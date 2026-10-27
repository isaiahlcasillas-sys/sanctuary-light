/**
 * Phase 3.4: Show Verification, volunteer approval, First Real Connection.
 * All console tests use the FAKE console (server/tools/fake-eos.ts) — simulated, not evidence
 * about the real sanctuary system.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildImportPlan, compareShow, defaultImportOptions, firstConnectionSteps, localFingerprint, normalizeLookApprovals, normalizeSubApprovals, outdatedWarnings,
  normalizeCueListApprovals, playbackApproved, readState, versionMatches, volunteerCanUseLook, volunteerPlaybackBlock, type AppConfig, type ConsoleSnapshot, type Look,
} from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { parseShowFile } from '../src/import';
import { ConfigStore, migrateConfig } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { startFakeEos, type FakeEos, type FakeShow } from '../tools/fake-eos';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-p34-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(25); }
}

/** A configuration built from the sample CSV export, like a real import. */
function importedConfig(): AppConfig {
  const show = parseShowFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'eos-import', 'eos-export.csv')), 'eos-export.csv');
  const base = { ...defaultConfig(), fixtures: [], groups: [], cueLists: [], looks: [], submasters: [] };
  return buildImportPlan(show, base, { ...defaultImportOptions(show, base), mode: 'replace' }).config;
}

/** The same show as the console would report it (absolute addresses: universe 2/1 = 513). */
function consoleShowFrom(cfg: AppConfig, name = 'Sunday Worship'): FakeShow {
  return {
    name,
    patch: cfg.fixtures.map((f) => ({ channel: f.channel, label: f.eosLabel ?? f.label, manufacturer: 'ETC', model: f.eosType ?? '', address: f.dmx ? (f.dmx.universe - 1) * 512 + f.dmx.address : 0 })),
    cueLists: cfg.cueLists.map((l) => ({ list: l.list, label: l.label, cues: l.cues.map((c) => ({ cue: c.cue, label: c.label })) })),
  };
}

const snapshot = (over: Partial<ConsoleSnapshot> = {}): ConsoleSnapshot => ({
  connected: true, showName: 'Sunday', consoleVersion: '3.3.10.0', read: null, patch: [], cueLists: [], groups: {}, consoleChangedAt: null, now: 10_000, ...over,
});

