/**
 * Import Eos Show: the data read from an Eos export, and how it becomes a Sanctuary Light
 * configuration.
 *
 * This is an OFFLINE, READ-ONLY file import. Nothing here talks to the console: the result
 * only replaces or merges Sanctuary Light's own local configuration. The Eos show file,
 * Gadget II, wireless DMX and SceneStation are never touched.
 *
 * Rules that keep the import honest:
 *  - Cue data in Eos is *tracked*: a cue stores only what changed. A cue's channel moves are
 *    therefore never turned into a complete look. Imported looks fire the real Eos cue and
 *    carry no invented preview levels or colours.
 *  - Fixture capabilities come only from evidence in the export (parameters the show uses,
 *    or a fixture type Eos calls a dimmer/relay). Otherwise a fixture gets intensity only.
 *  - Local protections (protected channels) are never removed by an import.
 */
import type {
  AppConfig, AreaId, Capability, CueEntry, CueListConfig, DmxAddress, Fixture, FixtureGroup, FixtureKind,
  FixtureProfile, Look, ParamKey, SubmasterConfig,
} from './model';

export type ShowFileFormat = 'eos-csv' | 'usitt-ascii' | 'patch-csv' | 'eos-native' | 'unsupported';

export interface ImportIssue {
  severity: 'info' | 'warning' | 'error';
  message: string;
  /** 1-based line in the file, when known. */
  line?: number;
}

export interface ImportedChannel {
  /** Eos channel number. */
  channel: number;
  label: string;
  manufacturer: string | null;
  /** Fixture type / personality exactly as Eos names it. null = not in the export. */
  fixtureType: string | null;
  /** First DMX address of the channel (part 1). */
  dmx: DmxAddress | null;
  /** All DMX addresses seen for this channel (multi-part channels, two-fers). */
  addresses: DmxAddress[];
  parts: number;
  /** Eos parameter names this channel uses anywhere in the show (cues, palettes, presets…). */
  parameters: string[];
  /** Plain patch spreadsheets only: a Sanctuary Light profile id/name given in the file. */
  profileHint?: string;
  /** Plain patch spreadsheets only: the file marks this channel as protected. */
  protectedHint?: boolean;
  line?: number;
}

export interface ImportedGroup { number: number; label: string; channels: number[]; line?: number }

/** Timing exactly as exported. Values are kept as text so nothing is reinterpreted. */
export interface CueTiming {
  time?: string; upDelay?: string;
  down?: string; downDelay?: string;
  focus?: string; focusDelay?: string;
  color?: string; colorDelay?: string;
  beam?: string; beamDelay?: string;
  follow?: string; hang?: string;
  link?: string;
  flags?: string[];
}

export interface ImportedCue {
  cue: string;
  label: string;
  timing: CueTiming;
  /** Number of cue parts (0 = a single-part cue). */
  parts: number;
  /** Channels with recorded changes in this cue. Tracked data: NOT the complete look. */
  movedChannels: number;
  notes?: string;
}

export interface ImportedCueList { list: number; label: string; cues: ImportedCue[] }

export type PaletteKind = 'preset' | 'intensity' | 'focus' | 'color' | 'beam';

export interface ImportedPalette {
  kind: PaletteKind;
  number: string;
  label: string;
  channels: number[];
  parameters: string[];
}

export interface ImportedSub { number: number; label: string; channels: number[] }

export interface ParsedShow {
  format: ShowFileFormat;
  formatLabel: string;
  fileName: string;
  /** Text encoding that was detected, e.g. "UTF-8", "UTF-16 LE", "Windows-1252". */
  encoding: string;
  /** Header information found in the file (manufacturer, console, software version…). */
  source: Record<string, string>;
  channels: ImportedChannel[];
  groups: ImportedGroup[];
  cueLists: ImportedCueList[];
  palettes: ImportedPalette[];
  subs: ImportedSub[];
  issues: ImportIssue[];
  /** Lines or rows that were read but not interpreted, grouped by keyword / section. */
  uninterpreted: { total: number; byKind: Record<string, number>; samples: { line: number; text: string }[] };
}

