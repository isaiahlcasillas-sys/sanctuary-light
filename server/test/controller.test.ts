import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerMessage } from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { ConfigStore } from '../src/store/configStore';
import { startFakeEos, type FakeEos } from '../tools/fake-eos';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-test-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(20); }
}

function make() {
  const store = new ConfigStore(tmp());
  const msgs: ServerMessage[] = [];
  const c = new Controller(store, (m) => msgs.push(m), () => false);
  return { store, c, msgs };
}

describe('Controller safety rules (offline)', () => {
  it('starts offline and only simulates', async () => {
    const { c } = make();
    expect(c.mode).toBe('offline');
    const r = await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-front' }, value: 60 }, 'operator');
    expect(r).toMatchObject({ ok: true, delivery: 'simulated' });
    expect(r.osc?.[0]).toContain('Chan 20 Thru 29 At 60 #');
    expect(c.levelsSnapshot().levels[20].intensity).toBe(60);
    expect(c.levelsSnapshot().sources[20]).toBe('simulated');
    c.shutdown();
  });

  it('requires sign-in', async () => {
    const { c } = make();
    expect((await c.execute({ kind: 'go' }, null)).delivery).toBe('blocked');
    c.shutdown();
  });

  it('blocks protected relay channels until unlocked', async () => {
    const { c } = make();
    const cmd = { kind: 'setIntensity' as const, target: { type: 'channels' as const, channels: [61] }, value: 100 };
    expect((await c.execute(cmd, 'operator')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'unlockProtected', confirm: false }, 'operator')).ok).toBe(false);
    await c.execute({ kind: 'unlockProtected', confirm: true }, 'operator');
    expect((await c.execute(cmd, 'operator')).delivery).toBe('simulated');
    c.shutdown();
  });

  it('limits volunteers', async () => {
    const { c } = make();
    expect((await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-scenic' }, value: 10 }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-house' }, value: 10 }, 'volunteer')).delivery).toBe('simulated');
    c.shutdown();
  });

  it('refuses to arm live without confirmation, and refuses direct DMX', async () => {
    const { c } = make();
    expect((await c.execute({ kind: 'setMode', mode: 'eos-live' }, 'operator')).ok).toBe(false);
    expect((await c.execute({ kind: 'setMode', mode: 'direct-dmx', confirm: true }, 'operator')).ok).toBe(false);
    expect(c.mode).toBe('offline');
    c.shutdown();
  });

  it('reports unmapped looks as preview-only', async () => {
    const { c } = make();
    const r = await c.execute({ kind: 'fireLook', lookId: 'look-sermon' }, 'operator');
    expect(r.delivery).toBe('simulated');
    expect(r.message).toMatch(/not mapped/);
    c.shutdown();
  });
});

describe('Controller with a fake Eos console over TCP', () => {
  let eos: FakeEos;
  beforeAll(async () => { eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true }); });
  afterAll(() => eos.close());

  for (const transport of ['tcp-1.1', 'tcp-1.0'] as const) {
    it(`monitor is read-only and live sends documented OSC (${transport})`, async () => {
      const { c, store } = make();
      const s = store.get().settings;
      store.update('settings', { ...s, connection: { ...s.connection, consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport, tcpPort: transport === 'tcp-1.1' ? eos.ports.slip! : eos.ports.length } });
      eos.received.length = 0;

      await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
      await until(() => c.status().connection.state === 'connected');
      await until(() => c.status().connection.consoleVersion === '3.3.10.0');
      const blocked = await c.execute({ kind: 'fireCue', list: 1, cue: '5' }, 'operator');
      expect(blocked.delivery).toBe('blocked');
      expect(eos.received.some((m) => m.includes('/fire'))).toBe(false);
      expect((await c.execute({ kind: 'testConnection' }, 'operator')).ok).toBe(true);

      await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
      const r = await c.execute({ kind: 'fireCue', list: 1, cue: '5' }, 'operator');
      expect(r.delivery).toBe('sent');
      await until(() => eos.received.includes('/eos/cue/1/5/fire'));
      await until(() => c.status().feedback.activeCue?.cue === '5');
      expect(c.status().feedback.activeCue?.source).toBe('confirmed');

      await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-front' }, value: 40 }, 'operator');
      await until(() => eos.received.includes('/eos/newcmd "Chan 20 Thru 29 At 40 #"'));
      expect(c.levelsSnapshot().sources[20]).toBe('commanded');

      await c.execute({ kind: 'setSub', sub: 1, value: 50 }, 'operator');
      await until(() => eos.received.includes('/eos/sub/1 0.5'));

      // Going offline must not transmit anything (no blackout on disconnect).
      const before = eos.received.length;
      await c.execute({ kind: 'setMode', mode: 'offline' }, 'operator');
      await wait(200);
      expect(eos.received.slice(before).filter((m) => m !== '/eos/ping')).toEqual([]);
      c.shutdown();
    });
  }

  it('reports an error instead of pretending when the console is unreachable', async () => {
    const { c, store } = make();
    const s = store.get().settings;
    store.update('settings', { ...s, connection: { ...s.connection, consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: 1 } });
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    await wait(100);
    const r = await c.execute({ kind: 'go' }, 'operator');
    expect(r).toMatchObject({ ok: false, delivery: 'error' });
    // Same-PC deployment: say plainly that Eos on this computer isn't answering.
    expect(c.status().connection.detail).toMatch(/not answering on this computer/);
    c.shutdown();
  });
});
