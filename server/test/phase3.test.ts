/**
 * Phase 3: sanctuary-Mac deployment helpers, restart safety, and the SceneStation
 * documentation model. Nothing here sends lighting commands except to the FAKE console.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeFailures, defaultArchitecture, type ArchitecturalConfig } from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { GroupVerifier } from '../src/groupVerifier';
import { parseSleepPrevention, preventSleep } from '../src/platform';
import { ConfigStore } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { validateSection } from '../src/store/validate';
import { startFakeEos } from '../tools/fake-eos';
// @ts-expect-error plain .mjs deploy script without type declarations
import { LABEL, renderLaunchAgent } from '../../deploy/macos/launchagent.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-p3-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Restart safety', () => {
  it('a restarted server with a fully commissioned config is offline and sends nothing', async () => {
    const eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true });
    const dir = tmp();
    const first = new ConfigStore(dir);
    const cfg = first.get();
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip! });
    cfg.settings.commissioning.monitorTest = { at: Date.now(), ok: true, replyMs: 3, reportedVersion: '3.3.10', detail: 'ok' };
    first.replaceAll(cfg);

    // "Reboot": a new store and controller read the same data directory.
    const c = new Controller(new ConfigStore(dir), () => {}, () => false);
    await wait(500);
    expect(c.mode).toBe('offline');
    expect(c.status().connection.state).toBe('disabled');
    expect(eos.received).toEqual([]);
    expect(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')))).not.toMatch(/eos-live|"mode"/);
    c.shutdown();
    eos.close();
  });
});

describe('Daily configuration snapshots', () => {
  it('writes one snapshot per day and keeps the newest N', () => {
    const store = new ConfigStore(tmp());
    expect(store.dailySnapshot(new Date(2026, 9, 25))).toBe('daily-2026-10-25.json');
    expect(store.dailySnapshot(new Date(2026, 9, 25, 23))).toBeNull();
    for (let d = 1; d <= 5; d++) store.dailySnapshot(new Date(2026, 10, d), 3);
    const daily = store.listBackups().filter((f) => f.startsWith('daily-'));
    expect(daily).toEqual(['daily-2026-11-05.json', 'daily-2026-11-04.json', 'daily-2026-11-03.json']);
  });

  it('per-save backup rotation never deletes daily snapshots', () => {
    const store = new ConfigStore(tmp());
    store.dailySnapshot(new Date(2026, 0, 1));
    for (let i = 0; i < 55; i++) store.update('cueLists', store.get().cueLists);
    expect(store.listBackups()).toContain('daily-2026-01-01.json');
    expect(store.listBackups().filter((f) => f.startsWith('config-')).length).toBeLessThanOrEqual(50);
  });
});

describe('Mac host helpers', () => {
  it('parses the sleep-prevention setting and never runs caffeinate off macOS', () => {
    expect(parseSleepPrevention(undefined)).toBe('off');
    expect(parseSleepPrevention('display')).toBe('display');
    expect(parseSleepPrevention('1')).toBe('system');
    expect(preventSleep('display', () => {}, 'linux')).toBeNull();
  });

  it('renders a launchd agent with absolute paths, crash restart and no root', () => {
    const plist: string = renderLaunchAgent({ nodePath: '/opt/homebrew/bin/node', repo: '/Users/booth/sanctuary-light', home: '/Users/booth' });
    expect(plist).toContain(`<string>${LABEL}</string>`);
    expect(plist).toContain('<string>/opt/homebrew/bin/node</string>');
    expect(plist).toContain('/Users/booth/sanctuary-light/server/src/index.ts');
    expect(plist).toContain('/Users/booth/Library/Application Support/Sanctuary Light');
    expect(plist).toMatch(/<key>SuccessfulExit<\/key>\s*<false\/>/);
    expect(plist).not.toContain('HOST');
    expect(plist).not.toMatch(/UserName|root/);
    expect(renderLaunchAgent({ nodePath: '/n', repo: '/r', home: '/h', lanAccess: true })).toContain('<key>HOST</key>');
    expect(() => renderLaunchAgent({ nodePath: 'node', repo: '/r' })).toThrow(/absolute/);
  });
});

describe('Architectural status (SceneStation documentation only)', () => {
  const arch = (patch: (a: ArchitecturalConfig) => void) => { const a = defaultArchitecture(); patch(a); return a; };
  const byId = (a: ArchitecturalConfig, id: string) => analyzeFailures(a).find((s) => s.id === id)!;

  it('says "needs audit" while nothing is verified, but the Mac failure case is known by design', () => {
    const a = defaultArchitecture();
    expect(byId(a, 'mac-fails').confidence).toBe('by-design');
    expect(byId(a, 'mac-fails').outcome).toMatch(/Offline Simulation/);
    expect(byId(a, 'ion-fails').confidence).toBe('needs-audit');
    expect(byId(a, 'wall-button').confidence).toBe('needs-audit');
  });

  it('explains that a node holding its last look keeps an in-line SceneStation passive', () => {
    const a = arch((x) => {
      x.stations[0].dmxRole = 'inline-backup';
      x.stations[0].lossAction = 'fade-to-current';
      x.upstream = [{ ...x.upstream[0], lossBehavior: 'holds-last-look' }];
    });
    expect(byId(a, 'ion-fails').outcome).toMatch(/stay passive/);
    const b = arch((x) => {
      x.stations[0].dmxRole = 'inline-backup';
      x.stations[0].lossAction = 'activate-preset';
      x.stations[0].lossPreset = 3;
      x.upstream = [{ ...x.upstream[0], lossBehavior: 'stops-output' }];
    });
    expect(byId(b, 'ion-fails').outcome).toMatch(/takes over.*activates preset 3/);
  });

  it('flags an output-only station as a hazard', () => {
    const a = arch((x) => { x.stations[0].dmxRole = 'output-only'; });
    expect(byId(a, 'wall-button').confidence).toBe('hazard');
  });

  it('validates the architecture section and fills it into older configs', () => {
    const cfg = defaultConfig();
    expect(validateSection('architecture', cfg.architecture, cfg)).toBeNull();
    const bad = arch((x) => { x.stations[0].lossAction = 'activate-preset'; x.stations[0].lossPreset = 99; });
    expect(validateSection('architecture', bad, cfg)).toMatch(/1–64/);
    const dir = tmp();
    const { architecture: _drop, ...old } = defaultConfig();
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(old));
    expect(new ConfigStore(dir).get().architecture.stations.length).toBe(1);
  });
});

describe('Group verification hardening (review fixes)', () => {
  const cfg = defaultConfig();
  const front = { ...cfg.groups.find((g) => g.id === 'grp-front')!, eosGroup: 7 };
  const T = 1_000_000;
  const ev = (v: GroupVerifier, reliable = true) => v.evaluate([front], cfg.fixtures, T + 10_000, reliable)[front.id];
  const pkt = (argIndex: number, values: string[], total: number) => ({ argIndex, argCount: values.length, total, values });

  it('never verifies over UDP', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    v.onInfo(7, 'Front', T);
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], [], T, pkt(0, ['-1', 'uid', '20-29'], 3));
    expect(ev(v, true).state).toBe('verified');
    expect(ev(v, false).state).toBe('unverified');
    expect(ev(v, false).detail).toMatch(/TCP/);
  });

  it('discards channel data from an older reply when a new reply starts', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    // A late packet from a superseded request…
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], [], T, pkt(2, ['20-29'], 3));
    // …then the new reply: info, then only its first packet (relay packet not yet received).
    v.onInfo(7, 'Front', T + 1);
    v.onChannels(7, [], [], T + 2, pkt(0, ['-1', 'uid'], 4));
    expect(ev(v).state).toBe('unverified');
    expect(ev(v).detail).toMatch(/incomplete/);
  });

  it('treats disagreeing packets as a mismatch', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    v.onInfo(7, 'Front', T);
    v.onChannels(7, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29], [], T, pkt(0, ['-1', 'uid', '20-29'], 3));
    v.onChannels(7, [61], [], T, pkt(2, ['61'], 3));
    expect(ev(v).state).toBe('mismatch');
  });

  it('rejects absurd list totals without allocating them', () => {
    const v = new GroupVerifier();
    v.markRequested([7], T);
    v.onInfo(7, 'Front', T);
    v.onChannels(7, [20], [], T, pkt(0, ['-1', 'uid', '20'], 4_294_967_295));
    expect(() => ev(v)).not.toThrow();
    expect(ev(v).state).toBe('unverified');
  });
});

describe('Preset looks with duplicate Eos group numbers', () => {
  it('allow the preset when any local group with that number is verified', async () => {
    const eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true });
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip! });
    // First group with Eos Group 1 is stale (mismatch); the second matches the console (20-29).
    cfg.groups.unshift({ id: 'grp-stale', name: 'Front (stale)', color: '#fff', channels: [20, 21], eosGroup: 1, volunteerVisible: false });
    cfg.groups.find((g) => g.id === 'grp-front')!.eosGroup = 1;
    cfg.looks.find((l) => l.id === 'look-wash')!.action = { type: 'preset', preset: 2, eosGroup: 1 };
    store.replaceAll(cfg);
    const c = new Controller(store, () => {}, () => false);
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    const end = Date.now() + 4000;
    while (c.status().groupVerification['grp-front'].state !== 'verified' && Date.now() < end) await wait(20);
    expect(c.status().groupVerification['grp-stale'].state).toBe('mismatch');
    expect((await c.execute({ kind: 'fireLook', lookId: 'look-wash' }, 'operator')).delivery).toBe('sent');
    c.shutdown();
    eos.close();
  });
});
