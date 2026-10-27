/**
 * Phase 2.5 regression tests: version-aware connection rules, cue-list GO/BACK,
 * group/relay safety when local config and console differ, and the setup wizard's
 * single-channel live test. Uses the FAKE console only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  checkConnectionCompat, eosCapabilities, parseEosVersion, recommendConnection,
  type AppConfig, type CommandResult, type FixtureGroup,
} from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { EosCommandBuilder } from '../src/engine/eosCommands';
import { parseCueText, parseFeedback, parseNumberList } from '../src/engine/eosFeedback';
import { GroupVerifier, REPLY_TIMEOUT_MS, SETTLE_MS } from '../src/groupVerifier';
import { int, str } from '../src/osc/codec';
import { ConfigStore, migrateConfig } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { validateSection } from '../src/store/validate';
import { startFakeEos, type FakeEos } from '../tools/fake-eos';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-p25-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(20); }
}

// ─────────────────────────── version rules ───────────────────────────

describe('Eos version capabilities', () => {
  it('parses console version strings', () => {
    expect(parseEosVersion('3.3.0.273')).toEqual({ major: 3, minor: 3, patch: 0 });
    expect(parseEosVersion('v2.9.3')).toEqual({ major: 2, minor: 9, patch: 3 });
    expect(parseEosVersion('')).toBeNull();
    expect(parseEosVersion('banana')).toBeNull();
  });

  it('only offers port 3037 (Third Party OSC) from Eos 3.1.0', () => {
    expect(eosCapabilities('2.9.3').thirdParty3037).toBe('no');
    expect(eosCapabilities('3.0.1').thirdParty3037).toBe('no');
    expect(eosCapabilities('3.1.0').thirdParty3037).toBe('yes');
    expect(eosCapabilities('3.3.9').thirdParty3038).toBe('yes');
    expect(eosCapabilities('3.3.8').thirdParty3038).toBe('no');
  });

  it('documents where the console settings live per version', () => {
    expect(eosCapabilities('3.2.12').thirdPartyToggle).toMatch(/ECU/);
    expect(eosCapabilities('3.3.0').thirdPartyToggle).toMatch(/Setup > Device Settings > Network/);
    expect(eosCapabilities('2.9.3').tcp3032FramingSetting).toMatch(/ECU/);
    expect(eosCapabilities('3.2.0').tcp3032FramingSetting).toMatch(/Setup > System > Show Control/);
  });

  it('treats /eos/cues as documented on 3.3+, unconfirmed on 3.0–3.2, absent on 2.x', () => {
    expect(eosCapabilities('3.3.10').cueListFireStop).toBe('yes');
    expect(eosCapabilities('3.2.12').cueListFireStop).toBe('verify');
    expect(eosCapabilities('2.9.3').cueListFireStop).toBe('no');
  });

  it('recommends a connection that exists on that version', () => {
    expect(recommendConnection('2.9.3')).toMatchObject({ transport: 'tcp-1.0', port: 3032 });
    expect(recommendConnection('3.0.2')).toMatchObject({ transport: 'tcp-1.0', port: 3032 });
    expect(recommendConnection('3.2.12')).toMatchObject({ transport: 'tcp-1.1', port: 3037 });
    expect(recommendConnection('1.9.0')).toMatchObject({ transport: 'udp' });
  });

  it('rejects impossible port/transport combinations', () => {
    const base = { goBackMethod: 'auto' as const };
    expect(checkConnectionCompat({ ...base, eosVersion: '2.9.3', transport: 'tcp-1.1', tcpPort: 3037 }).errors[0]).toMatch(/3\.1\.0/);
    expect(checkConnectionCompat({ ...base, eosVersion: '3.3.10', transport: 'tcp-1.0', tcpPort: 3037 }).errors[0]).toMatch(/SLIP/);
    expect(checkConnectionCompat({ ...base, eosVersion: '2.8.0', transport: 'tcp-1.0', tcpPort: 4703 }).errors[0]).toMatch(/2\.9\.0/);
    expect(checkConnectionCompat({ ...base, eosVersion: '3.3.10', transport: 'tcp-1.0', tcpPort: 3036 }).errors[0]).toMatch(/RFR/);
    expect(checkConnectionCompat({ ...base, eosVersion: '1.9.0', transport: 'tcp-1.0', tcpPort: 3032 }).errors[0]).toMatch(/UDP/);
    expect(checkConnectionCompat({ eosVersion: '2.9.3', transport: 'tcp-1.0', tcpPort: 3032, goBackMethod: 'cue-list' }).errors[0]).toMatch(/eos\/cues/);
    expect(checkConnectionCompat({ ...base, eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: 3037 }).errors).toEqual([]);
    expect(checkConnectionCompat({ ...base, eosVersion: '2.9.3', transport: 'tcp-1.1', tcpPort: 3032 }).warnings[0]).toMatch(/OSC 1\.0/);
  });

  it('checks same-PC (127.0.0.1) settings', () => {
    const base = { goBackMethod: 'auto' as const, consoleIp: '127.0.0.1' };
    expect(checkConnectionCompat({ ...base, eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: 3037 })).toEqual({ errors: [], warnings: [] });
    expect(checkConnectionCompat({ ...base, eosVersion: '3.0.2', transport: 'tcp-1.0', tcpPort: 3032 }).warnings[0]).toMatch(/3\.2/);
    expect(checkConnectionCompat({ ...base, eosVersion: '3.3.10', transport: 'udp', tcpPort: 3032, udpConsolePort: 8000, udpLocalPort: 8000 }).errors[0]).toMatch(/different port/);
    expect(checkConnectionCompat({ ...base, eosVersion: '3.3.10', transport: 'udp', tcpPort: 3032, udpConsolePort: 8000, udpLocalPort: 8001 }).errors).toEqual([]);
  });

  it('rejects version typos and placeholders', () => {
    expect(parseEosVersion('10.101.100.101')).toBeNull();
    expect(parseEosVersion('300')).toBeNull();
    expect(parseEosVersion('3.3.0.273 FAKE')).toEqual({ major: 3, minor: 3, patch: 0 });
    const cfg = defaultConfig();
    for (const bad of ['10.101.100.101', '3.x', '3']) {
      const s = { ...cfg.settings, connection: { ...cfg.settings.connection, eosVersion: bad } };
      expect(validateSection('settings', s, cfg)).toMatch(/Eos version/);
    }
  });

  it('settings validation refuses 3037 on Eos 2.x', () => {
    const cfg = defaultConfig();
    const s = { ...cfg.settings, connection: { ...cfg.settings.connection, eosVersion: '2.9.3', transport: 'tcp-1.1' as const, tcpPort: 3037 } };
    expect(validateSection('settings', s, cfg)).toMatch(/3\.1\.0/);
  });
});

describe('Config migration from v0.1', () => {
  it('clears placeholder versions and fixes the old 3037 and "stop" defaults', () => {
    const old = defaultConfig() as unknown as { settings: Record<string, unknown> };
    const conn = { ...(old.settings.connection as object), eosVersion: '2.x', transport: 'tcp-1.1', tcpPort: 3037, backKey: 'stop' };
    delete (conn as Record<string, unknown>).goBackMethod;
    const raw = { ...old, settings: { ...old.settings, connection: conn, commissioning: undefined } } as unknown as Partial<AppConfig>;
    const { config, notes } = migrateConfig(raw, defaultConfig());
    expect(config.settings.connection).toMatchObject({ eosVersion: '', transport: 'tcp-1.0', tcpPort: 3032, backKey: 'stopback', goBackMethod: 'auto' });
    expect(config.settings.commissioning.liveTest).toBeNull();
    expect(notes).toHaveLength(3);
  });

  it('restores a v0.1 backup by migrating it first', () => {
    const store = new ConfigStore(tmp());
    const old = defaultConfig() as unknown as { settings: Record<string, unknown> };
    const conn = { ...(old.settings.connection as object), eosVersion: '2.x', backKey: 'stop' } as Record<string, unknown>;
    delete conn.goBackMethod;
    const settings = { ...old.settings, connection: conn } as Record<string, unknown>;
    delete settings.commissioning;
    const restored = store.replaceAll({ ...old, settings } as unknown as AppConfig);
    expect(restored.settings.connection).toMatchObject({ eosVersion: '', backKey: 'stopback', goBackMethod: 'auto' });
    expect(store.migrationNotes.length).toBeGreaterThan(0);
  });

  it('defaultConfig returns independent copies (editing one never changes the defaults)', () => {
    const a = defaultConfig();
    a.groups[0].channels.push(999);
    a.settings.connection.consoleIp = '10.0.0.1';
    const b = defaultConfig();
    expect(b.groups[0].channels).not.toContain(999);
    expect(b.settings.connection.consoleIp).toBe('');
  });

  it('new installs start with no Eos version and refuse to connect', async () => {
    const store = new ConfigStore(tmp());
    expect(store.get().settings.connection.eosVersion).toBe('');
    const c = new Controller(store, () => {}, () => false);
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    expect(c.status().connection).toMatchObject({ state: 'error' });
    expect(c.status().connection.detail).toMatch(/Setup Wizard/);
    c.shutdown();
  });
});

// ─────────────────────────── OSC builders / parsers ───────────────────────────

describe('Cue-list GO/BACK and release commands', () => {
  const b = new EosCommandBuilder(null);
  it('uses /eos/cues/<list>/fire and /stop', () => {
    expect(b.cueListGo(2)).toEqual([{ address: '/eos/cues/2/fire', args: [] }]);
    expect(b.cueListStop(2)).toEqual([{ address: '/eos/cues/2/stop', args: [] }]);
    expect(() => b.cueListGo(0)).toThrow();
  });
  it('releases with Sneak', () => {
    expect(b.release({ channels: [21], eosGroup: null })[0].args[0].value).toBe('Chan 21 Sneak #');
  });
});

describe('Feedback parsing (documented formats)', () => {
  it('reads cue text with or without a percent', () => {
    expect(parseCueText('1/2 Label 5.0')).toMatchObject({ list: 1, cue: '2', label: 'Label', progress: null });
    expect(parseCueText('1/1 Label 5.00 100%')).toMatchObject({ list: 1, cue: '1', label: 'Label', progress: 100 });
    expect(parseCueText('2/3.5 Song 3 4.5 37%')).toMatchObject({ list: 2, cue: '3.5', label: 'Song 3', progress: 37 });
    expect(parseCueText('4/10 5.0')).toMatchObject({ list: 4, cue: '10', label: null });
  });
  it('reads pending/previous cue change messages', () => {
    expect(parseFeedback({ address: '/eos/out/pending/cue/1/2', args: [] })).toEqual({ kind: 'cueChanged', which: 'pending', list: 1, cue: '2' });
    expect(parseFeedback({ address: '/eos/out/previous/cue/3/1.5/1', args: [] })).toMatchObject({ which: 'previous', list: 3, cue: '1.5' });
  });
  it('ignores continuation packets for patch entries', () => {
    expect(parseFeedback({ address: '/eos/out/get/patch/5/1/list/20/2', args: [str('x'), int(1)] }).kind).toBe('other');
  });
  it('parses group channel lists across packets, including ranges and decimals', () => {
    expect(parseNumberList([5, '7-9', '12.3'])).toEqual({ numbers: [5, 7, 8, 9], unparsed: ['12.3'] });
    const first = parseFeedback({ address: '/eos/out/get/group/4/channels/list/0/3', args: [int(-1), str('uid'), str('1-3')] });
    expect(first).toMatchObject({ kind: 'groupChannels', group: 4, channels: [1, 2, 3] });
    const next = parseFeedback({ address: '/eos/out/get/group/4/channels/list/3/2', args: [int(10), str('61-62')] });
    expect(next).toMatchObject({ channels: [10, 61, 62] });
  });
  it('recognises change notifications', () => {
    expect(parseFeedback({ address: '/eos/out/notify/group/list/0/2', args: [int(1), int(3)] })).toEqual({ kind: 'notify', target: 'group' });
  });
});

// ─────────────────────────── group verifier ───────────────────────────

describe('GroupVerifier', () => {
  const cfg = defaultConfig();
  const front: FixtureGroup = { ...cfg.groups.find((g) => g.id === 'grp-front')!, eosGroup: 7 };
  const T = 1_000_000;
  const evalAt = (v: GroupVerifier, now: number, group = front) => v.evaluate([group], cfg.fixtures, now)[group.id];
  /** Packet info for a channel list sent as one packet: <list index>, <UID>, then one arg per entry. */
  const whole = (ch: number[], unparsed: string[] = []) => ({ argIndex: 0, argCount: 2 + ch.length + unparsed.length, total: 2 + ch.length + unparsed.length });

  it('never trusts a channel list with a missing packet', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    // Eos says 13 elements in total; only the first 12 arrived (relay 61 was in the lost packet).
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], [], T, { argIndex: 0, argCount: 12, total: 13 });
    const r = evalAt(v, T + 10_000);
    expect(r.state).toBe('unverified');
    expect(r.detail).toMatch(/incomplete/);
    v.onChannels(7, [61], [], T + 20, { argIndex: 12, argCount: 1, total: 13 });
    expect(evalAt(v, T + 10_000).state).toBe('protected');
  });

  it('never trusts a channel list without a total count', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], [], T);
    expect(evalAt(v, T + 10_000).state).toBe('unverified');
  });

  it('is unverified until the console answers, and never trusts a half-received list', () => {
    const v = new GroupVerifier();
    expect(evalAt(v, T).state).toBe('unverified');
    v.markRequested([7], T);
    v.onInfo(7, 'Front', T + 10);
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], [], T + 20, whole([20, 21, 22, 23, 24, 25, 26, 27, 28, 29], []));
    expect(evalAt(v, T + 20 + SETTLE_MS - 1).state).toBe('unverified');
    expect(evalAt(v, T + 20 + SETTLE_MS).state).toBe('verified');
  });

  it('flags a console group that contains a protected channel', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 61], [], T, whole([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 61], []));
    expect(evalAt(v, T + 1000)).toMatchObject({ state: 'protected' });
  });

  it('flags membership differences and unreadable entries', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    v.onChannels(7, [20, 21], [], T, whole([20, 21], []));
    expect(evalAt(v, T + 1000).state).toBe('mismatch');
    const w = new GroupVerifier();
    w.markRequested([7], T);
    w.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], ['29.2'], T, whole([20, 21, 22, 23, 24, 25, 26, 27, 28, 29], ['29.2']));
    expect(evalAt(w, T + 1000).state).toBe('mismatch');
  });

  it('reports no reply after the timeout and resets on invalidate', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    expect(evalAt(v, T + REPLY_TIMEOUT_MS + 1).detail).toMatch(/did not answer/);
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], [], T, whole([20, 21, 22, 23, 24, 25, 26, 27, 28, 29], []));
    v.invalidate();
    expect(evalAt(v, T + 5000).state).toBe('unverified');
    expect(v.needsRequest([7])).toEqual([7]);
  });
});

