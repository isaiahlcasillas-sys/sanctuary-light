/**
 * Import Eos Show: parsing, configuration planning, and the offline/read-only guarantee.
 * Test files live in test/fixtures/eos-import. They are written to the documented formats
 * (Eos CSV column titles as published from Eos 3.x exports; USITT ASCII), not copied from a
 * real console: see that folder's README.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildImportPlan, defaultImportOptions, type AppConfig, type ImportOptions, type ParsedShow } from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { decodeText } from '../src/import/decode';
import { parseShowFile } from '../src/import';
import { ShowImportService } from '../src/import/service';
import { ConfigStore } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { startFakeEos, type FakeEos } from '../tools/fake-eos';

const dir = path.join(__dirname, 'fixtures', 'eos-import');
const read = (f: string) => fs.readFileSync(path.join(dir, f));
const parse = (f: string) => parseShowFile(read(f), f);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-import-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(20); }
}
const ch = (s: ParsedShow, n: number) => s.channels.find((c) => c.channel === n)!;
const opts = (s: ParsedShow, cfg: AppConfig, patch: Partial<ImportOptions> = {}): ImportOptions => ({ ...defaultImportOptions(s, cfg), ...patch });

describe('Eos CSV export', () => {
  const s = parse('eos-export.csv');

  it('reads the patch: channels, labels, types, DMX, parts', () => {
    expect(s.format).toBe('eos-csv');
    expect(s.encoding).toBe('UTF-8');
    expect(s.channels.map((c) => c.channel)).toEqual([1, 2, 3, 11, 12, 21, 22, 31, 41, 61, 70, 80, 201, 202]);
    expect(ch(s, 11)).toMatchObject({ label: 'Pulpit Special', manufacturer: 'ETC', fixtureType: 'Source Four LED Series 2 Lustr', dmx: { universe: 2, address: 1 } });
    expect(ch(s, 1).dmx).toEqual({ universe: 1, address: 1 });
    expect(ch(s, 201)).toMatchObject({ parts: 2, label: 'Cyc Cell 1', addresses: [{ universe: 7, address: 1 }, { universe: 7, address: 2 }] });
    expect(ch(s, 70)).toMatchObject({ fixtureType: null, label: '' });
  });

  it('reports duplicates, bad rows and bad addresses instead of guessing', () => {
    const msgs = s.issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/Channel 3 appears more than once/);
    expect(ch(s, 3).label).toBe('Front Wash C'); // first entry kept
    expect(msgs).toMatch(/no usable channel number \("abc"\)/);
    expect(msgs).toMatch(/Channel 80: DMX address "2\/999" not understood/);
    expect(ch(s, 80).dmx).toBeNull();
    expect(msgs).toMatch(/Channels 201, 202 share DMX address 7\/1/);
    expect(msgs).toMatch(/Cue number "A1" in list 2/);
    expect(s.uninterpreted.byKind['block SHOWCONTROL']).toBe(1);
    expect(s.uninterpreted.byKind['target type "Macro"']).toBe(1);
  });

  it('reads groups and submasters with their channels', () => {
    expect(s.groups.map((g) => [g.number, g.label, g.channels])).toEqual([[1, 'Front Wash', [1, 2, 3]], [2, 'Specials', [11, 12]], [3, 'Stage Color', [21, 22, 999]]]);
    expect(s.subs.map((g) => [g.number, g.label, g.channels])).toEqual([[1, 'House Lights', [41]], [5, 'Relays', [61]]]);
  });

  it('reads multiple cue lists with labels and exported timing, without reinterpreting it', () => {
    expect(s.cueLists.map((l) => l.list)).toEqual([1, 2]);
    const l1 = s.cueLists[0].cues;
    expect(l1.map((q) => q.cue)).toEqual(['1', '2', '2.5', '3', '4']);
    expect(l1[1]).toMatchObject({ label: 'Welcome', timing: { time: '3', upDelay: '1', follow: '2', flags: ['Mark'] } });
    expect(l1[3]).toMatchObject({ label: 'Sermon, "Full" Focus', parts: 2, timing: { time: '8', focus: '4', color: '6', flags: ['Block'] }, notes: 'Pastor center' });
    expect(l1[4].timing.link).toBe('1');
    expect(s.cueLists[1].cues.find((q) => q.cue === '10')!.timing.time).toBe('0:03');
  });

  it('counts tracked cue changes but never treats them as a complete look', () => {
    const q1 = s.cueLists[0].cues[0];
    expect(q1.movedChannels).toBe(2);
    expect(Object.keys(q1)).not.toContain('levels');
  });

  it('collects parameters per channel and presets/palettes', () => {
    expect(ch(s, 11).parameters).toEqual(['Blue', 'Green', 'Indigo', 'Intensity', 'Lime', 'Red']);
    expect(ch(s, 31).parameters).toEqual(['Edge', 'Intensity', 'Pan', 'Tilt', 'Zoom']);
    expect(s.palettes.map((p) => `${p.kind}:${p.number}:${p.label}`)).toEqual(['beam:4:Tight', 'color:1:Amber', 'focus:2:Pulpit', 'intensity:3:Half', 'preset:1:Warm Stage']);
    expect(s.palettes.find((p) => p.kind === 'color')!.channels).toEqual([11]);
  });

  it('handles UTF-16 (with and without BOM), LF line endings and Latin-1', () => {
    const text = read('eos-export.csv').toString('utf8').replace(/^﻿/, '');
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    const be = Buffer.from(Buffer.from(text, 'utf16le')).swap16();
    const noBom = Buffer.from(text, 'utf16le');
    for (const [buf, enc] of [[le, 'UTF-16 LE'], [Buffer.concat([Buffer.from([0xfe, 0xff]), be]), 'UTF-16 BE'], [noBom, 'UTF-16 LE'], [Buffer.from(text.replace(/\r\n/g, '\n')), 'ASCII']] as const) {
      const r = parseShowFile(buf, 'show.csv');
      expect(r.encoding).toBe(enc);
      expect(r.channels).toHaveLength(14);
      expect(r.cueLists[0].cues).toHaveLength(5);
    }
    const latin = parse('latin1-patch.csv');
    expect(latin.encoding).toMatch(/1252/);
    expect(latin.format).toBe('patch-csv');
    expect(latin.channels.map((c) => c.label)).toEqual(['Chœur gauche', 'Baptistère', 'Café ‘Hall’']);
  });
});

describe('USITT ASCII export', () => {
  it('reads patch (including two-fers), labels, groups, subs and cue lists', () => {
    const s = parse('eos-show.asc');
    expect(s.format).toBe('usitt-ascii');
    expect(s.source).toMatchObject({ Manufacturer: 'ETC', Console: 'Eos', $$Format: '3.20', $$Title: 'Sunday Worship' });
    expect(s.channels.map((c) => c.channel)).toEqual([1, 2, 3, 4, 11, 12]);
    expect(ch(s, 4).addresses).toEqual([{ universe: 1, address: 4 }, { universe: 1, address: 5 }]);
    expect(ch(s, 11)).toMatchObject({ label: 'Pulpit Special', dmx: { universe: 2, address: 1 }, fixtureType: null });
    expect(s.groups.map((g) => [g.number, g.label, g.channels])).toEqual([[1, 'Front Wash', [1, 2, 3, 4]], [2, 'Specials', [11, 12]]]);
    expect(s.subs[0]).toMatchObject({ number: 1, label: 'House Lights', channels: [1, 2] });
    expect(s.cueLists.map((l) => [l.list, l.cues.map((q) => q.cue)])).toEqual([[1, ['1', '2', '2.5', '3', '4']], [2, ['1']]]);
  });

  it('keeps base cue timing when parts follow, and prefers $$UText labels', () => {
    const s = parse('eos-show.asc');
    const [c1, c2, , c3, c4] = s.cueLists[0].cues;
    expect(c1).toMatchObject({ label: 'Walk in', timing: { time: '5', upDelay: '1', down: '5' }, movedChannels: 3 });
    expect(c2).toMatchObject({ label: 'Welcome – Bienvenue', timing: { time: '3', follow: '2' } });
    expect(c3).toMatchObject({ label: 'Sermon', parts: 2, timing: { time: '8' } });
    expect(c4.timing.link).toBe('1');
  });

  it('lists what it did not interpret instead of guessing', () => {
    const s = parse('eos-show.asc');
    expect(s.uninterpreted.byKind).toMatchObject({ $$Param: 1, $$Effect: 1, 'Foo (unknown keyword)': 1, 'after EndData': 1 });
    expect(s.channels.some((c) => c.channel === 999)).toBe(false);
  });

  it('reads the commas-only delimiter option', () => {
    const s = parse('commas-only.asc');
    expect(s.channels.map((c) => [c.channel, c.dmx?.address])).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(s.groups[0]).toMatchObject({ label: 'Front Wash', channels: [1, 2, 3] });
    expect(s.cueLists[0].cues.map((q) => q.label)).toEqual(['Walk in', 'Welcome']);
    expect(s.issues.some((i) => /EndData/.test(i.message))).toBe(false);
  });

  it('warns about a missing EndData (cut-short file)', () => {
    const s = parseShowFile(Buffer.from('Ident 3:0\nPatch 1 1<1@FL\nCue 1 1\nText A\n'), 'cut.asc');
    expect(s.channels).toHaveLength(1);
    expect(s.issues.some((i) => /EndData/.test(i.message))).toBe(true);
  });
});

describe('Files that cannot be imported', () => {
  it('recognises native Eos show files and explains how to export', () => {
    for (const name of ['Sunday.esf', 'Sunday.esf2', 'Sunday.esf3d', 'SUNDAY.ESF']) {
      const s = parseShowFile(read('Sunday.esf3d'), name);
      expect(s.format).toBe('eos-native');
      expect(s.channels).toEqual([]);
      expect(s.issues[0].message).toMatch(/Export the show from Eos as CSV/);
    }
  });

  it('rejects binary, empty, unrelated and damaged files clearly', () => {
    expect(parse('garbage.bin')).toMatchObject({ format: 'unsupported', issues: [{ severity: 'error' }] });
    expect(parseShowFile(new Uint8Array(), 'x.csv').issues[0].message).toMatch(/empty/);
    expect(parse('not-eos.csv')).toMatchObject({ format: 'unsupported' });
    const t = parse('truncated.csv');
    expect(t.channels.map((c) => c.channel)).toEqual([1]); // the unclosed row is not half-imported
    expect(t.issues.some((i) => i.severity === 'error' && /never closed/.test(i.message))).toBe(true);
    expect(t.issues.some((i) => /no END_CHANNELS/.test(i.message))).toBe(true);
  });

  it('skips cue rows with an invalid cue list instead of failing the import', () => {
    const csv = 'START_LEVELS\nTARGET_TYPE_AS_TEXT,TARGET_LIST_NUMBER,TARGET_ID,CHANNEL,PARAMETER_TYPE_AS_TEXT\nCue,1.5,1,1,Intensity\nCue,x,2,1,Intensity\nCue,2,3,1,Intensity\nEND_LEVELS\nSTART_TARGETS\nTARGET_TYPE_AS_TEXT,TARGET_LIST_NUMBER,TARGET_ID,LABEL\nCue,2.5,9,Bad list\nEND_TARGETS\n';
    const s = parseShowFile(Buffer.from(csv), 'lists.csv');
    expect(s.cueLists.map((l) => l.list)).toEqual([2]);
    expect(s.issues.some((i) => /cue list "2.5" is not a whole number/.test(i.message))).toBe(true);
    const cfg = defaultConfig();
    expect(() => new ConfigStore(tmp()).applyImport(buildImportPlan(s, cfg, defaultImportOptions(s, cfg)).config)).not.toThrow();
  });

  it('reads DMX addresses the same way as the patch spreadsheet import', () => {
    const s = parseShowFile(Buffer.from('channel,address\n1,2.101\n2,2-5\n3,613\n'), 'a.csv');
    expect(s.channels.map((c) => c.dmx)).toEqual([{ universe: 2, address: 101 }, { universe: 2, address: 5 }, { universe: 2, address: 101 }]);
  });

  it('copes with missing fields', () => {
    const csv = 'START_TARGETS\r\nTARGET_TYPE_AS_TEXT,TARGET_ID,LABEL\r\nCue,1,\r\nGroup,x,Bad\r\nGroup,4,\r\nEND_TARGETS\r\n';
    const s = parseShowFile(Buffer.from(csv), 'partial.csv');
    expect(s.cueLists[0]).toMatchObject({ list: 1, cues: [{ cue: '1', label: '' }] });
    expect(s.groups).toEqual([{ number: 4, label: '', channels: [], line: 5 }]);
    expect(s.issues.some((i) => /Group "x"/.test(i.message))).toBe(true);
    const numericOnly = parseShowFile(Buffer.from('START_TARGETS\nTARGET_TYPE,TARGET_ID,LABEL\n1,1,A\nEND_TARGETS\n'), 'n.csv');
    expect(numericOnly.cueLists).toEqual([]);
    expect(numericOnly.issues[0].message).toMatch(/only by number/);
  });

  it('decodes text the same way on every platform', () => {
    expect(decodeText(Uint8Array.from([0x93, 0x48, 0x69, 0x94])).text).toBe('“Hi”');
  });
});

describe('Import plan (what changes in Sanctuary Light)', () => {
  const s = parse('eos-export.csv');
  const base = defaultConfig();

  it('builds profiles only from evidence in the export', () => {
    const empty = { ...structuredClone(base), fixtures: [] };
    const plan = buildImportPlan(s, empty, opts(s, empty));
    const prof = (chan: number) => plan.config.profiles.find((p) => p.id === plan.config.fixtures.find((f) => f.channel === chan)!.profileId)!;
    expect(prof(11)).toMatchObject({ kind: 'led-par', capabilities: ['intensity', 'rgb'], eosParams: { red: 'Red', green: 'Green', blue: 'Blue' }, verified: true });
    expect(prof(21)).toMatchObject({ kind: 'led-bar', capabilities: ['intensity', 'rgb', 'white'] });
    expect(prof(31)).toMatchObject({ kind: 'moving', capabilities: ['intensity', 'zoom', 'focus', 'pantilt'], eosParams: { pan: 'Pan', tilt: 'Tilt', focus: 'Edge' } });
    expect(prof(1)).toMatchObject({ capabilities: ['intensity'], verified: true }); // Eos "Dimmer"
    expect(prof(41)).toMatchObject({ kind: 'pendant', capabilities: ['intensity'], verified: true });
    expect(prof(61)).toMatchObject({ kind: 'relay', capabilities: ['relay'] });
    expect(prof(70).id).toBe('generic'); // no type in the export
    expect(prof(201)).toMatchObject({ capabilities: ['intensity'] });
  });

  it('protects relays named in Eos and never removes a local protection', () => {
    const local = structuredClone(base);
    local.fixtures = local.fixtures.filter((f) => f.channel !== 61);
    const prot = local.fixtures.find((f) => f.channel === 1);
    if (prot) prot.protected = true; else local.fixtures.push({ ...local.fixtures[0], id: 'fx-1', channel: 1, protected: true });
    const plan = buildImportPlan(s, local, opts(s, local, { conflicts: 'use-imported' }));
    expect(plan.config.fixtures.find((f) => f.channel === 61)!.protected).toBe(true);
    expect(plan.config.fixtures.find((f) => f.channel === 1)!.protected).toBe(true);
    const repl = buildImportPlan(s, local, opts(s, local, { mode: 'replace' }));
    expect(repl.config.fixtures.find((f) => f.channel === 1)!.protected).toBe(true);
    expect(repl.notices.some((n) => /Replace removes \d+ protected channel/.test(n.message))).toBe(true);
    expect(plan.config.submasters.find((x) => x.sub === 5)!.protected).toBe(true);
  });

  it('merges with conflict resolution, or replaces', () => {
    const local = structuredClone(base);
    local.fixtures = [{ ...base.fixtures[0], id: 'fx-11', channel: 11, label: 'My pulpit', stage: { x: 333, y: 222, rotation: 0 } }];
    local.groups = [{ id: 'g-mine', name: 'Mine', color: '#fff', channels: [1], eosGroup: 2, volunteerVisible: true }];
    const keep = buildImportPlan(s, local, opts(s, local, { conflicts: 'keep-local' }));
    expect(keep.config.fixtures.find((f) => f.channel === 11)!.label).toBe('My pulpit');
    expect(keep.config.groups.find((g) => g.eosGroup === 2)!.channels).toEqual([1]);
    expect(keep.conflicts.map((c) => [c.kind, c.resolution])).toEqual(expect.arrayContaining([['fixture', 'kept-local'], ['group', 'kept-local']]));
    const use = buildImportPlan(s, local, opts(s, local));
    const f11 = use.config.fixtures.find((f) => f.channel === 11)!;
    expect(f11.label).toBe('Pulpit Special');
    expect(f11.stage).toEqual({ x: 333, y: 222, rotation: 0 }); // stage position kept
    expect(use.config.groups.find((g) => g.eosGroup === 2)).toMatchObject({ id: 'g-mine', channels: [11, 12], volunteerVisible: true });
    const repl = buildImportPlan(s, base, opts(s, base, { mode: 'replace' }));
    expect(repl.config.fixtures.map((f) => f.channel)).toEqual(s.channels.map((c) => c.channel));
    expect(repl.config.groups.every((g) => g.eosGroup != null)).toBe(true);
    expect(repl.changes.fixtures.removed).toBeGreaterThan(0);
  });

  it('never lets missing information in the export overwrite what is known locally', () => {
    const asc = parse('eos-show.asc'); // USITT ASCII: no fixture types, channel 2 has no label
    const local = structuredClone(base);
    const two = local.fixtures.find((f) => f.channel === 2)!;
    two.dmx = { universe: 1, address: 2 }; // same address as the file, so only label/type could differ
    const plan = buildImportPlan(asc, local, opts(asc, local, { conflicts: 'use-imported' }));
    const after = plan.config.fixtures.find((f) => f.channel === 2)!;
    expect(after.profileId).toBe(two.profileId);
    expect(after.label).toBe(two.label);
    expect(plan.conflicts.some((c) => c.key === 'Channel 2')).toBe(false);
  });

  it('keeps fixture ids unique, keeps notes, and never shrinks profiles on re-import', () => {
    const local = structuredClone(base);
    local.fixtures = [{ ...base.fixtures[0], id: 'fx-3', channel: 5, notes: 'Gel R02, aimed at pulpit' },
      { ...base.fixtures[0], id: 'fx-11', channel: 11, label: 'Mine', notes: 'Gel R02' }];
    const plan = buildImportPlan(s, local, opts(s, local));
    const ids = plan.config.fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.config.fixtures.find((f) => f.channel === 3)!.id).not.toBe('fx-3');
    expect(plan.config.fixtures.find((f) => f.channel === 11)).toMatchObject({ id: 'fx-11', label: 'Pulpit Special', notes: 'Gel R02', eosType: 'Source Four LED Series 2 Lustr' });
    // A later export without the LEVELS block has no parameter evidence: controls stay.
    const thin = parseShowFile(Buffer.from(read('eos-export.csv').toString('utf8').replace(/START_LEVELS[\s\S]*END_LEVELS\r\n/, '')), 'thin.csv');
    const again = buildImportPlan(thin, plan.config, opts(thin, plan.config));
    const lustr = again.config.profiles.find((p) => p.name === 'Source Four LED Series 2 Lustr')!;
    expect(lustr.capabilities).toEqual(['intensity', 'rgb']);
  });

  it('reads Sanctuary Light\'s own patch CSV with its profile and protected columns', () => {
    const csv = 'channel,label,profile,universe,address,area,protected\n61,Relay,relay,1,61,utility,yes\n21,Par,stagelight-par-rgbw,1,21,stage,no\n22,Bar,Not A Profile,1,30,stage,no\n';
    const p = parseShowFile(Buffer.from(csv), 'sanctuary-patch.csv');
    expect(p.format).toBe('patch-csv');
    expect(p.channels.every((c) => c.fixtureType === null)).toBe(true);
    const empty = { ...structuredClone(base), fixtures: [] };
    const plan = buildImportPlan(p, empty, opts(p, empty));
    const f = (n: number) => plan.config.fixtures.find((x) => x.channel === n)!;
    expect(f(61)).toMatchObject({ profileId: 'relay', protected: true });
    expect(f(21).profileId).toBe('stagelight-par-rgbw');
    expect(f(22).profileId).toBe('generic');
    expect(plan.config.profiles.some((x) => x.id.startsWith('eos-'))).toBe(false);
  });

  it('keeps a large patch inside the stage plan', () => {
    const lines = ['channel,label,address', ...Array.from({ length: 600 }, (_, i) => `${i + 1},F${i + 1},${i + 1}`)];
    const big = parseShowFile(Buffer.from(lines.join('\n')), 'big.csv');
    const empty = { ...structuredClone(base), fixtures: [] };
    const plan = buildImportPlan(big, empty, opts(big, empty));
    const { width, height } = empty.stage;
    expect(plan.config.fixtures.every((x) => x.stage.x >= 0 && x.stage.x <= width && x.stage.y >= 0 && x.stage.y <= height)).toBe(true);
    expect(new Set(plan.config.fixtures.map((x) => `${x.stage.x},${x.stage.y}`)).size).toBe(600);
  });

  it('places new fixtures in a temporary grid and flags them for arranging', () => {
    const empty = { ...structuredClone(base), fixtures: [] };
    const plan = buildImportPlan(s, empty, opts(s, empty));
    expect(plan.unplaced).toHaveLength(s.channels.length);
    expect(plan.config.fixtures.every((f) => f.unplaced)).toBe(true);
    const keys = new Set(plan.config.fixtures.map((f) => `${f.stage.x},${f.stage.y}`));
    expect(keys.size).toBe(s.channels.length);
  });

  it('creates looks that fire real cues, with no invented preview', () => {
    const plan = buildImportPlan(s, base, opts(s, base, { looksFromList: 1 }));
    const looks = plan.config.looks.filter((l) => l.id.startsWith('look-eos-'));
    expect(looks.map((l) => [l.name, l.action])).toEqual([
      ['Preshow / Walk in', { type: 'cue', list: 1, cue: '1' }], ['Welcome', { type: 'cue', list: 1, cue: '2' }],
      ['Sermon, "Full" Focus', { type: 'cue', list: 1, cue: '3' }], ['Postlude', { type: 'cue', list: 1, cue: '4' }],
    ]);
    expect(looks.every((l) => l.preview.length === 0 && !l.volunteerVisible)).toBe(true);
    // Running the import again does not duplicate looks.
    const again = buildImportPlan(s, plan.config, opts(s, plan.config, { looksFromList: 1 }));
    expect(again.config.looks.filter((l) => l.id.startsWith('look-eos-'))).toHaveLength(4);
  });

  it('stores cue timing and palettes for reference, and leaves the current config untouched', () => {
    const before = JSON.stringify(base);
    const plan = buildImportPlan(s, base, opts(s, base));
    expect(JSON.stringify(base)).toBe(before);
    const list1 = plan.config.cueLists.find((l) => l.list === 1)!;
    expect(list1.cues.find((q) => q.cue === '3')).toMatchObject({ fromEos: true, notes: expect.stringContaining('Time 8 · Focus 4 · Color 6 · Block') });
    expect(plan.config.eosShow).toMatchObject({ fileName: 'eos-export.csv', counts: { channels: 14, cues: 7, palettes: 5 } });
    expect(plan.notices.some((n) => /Group 3 .* not in the patch: 999/.test(n.message))).toBe(true);
    expect(plan.config.settings).toEqual(base.settings); // connection, safety, commissioning untouched
    expect(plan.config.architecture).toEqual(base.architecture);
  });

  it('respects what the user chose to import', () => {
    const plan = buildImportPlan(s, base, { ...opts(s, base), include: { fixtures: false, groups: true, cueLists: false, submasters: false, looks: false, palettes: false } });
    expect(plan.config.fixtures).toEqual(base.fixtures);
    expect(plan.config.cueLists).toEqual(base.cueLists);
    expect(plan.changes.groups.added).toBeGreaterThan(0);
  });
});

describe('Applying an import is offline and read-only towards Eos', () => {
  let eos: FakeEos;
  beforeAll(async () => { eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true }); });
  afterAll(() => eos.close());

  function setup() {
    const dataDir = tmp();
    const store = new ConfigStore(dataDir);
    const c = new Controller(store, () => undefined, () => false);
    const svc = new ShowImportService(store, {
      mode: () => c.mode,
      configChanged: (prev) => c.onConfigChanged(prev, { quiet: true }),
      log: (l, m) => c.log(l, m),
    });
    return { dataDir, store, c, svc };
  }

  it('applies in SIM, keeps a named backup, and changes nothing else', () => {
    const { dataDir, store, c, svc } = setup();
    const { token, show } = svc.preview(read('eos-export.csv'), 'eos-export.csv');
    expect(show.channels).toHaveLength(14);
    expect(store.get().eosShow).toBeNull(); // preview changes nothing
    const r = svc.apply(token, { mode: 'merge' });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'backups', r.backup!))).toBe(true);
    expect(store.get().fixtures.find((f) => f.channel === 11)!.label).toBe('Pulpit Special');
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).eosShow.fileName).toBe('eos-export.csv');
    expect(c.mode).toBe('offline');
    expect(svc.apply(token, {}).ok).toBe(false); // a preview is used once
    c.shutdown();
  });

  it('sends nothing to a connected console and does not change the mode', async () => {
    const { store, c, svc } = setup();
    const s = store.get().settings;
    store.update('settings', { ...s, connection: { ...s.connection, consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip!, heartbeatSeconds: 30, staleSeconds: 60 } });
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    await until(() => c.status().connection.state === 'connected');
    await wait(400);
    const before = eos.received.length;
    const { token } = svc.preview(read('eos-export.csv'), 'eos-export.csv');
    expect(svc.apply(token, { mode: 'replace' }).ok).toBe(true);
    await wait(400);
    expect(eos.received.slice(before).filter((m) => !m.startsWith('/eos/ping'))).toEqual([]);
    expect(c.mode).toBe('eos-monitor');
    c.shutdown();
  });

  it('refuses while Live is armed, and refuses files that cannot be imported', async () => {
    const { store, c, svc } = setup();
    const s = store.get().settings;
    store.update('settings', { ...s, connection: { ...s.connection, consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip! } });
    await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator');
    const { token } = svc.preview(read('eos-export.csv'), 'eos-export.csv');
    const before = JSON.stringify(store.get());
    expect(svc.apply(token, {})).toMatchObject({ ok: false, error: expect.stringMatching(/Live control is armed/) });
    expect(JSON.stringify(store.get())).toBe(before);
    expect(c.mode).toBe('eos-live');
    c.shutdown();

    const off = setup();
    const native = off.svc.preview(read('Sunday.esf3d'), 'Sunday.esf');
    expect(off.svc.apply(native.token, {}).ok).toBe(false);
    expect(off.svc.apply('nope', {}).error).toMatch(/expired/);
    expect(off.svc.apply(off.svc.preview(read('eos-export.csv'), 'e.csv').token, { include: { fixtures: false, groups: false, cueLists: false, submasters: false, looks: false, palettes: false } }).error).toMatch(/Nothing was selected/);
    off.c.shutdown();
  });

  it('undoes the last import from its backup, once', () => {
    const { store, c, svc } = setup();
    const before = JSON.stringify(store.get());
    const { token } = svc.preview(read('eos-export.csv'), 'eos-export.csv');
    expect(svc.apply(token, { mode: 'replace' }).ok).toBe(true);
    expect(store.get().eosShow).not.toBeNull();
    expect(svc.undoLast()).toMatchObject({ ok: true, restored: expect.stringMatching(/^pre-import-/) });
    expect(JSON.stringify(store.get())).toBe(before);
    expect(svc.undoLast()).toMatchObject({ ok: false, error: expect.stringMatching(/no Eos import to undo/) });
    c.shutdown();
  });

  it('asks before undoing when things changed after the import, and keeps later settings', () => {
    const { store, c, svc } = setup();
    const before = store.get();
    const { token } = svc.preview(read('eos-export.csv'), 'eos-export.csv');
    expect(svc.apply(token, {}).ok).toBe(true);
    // Arrange one fixture and change a setting after the import.
    store.update('fixtures', store.get().fixtures.map((f) => (f.channel === 11 ? { ...f, stage: { x: 10, y: 10, rotation: 0 }, unplaced: false } : f)));
    const s = store.get().settings;
    store.update('settings', { ...s, sanctuaryName: 'Renamed later' });
    expect(svc.undoLast()).toMatchObject({ ok: false, changedSince: true });
    expect(store.get().eosShow).not.toBeNull();
    expect(svc.undoLast(true).ok).toBe(true);
    expect(store.get().fixtures).toEqual(before.fixtures);
    expect(store.get().eosShow).toBeNull();
    expect(store.get().settings.sanctuaryName).toBe('Renamed later');
    c.shutdown();
  });

  it('restored configs and old config files gain the new section', () => {
    const { store } = setup();
    const old = structuredClone(store.get()) as Partial<AppConfig>;
    delete old.eosShow;
    expect(store.replaceAll(old as AppConfig).eosShow).toBeNull();
  });
});