// ───────────────────────────── export instructions ─────────────────────────────

export const NATIVE_SHOW_EXTENSIONS = ['.esf', '.esf2', '.esf3d'];

/**
 * How to get an importable file out of Eos. From ETC's Eos manual ("Exporting Show Data"):
 * CSV export with an encoding choice, and USITT ASCII export with manufacturer data options.
 */
export const EOS_EXPORT_STEPS = {
  csv: [
    'In Eos, open the Browser and choose File → Export → CSV.',
    'Leave every show aspect selected (Patch, Groups, Cues, Palettes, Presets, Subs). If a {Deselect All} was pressed, select them again.',
    'Set Encoding Format to UTF-8 if your Eos version offers it.',
    'Choose a USB stick (or a folder on this PC), type a file name, and press Enter / {OK}.',
    'Bring the .csv file here and drop it on the import window.',
  ],
  ascii: [
    'In Eos, open the Browser and choose File → Export → USITT ASCII.',
    'Turn {Manufctr Data} ON, {Standard Delimiter} ON and {Hexadecimal Levels} OFF.',
    'Choose a location, type a file name, and press Enter / {OK}. The file ends in .asc.',
  ],
  safety: [
    'Exporting only writes a new file. It does not change the show that is loaded in Eos.',
    'Do not use File → Open on the sanctuary PC to open another show: that would replace the active show. Export from the show that is already loaded, or use Eos on another computer (offline editor) to open the .esf and export from there.',
  ],
};

// ───────────────────────────── import plan ─────────────────────────────

export interface ImportOptions {
  mode: 'merge' | 'replace';
  include: { fixtures: boolean; groups: boolean; cueLists: boolean; submasters: boolean; looks: boolean; palettes: boolean };
  /** When merging and both sides have the same channel/group/list/sub with different data. */
  conflicts: 'use-imported' | 'keep-local';
  /** Cue list whose labelled cues become looks (each look fires that Eos cue). null = none. */
  looksFromList: number | null;
  /**
   * Keep stage positions already arranged in Sanctuary Light for matching channel numbers.
   * Off by default when the current setup never came from an Eos import (sample fixtures):
   * a sample's position is not where the real light hangs.
   */
  keepPositions?: boolean;
}

export function defaultImportOptions(show: ParsedShow, cfg: AppConfig): ImportOptions {
  const lists = show.cueLists.map((l) => l.list);
  const looksFromList = lists.includes(cfg.settings.masterCueList) ? cfg.settings.masterCueList : lists[0] ?? null;
  return {
    mode: 'merge',
    include: {
      fixtures: show.channels.length > 0, groups: show.groups.length > 0, cueLists: show.cueLists.length > 0,
      submasters: show.subs.length > 0, looks: looksFromList != null, palettes: show.palettes.length > 0,
    },
    conflicts: 'use-imported',
    looksFromList,
    keepPositions: cfg.eosShow != null,
  };
}

export interface ImportConflict {
  kind: 'fixture' | 'group' | 'cueList' | 'submaster';
  key: string;
  local: string;
  imported: string;
  resolution: 'kept-local' | 'used-imported';
}

export interface SectionChange { added: number; updated: number; removed: number; unchanged: number }

export interface ImportPlan {
  config: AppConfig;
  changes: Record<'fixtures' | 'groups' | 'cueLists' | 'submasters' | 'looks' | 'profiles' | 'palettes', SectionChange>;
  conflicts: ImportConflict[];
  /** Things the operator should know before applying (protected channels, unknown fixtures…). */
  notices: ImportIssue[];
  /** Channels placed in a temporary grid that need arranging on the stage. */
  unplaced: number[];
}

/** Summary of the last Eos import, stored with the configuration (palettes/presets live here). */
export interface EosShowReference {
  importedAt: number;
  fileName: string;
  format: ShowFileFormat;
  source: Record<string, string>;
  palettes: ImportedPalette[];
  counts: { channels: number; groups: number; cueLists: number; cues: number; subs: number; palettes: number };
}

