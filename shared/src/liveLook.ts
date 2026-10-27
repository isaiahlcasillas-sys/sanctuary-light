/**
 * Apply to Eos: turning a designed local look into Eos commands.
 *
 * Phase 4B sends INTENSITY ONLY, using the documented command-line form already used for
 * the inspector's faders ("Chan 1 + 3 At 30 Enter"). Channels are always listed explicitly
 * (never "Group N"), so an imported group's membership never matters here.
 *
 * Other parameters (color, CCT, beam, position) are left out and reported, until their exact
 * Eos representation has been verified on our console. Protected, relay, utility and house
 * channels are never applied: house lights are shared with SceneStation.
 *
 * This file only plans; the server checks every precondition and does the sending.
 */
import { channelExpression } from './channels';
import { controlsUnknown, lookLevels, supportedParams } from './lookDesign';
import type { AppConfig, FixtureState, Look } from './model';

/** Upper limit on commands per Apply, to keep network output small and predictable. */
export const MAX_APPLY_COMMANDS = 40;
/** Pause between commands so the console's command line isn't flooded. */
export const APPLY_COMMAND_GAP_MS = 15;

export interface LiveCommand {
  channels: number[];
  level: number;
  /** Command-line text as Eos would show it ("#" = Enter). */
  text: string;
}

export interface LivePlan {
  lookId: string;
  commands: LiveCommand[];
  /** Channels in the look that won't be touched at all, and why. */
  skipped: { channel: number; label: string; reason: string }[];
  /** Parameters that won't be sent for channels whose intensity is sent, and why. */
  omitted: { channel: number; params: string[]; reason: string }[];
  /** Fade sent with the levels (Eos manual time), or null for a snap. */
  fadeSeconds: number | null;
  /** Problems that stop the whole Apply. */
  errors: string[];
}

export const PARAMS_NOT_VERIFIED = 'Not sent yet: how Eos sets this on your console hasn\'t been verified. Phase 4B applies intensity only.';
const PARAM_NAMES: [keyof FixtureState, string][] = [['color', 'color'], ['white', 'white'], ['amber', 'amber'], ['uv', 'UV'], ['cct', 'color temperature'], ['zoom', 'zoom'], ['focus', 'edge'], ['pan', 'pan'], ['tilt', 'tilt']];

const levelText = (v: number) => (v >= 100 ? 'Full' : v <= 0 ? '0' : `${v}`);
const fadeText = (f: number) => `${Math.round(f * 10) / 10}`;

/**
 * Plan the Eos commands for a look. Pure: no checks of mode, connection or show identity
 * (the server does those). `fadeSeconds` > 0 adds Eos manual time ("Time n") to each command.
 */
export function planLiveLook(cfg: Pick<AppConfig, 'fixtures' | 'profiles' | 'groups'>, look: Look, opts: { fadeSeconds?: number | null } = {}): LivePlan {
  const plan: LivePlan = { lookId: look.id, commands: [], skipped: [], omitted: [], fadeSeconds: null, errors: [] };
  if (look.action.type !== 'none') {
    plan.errors.push(`“${look.name}” plays an Eos ${look.action.type}; use Play for it. Apply to Eos is for looks designed in Sanctuary Light.`);
    return plan;
  }
  if (!look.fixtures?.length) {
    plan.errors.push(`“${look.name}” has no designed fixture levels. Open it in the Look Designer and save it first.`);
    return plan;
  }
  const fade = opts.fadeSeconds != null && opts.fadeSeconds > 0 ? Math.min(60, opts.fadeSeconds) : null;
  plan.fadeSeconds = fade;
  const profiles = new Map(cfg.profiles.map((p) => [p.id, p]));
  const byChannel = new Map(cfg.fixtures.map((f) => [f.channel, f]));
  const levels = lookLevels(cfg, look);
  const byLevel = new Map<number, number[]>();

  for (const designed of look.fixtures) {
    const ch = designed.channel;
    const f = byChannel.get(ch);
    if (!f) { plan.skipped.push({ channel: ch, label: `Channel ${ch}`, reason: 'Not in the imported patch.' }); continue; }
    const p = profiles.get(f.profileId);
    const caps = supportedParams(p);
    if (f.protected || caps.has('relay')) { plan.skipped.push({ channel: ch, label: f.label, reason: 'Protected (relay or utility): never applied from a look.' }); continue; }
    if (f.area === 'utility') { plan.skipped.push({ channel: ch, label: f.label, reason: 'Utility channel: never applied from a look.' }); continue; }
    if (f.area === 'house') { plan.skipped.push({ channel: ch, label: f.label, reason: 'House light: SceneStation shares the house lights, so they aren\'t applied until the SceneStation audit is done.' }); continue; }
    const s = levels.get(ch);
    if (!s) { plan.skipped.push({ channel: ch, label: f.label, reason: 'No valid level stored for this fixture.' }); continue; }
    const level = Math.round(Math.max(0, Math.min(100, s.intensity)));
    byLevel.set(level, [...(byLevel.get(level) ?? []), ch]);
    const params = PARAM_NAMES.filter(([k]) => s[k] != null).map(([, n]) => n);
    if (params.length) plan.omitted.push({ channel: ch, params, reason: controlsUnknown(p) ? 'Controls not confirmed by the import.' : PARAMS_NOT_VERIFIED });
  }

  for (const [level, channels] of [...byLevel.entries()].sort((a, b) => b[0] - a[0])) {
    const sorted = [...channels].sort((a, b) => a - b);
    const text = `Chan ${channelExpression(sorted)} At ${levelText(level)}${fade ? ` Time ${fadeText(fade)}` : ''} #`;
    plan.commands.push({ channels: sorted, level, text });
  }
  if (plan.commands.length > MAX_APPLY_COMMANDS) {
    plan.errors.push(`This look needs ${plan.commands.length} separate commands (one per distinct level). The limit is ${MAX_APPLY_COMMANDS}, to keep network output predictable. Use fewer distinct levels.`);
  }
  if (!plan.commands.length && !plan.errors.length) plan.errors.push('Nothing in this look can be applied (see the skipped fixtures).');
  return plan;
}

/** What actually happened when a look was applied. */
export interface ApplyReport {
  lookId: string;
  lookName: string;
  at: number;
  /** Command-line texts that were transmitted to Eos. */
  sent: string[];
  /** Transmission failed (with the error). */
  failed: { text: string; error: string }[];
  /** Not sent because the Apply was stopped (mode change, lost connection). */
  notSent: { text: string; reason: string }[];
  skipped: LivePlan['skipped'];
  omitted: LivePlan['omitted'];
  fadeSeconds: number | null;
  /**
   * Eos doesn't report channel levels back, so a transmitted command is never proof the light
   * changed. The operator confirms what they see.
   */
  confirmation: 'not-confirmed';
}

export function describeApply(r: ApplyReport): string {
  const parts = [`${r.sent.length} command${r.sent.length === 1 ? '' : 's'} sent`];
  if (r.failed.length) parts.push(`${r.failed.length} failed`);
  if (r.notSent.length) parts.push(`${r.notSent.length} not sent`);
  if (r.skipped.length) parts.push(`${r.skipped.length} fixture${r.skipped.length === 1 ? '' : 's'} skipped`);
  if (r.omitted.length) parts.push(`color/other parameters left out on ${r.omitted.length}`);
  return `“${r.lookName}” → Eos: ${parts.join(', ')}. Eos doesn't report levels back: check the lights.`;
}
