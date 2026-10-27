/**
 * Eos CSV export (Browser → File → Export → CSV).
 *
 * The file is a series of blocks. Each block starts with a START_<NAME> row, then a title row
 * of column names, then data, then END_<NAME>. ETC does not publish a column reference, so
 * blocks are recognised by their COLUMNS, never by position:
 *   - target blocks (TARGET_TYPE … TARGET_ID … LABEL, no CHANNEL): cues, groups, subs, presets,
 *     palettes and their labels/timing. Columns seen in Eos 3.x exports include TIME_DATA,
 *     UP_DELAY, DOWN_TIME, DOWN_DELAY, FOCUS_TIME … FOLLOW, LINK, MARK, BLOCK, ASSERT.
 *   - level blocks (TARGET_TYPE … CHANNEL … PARAMETER_TYPE_AS_TEXT): which channels and
 *     parameters each cue/group/sub/palette records.
 *   - patch blocks (CHANNEL plus ADDRESS / FIXTURE / LABEL columns, no TARGET_TYPE).
 * Anything else is reported as not interpreted. A plain patch spreadsheet with a "channel"
 * header (Sanctuary Light's own patch CSV) is read as a patch block too.
 */
import type { PaletteKind, ParsedShow } from '@sanctuary/shared';
import { parseCsv } from '../store/patchImport';
import { parseAddress, parseChannel, ShowBuilder } from './builder';

type Row = Record<string, string>;

const col = (row: Row, ...names: string[]) => {
  for (const n of names) { const v = row[n]; if (v !== undefined && v.trim() !== '') return v.trim(); }
  return '';
};

/** Normalise a column title: "Fixture Type" → FIXTURE_TYPE. */
const key = (h: string) => h.trim().replace(/^﻿/, '').toUpperCase().replace(/[\s-]+/g, '_');

type TargetKind = 'cue' | 'cuelist' | 'group' | 'sub' | PaletteKind | 'other';

/** Eos target type from TARGET_TYPE_AS_TEXT. The numeric TARGET_TYPE code is not documented, so it is not used. */
function targetKind(text: string): TargetKind {
  const t = text.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  if (t === 'cue') return 'cue';
  if (t === 'cue list' || t === 'cuelist') return 'cuelist';
  if (t === 'group') return 'group';
  if (t === 'sub' || t === 'submaster') return 'sub';
  if (t === 'preset') return 'preset';
  if (t === 'ip' || t === 'intensity palette') return 'intensity';
  if (t === 'fp' || t === 'focus palette') return 'focus';
  if (t === 'cp' || t === 'color palette' || t === 'colour palette') return 'color';
  if (t === 'bp' || t === 'beam palette') return 'beam';
  return 'other';
}

/** Cue list number from TARGET_LIST_NUMBER: a whole number ≥ 1, empty → list 1, anything else → null. */
function listNumber(raw: string): number | null {
  if (!raw.trim()) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : n === 0 ? 1 : null;
}

const isPalette = (k: TargetKind): k is PaletteKind => ['preset', 'intensity', 'focus', 'color', 'beam'].includes(k);
const flag = (v: string) => v !== '' && !/^(0|no|false|off)$/i.test(v);

interface Block { name: string; header: string[]; rows: { line: number; row: Row; raw: string[] }[]; line: number }

function blocks(text: string, b: ShowBuilder): { blocks: Block[]; loose: string[][] } {
  // Track line numbers: parseCsv drops blank rows, so re-parse row by row with offsets.
  const out: Block[] = [];
  const loose: string[][] = [];
  const rows = parseCsvWithLines(text);
  let cur: Block | null = null;
  for (const { cells, line } of rows) {
    if (cells[0] === UNTERMINATED) { b.issue('error', 'A quoted value is never closed, so the end of the file could not be read. The file may be damaged or cut short.', line); continue; }
    const first = (cells[0] ?? '').trim().replace(/^﻿/, '');
    const start = first.match(/^START_([A-Z0-9_]+)$/i);
    const end = first.match(/^END_([A-Z0-9_]+)$/i);
    if (start) {
      if (cur) b.issue('warning', `Block ${cur.name} has no END_${cur.name} line.`, cur.line);
      cur = { name: start[1].toUpperCase(), header: [], rows: [], line };
      out.push(cur);
      continue;
    }
    if (end) {
      if (!cur) b.issue('warning', `${first} without a matching START line.`, line);
      cur = null;
      continue;
    }
    if (!cur) { loose.push(cells); continue; }
    if (!cur.header.length) { cur.header = cells.map(key); continue; }
    const row: Row = {};
    cur.header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    cur.rows.push({ line, row, raw: cells });
  }
  if (cur) b.issue('warning', `Block ${cur.name} has no END_${cur.name} line (file may be cut short).`, cur.line);
  return { blocks: out, loose };
}

const UNTERMINATED = '\u0000unterminated';

