/**
 * Collects what a parser reads from an Eos export, keeping track of where everything came
 * from and of everything that could not be interpreted. Shared by the CSV and ASCII parsers.
 */
import type {
  DmxAddress, ImportedChannel, ImportedCue, ImportedCueList, ImportedGroup, ImportedPalette, ImportedSub,
  ImportIssue, PaletteKind, ParsedShow, ShowFileFormat,
} from '@sanctuary/shared';
import { splitAbsoluteAddress } from '../engine/eosFeedback';

export const MAX_CHANNEL = 99999;
const CUE_RE = /^\d+(\.\d+)?$/;

/** "2/101", "2-101", "2:101", "2.101" → universe/address; "613" → absolute Eos address. */
export function parseAddress(raw: string): DmxAddress | null | 'invalid' {
  const v = raw.trim();
  if (!v || v === '0') return null;
  const m = v.match(/^(\d+)\s*[/:.-]\s*(\d+)$/);
  if (m) {
    const universe = Number(m[1]); const address = Number(m[2]);
    return universe >= 1 && address >= 1 && address <= 512 ? { universe, address } : 'invalid';
  }
  if (/^\d+$/.test(v)) { const n = Number(v); return n >= 1 && n <= 512 * 64000 ? splitAbsoluteAddress(n) : 'invalid'; }
  return 'invalid';
}

/** "12" → 12; "12.1" (multicell / part notation) → 12. */
export function parseChannel(raw: string): { channel: number; cell: number | null } | null {
  const m = raw.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const channel = Number(m[1]);
  if (channel < 1 || channel > MAX_CHANNEL) return null;
  return { channel, cell: m[2] ? Number(m[2]) : null };
}

/** Cue numbers as Eos shows them ("1", "2.5"). Leading zeros and trailing ".0" are normalised. */
export function normaliseCue(raw: string): string | null {
  const v = raw.trim();
  if (!CUE_RE.test(v)) return null;
  const [whole, frac] = v.split('.');
  const f = (frac ?? '').replace(/0+$/, '');
  return `${Number(whole)}${f ? `.${f}` : ''}`;
}

export class ShowBuilder {
  private channels = new Map<number, ImportedChannel>();
  private params = new Map<number, Set<string>>();
  private groups = new Map<number, ImportedGroup & { members: Set<number> }>();
  private lists = new Map<number, { label: string; cues: Map<string, ImportedCue & { moved: Set<number> }> }>();
  private palettes = new Map<string, ImportedPalette & { members: Set<number>; paramSet: Set<string> }>();
  private subs = new Map<number, ImportedSub & { members: Set<number> }>();
  readonly issues: ImportIssue[] = [];
  private skipped = { total: 0, byKind: {} as Record<string, number>, samples: [] as { line: number; text: string }[] };
  readonly source: Record<string, string> = {};

  issue(severity: ImportIssue['severity'], message: string, line?: number) {
    if (this.issues.length < 300) this.issues.push({ severity, message, line });
    else if (this.issues.length === 300) this.issues.push({ severity: 'info', message: 'More issues were found but not listed.' });
  }

  /** Record content that was read but not interpreted. */
  skip(kind: string, line: number, text: string) {
    this.skipped.total++;
    this.skipped.byKind[kind] = (this.skipped.byKind[kind] ?? 0) + 1;
    if (this.skipped.samples.length < 40) this.skipped.samples.push({ line, text: text.slice(0, 160) });
  }

  hasChannel(n: number) { return this.channels.has(n); }

  /** Patch information for a channel. Repeated parts add addresses; a repeated part is a duplicate. */
  patch(channel: number, data: { label?: string; manufacturer?: string; fixtureType?: string; dmx?: DmxAddress | null; part?: number | null; profileHint?: string; protectedHint?: boolean }, line: number) {
    const existing = this.channels.get(channel);
    const part = data.part ?? 1;
    if (existing) {
      const seenParts = (existing as ImportedChannel & { seen?: Set<number> }).seen!;
      if (seenParts.has(part)) {
        this.issue('warning', `Channel ${channel}${data.part ? ` part ${part}` : ''} appears more than once in the patch; the first entry was kept.`, line);
        return;
      }
      seenParts.add(part);
      existing.parts = Math.max(existing.parts, seenParts.size);
      if (data.dmx) existing.addresses.push(data.dmx);
      if (!existing.dmx && data.dmx) existing.dmx = data.dmx;
      if (!existing.label && data.label) existing.label = data.label;
      if (!existing.fixtureType && data.fixtureType) existing.fixtureType = data.fixtureType;
      if (!existing.manufacturer && data.manufacturer) existing.manufacturer = data.manufacturer;
      return;
    }
    const ch: ImportedChannel & { seen: Set<number> } = {
      channel, label: data.label?.trim() ?? '', manufacturer: data.manufacturer?.trim() || null,
      fixtureType: data.fixtureType?.trim() || null, dmx: data.dmx ?? null, addresses: data.dmx ? [data.dmx] : [],
      parts: 1, parameters: [], line, seen: new Set([part]),
      ...(data.profileHint ? { profileHint: data.profileHint } : {}),
      ...(data.protectedHint ? { protectedHint: true } : {}),
    };
    this.channels.set(channel, ch);
  }

