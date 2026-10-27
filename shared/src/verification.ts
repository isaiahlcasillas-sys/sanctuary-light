/**
 * Show Verification: "Does Sanctuary Light match what's currently loaded in Eos?"
 *
 * Compares the local configuration (usually built by Import Eos Show) with what the console
 * itself reports through its read-only OSC interface (/eos/get/patch, /eos/get/cuelist,
 * /eos/get/cue, /eos/get/group). Rules:
 *  - Only data the console actually reported is compared. A file the importer accepted is
 *    not evidence that it matches the console.
 *  - A read that didn't finish never produces "missing" or "extra": those become unknown.
 *  - Things Eos's OSC interface doesn't expose (submaster/preset/palette contents, cue
 *    timing, effects, macros) are listed as unsupported, never as matching.
 */
import type { AppConfig, Fixture } from './model';
import type { GroupVerification } from './protocol';

export type CheckStatus = 'match' | 'different' | 'missing-in-eos' | 'extra-in-eos' | 'unknown' | 'unsupported';
export type CheckSection = 'console' | 'patch' | 'cues' | 'groups' | 'other';

export interface CheckItem {
  section: CheckSection;
  key: string;
  status: CheckStatus;
  local: string;
  console: string;
  detail?: string;
  /** Channel / group / cue-list reference for linking in the UI. */
  channel?: number;
  list?: number;
}

export interface ReadCounter { received: number; expected: number | null }

/** Everything the console reported, as collected by the server (read-only). */
export interface ConsoleSnapshot {
  connected: boolean;
  showName: string | null;
  consoleVersion: string | null;
  read: {
    startedAt: number;
    lastReplyAt: number | null;
    patch: ReadCounter;
    cueLists: ReadCounter;
    cues: Record<number, ReadCounter>;
    /** The console reported more entries than the reader asks for (2000 per list). */
    truncated: boolean;
  } | null;
  patch: { channel: number; label: string; manufacturer: string; model: string; dmx: { universe: number; address: number } | null }[];
  cueLists: { list: number; label: string; cues: { cue: string; label: string }[] }[];
  groups: Record<string, GroupVerification>;
  /** Last time the console said its patch/cues/groups changed (notify), if any. */
  consoleChangedAt: number | null;
  now: number;
}

export type ReadState = 'offline' | 'not-read' | 'reading' | 'incomplete' | 'complete';

export interface VerificationReport {
  state: ReadState;
  /** The connected console identifies itself as Sanctuary Light's FAKE simulator. */
  simulatedConsole: boolean;
  showName: string | null;
  consoleVersion: string | null;
  summary: Record<CheckStatus, number>;
  items: CheckItem[];
  /** Reasons the local configuration may be out of date compared with Eos. */
  warnings: string[];
  progress: { patch: ReadCounter; cueLists: ReadCounter; cues: ReadCounter } | null;
}

/** Stored after a complete verification; used to warn when Eos changes afterwards. */
export interface VerificationRecord {
  at: number;
  showName: string | null;
  consoleVersion: string | null;
  simulatedConsole: boolean;
  summary: Record<CheckStatus, number>;
  /** Fingerprint of the console's patch + cue lists at that time. */
  fingerprint: string;
  /** Fingerprint of what was compared on Sanctuary Light's side (see localFingerprint). */
  localFingerprint?: string;
}

export const READ_STALL_MS = 8000;
const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const dmxText = (d: { universe: number; address: number } | null | undefined) => (d ? `${d.universe}/${d.address}` : '—');

/** "3.2.12" matches "3.2.12.0", but "3.1" doesn't match "3.12.0" (whole version parts). */
export function versionMatches(configured: string, reported: string): boolean {
  if (!configured) return false;
  const a = configured.trim().split('.'); const b = reported.trim().split('.');
  return a.every((part, i) => Number(part) === Number(b[i]));
}

export function isSimulatedConsole(showName: string | null) {
  return !!showName && /FAKE SHOW/i.test(showName);
}

/** Small, stable hash (FNV-1a) — enough to notice that the console's data changed. */
export function fingerprint(snapshot: Pick<ConsoleSnapshot, 'patch' | 'cueLists'>): string {
  return hash(JSON.stringify([
    [...snapshot.patch].sort((a, b) => a.channel - b.channel).map((p) => [p.channel, p.label, p.model, dmxText(p.dmx)]),
    [...snapshot.cueLists].sort((a, b) => a.list - b.list).map((l) => [l.list, l.label, l.cues.map((c) => [c.cue, c.label])]),
  ]));
}

