/**
 * Fixture parameter controls, shared by the live inspector and the Look Designer. Only the
 * parameters the selected fixtures are known to support are shown; nothing is offered for a
 * capability the import didn't confirm.
 */
import { useEffect, useState } from 'react';
import { Home, Info } from 'lucide-react';
import type { Capability, FixtureState, RGB } from '@sanctuary/shared';
import { SWATCHES, kelvinToRgb255, rgbCss } from '../../lib/color';
import { ColorWheel } from '../ColorWheel';
import { XYPad } from '../XYPad';
import { Fader, Tip } from '../ui';

/** A control's value follows the source of truth, but moves at once while being dragged. */
function useFollow<T>(remote: T, key: string): [T, (v: T) => void] {
  const [v, setV] = useState(remote);
  const sig = JSON.stringify(remote);
  useEffect(() => { setV(remote); }, [key, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV];
}

export type ParamPatch = Partial<FixtureState>;

export function ParamControls({ caps, state, selKey, onChange, disabled = false, unconfirmedCount = 0, assumedCount = 0 }: {
  caps: Set<Capability>;
  state: FixtureState;
  /** Changes when the selection changes, so controls reset to the new fixtures' values. */
  selKey: string;
  /** Return false (or a promise of false) if the change was refused, to snap the control back. */
  onChange(patch: ParamPatch): void | boolean | Promise<boolean>;
  disabled?: boolean;
  /** Selected fixtures whose controls the import couldn't confirm (intensity only). */
  unconfirmedCount?: number;
  /** Selected fixtures whose controls come from a sample or hand-picked profile. */
  assumedCount?: number;
}) {
  const [intensity, setIntensity] = useFollow(state.intensity, selKey);
  const [color, setColor] = useFollow<RGB>(state.color ?? { r: 100, g: 100, b: 100 }, selKey);
  const [cct, setCct] = useFollow(state.cct ?? 3200, selKey);
  const [pt, setPt] = useFollow({ pan: state.pan ?? 0, tilt: state.tilt ?? 0 }, selKey);

  const send = async (patch: ParamPatch, revert: () => void) => {
    const r = await onChange(patch);
    if (r === false) revert();
  };
  const setInt = (v: number) => { const prev = intensity; setIntensity(v); void send({ intensity: v }, () => setIntensity(prev)); };
  const setRgb = (rgb: RGB) => { setColor(rgb); void send({ color: rgb }, () => undefined); };
  const relayOnly = caps.has('relay') && caps.size <= 2;

  return (
    <div className="params" aria-disabled={disabled}>
      {unconfirmedCount > 0 && (
        <div className="param-note"><Info size={13} /> {unconfirmedCount === 1 ? 'One fixture has' : `${unconfirmedCount} fixtures have`} controls the import couldn't confirm, so only intensity is offered for {unconfirmedCount === 1 ? 'it' : 'them'}.</div>
      )}

      {assumedCount > 0 && (
        <div className="param-note"><Info size={13} /> Controls for {assumedCount === 1 ? 'this fixture come' : `${assumedCount} fixtures come`} from a sample or hand-picked profile, not from your Eos show. Import the show to use its real fixture types.</div>
      )}

      <section className="param-section">
        <header><span>{relayOnly ? 'Switch' : 'Intensity'}</span><strong className="param-big" aria-live="polite">{Math.round(intensity)}<small>%</small></strong></header>
        <Fader label="Intensity" value={intensity} onChange={setInt} disabled={disabled} />
        <div className="chip-row">
          {(relayOnly ? [['On', 100], ['Off', 0]] : [['Full', 100], ['75', 75], ['50', 50], ['25', 25], ['Out', 0]]).map(([l, v]) => (
            <button key={l} className="chip" disabled={disabled} onClick={() => setInt(v as number)}>{l}</button>
          ))}
        </div>
      </section>

      {caps.has('rgb') && (
        <section className="param-section">
          <header><span>Color</span><span className="color-chip" style={{ background: rgbCss(color) }} aria-hidden /></header>
          <div className="color-block">
            <ColorWheel value={color} onChange={disabled ? () => undefined : setRgb} />
            <div className="swatches" role="group" aria-label="Color presets">
              {SWATCHES.map((s) => (
                <Tip key={s.name} label={s.name}><button className="swatch-btn" aria-label={s.name} disabled={disabled} style={{ background: rgbCss(s.rgb) }} onClick={() => setRgb(s.rgb)} /></Tip>
              ))}
            </div>
          </div>
          {(['r', 'g', 'b'] as const).map((ch) => (
            <div key={ch} className="param-row">
              <span>{ch === 'r' ? 'Red' : ch === 'g' ? 'Green' : 'Blue'}</span>
              <Fader label={ch === 'r' ? 'Red' : ch === 'g' ? 'Green' : 'Blue'} value={color[ch]} disabled={disabled} onChange={(v) => setRgb({ ...color, [ch]: v })} />
              <span className="val">{Math.round(color[ch])}</span>
            </div>
          ))}
        </section>
      )}

      {(caps.has('white') || caps.has('amber') || caps.has('uv')) && (
        <section className="param-section">
          <header><span>More emitters</span></header>
          {(['white', 'amber', 'uv'] as const).filter((p) => caps.has(p)).map((p) => (
            <Slider key={p} label={p === 'uv' ? 'UV' : p[0].toUpperCase() + p.slice(1)} value={state[p] ?? 0} selKey={selKey} disabled={disabled} onChange={(v) => void onChange({ [p]: v })} />
          ))}
        </section>
      )}

      {caps.has('cct') && (
        <section className="param-section">
          <header><span>Color temperature</span><span className="color-chip" style={{ background: `rgb(${kelvinToRgb255(cct).join(',')})` }} aria-hidden /></header>
          <div className="param-row">
            <span>CCT</span>
            <Fader label="Color temperature" min={2000} max={8000} step={50} value={cct} disabled={disabled} onChange={(v) => { setCct(v); void onChange({ cct: v }); }} />
            <span className="val">{cct}K</span>
          </div>
        </section>
      )}

      {(caps.has('zoom') || caps.has('focus')) && (
        <section className="param-section">
          <header><span>Beam</span></header>
          {caps.has('zoom') && <Slider label="Zoom" value={state.zoom ?? 50} selKey={selKey} disabled={disabled} onChange={(v) => void onChange({ zoom: v })} />}
          {caps.has('focus') && <Slider label="Edge" value={state.focus ?? 50} selKey={selKey} disabled={disabled} onChange={(v) => void onChange({ focus: v })} />}
        </section>
      )}

      {caps.has('pantilt') && (
        <section className="param-section">
          <header><span>Position</span><span className="hint">Pan {Math.round(pt.pan)}° · Tilt {Math.round(pt.tilt)}°</span></header>
          <XYPad pan={pt.pan} tilt={pt.tilt} onChange={(pan, tilt) => {
            if (disabled) return;
            const patch: ParamPatch = {};
            if (pan !== pt.pan) patch.pan = pan;
            if (tilt !== pt.tilt) patch.tilt = tilt;
            setPt({ pan, tilt });
            void onChange(patch);
          }} />
          <button className="chip" disabled={disabled} onClick={() => { setPt({ pan: 0, tilt: 0 }); void onChange({ pan: 0, tilt: 0 }); }}><Home size={12} />Home</button>
        </section>
      )}
    </div>
  );
}

function Slider({ label, value, selKey, onChange, disabled }: { label: string; value: number; selKey: string; onChange(v: number): void; disabled?: boolean }) {
  const [v, setV] = useFollow(value, selKey);
  return (
    <div className="param-row">
      <span>{label}</span>
      <Fader label={label} value={v} disabled={disabled} onChange={(x) => { setV(x); onChange(x); }} />
      <span className="val">{Math.round(v)}</span>
    </div>
  );
}