// ─────────────────────────── controller: offline ───────────────────────────

function makeController(mutate?: (cfg: AppConfig) => void) {
  const store = new ConfigStore(tmp());
  const cfg = store.get();
  mutate?.(cfg);
  store.replaceAll(cfg);
  const c = new Controller(store, () => {}, () => false);
  return { c, store };
}

describe('GO/BACK method selection (offline simulation)', () => {
  it('uses cue-list addresses on Eos 3.3 and keys on Eos 2.9', async () => {
    const a = makeController((cfg) => { cfg.settings.connection.eosVersion = '3.3.10'; });
    const go = await a.c.execute({ kind: 'go' }, 'volunteer');
    expect(go).toMatchObject({ delivery: 'simulated', osc: ['/eos/cues/1/fire'] });
    expect((await a.c.execute({ kind: 'back', list: 2 }, 'operator')).osc).toEqual(['/eos/cues/2/stop']);
    expect(a.c.status().goBack).toMatchObject({ method: 'cue-list', list: 1 });
    a.c.shutdown();

    const b = makeController((cfg) => { cfg.settings.connection.eosVersion = '2.9.3'; });
    expect((await b.c.execute({ kind: 'go' }, 'operator')).osc).toEqual(['/eos/key/go_0 1', '/eos/key/go_0 0']);
    expect((await b.c.execute({ kind: 'back' }, 'operator')).osc).toEqual(['/eos/key/stopback 1', '/eos/key/stopback 0']);
    expect(b.c.status().goBack).toMatchObject({ method: 'keys', list: null });
    b.c.shutdown();
  });

  it('limits which cue list GO/BACK may target', async () => {
    const a = makeController((cfg) => { cfg.settings.connection.eosVersion = '3.3.10'; });
    expect((await a.c.execute({ kind: 'go', list: 2 }, 'volunteer')).delivery).toBe('blocked');
    expect((await a.c.execute({ kind: 'go', list: 2 }, 'operator')).osc).toEqual(['/eos/cues/2/fire']);
    a.c.shutdown();
    const b = makeController((cfg) => { cfg.settings.connection.eosVersion = '2.9.3'; });
    const r = await b.c.execute({ kind: 'go', list: 2 }, 'operator');
    expect(r).toMatchObject({ ok: false, delivery: 'error' });
    expect(r.message).toMatch(/master playback/);
    b.c.shutdown();
  });

  it('honours an explicit keys preference and simulates GO in the chosen list', async () => {
    const { c } = makeController((cfg) => { cfg.settings.connection.eosVersion = '3.3.10'; cfg.settings.connection.goBackMethod = 'keys'; });
    expect((await c.execute({ kind: 'go' }, 'operator')).osc?.[0]).toBe('/eos/key/go_0 1');
    expect(c.status().feedback.activeCue).toMatchObject({ list: 1, cue: '1', source: 'simulated' });
    c.shutdown();
  });

  it('never sends "Group N" without verification, even when an Eos group number is configured', async () => {
    const { c } = makeController((cfg) => { cfg.groups.find((g) => g.id === 'grp-front')!.eosGroup = 1; });
    const r = await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-front' }, value: 40 }, 'operator');
    expect(r.osc).toEqual(['/eos/newcmd "Chan 20 Thru 29 At 40 #"']);
    expect(c.status().groupVerification['grp-front'].state).toBe('unverified');
    c.shutdown();
  });

  it('refuses groups that list channels missing from the patch', async () => {
    const { c } = makeController((cfg) => { cfg.groups.find((g) => g.id === 'grp-front')!.channels.push(500); });
    const r = await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-front' }, value: 40 }, 'operator');
    expect(r).toMatchObject({ ok: false, delivery: 'error' });
    expect(r.message).toMatch(/500/);
    c.shutdown();
  });

  it('keeps macro looks and wizard commands away from volunteers', async () => {
    const { c } = makeController((cfg) => {
      const l = cfg.looks.find((x) => x.id === 'look-prayer')!;
      l.action = { type: 'macro', macro: 5 };
    });
    expect((await c.execute({ kind: 'fireLook', lookId: 'look-prayer' }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'singleChannelTest', channel: 21, level: 50, confirmChannel: 21 }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'release', target: { type: 'channels', channels: [21] } }, 'volunteer')).delivery).toBe('blocked');
    c.shutdown();
  });

  it('wizard live test is refused outside Live mode', async () => {
    const { c } = makeController();
    expect((await c.execute({ kind: 'singleChannelTest', channel: 21, level: 50, confirmChannel: 21 }, 'operator')).message).toMatch(/Arm Live/);
    c.shutdown();
  });
});