function parseCsvWithLines(text: string): { cells: string[]; line: number }[] {
  // parseCsv understands quoting; count newlines consumed to know each row's starting line.
  const out: { cells: string[]; line: number }[] = [];
  let line = 1; let start = 0; let quoted = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    if (i === text.length && quoted) break; // the unclosed row is reported, not half-imported
    if ((c === '\n' && !quoted) || i === text.length) {
      const chunk = text.slice(start, i).replace(/\r$/, '');
      if (chunk.trim()) {
        const parsed = parseCsv(chunk);
        if (parsed[0]) out.push({ cells: parsed[0], line });
      }
      line += (text.slice(start, i + 1).match(/\n/g) ?? []).length;
      start = i + 1;
    }
  }
  if (quoted) out.push({ cells: [UNTERMINATED], line });
  return out;
}

function readPatch(block: Block, b: ShowBuilder) {
  for (const { line, row, raw } of block.rows) {
    const chRaw = col(row, 'CHANNEL', 'CHAN', 'CH', 'CHANNEL_NUMBER');
    const parsed = parseChannel(chRaw);
    if (!parsed) { b.issue('warning', `Patch row has no usable channel number ("${chRaw}"); skipped.`, line); b.skip('patch row without channel', line, raw.join(',')); continue; }
    const addrRaw = col(row, 'ADDRESS', 'DMX', 'DMX_ADDRESS', 'ADDRESS_DMX', 'ADDR');
    const univ = col(row, 'UNIVERSE', 'UNIV');
    let dmx = addrRaw ? parseAddress(univ && /^\d+$/.test(addrRaw) ? `${univ}/${addrRaw}` : addrRaw) : null;
    if (dmx === 'invalid') { b.issue('warning', `Channel ${parsed.channel}: DMX address "${addrRaw}" not understood; left empty.`, line); dmx = null; }
    const partRaw = col(row, 'PART', 'PART_NUMBER');
    const part = /^\d+$/.test(partRaw) && Number(partRaw) > 0 ? Number(partRaw) : parsed.cell;
    const prot = col(row, 'PROTECTED').toLowerCase();
    b.patch(parsed.channel, {
      label: col(row, 'LABEL', 'CHANNEL_LABEL', 'NAME'),
      manufacturer: col(row, 'MANUFACTURER', 'FIXTURE_MANUFACTURER', 'MFR'),
      fixtureType: col(row, 'FIXTURE_TYPE', 'FIXTURE', 'TYPE', 'DEVICE_TYPE', 'MODEL', 'PERSONALITY'),
      // Sanctuary Light's own patch CSV names its profile; that is a profile, not an Eos type.
      profileHint: col(row, 'PROFILE') || undefined,
      protectedHint: ['1', 'true', 'yes', 'y'].includes(prot),
      dmx, part,
    }, line);
  }
}

function readTargets(block: Block, b: ShowBuilder) {
  const unknownTypes = new Map<string, number>();
  for (const { line, row, raw } of block.rows) {
    const typeText = col(row, 'TARGET_TYPE_AS_TEXT');
    if (!typeText) { b.skip('target row without TARGET_TYPE_AS_TEXT', line, raw.join(',')); continue; }
    const kind = targetKind(typeText);
    const id = col(row, 'TARGET_ID');
    const label = col(row, 'LABEL');
    const listRaw = col(row, 'TARGET_LIST_NUMBER');
    const listNum = listNumber(listRaw);
    if (kind === 'other') { unknownTypes.set(typeText, (unknownTypes.get(typeText) ?? 0) + 1); continue; }
    if (kind === 'cuelist') {
      const n = Number(id || listNum || 0);
      if (Number.isInteger(n) && n > 0) b.cueList(n, label);
      continue;
    }
    if (kind === 'cue') {
      if (listNum === null) { b.issue('warning', `Cue ${id}: cue list "${listRaw}" is not a whole number; skipped.`, line); continue; }
      const q = b.cue(listNum, id, line);
      if (!q) continue;
      const part = Number(col(row, 'PART_NUMBER', 'PART') || '0');
      if (part > 0) { q.parts = Math.max(q.parts, part); continue; } // part rows: counted, base cue keeps its own data
      if (label) q.label = label;
      const t = q.timing;
      const set = (k: string, ...names: string[]) => { const v = col(row, ...names); if (v) (t as Record<string, unknown>)[k] = v; };
      set('time', 'UP_TIME', 'TIME_DATA', 'TIME'); set('upDelay', 'UP_DELAY');
      set('down', 'DOWN_TIME'); set('downDelay', 'DOWN_DELAY');
      set('focus', 'FOCUS_TIME'); set('focusDelay', 'FOCUS_DELAY');
      set('color', 'COLOR_TIME'); set('colorDelay', 'COLOR_DELAY');
      set('beam', 'BEAM_TIME'); set('beamDelay', 'BEAM_DELAY');
      set('follow', 'FOLLOW'); set('hang', 'HANG'); set('link', 'LINK');
      const flags = [['MARK', 'Mark'], ['BLOCK', 'Block'], ['ASSERT', 'Assert'], ['ALL_FADE', 'All fade'], ['PREHEAT', 'Preheat']]
        .filter(([c]) => flag(col(row, c))).map(([, n]) => n);
      if (flags.length) t.flags = flags;
      const notes = col(row, 'CUE_NOTES', 'NOTES');
      const scene = col(row, 'SCENE_TEXT');
      if (notes || scene) q.notes = [scene && `Scene: ${scene}`, notes].filter(Boolean).join(' · ');
      continue;
    }
    const n = Number(id);
    if (kind === 'group') { if (Number.isInteger(n) && n > 0) b.group(n, label, line); else b.issue('warning', `Group "${id}" is not a whole number; skipped.`, line); continue; }
    if (kind === 'sub') { if (Number.isInteger(n) && n > 0) b.sub(n, label); else b.issue('warning', `Submaster "${id}" is not a whole number; skipped.`, line); continue; }
    if (isPalette(kind)) { if (/^\d+(\.\d+)?$/.test(id)) b.palette(kind, id, label); continue; }
  }
  for (const [t, n] of unknownTypes) {
    b.issue('info', `${n} ${t} item(s) are in the export but Sanctuary Light has no use for them (they keep working in Eos).`);
    b.skip(`target type "${t}"`, block.line, `${n} rows`);
  }
}