  /** Another DMX address feeding the same channel. */
  address(channel: number, dmx: DmxAddress | null) {
    const ch = this.channels.get(channel);
    if (!ch || !dmx) return;
    if (!ch.addresses.some((a) => a.universe === dmx.universe && a.address === dmx.address)) ch.addresses.push(dmx);
    if (!ch.dmx) ch.dmx = dmx;
  }

  /** Channel label without other patch data (e.g. ETC's $ChanLabel). */
  label(channel: number, label: string, line: number) {
    const ch = this.channels.get(channel);
    if (ch) { if (!ch.label) ch.label = label; return; }
    this.patch(channel, { label }, line);
  }

  parameter(channel: number, name: string) {
    const n = name.trim();
    if (!n) return;
    const set = this.params.get(channel) ?? new Set<string>();
    set.add(n);
    this.params.set(channel, set);
  }

  group(number: number, label: string | null, line: number) {
    const g = this.groups.get(number) ?? { number, label: '', channels: [], members: new Set<number>(), line };
    if (label && !g.label) g.label = label;
    this.groups.set(number, g);
    return g;
  }
  groupChannel(number: number, channel: number) { this.group(number, null, 0).members.add(channel); }

  sub(number: number, label: string | null) {
    const s = this.subs.get(number) ?? { number, label: '', channels: [], members: new Set<number>() };
    if (label && !s.label) s.label = label;
    this.subs.set(number, s);
    return s;
  }
  subChannel(number: number, channel: number) { this.sub(number, null).members.add(channel); }

  cueList(list: number, label?: string) {
    const l = this.lists.get(list) ?? { label: '', cues: new Map() };
    if (label && !l.label) l.label = label;
    this.lists.set(list, l);
    return l;
  }

  /** Returns the cue (created if new), or null for an unusable cue number. */
  cue(list: number, rawCue: string, line: number) {
    const cue = normaliseCue(rawCue);
    if (!cue) { this.issue('warning', `Cue number "${rawCue}" in list ${list} is not a number Eos uses; skipped.`, line); return null; }
    const l = this.cueList(list);
    let q = l.cues.get(cue);
    if (!q) { q = { cue, label: '', timing: {}, parts: 0, movedChannels: 0, moved: new Set() }; l.cues.set(cue, q); }
    return q;
  }

  palette(kind: PaletteKind, number: string, label: string | null) {
    const key = `${kind}:${number}`;
    const p = this.palettes.get(key) ?? { kind, number, label: '', channels: [], parameters: [], members: new Set<number>(), paramSet: new Set<string>() };
    if (label && !p.label) p.label = label;
    this.palettes.set(key, p);
    return p;
  }

  finish(format: ShowFileFormat, formatLabel: string, fileName: string, encoding: string): ParsedShow {
    const channels = [...this.channels.values()].sort((a, b) => a.channel - b.channel).map((c) => {
      const { seen: _seen, ...rest } = c as ImportedChannel & { seen?: Set<number> };
      return { ...rest, parameters: [...(this.params.get(c.channel) ?? [])].sort() };
    });
    // Parameters referenced on channels that aren't in the patch are still evidence of nothing.
    const groups = [...this.groups.values()].sort((a, b) => a.number - b.number)
      .map(({ members, ...g }) => ({ ...g, channels: [...members].sort((a, b) => a - b) }));
    const subs = [...this.subs.values()].sort((a, b) => a.number - b.number)
      .map(({ members, ...s }) => ({ ...s, channels: [...members].sort((a, b) => a - b) }));
    const cueLists: ImportedCueList[] = [...this.lists.entries()].sort((a, b) => a[0] - b[0]).map(([list, l]) => ({
      list, label: l.label,
      cues: [...l.cues.values()].sort((a, b) => Number(a.cue) - Number(b.cue))
        .map(({ moved, ...q }) => ({ ...q, movedChannels: moved.size })),
    }));
    const palettes = [...this.palettes.values()].map(({ members, paramSet, ...p }) => ({ ...p, channels: [...members].sort((a, b) => a - b), parameters: [...paramSet].sort() }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || Number(a.number) - Number(b.number));

    // Duplicate DMX start addresses between different channels (may be intentional two-fers).
    const byAddr = new Map<string, number[]>();
    for (const c of channels) for (const a of c.addresses) {
      const k = `${a.universe}/${a.address}`;
      byAddr.set(k, [...(byAddr.get(k) ?? []), c.channel]);
    }
    for (const [addr, chans] of byAddr) {
      const distinct = [...new Set(chans)];
      if (distinct.length > 1) this.issue('warning', `Channels ${distinct.join(', ')} share DMX address ${addr}. That can be intentional, but check it in Eos's patch.`);
    }
    return {
      format, formatLabel, fileName, encoding, source: this.source,
      channels, groups, cueLists, palettes, subs, issues: this.issues, uninterpreted: this.skipped,
    };
  }

  /** Mark a channel as changed in a cue (tracked data: counted, never turned into a look). */
  cueMove(list: number, cue: ImportedCue, channel: number) {
    (cue as ImportedCue & { moved: Set<number> }).moved.add(channel);
    void list;
  }
}