/** Top of the "not yet placed" holding area, below the stage plan. */
export const unplacedAreaTop = (stageHeight: number) => stageHeight + 40;

const RELAY_RE = /\b(relay|contactor|non[- ]?dim|nondim|utility power|house power)\b/i;

/** Map an Eos parameter name to the Sanctuary Light parameter it controls, if any. */
export function classifyEosParameter(name: string): ParamKey | 'intensity' | null {
  const n = name.trim().toLowerCase();
  if (n === 'intensity' || n === 'intens' || n === 'dimmer') return 'intensity';
  if (n === 'red') return 'red';
  if (n === 'green') return 'green';
  if (n === 'blue') return 'blue';
  if (n === 'white') return 'white';
  if (n === 'amber') return 'amber';
  if (n === 'uv' || n === 'ultraviolet') return 'uv';
  if (n === 'ctc' || n === 'cct' || n === 'color temperature' || n === 'colour temperature' || n === 'color temp') return 'cct';
  if (n === 'pan') return 'pan';
  if (n === 'tilt') return 'tilt';
  if (n === 'zoom') return 'zoom';
  if (n === 'edge' || n === 'focus') return 'focus';
  return null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'fixture';

/**
 * Build fixture profiles from the export. One profile per Eos fixture type; capabilities only
 * from parameters the show actually uses on channels of that type.
 */
export function profilesFromShow(show: ParsedShow): { profiles: FixtureProfile[]; byChannel: Map<number, string> } {
  const byType = new Map<string, { manufacturer: string; type: string; params: Map<string, string> }>();
  const byChannel = new Map<number, string>();
  for (const ch of show.channels) {
    if (!ch.fixtureType) continue;
    const id = `eos-${slug(`${ch.manufacturer ?? ''} ${ch.fixtureType}`)}`;
    const entry = byType.get(id) ?? { manufacturer: ch.manufacturer ?? '', type: ch.fixtureType, params: new Map() };
    for (const p of ch.parameters) {
      const k = classifyEosParameter(p);
      if (k && !entry.params.has(k)) entry.params.set(k, p.trim());
    }
    byType.set(id, entry);
    byChannel.set(ch.channel, id);
  }
  const profiles: FixtureProfile[] = [];
  for (const [id, { manufacturer, type, params }] of byType) {
    const has = (k: string) => params.has(k);
    const relay = RELAY_RE.test(type);
    const isDimmer = /^dimmer\b|\bdimmer$/i.test(type.trim());
    const caps: Capability[] = relay ? ['relay'] : ['intensity'];
    const eosParams: Partial<Record<ParamKey, string>> = {};
    if (!relay) {
      if (has('red') && has('green') && has('blue')) { caps.push('rgb'); eosParams.red = params.get('red'); eosParams.green = params.get('green'); eosParams.blue = params.get('blue'); }
      for (const k of ['white', 'amber', 'uv', 'cct', 'zoom', 'focus'] as const) if (has(k)) { caps.push(k); eosParams[k] = params.get(k); }
      if (has('pan') && has('tilt')) { caps.push('pantilt'); eosParams.pan = params.get('pan'); eosParams.tilt = params.get('tilt'); }
    }
    const kind: FixtureKind = relay ? 'relay'
      : caps.includes('pantilt') ? 'moving'
        : /pendant/i.test(type) ? 'pendant'
          : caps.includes('rgb') && /bar|strip|batten|band|cyc/i.test(type) ? 'led-bar'
            : caps.includes('rgb') ? 'led-par'
              : 'conventional';
    const evidence = [...params.values()];
    const verified = relay || isDimmer || evidence.length > 0;
    profiles.push({
      id, name: type, manufacturer, kind, capabilities: caps, eosParams, verified,
      notes: relay
        ? 'Imported from the Eos patch. Treated as a relay: protected, on/off only.'
        : evidence.length
          ? `Imported from the Eos patch. Controls come from parameters the show uses: ${evidence.join(', ')}. Parameters the show never records can't be seen in an export.`
          : isDimmer
            ? 'Imported from the Eos patch (dimmer): intensity only.'
            : 'Imported from the Eos patch. The export showed no parameters for this type, so only intensity is offered until the fixture is checked.',
    });
  }
  return { profiles, byChannel };
}

function suggestArea(label: string, relay: boolean): AreaId {
  if (relay) return 'utility';
  if (/\b(house|pendant|aisle|nave|audience)\b/i.test(label)) return 'house';
  if (/\b(front|foh|wash|key)\b/i.test(label)) return 'front';
  if (/\b(cyc|scenic|backdrop|wall|cross)\b/i.test(label)) return 'scenic';
  return 'stage';
}

const GROUP_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#60a5fa', '#facc15'];
const same = (a: number[], b: number[]) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);
const fmtDmx = (d: DmxAddress | null) => (d ? `${d.universe}/${d.address}` : 'no address');
const zero = (): SectionChange => ({ added: 0, updated: 0, removed: 0, unchanged: 0 });

