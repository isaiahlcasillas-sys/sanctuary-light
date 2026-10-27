/**
 * Phase 4B: Apply to Eos (real look playback, intensity only) and operator-assisted Record to
 * Eos with read-back confirmation. Console tests use the FAKE console: simulated, not evidence
 * about the real sanctuary system.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildImportPlan, defaultImportOptions, planLiveLook, MAX_APPLY_COMMANDS, type AppConfig, type Look } from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { parseShowFile } from '../src/import';
import { ConfigStore } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { startFakeEos, type FakeEos, type FakeShow } from '../tools/fake-eos';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-p4b-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(20); }
}

/** The sample CSV export imported with Replace, like the real first import. */
function importedConfig(): AppConfig {
  const show = parseShowFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'eos-import', 'eos-export.csv')), 'eos-export.csv');
  const base = { ...defaultConfig(), fixtures: [], groups: [], cueLists: [], looks: [], submasters: [] };
  return buildImportPlan(show, base, { ...defaultImportOptions(show, base), mode: 'replace' }).config;
}
function consoleShowFrom(cfg: AppConfig, name = 'FAKE SHOW (not a real console)'): FakeShow {
  return {
    name,
    patch: cfg.fixtures.map((f) => ({ channel: f.channel, label: f.eosLabel ?? f.label, manufacturer: 'ETC', model: f.eosType ?? '', address: f.dmx ? (f.dmx.universe - 1) * 512 + f.dmx.address : 0 })),
    cueLists: cfg.cueLists.map((l) => ({ list: l.list, label: l.label, cues: l.cues.map((c) => ({ cue: c.cue, label: c.label })) })),
  };
}

/** A designed look: front wash (1–3, intensity only) at 30/30/45, pulpit special (11) blue, plus house and relay channels. */
const testLook: Look = {
  id: 'test-look', name: 'First test', description: '', icon: 'sun', gradient: ['#000', '#111'], action: { type: 'none' }, preview: [],
  volunteerVisible: false, fadeSeconds: 3,
  fixtures: [
    { channel: 1, intensity: 30 }, { channel: 2, intensity: 30 }, { channel: 3, intensity: 45 },
    { channel: 11, intensity: 60, color: { r: 0, g: 0, b: 100 } },
    { channel: 41, intensity: 50 },   // house pendant: SceneStation shares house lights
    { channel: 61, intensity: 100 },  // relay: protected
  ],
};

