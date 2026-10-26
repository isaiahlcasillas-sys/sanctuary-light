import { useRef, type PointerEvent } from 'react';

/** Pan/tilt pad. x = pan (−270…270°), y = tilt (−135…135°). */
export function XYPad({ pan, tilt, onChange }: { pan: number; tilt: number; onChange(pan: number, tilt: number): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const set = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    onChange(Math.round(fx * 540 - 270), Math.round(fy * 270 - 135));
  };
  return (
    <div
      ref={ref} className="xy-pad" tabIndex={0} role="slider" aria-label="Pan and tilt: left/right arrows pan, up/down arrows tilt"
      aria-valuetext={`pan ${pan} degrees, tilt ${tilt} degrees`}
      onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture(e.pointerId); set(e); }}
      onPointerMove={(e) => dragging.current && set(e)}
      onPointerUp={() => { dragging.current = false; }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 15 : 3;
        if (e.key === 'ArrowLeft') onChange(Math.max(-270, pan - step), tilt);
        else if (e.key === 'ArrowRight') onChange(Math.min(270, pan + step), tilt);
        else if (e.key === 'ArrowUp') onChange(pan, Math.max(-135, tilt - step));
        else if (e.key === 'ArrowDown') onChange(pan, Math.min(135, tilt + step));
        else return;
        e.preventDefault();
      }}
    >
      <div className="xy-handle" style={{ left: `${((pan + 270) / 540) * 100}%`, top: `${((tilt + 135) / 270) * 100}%` }} />
    </div>
  );
}
