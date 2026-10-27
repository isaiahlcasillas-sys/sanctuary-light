/**
 * Import report: exactly what the last Eos show import gave Sanctuary Light, what it left
 * incomplete, and what someone has to set up by hand. Built only from the configuration as it
 * is now; it never guesses what the show contains.
 */
import type { AppConfig } from './model';

export interface ReportLine {
  /** Short heading, e.g. "DMX addresses". */
  label: string;
  /** What it means, in plain words. */
  detail: string;
  /** How many items (when it makes sense). */
  count?: number;
}

export interface ImportReport {
  source: { fileName: string; format: string; importedAt: number } | null;
  /** Taken from the export file as it was. */
  imported: ReportLine[];
  /** Imported, but something is missing or couldn't be confirmed. */
  incomplete: ReportLine[];
  /** Not in an export file: an operator sets it up in Sanctuary Light. */
  manual: ReportLine[];
  /** Never imported (an Eos export doesn't carry it, or Sanctuary Light doesn't read it). */
  notImported: ReportLine[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Singular or plural verb for a count: verb(1, 'has', 'have'). */
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function importReport(cfg: AppConfig): ImportReport {
  const show = cfg.eosShow;
  const fixtures = cfg.fixtures.filter((f) => f.eosType !== undefined || f.eosLabel !== undefined);
  const imported: ReportLine[] = [];
  const incomplete: ReportLine[] = [];
  const manual: ReportLine[] = [];
  const notImported: ReportLine[] = [
    { label: 'Cue contents', detail: 'Levels, colors and positions inside each cue stay in Eos. Sanctuary Light knows cue numbers, labels and the timing text only.' },
    { label: 'Preset and palette contents', detail: 'Only their numbers and names are kept, for reference.' },
    { label: 'Submaster contents', detail: 'Only the submaster number and label. Moving a sub moves whatever it holds in Eos.' },
    { label: 'Effects, macros, magic sheets, snapshots', detail: 'Not imported. Macros and snapshots can only be assigned to looks by an operator.' },
    { label: 'Where the lights hang', detail: 'An Eos export has no stage positions. You place fixtures in Arrange sanctuary.' },
    { label: 'SceneStation, Gadget II, wireless DMX', detail: 'Not part of the Eos show. Sanctuary Light never reads or changes them.' },
  ];
  if (!show) {
    return {
      source: null, imported, incomplete,
      manual: [{ label: 'Import your Eos show', detail: 'Sanctuary Light is using its built-in sample setup. Export the show from Eos (File → Export → CSV) and import it.' }],
      notImported,
    };
  }

  const profiles = new Map(cfg.profiles.map((p) => [p.id, p]));
  const grouped = new Set(cfg.groups.flatMap((g) => g.channels));
  const patched = new Set(cfg.fixtures.map((f) => f.channel));
  const withAddress = fixtures.filter((f) => f.dmx).length;
  const withType = fixtures.filter((f) => f.eosType).length;
  const confirmed = fixtures.filter((f) => profiles.get(f.profileId)?.verified).length;
  const eosGroups = cfg.groups.filter((g) => g.eosGroup != null);
  const lists = cfg.cueLists.filter((l) => l.cues.some((q) => q.fromEos));
  const cues = lists.flatMap((l) => l.cues);
  const timed = cues.filter((q) => q.timing && Object.values(q.timing).some((v) => (Array.isArray(v) ? v.length > 0 : !!v))).length;
  const subs = cfg.submasters.filter((s) => s.fromEos);
  const palettes = show.palettes.length;

  imported.push({ label: 'Channels', count: fixtures.length, detail: `${plural(fixtures.length, 'channel')} with their Eos channel numbers and labels.` });
  if (withAddress) imported.push({ label: 'DMX addresses', count: withAddress, detail: `${withAddress} of ${fixtures.length} channels have a universe/address (for reference; Eos's patch stays in charge).` });
  if (withType) imported.push({ label: 'Fixture types', count: withType, detail: `${withType} of ${fixtures.length} channels name their Eos fixture type.` });
  if (confirmed) imported.push({ label: 'Controls', count: confirmed, detail: `${confirmed} channels have controls (color, pan/tilt…) taken from parameters the show actually uses.` });
  if (eosGroups.length) imported.push({ label: 'Groups', count: eosGroups.length, detail: `${plural(eosGroups.length, 'Eos group')} with their numbers, labels and channels.` });
  if (lists.length) imported.push({ label: 'Cue lists', count: cues.length, detail: `${plural(lists.length, 'cue list')}, ${plural(cues.length, 'cue')}, with numbers and labels${timed ? `; ${timed} with exported timing text` : ''}.` });
  if (subs.length) imported.push({ label: 'Submasters', count: subs.length, detail: `${plural(subs.length, 'submaster')} (numbers and labels).` });
  if (palettes) imported.push({ label: 'Presets and palettes', count: palettes, detail: `${palettes} names, for reference.` });

  const noType = fixtures.length - withType;
  const noAddr = fixtures.length - withAddress;
  const unconfirmed = fixtures.length - confirmed;
  if (noType) incomplete.push({ label: 'Fixture type unknown', count: noType, detail: `${plural(noType, 'channel')} ${verb(noType, 'has', 'have')} no fixture type in the export. Check them in Review fixtures.` });
  if (noAddr) incomplete.push({ label: 'No DMX address', count: noAddr, detail: `${plural(noAddr, 'channel')} ${verb(noAddr, 'has', 'have')} no address in the export (unpatched, or the export didn't include it).` });
  if (unconfirmed) incomplete.push({ label: 'Controls not confirmed', count: unconfirmed, detail: `${plural(unconfirmed, 'channel')} showed no parameters in the export, so only intensity is offered for them.` });
  const outside = eosGroups.filter((g) => g.channels.some((c) => !patched.has(c)));
  if (outside.length) incomplete.push({ label: 'Groups with unpatched channels', count: outside.length, detail: `${outside.map((g) => `Group ${g.eosGroup}`).join(', ')} ${verb(outside.length, 'includes', 'include')} channels that aren't in the imported patch.` });
  const ungrouped = fixtures.filter((f) => !grouped.has(f.channel)).length;
  if (ungrouped) incomplete.push({ label: 'Not in any group', count: ungrouped, detail: `${plural(ungrouped, 'channel')} ${verb(ungrouped, 'isn\'t', 'aren\'t')} in a group, so volunteers can't reach them with a group fader.` });
  const unlabeled = cues.filter((q) => !q.label).length;
  if (unlabeled) incomplete.push({ label: 'Cues without labels', count: unlabeled, detail: `${plural(unlabeled, 'cue')} ${verb(unlabeled, 'has', 'have')} no label in Eos. Add friendly labels in Worship looks if volunteers will see them.` });

  const unplaced = fixtures.filter((f) => f.unplaced).length;
  if (unplaced) manual.push({ label: 'Place fixtures on the stage plan', count: unplaced, detail: `${plural(unplaced, 'fixture')} ${verb(unplaced, 'is', 'are')} waiting in "Not yet placed" (Arrange sanctuary).` });
  manual.push({ label: 'Check categories', detail: 'Front, stage wash, scenic, house and utility were suggested from labels. Correct any that are wrong, especially house lights (SceneStation also controls those).' });
  const protectedCount = fixtures.filter((f) => f.protected).length;
  manual.push({ label: 'Confirm relays and utility channels', count: protectedCount, detail: `${plural(protectedCount, 'channel')} ${protectedCount === 1 ? 'is' : 'are'} protected (found by label). Protect any other relay or house-power channel in Review fixtures.` });
  manual.push({ label: 'Choose volunteer groups', detail: 'Imported groups start hidden from volunteers. Pick the ones volunteers may adjust (Settings → Groups).' });
  manual.push({ label: 'Make worship looks and approve them', detail: 'Assign cues to buttons, then review each one (and any submaster or GO/BACK list) before volunteers can use it.' });
  manual.push({ label: 'Compare with the running show', detail: cfg.verification && cfg.verification.at > show.importedAt && !cfg.verification.simulatedConsole ? 'Done: see Verify with Eos for the result.' : 'Connect in Monitor mode and run Verify with Eos. The file may not match what Eos has loaded now.' });

  return { source: { fileName: show.fileName, format: show.format, importedAt: show.importedAt }, imported, incomplete, manual, notImported };
}