describe('Planning Apply to Eos (pure)', () => {
  const cfg = importedConfig();

  it('uses the real channel numbers, groups equal levels, and never addresses Eos groups', () => {
    const plan = planLiveLook(cfg, testLook);
    expect(plan.errors).toEqual([]);
    expect(plan.commands.map((c) => c.text)).toEqual(['Chan 11 At 60 #', 'Chan 3 At 45 #', 'Chan 1 + 2 At 30 #']);
    expect(plan.commands.every((c) => !/Group/.test(c.text))).toBe(true);
  });

  it('skips protected, relay, utility and house channels with a reason', () => {
    const plan = planLiveLook(cfg, testLook);
    const skipped = Object.fromEntries(plan.skipped.map((s) => [s.channel, s.reason]));
    expect(skipped[41]).toMatch(/SceneStation/);
    expect(skipped[61]).toMatch(/Protected/);
    expect(plan.commands.flatMap((c) => c.channels)).not.toContain(41);
    expect(plan.commands.flatMap((c) => c.channels)).not.toContain(61);
  });

  it('leaves out color and other parameters (not yet verified) and says so', () => {
    const plan = planLiveLook(cfg, testLook);
    expect(plan.omitted).toEqual([{ channel: 11, params: ['color'], reason: expect.stringMatching(/hasn't been verified/) }]);
    expect(plan.commands.some((c) => /Red|Blue|Color|param/i.test(c.text))).toBe(false);
  });

  it('adds Eos manual time only when asked, and refuses looks it can\'t apply', () => {
    expect(planLiveLook(cfg, testLook, { fadeSeconds: 2.5 }).commands[0].text).toBe('Chan 11 At 60 Time 2.5 #');
    expect(planLiveLook(cfg, { ...testLook, action: { type: 'cue', list: 1, cue: '2' } }).errors[0]).toMatch(/use Play/);
    expect(planLiveLook(cfg, { ...testLook, fixtures: [] }).errors[0]).toMatch(/no designed fixture levels/);
    expect(planLiveLook(cfg, { ...testLook, fixtures: [{ channel: 61, intensity: 100 }] }).errors[0]).toMatch(/Nothing in this look/);
    expect(planLiveLook(cfg, { ...testLook, fixtures: [{ channel: 999, intensity: 50 }] }).skipped[0].reason).toMatch(/Not in the imported patch/);
  });

  it('caps the number of commands to keep output predictable', () => {
    const many = { ...testLook, fixtures: Array.from({ length: MAX_APPLY_COMMANDS + 1 }, (_, i) => ({ channel: [1, 2, 3, 11, 12, 21, 22, 70, 80, 201, 202][i % 11], intensity: i + 1 })) };
    // Same channel repeated with different levels still creates distinct commands per level.
    const cfg2 = { ...cfg, fixtures: [...cfg.fixtures, ...Array.from({ length: 50 }, (_, i) => ({ ...cfg.fixtures[0], id: `x${i}`, channel: 500 + i }))] };
    const big = { ...many, fixtures: Array.from({ length: MAX_APPLY_COMMANDS + 1 }, (_, i) => ({ channel: 500 + i, intensity: i + 1 })) };
    expect(planLiveLook(cfg2, big).errors[0]).toMatch(/limit is/);
  });
});

describe('Apply to Eos against the FAKE console', { timeout: 30000 }, () => {
  let eos: FakeEos;
  const open: Controller[] = [];
  const cfg0 = importedConfig();
  beforeAll(async () => {
    const groups: Record<number, (number | string)[]> = {};
    for (const g of cfg0.groups) if (g.eosGroup != null) groups[g.eosGroup] = g.channels;
    eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true, version: '3.3.10.0', show: consoleShowFrom(cfg0), groups });
  });
  afterAll(() => eos.close());
  afterEach(() => { for (const c of open.splice(0)) c.shutdown(); eos.mute(false); eos.setShow(consoleShowFrom(cfg0), 'edit'); });

  const lighting = () => eos.received.filter((m) => !/^\/eos\/(get\/|ping|subscribe)/.test(m));

  async function setup(opts: { verify?: boolean; live?: boolean; mutate?: (cfg: AppConfig) => void } = {}) {
    const store = new ConfigStore(tmp());
    const cfg = structuredClone(cfg0);
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip!, heartbeatSeconds: 1, staleSeconds: 2 });
    cfg.looks.push(testLook);
    opts.mutate?.(cfg);
    store.replaceAll(cfg);
    const c = new Controller(store, () => undefined, () => false);
    open.push(c);
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    await until(() => c.status().connection.state === 'connected');
    if (opts.verify !== false) {
      expect(c.startVerification().ok).toBe(true);
      await until(() => store.get().verification !== null, 10000);
    }
    if (opts.live !== false) expect((await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator')).ok).toBe(true);
    eos.received.length = 0;
    return { c, store };
  }

  it('sends exactly the planned intensity commands, reports them, and shows them as commanded (not confirmed)', async () => {
    const { c } = await setup();
    const r = await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    expect(r).toMatchObject({ ok: true, delivery: 'sent' });
    expect(r.report).toMatchObject({ sent: ['Chan 11 At 60 #', 'Chan 3 At 45 #', 'Chan 1 + 2 At 30 #'], failed: [], notSent: [], confirmation: 'not-confirmed' });
    expect(r.message).toMatch(/doesn't report levels back/);
    await until(() => lighting().length === 3);
    expect(lighting()).toEqual(['/eos/newcmd "Chan 11 At 60 #"', '/eos/newcmd "Chan 3 At 45 #"', '/eos/newcmd "Chan 1 + 2 At 30 #"']);
    expect(c.levelsSnapshot().levels[3].intensity).toBe(45);
    expect(c.levelsSnapshot().sources[3]).toBe('commanded');
    expect(c.levelsSnapshot().sources[41]).not.toBe('commanded'); // house: skipped
  });

  it('sends a fade only when asked, as Eos manual time', async () => {
    const { c } = await setup();
    await c.execute({ kind: 'applyLook', lookId: 'test-look', fadeSeconds: 2, confirm: true }, 'operator');
    await until(() => lighting().length === 3);
    expect(lighting()[0]).toBe('/eos/newcmd "Chan 11 At 60 Time 2 #"');
  });

  it('never sends from Simulation or Monitor, or for a volunteer, or without confirmation', async () => {
    const { c } = await setup({ live: false });
    let r = await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    expect(r).toMatchObject({ ok: false, delivery: 'blocked' });
    expect(r.message).toMatch(/Monitor mode can only listen/);
    await c.execute({ kind: 'setMode', mode: 'offline' }, 'operator');
    r = await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    expect(r.message).toMatch(/In SIM, use Preview/);
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    await until(() => c.status().connection.state === 'connected');
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    expect((await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'volunteer')).message).toMatch(/operator PIN/);
    expect((await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: false }, 'operator')).message).toMatch(/confirmation/);
    await wait(100);
    expect(lighting()).toEqual([]);
  });

  it('refuses without a verified show, or when the show changed since verification', async () => {
    const a = await setup({ verify: false });
    expect((await a.c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator')).message).toMatch(/Verify with Eos first/);
    a.c.shutdown();

    const b = await setup();
    eos.setShow({ ...consoleShowFrom(cfg0), name: 'FAKE SHOW (another show)' }, 'load');
    await until(() => b.c.status().connection.showName === 'FAKE SHOW (another show)');
    expect((await b.c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator')).message).toMatch(/Verify again/);
    await wait(100);
    expect(lighting()).toEqual([]);
  });

  it('refuses channels the console didn\'t report, and the sample setup', async () => {
    // A look that names a channel the console never reported (e.g. made before a re-patch).
    const { c } = await setup({ mutate: (cfg) => { cfg.looks = cfg.looks.map((l) => (l.id === 'test-look' ? { ...l, fixtures: [...l.fixtures!, { channel: 777, intensity: 50 }] } : l)); } });
    const r = await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    expect(r.message).toMatch(/777.*weren't in the patch Eos reported/);
    expect(lighting()).toEqual([]);

    const noShow = await setup({ mutate: (cfg) => { cfg.eosShow = null; } });
    expect((await noShow.c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator')).message).toMatch(/Import your Eos show/);
  });

  it('sends nothing when Eos has stopped answering', async () => {
    const { c } = await setup();
    eos.mute(true);
    await until(() => !!c.status().connection.stale, 6000);
    const r = await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    expect(r).toMatchObject({ ok: false, delivery: 'blocked' });
    expect(r.message).toMatch(/not answering/);
    expect(lighting()).toEqual([]);
  });

  it('stops part-way if Live is switched off, and reports what was not sent', async () => {
    const { c } = await setup();
    const p = c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    await wait(5); // first command is out; the rest wait for the gap between commands
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.report!.sent.length).toBeGreaterThanOrEqual(1);
    expect(r.report!.notSent.length).toBeGreaterThanOrEqual(1);
    expect(r.report!.notSent[0].reason).toMatch(/Live mode was switched off/);
    expect(r.report!.sent.length + r.report!.notSent.length).toBe(3);
  });

  it('reports a failed transmission without hiding the ones that went out', async () => {
    const { c } = await setup();
    const engine = (c as unknown as { eos: { transmit(m: unknown): unknown } }).eos;
    const real = engine.transmit.bind(engine);
    let n = 0;
    engine.transmit = (m: unknown) => { if (++n === 2) throw new Error('socket write failed'); return real(m); };
    const r = await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    expect(r.ok).toBe(false);
    expect(r.report!.sent).toEqual(['Chan 11 At 60 #', 'Chan 1 + 2 At 30 #']);
    expect(r.report!.failed).toEqual([{ text: 'Chan 3 At 45 #', error: 'socket write failed' }]);
    expect(r.message).toMatch(/1 failed/);
  });

  it('refuses a second Apply while one is still sending', async () => {
    const { c } = await setup();
    const first = c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    const second = await c.execute({ kind: 'applyLook', lookId: 'test-look', confirm: true }, 'operator');
    expect(second.message).toMatch(/still sending/);
    expect((await first).ok).toBe(true);
    await until(() => lighting().length === 3);
    await wait(100);
    expect(lighting().length).toBe(3);
  });

  it('Record to Eos: checks every precondition and never overwrites a cue', async () => {
    const { c, store } = await setup();
    const req = { lookId: 'test-look', list: 1, cue: '105', label: 'First test', fadeSeconds: 3 };
    expect(c.recordPlan(req)).toMatchObject({ ok: false, error: expect.stringMatching(/Back up the Eos show today/) });
    const s = store.get().settings;
    store.update('settings', { ...s, commissioning: { ...s.commissioning, firstConnection: { showBackedUpAt: Date.now(), genuineExportConfirmedAt: null, patchReviewedAt: null, testFixture: null } } });
    expect(c.recordPlan({ ...req, cue: '2' })).toMatchObject({ ok: false, error: expect.stringMatching(/already exists.*never overwrites/) });
    expect(c.recordPlan({ ...req, list: 9 })).toMatchObject({ ok: false, error: expect.stringMatching(/wasn't found/) });
    expect(c.recordPlan({ ...req, label: 'bad "quote"' })).toMatchObject({ ok: false });
    const plan = c.recordPlan(req);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.steps.join('\n')).toMatch(/\[Record Only\] \[Cue\] 1 \[\/\] 105 \[Enter\]/);
      expect(plan.steps.join('\n')).toMatch(/\[Label\] First test/);
      expect(plan.warnings.join(' ')).toMatch(/changes the show/);
    }
    // The check itself sends nothing.
    await wait(50);
    expect(lighting()).toEqual([]);
  });

  it('Record to Eos: only a cue Eos reports back is called recorded', async () => {
    const { c, store } = await setup();
    const req = { lookId: 'test-look', list: 1, cue: '105', label: 'First test' };
    expect((await c.recordVerify(req)).status).toBe('not-found');
    const show = consoleShowFrom(cfg0);
    show.cueLists[0].cues.push({ cue: '105', label: 'Something else' });
    eos.setShow(show, 'edit');
    expect((await c.recordVerify(req)).status).toBe('label-differs');
    show.cueLists[0].cues[show.cueLists[0].cues.length - 1].label = 'First test';
    eos.setShow(show, 'edit');
    const r = await c.recordVerify(req);
    expect(r.status).toBe('confirmed');
    expect(store.get().looks.find((l) => l.id === 'test-look')!.eosCue).toMatchObject({ list: 1, cue: '105', label: 'First test' });
    expect(lighting()).toEqual([]); // verifying only reads
  });
});