describe('compareShow (pure)', () => {
  const cfg = importedConfig();
  cfg.settings.connection.eosVersion = '3.3.10';
  const full = consoleShowFrom(cfg);
  const read = (patchN: number, listsN: number, cues: Record<number, [number, number]>) => ({
    startedAt: 1000, lastReplyAt: 9_000, truncated: false,
    patch: { received: patchN, expected: patchN }, cueLists: { received: listsN, expected: listsN },
    cues: Object.fromEntries(Object.entries(cues).map(([k, [r, e]]) => [k, { received: r, expected: e }])),
  });
  const asSnapshot = (show: FakeShow, over: Partial<ConsoleSnapshot> = {}) => snapshot({
    patch: show.patch.map((p) => ({ channel: p.channel, label: p.label, manufacturer: p.manufacturer, model: p.model, dmx: p.address ? { universe: Math.floor((p.address - 1) / 512) + 1, address: ((p.address - 1) % 512) + 1 } : null })),
    cueLists: show.cueLists.map((l) => ({ list: l.list, label: l.label, cues: l.cues.map((c) => ({ cue: c.cue, label: c.label })) })),
    read: read(show.patch.length, show.cueLists.length, Object.fromEntries(show.cueLists.map((l) => [l.list, [l.cues.length, l.cues.length]]))),
    ...over,
  });

  it('reports matches only for data the console actually reported', () => {
    const r = compareShow(cfg, asSnapshot(full));
    expect(r.state).toBe('complete');
    const patch = r.items.filter((i) => i.section === 'patch');
    expect(patch.every((i) => i.status === 'match')).toBe(true);
    expect(r.items.filter((i) => i.section === 'cues').every((i) => i.status === 'match')).toBe(true);
    // Groups were never read from the console: unknown, not "match".
    expect(r.items.filter((i) => i.section === 'groups').every((i) => i.status === 'unknown')).toBe(true);
    expect(r.items.filter((i) => i.status === 'unsupported').map((i) => i.key)).toEqual(expect.arrayContaining(['Submaster contents', 'Presets & palettes', 'Cue timing, effects, macros']));
    expect(r.items.find((i) => i.key === 'Loaded show')!.status).toBe('unsupported');
  });

  it('finds differences, missing and extra channels, and cue list differences', () => {
    const changed: FakeShow = structuredClone(full);
    changed.patch = changed.patch.filter((p) => p.channel !== 12);           // missing in Eos
    changed.patch.find((p) => p.channel === 11)!.label = 'Pulpit (moved)';   // different label
    changed.patch.find((p) => p.channel === 1)!.address = 9;                 // different address
    changed.patch.push({ channel: 500, label: 'New in Eos', manufacturer: 'ETC', model: 'Dimmer', address: 400 }); // extra
    changed.cueLists[0].cues = changed.cueLists[0].cues.filter((c) => c.cue !== '4');
    changed.cueLists[0].cues.find((c) => c.cue === '2')!.label = 'Greeting';
    changed.cueLists[0].cues.push({ cue: '9', label: 'Added in Eos' });
    const r = compareShow(cfg, asSnapshot(changed));
    const by = (k: string) => r.items.find((i) => i.key === k)!;
    expect(by('Channel 12').status).toBe('missing-in-eos');
    expect(by('Channel 11')).toMatchObject({ status: 'different', detail: expect.stringContaining('label "Pulpit Special" vs "Pulpit (moved)"') });
    expect(by('Channel 1').detail).toMatch(/DMX 1\/1 vs 1\/9/);
    expect(by('Channel 500').status).toBe('extra-in-eos');
    expect(by('Cue list 1')).toMatchObject({ status: 'different', detail: expect.stringMatching(/not in Eos: cue 4.*only in Eos: cue 9.*label\(s\) differ/) });
    expect(r.summary['missing-in-eos']).toBe(1);
    expect(r.summary['extra-in-eos']).toBe(1);
  });

  it('never calls something missing when the read did not finish', () => {
    const partial = asSnapshot(full);
    partial.patch = partial.patch.slice(0, 3);
    partial.read = { ...partial.read!, patch: { received: 3, expected: full.patch.length }, lastReplyAt: 9_500 };
    const r = compareShow(cfg, partial);
    expect(r.state).toBe('reading');
    expect(r.summary['missing-in-eos']).toBe(0);
    expect(r.items.find((i) => i.key === 'Channel 31')!.status).toBe('unknown');
    expect(readState({ ...partial, now: 9_500 + 9_000 })).toBe('incomplete');
    expect(readState(snapshot({ connected: false }))).toBe('offline');
  });

  it('compares versions by whole parts', () => {
    expect(versionMatches('3.2.12', '3.2.12.0')).toBe(true);
    expect(versionMatches('3.1', '3.12.0')).toBe(false);
    expect(versionMatches('', '3.3.10')).toBe(false);
  });

  it('marks the FAKE simulator so it is never mistaken for real evidence', () => {
    expect(compareShow(cfg, asSnapshot(full, { showName: 'FAKE SHOW (not a real console)' })).simulatedConsole).toBe(true);
    expect(compareShow(cfg, asSnapshot(full)).simulatedConsole).toBe(false);
  });

  it('warns when the configuration may be out of date', () => {
    const c = structuredClone(cfg);
    expect(outdatedWarnings(c, { showName: 'A', consoleChangedAt: null, connected: true }, null)[0]).toMatch(/never been compared/);
    c.verification = { at: c.eosShow!.importedAt + 1000, showName: 'A', consoleVersion: '3.3.10.0', simulatedConsole: false, summary: { match: 1, different: 0, 'missing-in-eos': 0, 'extra-in-eos': 0, unknown: 0, unsupported: 0 }, fingerprint: 'abc' };
    expect(outdatedWarnings(c, { showName: 'A', consoleChangedAt: null, connected: true }, 'abc')).toEqual([]);
    expect(outdatedWarnings(c, { showName: 'B', consoleChangedAt: null, connected: true }, null)[0]).toMatch(/"B" loaded/);
    expect(outdatedWarnings(c, { showName: 'A', consoleChangedAt: c.verification.at + 5, connected: true }, null)[0]).toMatch(/reported patch, cue or group changes/);
    expect(outdatedWarnings(c, { showName: 'A', consoleChangedAt: null, connected: true }, 'zzz')[0]).toMatch(/different from when/);
    c.eosShow!.importedAt = c.verification.at + 10;
    expect(outdatedWarnings(c, { showName: 'A', consoleChangedAt: null, connected: true }, null)[0]).toMatch(/imported after the last verification/);
  });
});

