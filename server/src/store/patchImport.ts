/**
 * Fixture patch import/export (CSV and JSON).
 *
 * CSV columns (header row required, case-insensitive, order free):
 *   channel*, label, profile, universe, address, dmx, area, protected, x, y, rotation, notes
 * - "channel" is the Eos channel number. Aliases: chan, ch.
 * - "dmx" may be "2/101" (universe/address) or an absolute Eos address like 613.
 *   Universe/address are informational in Eos mode.
 * - "profile" matches a profile id or name; unknown types fall back to "generic".
 */
import type { AreaId, Fixture, FixtureProfile } from '@sanctuary/shared';
import { splitAbsoluteAddress } from '../engine/eosFeedback';

export interface ImportResult {
  fixtures: Fixture[];
  warnings: string[];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string> = {
  chan: 'channel', ch: 'channel', 'channel number': 'channel',
  name: 'label', 'fixture type': 'profile', type: 'profile', fixture: 'profile',
  addr: 'address', 'dmx address': 'dmx', univ: 'universe', u: 'universe',
};

const AREAS: AreaId[] = ['stage', 'front', 'house', 'scenic', 'utility'];

export function matchProfile(raw: string, profiles: FixtureProfile[]): FixtureProfile | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  return profiles.find((p) => p.id.toLowerCase() === q)
    ?? profiles.find((p) => p.name.toLowerCase() === q)
    ?? profiles.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()))
    ?? null;
}

function parseDmx(rec: Record<string, string>, warnings: string[], line: number): Fixture['dmx'] {
  const dmx = rec.dmx?.trim();
  if (dmx) {
    const m = dmx.match(/^(\d+)\s*[/.:]\s*(\d+)$/);
    if (m) return { universe: Number(m[1]), address: Number(m[2]) };
    if (/^\d+$/.test(dmx)) return splitAbsoluteAddress(Number(dmx));
    warnings.push(`Line ${line}: could not read DMX "${dmx}"`);
    return null;
  }
  const u = Number(rec.universe); const a = Number(rec.address);
  if (rec.address?.trim() && Number.isInteger(a) && a > 0) {
    if (rec.universe?.trim() && Number.isInteger(u) && u > 0) return { universe: u, address: a };
    return splitAbsoluteAddress(a);
  }
  return null;
}

/** Fill position/area for imported fixtures, keeping existing stage placement by channel. */
function finalize(list: Partial<Fixture>[], existing: Fixture[]): Fixture[] {
  const byChan = new Map(existing.map((f) => [f.channel, f]));
  return list.map((f, i) => {
    const prev = byChan.get(f.channel!);
    return {
      id: `fx-${f.channel}`,
      channel: f.channel!,
      label: f.label || prev?.label || `Channel ${f.channel}`,
      profileId: f.profileId || prev?.profileId || 'generic',
      dmx: f.dmx ?? prev?.dmx ?? null,
      area: f.area || prev?.area || 'stage',
      protected: f.protected ?? prev?.protected ?? false,
      stage: f.stage ?? prev?.stage ?? { x: 80 + (i % 20) * 52, y: 760 - Math.floor(i / 20) * 50, rotation: 0 },
      notes: f.notes ?? prev?.notes,
    };
  });
}

function checkDuplicates(fixtures: Fixture[], warnings: string[]): Fixture[] {
  const seen = new Set<number>();
  return fixtures.filter((f) => {
    if (seen.has(f.channel)) { warnings.push(`Duplicate channel ${f.channel} ignored`); return false; }
    seen.add(f.channel);
    return true;
  }).sort((a, b) => a.channel - b.channel);
}

export function importCsv(text: string, profiles: FixtureProfile[], existing: Fixture[], protectedChannels: Set<number>): ImportResult {
  const warnings: string[] = [];
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return { fixtures: [], warnings: ['CSV needs a header row and at least one data row'] };
  const header = rows[0].map((h) => { const k = h.trim().toLowerCase(); return ALIASES[k] ?? k; });
  if (!header.includes('channel')) return { fixtures: [], warnings: ['CSV must have a "channel" column (Eos channel number, not DMX address)'] };
  const list: Partial<Fixture>[] = [];
  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = (cells[i] ?? '').trim(); });
    const channel = Number(rec.channel);
    if (!Number.isInteger(channel) || channel <= 0) { warnings.push(`Line ${line}: invalid channel "${rec.channel}" skipped`); return; }
    let profileId: string | undefined;
    if (rec.profile) {
      const p = matchProfile(rec.profile, profiles);
      if (p) profileId = p.id;
      else { profileId = 'generic'; warnings.push(`Line ${line}: fixture type "${rec.profile}" not recognized — using Generic`); }
    }
    const area = rec.area?.toLowerCase() as AreaId;
    const x = Number(rec.x); const y = Number(rec.y);
    const prot = rec.protected?.toLowerCase();
    list.push({
      channel,
      label: rec.label || undefined,
      profileId,
      dmx: parseDmx(rec, warnings, line),
      area: AREAS.includes(area) ? area : undefined,
      protected: prot ? ['1', 'true', 'yes', 'y'].includes(prot) : protectedChannels.has(channel) ? true : undefined,
      stage: rec.x && rec.y && Number.isFinite(x) && Number.isFinite(y) ? { x, y, rotation: Number(rec.rotation) || 0 } : undefined,
      notes: rec.notes || (rec.profile && profileId === 'generic' ? `Imported type: ${rec.profile}` : undefined),
    });
  });
  return { fixtures: checkDuplicates(finalize(list, existing), warnings), warnings };
}

export function importJson(text: string, existing: Fixture[]): ImportResult {
  const warnings: string[] = [];
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { fixtures: [], warnings: [`Invalid JSON: ${(e as Error).message}`] }; }
  const arr = Array.isArray(data) ? data : (data as { fixtures?: unknown })?.fixtures;
  if (!Array.isArray(arr)) return { fixtures: [], warnings: ['JSON must be an array of fixtures or { "fixtures": [...] }'] };
  const list: Partial<Fixture>[] = [];
  arr.forEach((raw, i) => {
    const f = raw as Partial<Fixture>;
    if (!Number.isInteger(f.channel) || (f.channel as number) <= 0) { warnings.push(`Item ${i}: invalid channel skipped`); return; }
    list.push(f);
  });
  return { fixtures: checkDuplicates(finalize(list, existing), warnings), warnings };
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(fixtures: Fixture[]): string {
  const head = ['channel', 'label', 'profile', 'universe', 'address', 'area', 'protected', 'x', 'y', 'rotation', 'notes'];
  const lines = fixtures.map((f) => [
    f.channel, f.label, f.profileId, f.dmx?.universe ?? '', f.dmx?.address ?? '', f.area, f.protected ? 'yes' : 'no',
    f.stage.x, f.stage.y, f.stage.rotation, f.notes ?? '',
  ].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}