function readLevels(block: Block, b: ShowBuilder) {
  for (const { line, row, raw } of block.rows) {
    const kind = targetKind(col(row, 'TARGET_TYPE_AS_TEXT'));
    const ch = parseChannel(col(row, 'CHANNEL'));
    if (!ch) { b.skip('level row without channel', line, raw.join(',')); continue; }
    const param = col(row, 'PARAMETER_TYPE_AS_TEXT', 'PARAMETER');
    if (param) b.parameter(ch.channel, param);
    const id = col(row, 'TARGET_ID');
    const listNum = listNumber(col(row, 'TARGET_LIST_NUMBER'));
    if (kind === 'group') { const n = Number(id); if (Number.isInteger(n) && n > 0) b.groupChannel(n, ch.channel); }
    else if (kind === 'sub') { const n = Number(id); if (Number.isInteger(n) && n > 0) b.subChannel(n, ch.channel); }
    else if (kind === 'cue') {
      if (listNum === null) { b.skip('level row with an invalid cue list', line, raw.join(',')); continue; }
      const q = b.cue(listNum, id, line);
      if (q) b.cueMove(listNum, q, ch.channel);
    } else if (isPalette(kind) && /^\d+(\.\d+)?$/.test(id)) {
      const p = b.palette(kind, id, null);
      p.members.add(ch.channel);
      if (param) p.paramSet.add(param);
    }
  }
}

export function parseEosCsv(text: string, fileName: string, encoding: string): ParsedShow {
  const b = new ShowBuilder();
  const { blocks: list, loose } = blocks(text, b);

  if (!list.length) {
    // No START_/END_ blocks: a plain patch spreadsheet (channel, label, type, address…).
    const header = (loose[0] ?? []).map(key);
    if (!header.some((h) => ['CHANNEL', 'CHAN', 'CH', 'CHANNEL_NUMBER'].includes(h))) {
      b.issue('error', 'This CSV has no Eos export blocks and no "channel" column, so it isn\'t an Eos export or a patch list.');
      return b.finish('unsupported', 'CSV (not recognised)', fileName, encoding);
    }
    const rows = loose.slice(1).map((cells, i) => {
      const row: Row = {}; header.forEach((h, j) => { row[h] = (cells[j] ?? '').trim(); });
      return { line: i + 2, row, raw: cells };
    });
    readPatch({ name: 'PATCH', header, rows, line: 1 }, b);
    return b.finish('patch-csv', 'Patch spreadsheet (CSV)', fileName, encoding);
  }

  for (const block of list) {
    const h = new Set(block.header);
    if (!block.header.length) { b.issue('warning', `Block ${block.name} is empty.`, block.line); continue; }
    if (h.has('TARGET_TYPE_AS_TEXT') && h.has('CHANNEL')) readLevels(block, b);
    else if (h.has('TARGET_TYPE_AS_TEXT') && h.has('TARGET_ID')) readTargets(block, b);
    else if (h.has('TARGET_TYPE') && !h.has('TARGET_TYPE_AS_TEXT')) {
      b.issue('warning', `Block ${block.name} names target types only by number, which ETC doesn't document; it was not read.`, block.line);
      b.skip(`block ${block.name}`, block.line, `${block.rows.length} rows`);
    } else if (h.has('CHANNEL') || h.has('CHAN')) readPatch(block, b);
    else {
      b.issue('info', `Block ${block.name} (${block.rows.length} rows) isn't used by Sanctuary Light.`, block.line);
      b.skip(`block ${block.name}`, block.line, `${block.rows.length} rows`);
    }
  }
  return b.finish('eos-csv', 'Eos CSV export', fileName, encoding);
}
