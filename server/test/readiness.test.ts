/**
 * Phase 3.1: Sunday-readiness checklist and automatic connection-recovery detection.
 * Uses only the FAKE console.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessReadiness, type AppConfig } from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { ConfigStore } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { startFakeEos } from '../tools/fake-eos';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ready-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(25); }
}
const freePort = () => new Promise<number>((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
});

function commissioned(): AppConfig {
  const cfg = defaultConfig();
  const now = Date.now();
  cfg.settings.connection.eosVersion = '3.3.10';
  cfg.settings.commissioning = {
    versionConfirmedAt: now, networkCheckedAt: now, notes: '',
    monitorTest: { at: now, ok: true, replyMs: 2, reportedVersion: '3.3.10.0', detail: 'ok' },
    liveTest: { at: now, channel: 21, level: 50, operatorConfirmedLight: true, released: true },
    recoveryObservedAt: now,
  };
  cfg.fixtures = cfg.fixtures.filter((f) => f.profileId !== 'demo-mover');
  cfg.looks = cfg.looks.map((l) => ({ ...l, volunteerVisible: false }));
  cfg.architecture.auditCompletedAt = now;
  return cfg;
}

describe('Sunday readiness checklist', () => {
  const base = { defaultPinsInUse: false, boundHost: '127.0.0.1', consoleVersion: '3.3.10.0', hasTodaysBackup: true };
  const status = (r: ReturnType<typeof assessReadiness>, id: string) => r.items.find((i) => i.id === id)!.status;

  it('a fresh install is not ready, and says why', () => {
    const r = assessReadiness({ ...base, config: defaultConfig(), defaultPinsInUse: true, consoleVersion: null });
    expect(r.readyForSupervisedSunday).toBe(false);
    for (const id of ['pins', 'version', 'monitor', 'live']) expect(status(r, id)).toBe('fail');
    expect(status(r, 'demo')).toBe('warn');
    expect(status(r, 'looks')).toBe('warn');
  });

  it('a commissioned setup with changed PINs is ready', () => {
    const r = assessReadiness({ ...base, config: commissioned() });
    expect(r.items.filter((i) => i.status !== 'pass')).toEqual([]);
    expect(r.readyForSupervisedSunday).toBe(true);
  });

  it('blocks on default PINs, an unconfirmed light, or a version mismatch', () => {
    expect(assessReadiness({ ...base, config: commissioned(), defaultPinsInUse: true }).readyForSupervisedSunday).toBe(false);
    const unconfirmed = commissioned();
    unconfirmed.settings.commissioning.liveTest!.operatorConfirmedLight = null;
    expect(status(assessReadiness({ ...base, config: unconfirmed }), 'live')).toBe('fail');
    expect(status(assessReadiness({ ...base, config: commissioned(), consoleVersion: '2.9.3' }), 'version')).toBe('fail');
  });

  it('warns (does not hide) network exposure', () => {
    const r = assessReadiness({ ...base, config: commissioned(), boundHost: '0.0.0.0' });
    expect(status(r, 'network')).toBe('warn');
    expect(r.items.find((i) => i.id === 'network')!.detail).toMatch(/not encrypted/);
  });
});

describe('Connection recovery', () => {
  it('reconnects by itself after the console restarts, records it, and replays no lighting commands', async () => {
    const port = await freePort();
    let eos = await startFakeEos({ slipPort: port, lengthPort: 0, quiet: true });
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: port });
    store.replaceAll(cfg);
    const c = new Controller(store, () => {}, () => false);
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    await until(() => c.status().connection.state === 'connected');
    expect(store.get().settings.commissioning.recoveryObservedAt).toBeNull();

    eos.close();                                  // console "unplugged"
    await until(() => c.status().connection.state !== 'connected');
    eos = await startFakeEos({ slipPort: port, lengthPort: 0, quiet: true });   // back
    await until(() => c.status().connection.state === 'connected');
    await until(() => store.get().settings.commissioning.recoveryObservedAt != null);

    await wait(300);
    expect(c.mode).toBe('eos-live');
    const lighting = eos.received.filter((m) => !/^\/eos\/(ping|get\/|subscribe)/.test(m));
    expect(lighting).toEqual([]);              // only read-only traffic after reconnecting
    c.shutdown();
    eos.close();
  }, 20_000);
});

describe('Silent console (half-open TCP)', () => {
  it('drops a connection that stops answering and reconnects when the console answers again', async () => {
    const eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true });
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip!, heartbeatSeconds: 1, staleSeconds: 2 });
    store.replaceAll(cfg);
    const logs: string[] = [];
    const c = new Controller(store, (m) => { if (m.t === 'log') logs.push(m.entry.message); }, () => false);
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    await until(() => c.status().connection.state === 'connected' && !c.status().connection.stale);
    eos.mute(true);                                 // console freezes; socket stays open
    await until(() => logs.some((l) => /No reply from the console/.test(l)), 10_000);
    eos.mute(false);
    await until(() => c.status().connection.state === 'connected' && !c.status().connection.stale, 10_000);
    // One reconnect, not a loop: a fresh connection is never dropped for an earlier silence.
    await wait(3000);
    expect(logs.filter((l) => /No reply from the console/.test(l)).length).toBe(1);
    await until(() => store.get().settings.commissioning.recoveryObservedAt != null);
    c.shutdown();
    eos.close();
  }, 30_000);
});

describe('Stale connection', () => {
  it('refuses live commands while the console is not answering, so nothing can be delivered late', async () => {
    const eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true });
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip!, heartbeatSeconds: 1, staleSeconds: 2 });
    store.replaceAll(cfg);
    const c = new Controller(store, () => {}, () => false);
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    await until(() => c.status().connection.state === 'connected' && !c.status().connection.stale);
    eos.mute(true);
    await until(() => c.status().connection.stale);
    const r = await c.execute({ kind: 'setIntensity', target: { type: 'channels', channels: [21] }, value: 50 }, 'operator');
    expect(r).toMatchObject({ ok: false, delivery: 'error' });
    expect(r.message).toMatch(/stale/);
    eos.mute(false);
    await wait(300);
    expect(eos.received.some((m) => m.includes('Chan 21'))).toBe(false);
    c.shutdown();
    eos.close();
  }, 20_000);
});
