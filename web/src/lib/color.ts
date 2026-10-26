import type { RGB } from '@sanctuary/shared';

/** h 0–360, s/v 0–1 → RGB 0–100 (Eos-style percentages). */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 100), g: Math.round((g + m) * 100), b: Math.round((b + m) * 100) };
}

export function rgbToHsv({ r, g, b }: RGB): { h: number; s: number; v: number } {
  const R = r / 100, G = g / 100, B = b / 100;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? d / max : 0, v: max };
}

/** Approximate color of a black-body source (Tanner Helland's fit), returned as 0–255. */
export function kelvinToRgb255(k: number): [number, number, number] {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return [c(r), c(g), c(b)];
}

export const rgbCss = (c: RGB, alpha = 1) =>
  `rgba(${Math.round(c.r * 2.55)}, ${Math.round(c.g * 2.55)}, ${Math.round(c.b * 2.55)}, ${alpha})`;

export const SWATCHES: { name: string; rgb: RGB }[] = [
  { name: 'Warm White', rgb: { r: 100, g: 78, b: 50 } },
  { name: 'Neutral White', rgb: { r: 100, g: 95, b: 85 } },
  { name: 'Cool White', rgb: { r: 80, g: 90, b: 100 } },
  { name: 'Red', rgb: { r: 100, g: 0, b: 0 } },
  { name: 'Amber', rgb: { r: 100, g: 50, b: 0 } },
  { name: 'Gold', rgb: { r: 100, g: 75, b: 10 } },
  { name: 'Green', rgb: { r: 0, g: 100, b: 20 } },
  { name: 'Cyan', rgb: { r: 0, g: 80, b: 100 } },
  { name: 'Blue', rgb: { r: 0, g: 10, b: 100 } },
  { name: 'Lavender', rgb: { r: 60, g: 40, b: 100 } },
  { name: 'Purple', rgb: { r: 55, g: 0, b: 100 } },
  { name: 'Magenta', rgb: { r: 100, g: 0, b: 70 } },
];
