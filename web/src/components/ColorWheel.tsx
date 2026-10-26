import { useEffect, useRef, type PointerEvent } from 'react';
import type { RGB } from '@sanctuary/shared';
import { hsvToRgb, rgbCss, rgbToHsv } from '../lib/color';

/** Hue/saturation wheel. Brightness is handled by the intensity fader, as on Lightkey and Eos. */
export function ColorWheel({ value, onChange }: { value: RGB; onChange(rgb: RGB): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    const size = 420;
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const r0 = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r0, dy = y - r0;
        const d = Math.sqrt(dx * dx + dy * dy) / r0;
        const i = (y * size + x) * 4;
        if (d > 1) { img.data[i + 3] = 0; continue; }
        const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const { r, g, b } = hsvToRgb(h, d, 1);
        img.data[i] = r * 2.55; img.data[i + 1] = g * 2.55; img.data[i + 2] = b * 2.55; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const pick = (e: PointerEvent) => {
    const rect = box.current!.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (rect.width / 2));
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    onChange(hsvToRgb(h, s, 1));
  };

  const hsv = rgbToHsv(value);
  const angle = (hsv.h * Math.PI) / 180;
  const left = 50 + Math.cos(angle) * hsv.s * 50;
  const top = 50 + Math.sin(angle) * hsv.s * 50;

  const nudge = (dh: number, ds: number) => {
    onChange(hsvToRgb((hsv.h + dh + 360) % 360, Math.max(0, Math.min(1, hsv.s + ds)), 1));
  };

  return (
    <div
      ref={box} className="wheel" tabIndex={0} role="slider" aria-label="Color: arrow keys change hue (left/right) and saturation (up/down)"
      aria-valuetext={`hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s * 100)} percent`}
      onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture(e.pointerId); pick(e); }}
      onPointerMove={(e) => dragging.current && pick(e)}
      onPointerUp={() => { dragging.current = false; }}
      onKeyDown={(e) => {
        const map: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] };
        if (map[e.key]) { e.preventDefault(); nudge(...map[e.key]); }
      }}
    >
      <canvas ref={canvas} />
      <div className="wheel-handle" style={{ left: `${left}%`, top: `${top}%`, background: rgbCss(value) }} />
    </div>
  );
}