describe('Show Verification against the FAKE console (simulated)', () => {
  let eos: FakeEos;
  const cfg0 = importedConfig();
  beforeAll(async () => { eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true, show: consoleShowFrom(cfg0), groups: { 1: ['1-3'], 2: [11, 12], 3: [21, 22, 999] } }); });
  afterAll(() => eos.close());

  async function connected() {
    const store = new ConfigStore(tmp());
    store.replaceAll({ ...cfg0, settings: { ...cfg0.settings, connection: { ...cfg0.settings.connection, consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip! } } });
    const c = new Controller(store, () => undefined, () => false);
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    await until(() => c.status().connection.state === 'connected' && c.status().connection.showName != null);
    return { store, c };
  }

  it('reads the console read-only, compares, and saves a verification record', async () => {
    const { store, c } = await connected();
    expect(c.verificationReport().state).toBe('not-read');
    const before = eos.received.length;
    expect(c.startVerification().ok).toBe(true);
    await until(() => c.verificationReport().state === 'complete');
    const sent = eos.received.slice(before).filter((m) => !m.startsWith('/eos/ping'));
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((m) => m.startsWith('/eos/get/') || m.startsWith('/eos/subscribe'))).toBe(true); // read-only
    await until(() => Object.values(c.status().groupVerification).some((g) => g.state === 'verified'));
    const r = c.verificationReport();
    expect(r.summary.different + r.summary['missing-in-eos'] + r.summary['extra-in-eos']).toBe(0);
    expect(r.items.filter((i) => i.section === 'patch').every((i) => i.status === 'match')).toBe(true);
    expect(r.items.find((i) => i.key.startsWith('Group 1'))!.status).toBe('match');
    expect(store.get().verification).toMatchObject({ showName: 'Sunday Worship', simulatedConsole: false });
    expect(c.mode).toBe('eos-monitor');
    c.shutdown();
  });

  it('warns when the show is edited or another show is loaded after verification', async () => {
    const { c, store } = await connected();
    c.startVerification();
    await until(() => store.get().verification !== null, 8000);
    expect(c.status().showWarnings).toEqual([]);
    const edited = consoleShowFrom(cfg0);
    edited.patch[0].label = 'Edited in Eos';
    eos.setShow(edited, 'edit');
    await until(() => c.status().showWarnings.length > 0);
    expect(c.status().showWarnings[0]).toMatch(/reported patch, cue or group changes/);
    eos.setShow({ ...edited, name: 'Christmas Eve' }, 'load');
    await until(() => c.status().showWarnings.some((w) => /Christmas Eve/.test(w)));
    eos.setShow(consoleShowFrom(cfg0), 'load');
    c.shutdown();
  });

  it('saves the record by itself (no screen polling) and survives a repeated read', async () => {
    const { store, c } = await connected();
    c.startVerification();
    c.startVerification(); // pressed twice: replies to the first read must not inflate the second
    await until(() => store.get().verification !== null, 8000);
    const r = c.verificationReport();
    expect(r.state).toBe('complete');
    expect(r.summary['missing-in-eos']).toBe(0);
    expect(r.progress!.patch.received).toBe(r.progress!.patch.expected);
    expect(store.get().verification!.summary.unknown).toBe(0); // groups were waited for
    c.shutdown();
  });

  it('refuses to read while offline', () => {
    const c = new Controller(new ConfigStore(tmp()), () => undefined, () => false);
    expect(c.startVerification()).toMatchObject({ ok: false, delivery: 'blocked' });
    expect(c.verificationReport().state).toBe('offline');
    c.shutdown();
  });
});

