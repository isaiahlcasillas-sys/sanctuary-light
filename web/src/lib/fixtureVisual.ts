import type { Fixture, FixtureProfile, FixtureState } from '@sanctuary/shared';
import { kelvinToRgb255 } from './color';

/** The color a fixture's light appears in the preview, as 0–255 RGB. */
export function lightColor(state: FixtureState | undefined, profile: FixtureProfile | undefined): [number, number, number] {
  const caps = profile?.capabilities ?? [];
  if (state?.color && caps.includes('rgb')) {
    let r = state.color.r * 2.55, g = state.color.g * 2.55, b = state.color.b * 2.55;
    const w = (state.white ?? 0) / 100, a = (state.amber ?? 0) / 100, uv = (state.uv ?? 0) / 100;
    r = r + w * 255 + a * 255 + uv * 60; g = g + w * 240 + a * 150; b = b + w * 220 + uv * 200;
    const max = Math.max(r, g, b, 1);
    const scale = max > 255 ? 255 / max : 1;
    return [r * scale, g * scale, b * scale].map(Math.round) as [number, number, number];
  }
  if (caps.includes('cct') && state?.cct) return kelvinToRgb255(state.cct);
  if (profile?.kind === 'pendant') return kelvinToRgb255(2800);
  if (profile?.kind === 'conventional') return kelvinToRgb255(3400);
  if (profile?.kind === 'relay') return [248, 113, 113];
  return [255, 244, 230];
}

export interface BeamShape { cx: number; cy: number; rx: number; ry: number; angle: number }

/** Where the light lands on the overhead plan. rotation 0 = pointing toward the house (down the screen). */
export function beamFor(f: Fixture, profile: FixtureProfile | undefined, state: FixtureState | undefined): BeamShape | null {
  const kind = profile?.kind ?? 'conventional';
  if (kind === 'relay') return null;
  let rot = f.stage.rotation;
  let throwDist = 0;
  let rx = 80, ry = 80;
  switch (kind) {
    case 'conventional': throwDist = 170; rx = ry = 70; break;
    case 'led-par': throwDist = 30; rx = ry = 85; break;
    case 'led-bar': throwDist = 18; rx = 75; ry = 34; break;
    case 'striplight': throwDist = 22; rx = 120; ry = 40; break;
    case 'pendant': throwDist = 0; rx = ry = 58; break;
    case 'moving': {
      rot += state?.pan ?? 0;
      throwDist = 40 + Math.abs(state?.tilt ?? 45) * 3;
      const z = 30 + (state?.zoom ?? 50) * 1.1;
      rx = ry = z;
      break;
    }
  }
  if (kind !== 'moving' && profile?.capabilities.includes('zoom') && state?.zoom != null) rx = ry = 30 + state.zoom * 1.2;
  const rad = (rot * Math.PI) / 180;
  return { cx: f.stage.x - Math.sin(rad) * throwDist, cy: f.stage.y + Math.cos(rad) * throwDist, rx, ry, angle: kind === 'led-bar' || kind === 'striplight' ? rot : 0 };
}