/**
 * Fingerprint of the local data a verification compares (Eos identities: channels, addresses,
 * types, Eos labels, cue numbers, Eos group membership). Friendly names don't count. If it
 * changes, the last verification no longer describes this configuration.
 */
export function localFingerprint(cfg: AppConfig): string {
  return hash(JSON.stringify([
    [...cfg.fixtures].sort((a, b) => a.channel - b.channel).map((f) => [f.channel, f.eosLabel ?? null, f.eosType ?? null, dmxText(f.dmx)]),
    [...cfg.cueLists].sort((a, b) => a.list - b.list).map((l) => [l.list, l.cues.map((c) => c.cue)]),
    cfg.groups.filter((g) => g.eosGroup != null).map((g) => [g.eosGroup, [...g.channels].sort((a, b) => a - b)]).sort((a, b) => Number(a[0]) - Number(b[0])),
  ]));
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function readState(s: ConsoleSnapshot): ReadState {
  if (!s.connected) return 'offline';
  const r = s.read;
  if (!r) return 'not-read';
  const done = (c: ReadCounter) => c.expected != null && c.received >= c.expected;
  const cueCountsKnown = s.cueLists.every((l) => r.cues[l.list]?.expected != null);
  const complete = done(r.patch) && done(r.cueLists) && cueCountsKnown && Object.values(r.cues).every(done) && !r.truncated;
  if (complete) return 'complete';
  const last = r.lastReplyAt ?? r.startedAt;
  return s.now - last > READ_STALL_MS ? 'incomplete' : 'reading';
}

function patchItems(cfg: AppConfig, s: ConsoleSnapshot, complete: boolean): CheckItem[] {
  const items: CheckItem[] = [];
  const consoleBy = new Map(s.patch.map((p) => [p.channel, p]));
  const localBy = new Map(cfg.fixtures.map((f) => [f.channel, f]));
  const channels = [...new Set([...localBy.keys(), ...consoleBy.keys()])].sort((a, b) => a - b);
  for (const ch of channels) {
    const f = localBy.get(ch);
    const p = consoleBy.get(ch);
    if (f && !p) {
      items.push({
        section: 'patch', key: `Channel ${ch}`, channel: ch, local: localText(f), console: complete ? 'not patched' : 'not read',
        status: complete ? 'missing-in-eos' : 'unknown',
        detail: complete ? 'In Sanctuary Light but not patched in the show loaded in Eos.' : 'The console hasn\'t reported this channel (the read is not complete).',
      });
      continue;
    }
    if (!f && p) {
      items.push({ section: 'patch', key: `Channel ${ch}`, channel: ch, local: 'not in Sanctuary Light', console: consoleText(p), status: 'extra-in-eos', detail: 'Patched in Eos but not in Sanctuary Light. Import the current show again or add it in Settings → Patch.' });
      continue;
    }
    if (!f || !p) continue;
    const diffs: string[] = [];
    const notCompared: string[] = [];
    const localLabel = f.eosLabel ?? f.label;
    if (norm(localLabel) !== norm(p.label)) diffs.push(`label "${localLabel}" vs "${p.label}"`);
    if (f.eosType) { if (norm(f.eosType) !== norm(p.model)) diffs.push(`type "${f.eosType}" vs "${p.model}"`); }
    else notCompared.push('fixture type (not in the import)');
    if (f.dmx && p.dmx) { if (dmxText(f.dmx) !== dmxText(p.dmx)) diffs.push(`DMX ${dmxText(f.dmx)} vs ${dmxText(p.dmx)}`); }
    else if (f.dmx || p.dmx) diffs.push(`DMX ${dmxText(f.dmx)} vs ${dmxText(p.dmx)}`);
    items.push({
      section: 'patch', key: `Channel ${ch}`, channel: ch, local: localText(f), console: consoleText(p),
      status: diffs.length ? 'different' : 'match',
      detail: [diffs.length ? `Differs: ${diffs.join('; ')}.` : 'Label, type and address match.', notCompared.length ? `Not compared: ${notCompared.join(', ')}.` : ''].filter(Boolean).join(' '),
    });
  }
  return items;
}

const localText = (f: Fixture) => `${f.eosLabel ?? f.label} · ${f.eosType ?? 'type unknown'} · ${dmxText(f.dmx)}`;
const consoleText = (p: ConsoleSnapshot['patch'][number]) => `${p.label || '(no label)'} · ${p.model || 'type ?'} · ${dmxText(p.dmx)}`;

function cueItems(cfg: AppConfig, s: ConsoleSnapshot, complete: boolean): CheckItem[] {
  const items: CheckItem[] = [];
  const consoleBy = new Map(s.cueLists.map((l) => [l.list, l]));
  const lists = [...new Set([...cfg.cueLists.map((l) => l.list), ...consoleBy.keys()])].sort((a, b) => a - b);
  for (const n of lists) {
    const local = cfg.cueLists.find((l) => l.list === n);
    const remote = consoleBy.get(n);
    if (local && !remote) {
      items.push({ section: 'cues', key: `Cue list ${n}`, list: n, local: `${local.cues.length} cues`, console: complete ? 'no such list' : 'not read', status: complete ? 'missing-in-eos' : 'unknown' });
      continue;
    }
    if (!local && remote) {
      items.push({ section: 'cues', key: `Cue list ${n}`, list: n, local: 'not in Sanctuary Light', console: `${remote.cues.length} cues`, status: 'extra-in-eos' });
      continue;
    }
    if (!local || !remote) continue;
    const listCounterDone = s.read?.cues[n] && s.read.cues[n].expected != null && s.read.cues[n].received >= (s.read.cues[n].expected ?? 0);
    const localBy = new Map(local.cues.map((c) => [c.cue, c]));
    const remoteBy = new Map(remote.cues.map((c) => [c.cue, c]));
    const missing = local.cues.filter((c) => !remoteBy.has(c.cue)).map((c) => c.cue);
    const extra = remote.cues.filter((c) => !localBy.has(c.cue)).map((c) => c.cue);
    const relabelled = local.cues.filter((c) => remoteBy.has(c.cue) && norm(c.label) !== norm(remoteBy.get(c.cue)!.label));
    const labelDiff = local.label && remote.label && norm(local.label) !== norm(remote.label);
    const diffs: string[] = [];
    if (labelDiff) diffs.push(`list label "${local.label}" vs "${remote.label}"`);
    if (listCounterDone && missing.length) diffs.push(`not in Eos: cue ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
    if (extra.length) diffs.push(`only in Eos: cue ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? '…' : ''}`);
    if (relabelled.length) diffs.push(`${relabelled.length} label(s) differ (${relabelled.slice(0, 4).map((c) => `${c.cue}: "${c.label}" vs "${remoteBy.get(c.cue)!.label}"`).join('; ')}${relabelled.length > 4 ? '…' : ''})`);
    items.push({
      section: 'cues', key: `Cue list ${n}`, list: n, local: `${local.cues.length} cues${local.label ? ` · ${local.label}` : ''}`,
      console: `${remote.cues.length} cues${remote.label ? ` · ${remote.label}` : ''}`,
      status: !listCounterDone ? 'unknown' : diffs.length ? 'different' : 'match',
      detail: !listCounterDone ? 'The console hasn\'t finished reporting this list.' : diffs.length ? `Differs: ${diffs.join('; ')}.` : 'Cue numbers and labels match. (Timing is not readable over OSC and isn\'t compared.)',
    });
  }
  return items;
}

function groupItems(cfg: AppConfig, s: ConsoleSnapshot): CheckItem[] {
  return cfg.groups.map((g): CheckItem => {
    const v = s.groups[g.id];
    const base = { section: 'groups' as const, key: g.eosGroup != null ? `Group ${g.eosGroup} (${g.name})` : g.name, local: `${g.channels.length} channels` };
    if (g.eosGroup == null) return { ...base, console: '—', status: 'unsupported', detail: 'A Sanctuary Light-only group (no Eos group number): nothing in Eos to compare. Live commands use its channel list.' };
    if (!v || v.state === 'unverified' || v.state === 'not-applicable') return { ...base, console: v?.consoleChannels ? `${v.consoleChannels.length} channels` : 'not read', status: 'unknown', detail: v?.detail || 'Not verified yet. Until it is, Live sends the channel list, never "Group N".' };
    if (v.state === 'verified') return { ...base, console: `${v.consoleChannels?.length ?? '?'} channels`, status: 'match', detail: v.detail };
    return { ...base, console: v.consoleChannels ? `${v.consoleChannels.length} channels` : '?', status: 'different', detail: v.detail };
  });
}

const UNSUPPORTED: CheckItem[] = [
  { section: 'other', key: 'Submaster contents', status: 'unsupported', local: 'labels only', console: 'not readable', detail: 'Eos\'s OSC interface doesn\'t report what a submaster controls. Check submasters in Eos before letting volunteers use them.' },
  { section: 'other', key: 'Presets & palettes', status: 'unsupported', local: 'reference list', console: 'not readable', detail: 'Not compared. They stay in Eos.' },
  { section: 'other', key: 'Cue timing, effects, macros', status: 'unsupported', local: 'as exported', console: 'not readable', detail: 'Not compared. A cue, macro or effect can do things Sanctuary Light can\'t see, so each look must be reviewed before volunteers use it.' },
];

export function outdatedWarnings(cfg: AppConfig, s: Pick<ConsoleSnapshot, 'showName' | 'consoleChangedAt' | 'connected'>, currentFingerprint: string | null): string[] {
  const w: string[] = [];
  const v = cfg.verification;
  if (!v) {
    if (cfg.eosShow) w.push('The imported show has never been compared with Eos. Run Show Verification in Monitor mode.');
    return w;
  }
  if (cfg.eosShow && cfg.eosShow.importedAt > v.at) w.push('A show was imported after the last verification. Verify again.');
  else if (v.localFingerprint && v.localFingerprint !== localFingerprint(cfg)) w.push('Channels, cue lists or Eos groups were changed in Sanctuary Light after the last verification. Verify again.');
  if (s.connected && s.showName != null && v.showName != null && s.showName !== v.showName) w.push(`Eos now has "${s.showName}" loaded, but Sanctuary Light was verified against "${v.showName}". The local configuration may be out of date.`);
  if (s.consoleChangedAt && s.consoleChangedAt > v.at) w.push('Eos reported patch, cue or group changes since the last verification. The local configuration may be out of date.');
  if (currentFingerprint && currentFingerprint !== v.fingerprint) w.push('The console\'s patch or cue lists are different from when Sanctuary Light was last verified.');
  return w;
}

export function compareShow(cfg: AppConfig, s: ConsoleSnapshot): VerificationReport {
  const state = readState(s);
  const summary: Record<CheckStatus, number> = { match: 0, different: 0, 'missing-in-eos': 0, 'extra-in-eos': 0, unknown: 0, unsupported: 0 };
  const items: CheckItem[] = [];
  const read = s.read;
  if (state !== 'offline') {
    const complete = state === 'complete';
    items.push({
      section: 'console', key: 'Eos version', status: !s.consoleVersion ? 'unknown' : versionMatches(cfg.settings.connection.eosVersion, s.consoleVersion) ? 'match' : 'different',
      local: cfg.settings.connection.eosVersion || 'not set', console: s.consoleVersion ?? 'not reported',
    });
    items.push({ section: 'console', key: 'Loaded show', status: 'unsupported', local: cfg.eosShow ? cfg.eosShow.fileName : 'nothing imported', console: s.showName ?? 'not reported', detail: 'Eos reports the show name, which an export file doesn\'t contain, so this can\'t be compared directly. The patch and cue comparison below is what counts.' });
    if (read) {
      items.push(...patchItems(cfg, s, complete && read.patch.expected != null && read.patch.received >= read.patch.expected));
      items.push(...cueItems(cfg, s, complete));
    }
    items.push(...groupItems(cfg, s));
  }
  items.push(...UNSUPPORTED);
  for (const i of items) summary[i.status]++;
  const sum = (o: Record<number, ReadCounter>) => Object.values(o).reduce((a, c) => ({ received: a.received + c.received, expected: a.expected == null || c.expected == null ? null : a.expected + c.expected }), { received: 0, expected: 0 } as ReadCounter);
  const fp = state === 'complete' ? fingerprint(s) : null;
  return {
    state, simulatedConsole: isSimulatedConsole(s.showName), showName: s.showName, consoleVersion: s.consoleVersion, summary, items,
    warnings: outdatedWarnings(cfg, s, fp),
    progress: read ? { patch: read.patch, cueLists: read.cueLists, cues: sum(read.cues) } : null,
  };
}