describe('Volunteer approval', () => {
  const cueLook: Look = { id: 'l1', name: 'Welcome', description: '', icon: 'sun', gradient: ['#000', '#111'], action: { type: 'cue', list: 1, cue: '2' }, preview: [], volunteerVisible: false };

  it('requires an approval for any look that triggers Eos', () => {
    expect(volunteerCanUseLook({ ...cueLook, volunteerVisible: true })).toBe(false);
    expect(volunteerCanUseLook({ ...cueLook, volunteerVisible: true, approval: { at: 1, note: 'x' } })).toBe(true);
    expect(volunteerCanUseLook({ ...cueLook, volunteerVisible: true, action: { type: 'none' } })).toBe(true);
  });

  it('withdraws the approval when the action changes', () => {
    const approved = { ...cueLook, volunteerVisible: true, approval: { at: 1, note: 'x' } };
    const { looks, withdrawn } = normalizeLookApprovals([approved], [{ ...approved, action: { type: 'cue', list: 1, cue: '3' } }]);
    expect(looks[0]).toMatchObject({ approval: null, volunteerVisible: false });
    expect(withdrawn).toEqual(['Welcome']);
    expect(normalizeLookApprovals([approved], [{ ...approved, name: 'Hello' }]).looks[0].approval).not.toBeNull();
  });

  it('keeps approvals server-owned when looks or subs are saved', () => {
    const approved = { ...cueLook, approval: { at: 1, note: 'x' } };
    // A new look can't arrive already approved.
    expect(normalizeLookApprovals([], [approved]).looks[0].approval).toBeNull();
    // A stale screen can't re-approve (or un-approve) a look.
    expect(normalizeLookApprovals([cueLook], [approved]).looks[0].approval).toBeNull();
    expect(normalizeLookApprovals([approved], [{ ...approved, approval: null }]).looks[0].approval).toEqual({ at: 1, note: 'x' });
    const subs = normalizeSubApprovals([{ sub: 1, label: 'A', volunteerVisible: false, protected: false, fromEos: true }], [{ sub: 1, label: 'A', volunteerVisible: true, protected: false, approval: { at: 1, note: 'x' } }]);
    expect(subs[0]).toMatchObject({ fromEos: true, approval: null });
  });

  it('refuses to save an unapproved Eos look or sub as volunteer-visible', () => {
    const store = new ConfigStore(tmp());
    expect(() => store.update('looks', [{ ...cueLook, volunteerVisible: true }])).toThrow(/approve/);
    expect(() => store.update('submasters', [{ sub: 1, label: 'House', volunteerVisible: true, protected: false, fromEos: true }])).toThrow(/approve/);
    expect(() => store.update('submasters', [{ sub: 1, label: 'House', volunteerVisible: true, protected: false, fromEos: true, approval: { at: 1, note: 'x' } }])).not.toThrow();
  });

  it('blocks volunteers from unapproved looks, cues and imported subs (operators unaffected)', async () => {
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    store.update('looks', [...cfg.looks, cueLook, { ...cueLook, id: 'l2', name: 'Approved', action: { type: 'cue', list: 1, cue: '5' }, volunteerVisible: true, approval: { at: 1, note: 'x' } }]);
    store.update('submasters', [{ sub: 9, label: 'Imported', volunteerVisible: false, protected: false, fromEos: true }]);
    const c = new Controller(store, () => undefined, () => false);
    expect((await c.execute({ kind: 'fireLook', lookId: 'l1' }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'fireLook', lookId: 'l2' }, 'volunteer')).ok).toBe(true);
    expect((await c.execute({ kind: 'fireCue', list: 1, cue: '2' }, 'volunteer')).message).toMatch(/hasn't been approved/);
    expect((await c.execute({ kind: 'fireCue', list: 1, cue: '5' }, 'volunteer')).ok).toBe(true);
    expect((await c.execute({ kind: 'fireCue', list: 1, cue: '5.0' }, 'volunteer')).ok).toBe(true);
    expect((await c.execute({ kind: 'fireCue', list: 1, cue: '2' }, 'operator')).ok).toBe(true);
    expect((await c.execute({ kind: 'setSub', sub: 9, value: 50 }, 'volunteer')).delivery).toBe('blocked');
    c.shutdown();
  });

  it('imported looks and subs start unapproved and hidden from volunteers', () => {
    const cfg = importedConfig();
    expect(cfg.looks.every((l) => !l.volunteerVisible && !l.approval)).toBe(true);
    expect(cfg.submasters.every((s) => s.fromEos && !s.volunteerVisible && !s.approval)).toBe(true);
  });

  it('marks re-imported submasters as from Eos even when nothing changed', () => {
    const show = parseShowFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'eos-import', 'eos-export.csv')), 'x.csv');
    const local = { ...defaultConfig(), submasters: [{ sub: 1, label: 'House Lights', volunteerVisible: true, protected: false }] };
    for (const conflicts of ['use-imported', 'keep-local'] as const) {
      const plan = buildImportPlan(show, local, { ...defaultImportOptions(show, local), conflicts });
      expect(plan.config.submasters.find((s) => s.sub === 1)).toMatchObject({ fromEos: true });
    }
  });

  it('never approves anything automatically when an older configuration is updated', () => {
    const old = defaultConfig() as Partial<AppConfig>;
    old.looks = [{ ...cueLook, volunteerVisible: true }];
    old.submasters = [{ sub: 1, label: 'House Lights', volunteerVisible: true, protected: false }];
    const { config, notes } = migrateConfig(old, defaultConfig());
    expect(config.looks[0]).toMatchObject({ volunteerVisible: false, approval: null });
    expect(config.submasters[0]).toMatchObject({ volunteerVisible: false, approval: null });
    expect(notes.join(' ')).toMatch(/hidden until an operator approves/);
  });
});