// ─────────────────────────── controller + fake console ───────────────────────────

describe('Against a fake Eos 3.3 console (TCP 3037-style SLIP)', () => {
  let eos: FakeEos;
  const open: Controller[] = [];
  beforeAll(async () => { eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true, version: '3.3.10.0' }); });
  afterAll(() => eos.close());
  afterEach(() => { for (const c of open.splice(0)) c.shutdown(); });

  async function connected(mutate?: (cfg: AppConfig) => void) {
    const r = makeController((cfg) => {
      Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip! });
      cfg.groups.find((g) => g.id === 'grp-front')!.eosGroup = 1; // console: 20-29 ✓
      cfg.groups.find((g) => g.id === 'grp-house')!.eosGroup = 2; // console: 31-54, 71-78 ✓
      cfg.groups.find((g) => g.id === 'grp-stage')!.eosGroup = 3; // console also contains relays 61, 62 ✗
      mutate?.(cfg);
    });
    open.push(r.c);
    eos.received.length = 0;
    await r.c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    await until(() => r.c.status().connection.state === 'connected');
    // Wait for every group the tests look at (replies can arrive in any order under load).
    await until(() => ['grp-front', 'grp-house', 'grp-stage'].every((id) => r.c.status().groupVerification[id].state !== 'unverified'));
    return r;
  }

  it('verifies matching groups and refuses the one containing relays', async () => {
    const { c } = await connected();
    const gv = c.status().groupVerification;
    expect(gv['grp-front']).toMatchObject({ state: 'verified', consoleLabel: 'Fake Group 1' });
    expect(gv['grp-house'].state).toBe('verified');
    expect(gv['grp-stage']).toMatchObject({ state: 'protected' });
    expect(gv['grp-stage'].detail).toMatch(/61/);

    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-front' }, value: 40 }, 'operator');
    const stage: CommandResult = await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-stage' }, value: 60 }, 'operator');
    expect(stage.delivery).toBe('sent');
    await until(() => eos.received.includes('/eos/newcmd "Group 1 At 40 #"'));
    await until(() => eos.received.includes('/eos/newcmd "Chan 1 Thru 19 + 30 + 79 + 80 At 60 #"'));
    expect(eos.received.some((m) => m.includes('Group 3'))).toBe(false);
  });

  it('falls back to channels when the local list differs from the console', async () => {
    const { c } = await connected((cfg) => { cfg.groups.find((g) => g.id === 'grp-front')!.channels = [20, 21, 22]; });
    expect(c.status().groupVerification['grp-front'].state).toBe('mismatch');
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-front' }, value: 30 }, 'operator');
    await until(() => eos.received.includes('/eos/newcmd "Chan 20 Thru 22 At 30 #"'));
  });

  it('re-verifies when the console reports a group change', async () => {
    const { c } = await connected();
    expect(c.status().groupVerification['grp-front'].state).toBe('verified');
    eos.setGroup(1, ['20-29', 61]);
    await until(() => c.status().groupVerification['grp-front'].state === 'protected');
    eos.setGroup(1, ['20-29']);
  });

  it('blocks preset looks whose Eos group is not verified', async () => {
    const { c } = await connected((cfg) => {
      cfg.looks.find((l) => l.id === 'look-sermon')!.action = { type: 'preset', preset: 4, eosGroup: 3 };
      cfg.looks.find((l) => l.id === 'look-wash')!.action = { type: 'preset', preset: 2, eosGroup: 1 };
    });
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    const bad = await c.execute({ kind: 'fireLook', lookId: 'look-sermon' }, 'operator');
    expect(bad).toMatchObject({ ok: false, delivery: 'error' });
    expect((await c.execute({ kind: 'fireLook', lookId: 'look-wash' }, 'operator')).delivery).toBe('sent');
    await until(() => eos.received.includes('/eos/newcmd "Group 1 Preset 2 #"'));
    expect(eos.received.some((m) => m.includes('Preset 4'))).toBe(false);
  });

  it('GO/BACK target the configured cue list and update cue feedback', async () => {
    const { c } = await connected();
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    await c.execute({ kind: 'go' }, 'volunteer');
    await until(() => eos.received.includes('/eos/cues/1/fire'));
    await until(() => c.status().feedback.activeCue?.cue === '1' && c.status().feedback.pendingCue?.cue === '2');
    await c.execute({ kind: 'go' }, 'volunteer');
    await c.execute({ kind: 'back' }, 'volunteer');
    await until(() => eos.received.includes('/eos/cues/1/stop'));
    expect(eos.received.some((m) => m.startsWith('/eos/key/'))).toBe(false);
  });

  it('runs the wizard single-channel test with every guard', async () => {
    const { c, store } = await connected();
    expect((await c.execute({ kind: 'testConnection' }, 'volunteer')).ok).toBe(true);
    expect(store.get().settings.commissioning.monitorTest).toBeNull(); // volunteers' tests aren't commissioning records
    const backups = store.listBackups().length;
    expect((await c.execute({ kind: 'testConnection' }, 'operator')).ok).toBe(true);
    expect(store.get().settings.commissioning.monitorTest).toMatchObject({ ok: true, reportedVersion: '3.3.10.0' });
    expect(store.listBackups().length).toBe(backups); // recording a result doesn't rotate real backups
    // Monitor mode: refused, and nothing reaches the console.
    expect((await c.execute({ kind: 'singleChannelTest', channel: 21, level: 50, confirmChannel: 21 }, 'operator')).delivery).toBe('blocked');
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    expect((await c.execute({ kind: 'singleChannelTest', channel: 21, level: 50, confirmChannel: 22 }, 'operator')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'singleChannelTest', channel: 61, level: 50, confirmChannel: 61 }, 'operator')).message).toMatch(/protected/);
    expect((await c.execute({ kind: 'singleChannelTest', channel: 999, level: 50, confirmChannel: 999 }, 'operator')).message).toMatch(/not in this app/);
    expect(eos.received.filter((m) => m.startsWith('/eos/newcmd'))).toEqual([]);

    const ok = await c.execute({ kind: 'singleChannelTest', channel: 21, level: 50, confirmChannel: 21 }, 'operator');
    expect(ok.delivery).toBe('sent');
    await until(() => eos.received.includes('/eos/newcmd "Chan 21 At 50 #"'));
    expect(store.get().settings.commissioning.liveTest).toMatchObject({ channel: 21, level: 50, released: false });
    await c.execute({ kind: 'release', target: { type: 'channels', channels: [21] } }, 'operator');
    await until(() => eos.received.includes('/eos/newcmd "Chan 21 Sneak #"'));
    expect(store.get().settings.commissioning.liveTest?.released).toBe(true);
  });

  it('warns when the console reports a different version than configured', async () => {
    const { c } = await connected((cfg) => { cfg.settings.connection.eosVersion = '3.2.12'; });
    await until(() => c.status().versionMismatch != null);
    expect(c.status().versionMismatch).toMatch(/3\.3\.10/);
  });
});

describe('Against a fake Eos 2.9 console (TCP 3032, packet-length)', () => {
  let eos: FakeEos;
  beforeAll(async () => { eos = await startFakeEos({ lengthPort: 0, quiet: true, version: '2.9.3.9' }); });
  afterAll(() => eos.close());

  it('has no port 3037, uses keys for GO/BACK, and still verifies groups', async () => {
    expect(eos.ports.slip).toBeNull();
    const { c } = makeController((cfg) => {
      Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '2.9.3', transport: 'tcp-1.0', tcpPort: eos.ports.length });
      cfg.groups.find((g) => g.id === 'grp-front')!.eosGroup = 1;
    });
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    await until(() => c.status().connection.state === 'connected');
    await until(() => c.status().groupVerification['grp-front'].state === 'verified');
    await c.execute({ kind: 'go' }, 'operator');
    await until(() => eos.received.includes('/eos/key/go_0 1'));
    expect(eos.received.some((m) => m.startsWith('/eos/cues/'))).toBe(false);
    c.shutdown();
  });
});

