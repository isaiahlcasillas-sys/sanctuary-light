/**
 * Look Designer helpers: local looks built fixture by fixture, simulated fades between them,
 * and the library's collections. Everything here is local to Sanctuary Light. Sending a look to
 * Eos is a separate, explicit, server-checked action (see liveLook.ts).
 */
import type { AppConfig, Capability, Fixture, FixtureProfile, FixtureState, Look, LookFixtureState, RGB } from './model';

export const DEFAULT_COLLECTIONS = ['Worship', 'Sermon', 'Seasonal', 'Special Events'] as const;
export const MAX_FADE_SECONDS = 120;

/** Collections in use, defaults first. A look without one is shown under "Worship". */
export function lookCollections(looks: Look[]): string[] {
  const used = looks.map((l) => l.collection).filter((c): c is string => !!c && !!c.trim());
  return [...new Set<string>([...DEFAULT_COLLECTIONS, ...used])];
}
export const collectionOf = (l: Look) => (l.collection && l.collection.trim()) || 'Worship';

/**
 * The import couldn't tell what this fixture can do (unknown type, or a type with no
 * parameters in the export), so only intensity is offered.
 */
export const controlsUnknown = (p: FixtureProfile | undefined) => !p || p.id === 'generic' || (p.id.startsWith('eos-') && !p.verified);
/** The controls come from a sample or hand-picked profile, not from the show itself. */
export const profileAssumed = (p: FixtureProfile | undefined) => !!p && !p.verified && !controlsUnknown(p);

/** The parameters a profile is known to support (nothing is assumed for unknown profiles). */
export function supportedParams(profile: FixtureProfile | undefined): Set<Capability> {
  const caps = new Set<Capability>(profile?.capabilities ?? ['intensity']);
  // A relay is switched with intensity (0 = off, full = on).
  if (caps.has('relay')) caps.add('intensity');
  return caps;
}

/** Keep only what the fixture is known to support. Values are clamped to their ranges. */
export function clampToProfile(state: FixtureState, profile: FixtureProfile | undefined): FixtureState {
  const caps = supportedParams(profile);
  const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  const out: FixtureState = { intensity: caps.has('intensity') ? pct(state.intensity ?? 0) : 0 };
  if (caps.has('rgb') && state.color) out.color = { r: pct(state.color.r), g: pct(state.color.g), b: pct(state.color.b) };
  if (caps.has('white') && state.white != null) out.white = pct(state.white);
  if (caps.has('amber') && state.amber != null) out.amber = pct(state.amber);
  if (caps.has('uv') && state.uv != null) out.uv = pct(state.uv);
  if (caps.has('cct') && state.cct != null) out.cct = Math.max(1000, Math.min(12000, Math.round(state.cct)));
  if (caps.has('zoom') && state.zoom != null) out.zoom = pct(state.zoom);
  if (caps.has('focus') && state.focus != null) out.focus = pct(state.focus);
  if (caps.has('pantilt')) {
    if (state.pan != null) out.pan = Math.max(-270, Math.min(270, state.pan));
    if (state.tilt != null) out.tilt = Math.max(-135, Math.min(135, state.tilt));
  }
  return out;
}

/**
 * What a look sets, channel by channel. Designed looks (`fixtures`) are used as they are;
 * older looks fall back to their group preview. Channels a look doesn't mention are absent
 * (they keep whatever they had). Parameters a fixture doesn't support are dropped.
 */
export function lookLevels(cfg: Pick<AppConfig, 'fixtures' | 'profiles' | 'groups'>, look: Look): Map<number, FixtureState> {
  const profiles = new Map(cfg.profiles.map((p) => [p.id, p]));
  const byChannel = new Map(cfg.fixtures.map((f) => [f.channel, f]));
  const out = new Map<number, FixtureState>();
  if (look.fixtures?.length) {
    for (const s of look.fixtures) {
      const f = byChannel.get(s.channel);
      if (!f) continue;
      const { channel: _c, ...state } = s;
      out.set(s.channel, clampToProfile(state, profiles.get(f.profileId)));
    }
    return out;
  }
  for (const entry of look.preview) {
    const g = cfg.groups.find((x) => x.id === entry.groupId);
    if (!g) continue;
    for (const ch of g.channels) {
      const f = byChannel.get(ch);
      if (!f) continue;
      out.set(ch, clampToProfile({ intensity: entry.intensity, color: entry.color, cct: entry.cct }, profiles.get(f.profileId)));
    }
  }
  return out;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: RGB | undefined, b: RGB | undefined, t: number): RGB | undefined => {
  if (!a && !b) return undefined;
  const x = a ?? b!; const y = b ?? a!;
  return { r: mix(x.r, y.r, t), g: mix(x.g, y.g, t), b: mix(x.b, y.b, t) };
};

/** A crossfade step between two fixture states (t from 0 to 1). Color snaps from black. */
export function interpolateState(from: FixtureState, to: FixtureState, t: number): FixtureState {
  const k = Math.max(0, Math.min(1, t));
  const num = (a: number | undefined, b: number | undefined) => (a == null && b == null ? undefined : mix(a ?? b!, b ?? a!, k));
  const out: FixtureState = { intensity: mix(from.intensity, to.intensity, k) };
  // A fixture fading up from dark takes its new color straight away (as a console would).
  const color = from.intensity <= 0.5 ? to.color ?? from.color : mixRgb(from.color, to.color, k);
  if (color) out.color = color;
  for (const p of ['white', 'amber', 'uv', 'cct', 'zoom', 'focus', 'pan', 'tilt'] as const) {
    const v = num(from[p], to[p]);
    if (v != null) out[p] = v;
  }
  return out;
}

/** Turn designer states into what is saved in a look (only supported parameters, sorted). */
export function toLookFixtures(states: Map<number, FixtureState>, fixtures: Fixture[], profiles: FixtureProfile[]): LookFixtureState[] {
  const byChannel = new Map(fixtures.map((f) => [f.channel, f]));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return [...states.entries()]
    .filter(([ch]) => byChannel.has(ch))
    .sort(([a], [b]) => a - b)
    .map(([channel, s]) => ({ channel, ...clampToProfile(s, byId.get(byChannel.get(channel)!.profileId)) }));
}

/** Two representative colors of a look, for its library card. */
export function lookPalette(cfg: Pick<AppConfig, 'fixtures' | 'profiles' | 'groups'>, look: Look): [string, string] {
  const lit = [...lookLevels(cfg, look).values()].filter((s) => s.intensity > 5);
  if (!lit.length) return look.gradient;
  const avg = (list: FixtureState[]) => {
    const n = list.length;
    const c = list.reduce((acc, s) => {
      const rgb = s.color ?? { r: 100, g: 92, b: 80 };
      const k = s.intensity / 100;
      return { r: acc.r + rgb.r * k, g: acc.g + rgb.g * k, b: acc.b + rgb.b * k };
    }, { r: 0, g: 0, b: 0 });
    const to255 = (v: number) => Math.round(Math.min(255, (v / n) * 2.55 * 0.85 + 18));
    return `rgb(${to255(c.r)},${to255(c.g)},${to255(c.b)})`;
  };
  const colored = lit.filter((s) => s.color);
  return [avg(lit), avg(colored.length ? colored : lit)];
}