describe('Volunteer bypass audit: every volunteer action is authorised on the server', () => {
  const approval = { at: 1, note: 'x' };
  const listApproval = (cfg: AppConfig, list = 1) => {
    const l = cfg.cueLists.find((x) => x.list === list)!;
    return { ...approval, cues: l.cues.map((q) => q.cue) };
  };
  function controller(mutate?: (cfg: AppConfig) => void) {
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    cfg.settings.connection.eosVersion = '3.3.10'; // documented cue-list GO/BACK
    mutate?.(cfg);
    store.replaceAll(cfg);
    return { c: new Controller(store, () => undefined, () => false), store };
  }

  it('volunteers can only send the command kinds Volunteer Mode needs', async () => {
    const { c } = controller();
    const operatorOnly: Parameters<Controller['execute']>[0][] = [
      { kind: 'setColor', target: { type: 'group', groupId: 'grp-front' }, rgb: { r: 1, g: 1, b: 1 } },
      { kind: 'setParam', target: { type: 'group', groupId: 'grp-front' }, param: 'pan', value: 1 },
      { kind: 'release', target: { type: 'group', groupId: 'grp-front' } },
      { kind: 'singleChannelTest', channel: 20, level: 50, confirmChannel: 20 },
      { kind: 'verifyGroups' }, { kind: 'setMode', mode: 'eos-live', confirm: true },
      { kind: 'unlockProtected', confirm: true }, { kind: 'lockProtected' }, { kind: 'syncFromConsole' },
    ];
    for (const cmd of operatorOnly) expect((await c.execute(cmd, 'volunteer')).message, cmd.kind).toMatch(/operator PIN/);
    expect((await c.execute({ kind: 'go' }, null)).delivery).toBe('blocked');
    c.shutdown();
  });

  it('GO, BACK (Stop/Back) are operator-only until an operator approves the whole master cue list', async () => {
    const { c } = controller();
    for (const kind of ['go', 'back'] as const) {
      const r = await c.execute({ kind }, 'volunteer');
      expect(r).toMatchObject({ ok: false, delivery: 'blocked' });
      expect(r.message).toMatch(/hasn't been reviewed and approved/);
      expect((await c.execute({ kind }, 'operator')).ok).toBe(true);
    }
    expect(c.status().volunteerPlayback).toMatch(/approved/);
    c.shutdown();

    const ok = controller((cfg) => { cfg.cueLists[0].playbackApproval = listApproval(cfg); });
    expect(ok.c.status().volunteerPlayback).toBeNull();
    expect((await ok.c.execute({ kind: 'go' }, 'volunteer')).ok).toBe(true);
    expect((await ok.c.execute({ kind: 'back' }, 'volunteer')).ok).toBe(true);
    // Another list is still operator-only, approved or not.
    expect((await ok.c.execute({ kind: 'go', list: 2 }, 'volunteer')).delivery).toBe('blocked');
    ok.c.shutdown();
  });

  it('fails safe when GO/BACK are console keys (the master playback can hold any cue list)', async () => {
    const { c } = controller((cfg) => {
      cfg.settings.connection.eosVersion = '2.9.3';
      cfg.cueLists[0].playbackApproval = listApproval(cfg);
    });
    expect(c.status().goBack.method).toBe('keys');
    expect((await c.execute({ kind: 'go' }, 'volunteer')).message).toMatch(/can't tell which cue list/);
    expect((await c.execute({ kind: 'back' }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'go' }, 'operator')).ok).toBe(true);
    c.shutdown();
  });

  it('withdraws a cue list approval when its cues change, when it is imported again, or when Eos reports different cues', () => {
    const cfg = defaultConfig();
    const l1 = cfg.cueLists[0];
    const approved = { ...l1, playbackApproval: listApproval(cfg) };
    expect(playbackApproved(approved)).toBe(true);
    // Labels may change; cue numbers may not.
    expect(normalizeCueListApprovals([approved], [{ ...approved, cues: approved.cues.map((q) => ({ ...q, label: 'x' })) }]).cueLists[0].playbackApproval).not.toBeNull();
    const added = normalizeCueListApprovals([approved], [{ ...approved, cues: [...approved.cues, { cue: '99', label: 'new' }] }]);
    expect(added.cueLists[0].playbackApproval).toBeNull();
    expect(added.withdrawn).toEqual([l1.list]);
    // An ordinary save can't create one.
    expect(normalizeCueListApprovals([l1], [approved]).cueLists[0].playbackApproval).toBeNull();
    // Eos reports a different list.
    const withApproval = { ...cfg, cueLists: [approved, ...cfg.cueLists.slice(1)] };
    expect(volunteerPlaybackBlock(withApproval, l1.list, 'cue-list', approved.playbackApproval.cues)).toBeNull();
    expect(volunteerPlaybackBlock(withApproval, l1.list, 'cue-list', ['1', '2'])).toMatch(/Eos reports different cues/);
    // Import never carries an approval over.
    const show = parseShowFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'eos-import', 'eos-export.csv')), 'x.csv');
    const imported = importedConfig();
    imported.cueLists = imported.cueLists.map((l) => ({ ...l, playbackApproval: { ...approval, cues: l.cues.map((q) => q.cue) } }));
    for (const mode of ['merge', 'replace'] as const) {
      const plan = buildImportPlan(show, imported, { ...defaultImportOptions(show, imported), mode });
      expect(plan.config.cueLists.every((l) => !l.playbackApproval), mode).toBe(true);
      expect(plan.notices.some((n) => /GO\/BACK approval withdrawn/.test(n.message))).toBe(true);
    }
  });

  it('every submaster needs approval, imported or not, and protected subs stay locked', async () => {
    const store = new ConfigStore(tmp());
    expect(() => store.update('submasters', [{ sub: 1, label: 'House Lights', volunteerVisible: true, protected: false }])).toThrow(/approve/);
    store.update('submasters', [
      { sub: 1, label: 'House Lights', volunteerVisible: false, protected: false },
      { sub: 2, label: 'Wash', volunteerVisible: true, protected: false, approval },
      { sub: 3, label: 'Relay', volunteerVisible: true, protected: true, approval },
    ]);
    const c = new Controller(store, () => undefined, () => false);
    expect((await c.execute({ kind: 'setSub', sub: 1, value: 50 }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'setSub', sub: 2, value: 50 }, 'volunteer')).ok).toBe(true);
    expect((await c.execute({ kind: 'setSub', sub: 3, value: 50 }, 'volunteer')).message).toMatch(/protected/);
    expect((await c.execute({ kind: 'setSub', sub: 7, value: 50 }, 'volunteer')).delivery).toBe('blocked');
    c.shutdown();
  });

  it('a look cannot get round the protection on the sub or group it uses', async () => {
    const { c } = controller((cfg) => {
      cfg.submasters = [{ sub: 3, label: 'Relay', volunteerVisible: false, protected: true }];
      cfg.groups.find((g) => g.id === 'grp-utility')!.eosGroup = 9;
      cfg.looks.push(
        { id: 'sub-look', name: 'Sub look', description: '', icon: 'sun', gradient: ['#000', '#111'], action: { type: 'sub', sub: 3, level: 100 }, preview: [], volunteerVisible: true, approval },
        { id: 'preset-look', name: 'Preset look', description: '', icon: 'sun', gradient: ['#000', '#111'], action: { type: 'preset', preset: 1, eosGroup: 9 }, preview: [], volunteerVisible: true, approval },
      );
    });
    for (const role of ['volunteer', 'operator'] as const) {
      expect((await c.execute({ kind: 'fireLook', lookId: 'sub-look' }, role)).message).toMatch(/protected/);
      expect((await c.execute({ kind: 'fireLook', lookId: 'preset-look' }, role)).message).toMatch(/protected/i);
    }
    await c.execute({ kind: 'unlockProtected', confirm: true }, 'operator');
    expect((await c.execute({ kind: 'fireLook', lookId: 'sub-look' }, 'operator')).ok).toBe(true);
    c.shutdown();
  });

  it('volunteer intensity only reaches volunteer groups, never protected channels', async () => {
    const { c } = controller((cfg) => { cfg.groups.find((g) => g.id === 'grp-utility')!.volunteerVisible = true; });
    expect((await c.execute({ kind: 'setIntensity', target: { type: 'channels', channels: [20] }, value: 50 }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-scenic' }, value: 50 }, 'volunteer')).delivery).toBe('blocked');
    expect((await c.execute({ kind: 'setIntensity', target: { type: 'group', groupId: 'grp-utility' }, value: 50 }, 'volunteer')).message).toMatch(/protected/i);
    c.shutdown();
  });
});

describe('Imported identities and arranging', () => {
  it('keeps the Eos label when a group is renamed for volunteers', () => {
    const cfg = importedConfig();
    const g = cfg.groups.find((x) => x.eosGroup === 1)!;
    expect(g.eosLabel).toBe('Front Wash');
    g.name = 'Front lights (volunteers)';
    const show = parseShowFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'eos-import', 'eos-export.csv')), 'again.csv');
    const again = buildImportPlan(show, cfg, defaultImportOptions(show, cfg));
    const g2 = again.config.groups.find((x) => x.eosGroup === 1)!;
    expect(g2).toMatchObject({ name: 'Front lights (volunteers)', eosLabel: 'Front Wash', channels: [1, 2, 3] });
    expect(again.conflicts.some((c) => c.kind === 'group' && c.key === 'Group 1')).toBe(false);
    expect(cfg.fixtures.find((f) => f.channel === 11)!.eosLabel).toBe('Pulpit Special');
  });

  it('Replace never borrows labels, types or positions from the (sample) setup it replaces', () => {
    const show = parseShowFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'eos-import', 'eos-export.csv')), 'x.csv');
    const sample = defaultConfig(); // has its own channel 70 ("Relay 10", protected)
    const plan = buildImportPlan(show, sample, { ...defaultImportOptions(show, sample), mode: 'replace' });
    const f70 = plan.config.fixtures.find((f) => f.channel === 70)!;
    expect(f70.label).toBe('Channel 70');           // the export has no label: not the sample's
    expect(f70.eosLabel).toBe('');                   // exactly what Eos had
    expect(f70.profileId).toBe('generic');
    expect(f70.protected).toBe(true);                // protections are always kept
    expect(plan.config.fixtures.every((f) => f.unplaced)).toBe(true); // sample positions not inherited
  });

  it('adopts an Eos label added later to a group that had none (unless renamed here)', () => {
    const cfg = importedConfig();
    cfg.groups.push({ id: 'grp-eos-5', name: 'Group 5', color: '#fff', channels: [1], eosGroup: 5, volunteerVisible: false, eosLabel: '' });
    const show = parseShowFile(Buffer.from('START_TARGETS\nTARGET_TYPE_AS_TEXT,TARGET_ID,LABEL\nGroup,5,Choir\nEND_TARGETS\nSTART_LEVELS\nTARGET_TYPE_AS_TEXT,TARGET_ID,CHANNEL,PARAMETER_TYPE_AS_TEXT\nGroup,5,1,Intensity\nEND_LEVELS\n'), 'g.csv');
    const plan = buildImportPlan(show, cfg, { ...defaultImportOptions(show, cfg), conflicts: 'use-imported' });
    expect(plan.config.groups.find((g) => g.eosGroup === 5)).toMatchObject({ name: 'Choir', eosLabel: 'Choir' });
  });

  it('puts unplaced fixtures in a holding area below the stage, not on it', () => {
    const cfg = importedConfig();
    expect(cfg.fixtures.every((f) => f.unplaced && f.stage.y > cfg.stage.height)).toBe(true);
  });
});