/** Summarise a cue's timing in one short line ("Time 5 · Down 3 · Follow 2"). */
export function describeTiming(t: CueTiming): string {
  const out: string[] = [];
  const pair = (label: string, v?: string, d?: string) => { if (v || d) out.push(`${label} ${v ?? ''}${d ? ` (delay ${d})` : ''}`.trim()); };
  pair('Time', t.time, t.upDelay);
  pair('Down', t.down, t.downDelay);
  pair('Focus', t.focus, t.focusDelay);
  pair('Color', t.color, t.colorDelay);
  pair('Beam', t.beam, t.beamDelay);
  if (t.follow) out.push(`Follow ${t.follow}`);
  if (t.hang) out.push(`Hang ${t.hang}`);
  if (t.link) out.push(`Link ${t.link}`);
  if (t.flags?.length) out.push(t.flags.join(', '));
  return out.join(' · ');
}

/**
 * Work out the new local configuration for an import. Pure: used by the browser for the live
 * preview and by the server when applying, so both always agree.
 */
export function buildImportPlan(show: ParsedShow, current: AppConfig, opts: ImportOptions): ImportPlan {
  const replace = opts.mode === 'replace';
  const useImported = replace || opts.conflicts === 'use-imported';
  const conflicts: ImportConflict[] = [];
  const notices: ImportIssue[] = [];
  const changes: ImportPlan['changes'] = {
    fixtures: zero(), groups: zero(), cueLists: zero(), submasters: zero(), looks: zero(), profiles: zero(), palettes: zero(),
  };
  const cfg: AppConfig = structuredClone(current);
  const unplaced: number[] = [];

  // ── profiles + fixtures ──
  if (opts.include.fixtures && show.channels.length) {
    const { profiles, byChannel } = profilesFromShow(show);
    const profileIds = new Set(cfg.profiles.map((p) => p.id));
    for (const p of profiles) {
      const old = cfg.profiles.find((x) => x.id === p.id);
      if (!old) { cfg.profiles.push(p); changes.profiles.added++; continue; }
      // Evidence only adds: a later export with less detail never removes controls.
      const caps = [...new Set([...old.capabilities, ...p.capabilities])];
      const merged = { ...old, capabilities: caps, eosParams: { ...old.eosParams, ...p.eosParams }, verified: old.verified || p.verified };
      if (JSON.stringify(merged) !== JSON.stringify(old)) { cfg.profiles = cfg.profiles.map((x) => (x.id === p.id ? merged : x)); changes.profiles.updated++; }
    }
    const localByChan = new Map(current.fixtures.map((f) => [f.channel, f]));
    const importedChans = new Set(show.channels.map((c) => c.channel));
    const next = new Map<number, Fixture>();
    if (!replace) for (const f of current.fixtures) next.set(f.channel, f);

    // Temporary grid for fixtures that have no stage position yet, ordered by first group.
    const firstGroup = new Map<number, number>();
    for (const g of show.groups) for (const c of g.channels) if (!firstGroup.has(c)) firstGroup.set(c, g.number);
    const keepPositions = opts.keepPositions ?? current.eosShow != null;
    const placedLocally = (ch: number) => { const l = localByChan.get(ch); return !!l && keepPositions && !l.unplaced; };
    const toPlace = show.channels.filter((c) => !placedLocally(c.channel))
      .sort((a, b) => (firstGroup.get(a.channel) ?? 1e9) - (firstGroup.get(b.channel) ?? 1e9) || a.channel - b.channel);
    // An export says nothing about where lights hang, so no position is invented: new fixtures
    // wait in a "not yet placed" holding area BELOW the stage plan until someone places them.
    const perRow = Math.max(1, Math.floor((cfg.stage.width - 80) / 56));
    const gridPos = new Map(toPlace.map((c, i) => [c.channel, { x: 60 + (i % perRow) * 56, y: unplacedAreaTop(cfg.stage.height) + 64 + Math.floor(i / perRow) * 52, rotation: 0 }]));
    const usedIds = new Set(current.fixtures.map((f) => f.id));

    for (const ch of show.channels) {
      const local = localByChan.get(ch.channel);
      // Merge: information the export doesn't have (a USITT ASCII file has no fixture types;
      // labels or addresses may be blank) never overwrites what Sanctuary Light already knows.
      // Replace: nothing is borrowed from the setup being replaced (it may be sample data),
      // except protections, which are always kept.
      const known = replace ? undefined : local;
      const hinted = ch.profileHint ? cfg.profiles.find((p) => p.id === ch.profileHint || p.name.toLowerCase() === ch.profileHint!.toLowerCase())?.id : undefined;
      const profileId = byChannel.get(ch.channel) ?? hinted ?? known?.profileId ?? 'generic';
      const relay = cfg.profiles.find((p) => p.id === profileId)?.capabilities.includes('relay') ?? false;
      const label = ch.label || known?.label || (ch.fixtureType ? `${ch.fixtureType} ${ch.channel}` : `Channel ${ch.channel}`);
      let id = local?.id ?? `fx-${ch.channel}`;
      if (!local) { while (usedIds.has(id)) id = `${id}-eos`; usedIds.add(id); }
      const fromEos: Fixture = {
        id,
        channel: ch.channel,
        label,
        profileId,
        dmx: ch.dmx ?? known?.dmx ?? null,
        area: known?.area ?? suggestArea(label, relay),
        // Never remove a local protection; add one for relays / non-dims named in Eos.
        protected: (local?.protected ?? false) || relay || RELAY_RE.test(ch.label) || ch.protectedHint === true,
        stage: placedLocally(ch.channel) ? local!.stage : gridPos.get(ch.channel)!,
        // The operator's own notes win; the Eos type is kept separately in eosType.
        notes: known?.notes || [ch.manufacturer, ch.fixtureType].filter(Boolean).join(' ') || undefined,
        eosType: ch.fixtureType ?? known?.eosType,
        // Exactly what Eos calls this channel in the export (may be empty).
        eosLabel: ch.label,
        unplaced: !placedLocally(ch.channel),
      };
      if (fromEos.unplaced) unplaced.push(ch.channel);
      // Position and placement always follow the keep-positions rule, whatever else is kept.
      const placement = { stage: fromEos.stage, unplaced: fromEos.unplaced };
      if (!local) {
        next.set(ch.channel, fromEos); changes.fixtures.added++;
        continue;
      }
      const differs = local.label !== fromEos.label || local.profileId !== fromEos.profileId || fmtDmx(local.dmx) !== fmtDmx(fromEos.dmx);
      if (!differs) { next.set(ch.channel, { ...local, ...placement, protected: fromEos.protected, eosType: fromEos.eosType, eosLabel: fromEos.eosLabel }); changes.fixtures.unchanged++; continue; }
      if (!replace) {
        conflicts.push({
          kind: 'fixture', key: `Channel ${ch.channel}`,
          local: `${local.label} · ${local.profileId} · ${fmtDmx(local.dmx)}`,
          imported: `${fromEos.label} · ${ch.fixtureType ?? 'no type'} · ${fmtDmx(fromEos.dmx)}`,
          resolution: useImported ? 'used-imported' : 'kept-local',
        });
      }
      next.set(ch.channel, useImported ? fromEos : { ...local, ...placement, protected: fromEos.protected });
      changes.fixtures.updated += useImported ? 1 : 0;
      changes.fixtures.unchanged += useImported ? 0 : 1;
    }
    if (replace) {
      const dropped = current.fixtures.filter((f) => !importedChans.has(f.channel));
      changes.fixtures.removed = dropped.length;
      const droppedProtected = dropped.filter((f) => f.protected);
      if (droppedProtected.length) {
        notices.push({ severity: 'warning', message: `Replace removes ${droppedProtected.length} protected channel(s) that are not in the Eos export: ${droppedProtected.map((f) => f.channel).join(', ')}. If they still exist in Eos, use Merge instead.` });
      }
    }
    cfg.fixtures = [...next.values()].sort((a, b) => a.channel - b.channel);
    const generic = show.channels.filter((c) => !c.fixtureType).length;
    if (generic) notices.push({ severity: 'info', message: `${generic} channel(s) have no fixture type in the export. They get intensity-only controls (Generic) until you choose a profile.` });
    const relays = cfg.fixtures.filter((f) => f.protected && importedChans.has(f.channel) && !localByChan.get(f.channel)?.protected);
    if (relays.length) notices.push({ severity: 'info', message: `${relays.length} channel(s) named as relays/non-dims in Eos will be protected: ${relays.map((f) => f.channel).join(', ')}.` });
  }

  // ── groups ──
  if (opts.include.groups && show.groups.length) {
    const byEos = new Map(current.groups.filter((g) => g.eosGroup != null).map((g) => [g.eosGroup as number, g]));
    const kept = replace ? [] : current.groups.filter((g) => g.eosGroup == null || !show.groups.some((s) => s.number === g.eosGroup));
    const out: FixtureGroup[] = [...kept];
    show.groups.forEach((g, i) => {
      const local = byEos.get(g.number);
      const fromEos: FixtureGroup = {
        id: local?.id ?? `grp-eos-${g.number}`, name: g.label || `Group ${g.number}`,
        color: local?.color ?? GROUP_COLORS[i % GROUP_COLORS.length], channels: [...g.channels].sort((a, b) => a - b),
        eosGroup: g.number, volunteerVisible: local?.volunteerVisible ?? false, eosLabel: g.label,
      };
      if (!local) { out.push(fromEos); changes.groups.added++; return; }
      // A local (volunteer-facing) name is the operator's choice: only channel changes conflict.
      if (same(local.channels, g.channels) && (local.name === fromEos.name || local.eosLabel === g.label)) { out.push({ ...local, eosLabel: g.label }); changes.groups.unchanged++; return; }
      if (!replace) {
        conflicts.push({
          kind: 'group', key: `Group ${g.number}`,
          local: `${local.name}: ${local.channels.length} channels`, imported: `${fromEos.name}: ${g.channels.length} channels`,
          resolution: useImported ? 'used-imported' : 'kept-local',
        });
      }
      // Using Eos data updates the channels; a renamed group keeps its local name.
      // "Renamed" = the local name differs from the name the import gave it (its Eos label, or "Group N").
      const renamed = local.eosLabel !== undefined && local.name !== (local.eosLabel || `Group ${g.number}`);
      out.push(useImported ? { ...fromEos, name: renamed ? local.name : fromEos.name } : { ...local, eosLabel: g.label });
      if (useImported) changes.groups.updated++; else changes.groups.unchanged++;
    });
    if (replace) {
      const lost = current.groups.filter((g) => !show.groups.some((s) => s.number === g.eosGroup));
      changes.groups.removed = lost.length;
      if (lost.some((g) => g.volunteerVisible)) notices.push({ severity: 'warning', message: `Replace removes local groups volunteers use: ${lost.filter((g) => g.volunteerVisible).map((g) => g.name).join(', ')}. Mark imported groups as volunteer-visible in Settings → Groups afterwards.` });
    }
    cfg.groups = out;
    notices.push({ severity: 'info', message: 'Imported groups start unverified. Until you verify them against Eos (Monitor mode → Verify groups), Sanctuary Light sends each group\'s channel list, never "Group N".' });
  }
  const patched = new Set(cfg.fixtures.map((f) => f.channel));
  for (const g of opts.include.groups ? show.groups : []) {
    const missing = g.channels.filter((c) => !patched.has(c));
    if (missing.length) notices.push({ severity: 'warning', message: `Group ${g.number} (${g.label || 'no label'}) includes channel(s) not in the patch: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}.` });
  }

  // ── cue lists ──
  if (opts.include.cueLists && show.cueLists.length) {
    const byList = new Map(current.cueLists.map((c) => [c.list, c]));
    const out: CueListConfig[] = replace ? [] : current.cueLists.filter((c) => !show.cueLists.some((s) => s.list === c.list));
    for (const l of show.cueLists) {
      const fromEos: CueListConfig = {
        list: l.list, label: l.label || `Cue list ${l.list}`,
        cues: l.cues.map((q): CueEntry => ({
          cue: q.cue, label: q.label,
          notes: [describeTiming(q.timing), q.parts ? `${q.parts} parts` : '', q.notes ?? ''].filter(Boolean).join(' · ') || undefined,
          timing: q.timing, fromEos: true,
        })),
      };
      const local = byList.get(l.list);
      if (!local) { out.push(fromEos); changes.cueLists.added++; continue; }
      const localKey = local.cues.map((c) => `${c.cue}:${c.label}`).join('|');
      const eosKey = fromEos.cues.map((c) => `${c.cue}:${c.label}`).join('|');
      if (localKey === eosKey) { out.push({ ...local, cues: fromEos.cues }); changes.cueLists.unchanged++; continue; }
      if (!replace) conflicts.push({ kind: 'cueList', key: `Cue list ${l.list}`, local: `${local.cues.length} cues`, imported: `${l.cues.length} cues`, resolution: useImported ? 'used-imported' : 'kept-local' });
      out.push(useImported ? fromEos : local);
      if (useImported) changes.cueLists.updated++; else changes.cueLists.unchanged++;
    }
    if (replace) changes.cueLists.removed = current.cueLists.filter((c) => !show.cueLists.some((s) => s.list === c.list)).length;
    cfg.cueLists = out.sort((a, b) => a.list - b.list);
  }

  // ── submasters ──
  if (opts.include.submasters && show.subs.length) {
    const protectedChans = new Set(cfg.fixtures.filter((f) => f.protected).map((f) => f.channel));
    const bySub = new Map(current.submasters.map((s) => [s.sub, s]));
    const hiddenSubs: number[] = [];
    const out: SubmasterConfig[] = replace ? [] : current.submasters.filter((s) => !show.subs.some((x) => x.number === s.sub));
    for (const s of show.subs) {
      const local = bySub.get(s.number);
      const touchesProtected = s.channels.some((c) => protectedChans.has(c));
      // A submaster can control anything in Eos: volunteers need an operator's approval, so an
      // unapproved one is hidden from Volunteer Mode until someone reviews it.
      const approval = local?.approval ?? null;
      const volunteerVisible = !!approval && (local?.volunteerVisible ?? false);
      if (local?.volunteerVisible && !approval) hiddenSubs.push(s.number);
      const fromEos: SubmasterConfig = {
        sub: s.number, label: s.label || `Sub ${s.number}`, volunteerVisible,
        protected: (local?.protected ?? false) || touchesProtected,
        fromEos: true, approval,
      };
      if (!local) { out.push(fromEos); changes.submasters.added++; continue; }
      if (local.label === fromEos.label && local.protected === fromEos.protected) { out.push({ ...local, fromEos: true, volunteerVisible }); changes.submasters.unchanged++; continue; }
      if (!replace && local.label !== fromEos.label) conflicts.push({ kind: 'submaster', key: `Sub ${s.number}`, local: local.label, imported: fromEos.label, resolution: useImported ? 'used-imported' : 'kept-local' });
      out.push(useImported ? fromEos : { ...local, protected: fromEos.protected, fromEos: true, volunteerVisible });
      if (useImported) changes.submasters.updated++; else changes.submasters.unchanged++;
    }
    if (replace) changes.submasters.removed = current.submasters.filter((s) => !show.subs.some((x) => x.number === s.sub)).length;
    cfg.submasters = out.sort((a, b) => a.sub - b.sub);
    if (hiddenSubs.length) notices.push({ severity: 'warning', message: `Submaster(s) ${hiddenSubs.join(', ')} are in the Eos show and will be hidden from volunteers until an operator reviews and approves them (Setup → Worship looks).` });
    const prot = cfg.submasters.filter((s) => s.protected && !bySub.get(s.sub)?.protected);
    if (prot.length) notices.push({ severity: 'info', message: `Submaster(s) ${prot.map((s) => s.sub).join(', ')} control protected channels and will be protected too.` });
  }

  // ── looks: one per labelled cue in the chosen list; each fires the real Eos cue ──
  if (opts.include.looks && opts.looksFromList != null) {
    const list = show.cueLists.find((l) => l.list === opts.looksFromList);
    const existing = new Set(current.looks.filter((l) => l.action.type === 'cue').map((l) => l.action.type === 'cue' ? `${l.action.list}/${l.action.cue}` : ''));
    const labelled = list?.cues.filter((q) => q.label.trim()) ?? [];
    const looks: Look[] = [];
    for (const q of labelled) {
      if (existing.has(`${list!.list}/${q.cue}`)) { changes.looks.unchanged++; continue; }
      looks.push({
        id: `look-eos-${list!.list}-${q.cue.replace('.', '_')}`,
        name: q.label.trim(),
        description: `Plays Eos cue ${list!.list}/${q.cue}. The stage preview can't show it: Eos stores cues as tracked changes.`,
        icon: 'sparkles',
        gradient: ['#1e293b', '#475569'],
        action: { type: 'cue', list: list!.list, cue: q.cue },
        preview: [],
        volunteerVisible: false,
        approval: null, // importing a cue is never approval
      });
    }
    changes.looks.added = looks.length;
    cfg.looks = [...current.looks, ...looks];
    const unlabelled = (list?.cues.length ?? 0) - labelled.length;
    if (unlabelled) notices.push({ severity: 'info', message: `${unlabelled} cue(s) in list ${opts.looksFromList} have no label, so no look was made for them (they still play from GO).` });
    if (looks.length) notices.push({ severity: 'info', message: `${looks.length} look(s) will fire the real Eos cues. They are hidden from volunteers until you choose which ones to show (Settings → Looks).` });
  }

  // ── palettes / presets: reference only ──
  const palettes = opts.include.palettes ? show.palettes : (current.eosShow?.palettes ?? []);
  changes.palettes.added = opts.include.palettes ? show.palettes.length : 0;
  cfg.eosShow = {
    importedAt: Date.now(),
    fileName: show.fileName,
    format: show.format,
    source: show.source,
    palettes,
    counts: {
      channels: show.channels.length, groups: show.groups.length, cueLists: show.cueLists.length,
      cues: show.cueLists.reduce((n, l) => n + l.cues.length, 0), subs: show.subs.length, palettes: show.palettes.length,
    },
  };

  // Profiles no longer used by any fixture are kept: they are harmless and may be chosen manually.
  return { config: cfg, changes, conflicts, notices, unplaced };
}