describe('First Real Connection workflow', () => {
  it('follows the real records, step by step', () => {
    const cfg = importedConfig();
    const ids = (c: AppConfig) => Object.fromEntries(firstConnectionSteps(c).map((s) => [s.id, s.state]));
    expect(ids(cfg)).toEqual({ backup: 'todo', import: 'attention', inspect: 'todo', monitor: 'todo', compare: 'todo', choose: 'todo', live: 'todo' });
    const now = Date.now();
    cfg.settings.commissioning.firstConnection = { showBackedUpAt: now, genuineExportConfirmedAt: now, patchReviewedAt: now, testFixture: { channel: 11, approvedBy: 'TAD', at: now } };
    cfg.settings.commissioning.monitorTest = { at: now, ok: true, replyMs: 3, reportedVersion: '3.3.10.0', detail: 'ok' };
    cfg.verification = { at: now, showName: 'FAKE SHOW (not a real console)', consoleVersion: '3.3.10.0', simulatedConsole: true, summary: { match: 20, different: 0, 'missing-in-eos': 0, 'extra-in-eos': 0, unknown: 0, unsupported: 3 }, fingerprint: 'x' };
    expect(ids(cfg).compare).toBe('attention'); // simulator is not evidence
    cfg.verification = { ...cfg.verification, simulatedConsole: false, showName: 'Sunday' };
    cfg.settings.commissioning.liveTest = { at: now + 1, channel: 11, level: 50, operatorConfirmedLight: true, released: true };
    expect(Object.values(ids(cfg)).every((s) => s === 'done')).toBe(true);
    cfg.fixtures.find((f) => f.channel === 11)!.protected = true;
    expect(ids(cfg).choose).toBe('attention');
  });

  it('never reports the comparison as done from incomplete, old or outdated verification data', () => {
    const cfg = importedConfig();
    const now = Date.now();
    const summary = { match: 20, different: 0, 'missing-in-eos': 0, 'extra-in-eos': 0, unknown: 0, unsupported: 3 };
    const base = { at: now, showName: 'Sunday', consoleVersion: '3.3.10.0', simulatedConsole: false, summary, fingerprint: 'x', localFingerprint: localFingerprint(cfg) };
    const compare = (v: AppConfig['verification']) => firstConnectionSteps({ ...cfg, verification: v }, now).find((s) => s.id === 'compare')!;
    expect(compare(base).state).toBe('done');
    // Something couldn't be checked (e.g. groups the console never reported).
    expect(compare({ ...base, summary: { ...summary, unknown: 2 } }).state).toBe('attention');
    // Verified on another day.
    expect(compare({ ...base, at: now - 2 * 86_400_000 }).state).toBe('attention');
    // Eos identities edited here after verifying (renaming for volunteers doesn't count).
    const renamed = structuredClone(cfg); renamed.fixtures[0].label = 'Friendly name';
    expect(firstConnectionSteps({ ...renamed, verification: base }, now).find((s) => s.id === 'compare')!.state).toBe('done');
    const edited = structuredClone(cfg); edited.fixtures[0].dmx = { universe: 9, address: 1 };
    expect(firstConnectionSteps({ ...edited, verification: base }, now).find((s) => s.id === 'compare')!.state).toBe('attention');
    expect(outdatedWarnings({ ...edited, verification: base }, { showName: null, consoleChangedAt: null, connected: false }, null).join(' ')).toMatch(/changed in Sanctuary Light/);
  });
});
