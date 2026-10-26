import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Info } from 'lucide-react';
import { channelExpression, type Capability, type FixtureState, type ParamKey } from '@sanctuary/shared';
import { sendCommand, targetForSelection, useApp } from '../state/store';
import { SWATCHES, kelvinToRgb255, rgbCss } from '../lib/color';
import { ColorWheel } from './ColorWheel';
import { XYPad } from './XYPad';
import { Fader, SourceBadge, Tip } from './ui';

function useLocalValue<T>(remote: T, deps: unknown[]): [T, (v: T) => void] {
  const [v, setV] = useState(remote);
  useEffect(() => { setV(remote); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV];
}

export function ControlPanel() {
  const config = useApp((s) => s.config);
  const levels = useApp((s) => s.levels);
  const selection = useApp((s) => s.selection);
  const lastResult = useApp((s) => s.lastResult);

  const fixtures = useMemo(() => (config?.fixtures ?? []).filter((f) => selection.includes(f.channel)), [config, selection]);
  const caps = useMemo(() => {
    const set = new Set<Capability>();
    for (const f of fixtures) for (const c of config!.profiles.find((p) => p.id === f.profileId)?.capabilities ?? []) set.add(c);
    return set;
  }, [fixtures, config]);
  const first: FixtureState = (fixtures[0] && levels?.levels[fixtures[0].channel]) || { intensity: 0 };
  const target = targetForSelection(selection, config);
  const group = target.type === 'group' ? config?.groups.find((g) => g.id === target.groupId) : undefined;
  const anyProtected = fixtures.some((f) => f.protected);
  const key = selection.join(',');

  const [intensity, setIntensity] = useLocalValue(first.intensity, [key, first.intensity]);
  const [color, setColor] = useLocalValue(first.color ?? { r: 100, g: 100, b: 100 }, [key, first.color?.r, first.color?.g, first.color?.b]);
  const [cct, setCct] = useLocalValue(first.cct ?? 3200, [key, first.cct]);
  const [pt, setPt] = useLocalValue({ pan: first.pan ?? 0, tilt: first.tilt ?? 0 }, [key, first.pan, first.tilt]);

  if (selection.length === 0) {
    return (
      <div className="panel area-control">
        <div className="panel-head"><h2>Fixture control</h2></div>
        <div className="panel-body" style={{ display: 'grid', gap: 14, placeItems: 'center', textAlign: 'center', paddingTop: 40 }}>
          <Crosshair size={36} color="var(--text-3)" />
          <div><strong>Select fixtures</strong><div className="hint">Click a fixture or a group chip on the stage. Shift-click to add more.</div></div>
          <GroupCards />
        </div>
      </div>
    );
  }

  // On a refused command, snap the control back to the level we actually know about.
  const setInt = (v: number) => {
    setIntensity(v);
    void sendCommand({ kind: 'setIntensity', target, value: v }).then((r) => { if (!r.ok) setIntensity(first.intensity); });
  };
  const setRgb = (rgb: typeof color) => { setColor(rgb); void sendCommand({ kind: 'setColor', target, rgb }); };
  const setParam = (param: ParamKey, value: number) => void sendCommand({ kind: 'setParam', target, param, value });

  return (
    <div className="panel area-control">
      <div className="panel-head">
        <h2>Fixture control</h2>
        <span className="spacer" />
        <SourceBadge source={levels?.sources[selection[0]] ?? 'simulated'} />
      </div>
      <div className="panel-body control">
        <div className="sel-summary">
          <strong>{group ? group.name : fixtures.length === 1 ? fixtures[0].label : `${fixtures.length} fixtures`}</strong>
          <span className="badge">Chan {channelExpression(selection)}</span>
          {group && <Tip label={group.eosGroup ? `Commands use Eos Group ${group.eosGroup}` : 'No Eos group number set — commands address channels directly'}><span className="badge">{group.eosGroup ? `Eos Group ${group.eosGroup}` : 'Channels'}</span></Tip>}
          {anyProtected && <span className="badge err">Protected</span>}
        </div>

        {caps.has('relay') && !caps.has('intensity') ? (
          <div className="card hint"><Info size={14} /> Relays are switched by intensity (0 = off, Full = on). They are locked until you unlock protected channels in the top bar.</div>
        ) : null}

        <div>
          <div className="section-title">Intensity</div>
          <div className="fader-wrap">
            <Fader orientation="vertical" label="Intensity" value={intensity} onChange={setInt} />
            <div style={{ display: 'grid', gap: 10, alignContent: 'start', flex: 1 }}>
              <div className="fader-value" aria-live="polite">{Math.round(intensity)}<span style={{ fontSize: 16, color: 'var(--text-3)' }}>%</span></div>
              <div className="quick-levels">
                {[['Full', 100], ['75', 75], ['50', 50], ['25', 25], ['Out', 0]].map(([l, v]) => (
                  <button key={l} className="btn sm" onClick={() => setInt(v as number)}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {caps.has('rgb') && (
          <div>
            <div className="section-title">Color</div>
            <div className="wheel-wrap">
              <ColorWheel value={color} onChange={setRgb} />
              <div className="swatches">
                {SWATCHES.map((s) => (
                  <Tip key={s.name} label={s.name}><button className="swatch-btn" aria-label={s.name} style={{ background: rgbCss(s.rgb) }} onClick={() => setRgb(s.rgb)} /></Tip>
                ))}
              </div>
              <div style={{ width: '100%', display: 'grid', gap: 6 }}>
                {(['r', 'g', 'b'] as const).map((ch) => (
                  <div key={ch} className="param-row">
                    <span>{ch === 'r' ? 'Red' : ch === 'g' ? 'Green' : 'Blue'}</span>
                    <Fader label={ch} value={color[ch]} onChange={(v) => setRgb({ ...color, [ch]: v })} />
                    <span className="val">{Math.round(color[ch])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {(caps.has('white') || caps.has('amber') || caps.has('uv')) && (
          <div>
            <div className="section-title">Additional emitters</div>
            {(['white', 'amber', 'uv'] as const).filter((p) => caps.has(p)).map((p) => (
              <ParamSlider key={p} label={p === 'uv' ? 'UV' : p[0].toUpperCase() + p.slice(1)} value={first[p] ?? 0} selKey={key} onChange={(v) => setParam(p, v)} />
            ))}
          </div>
        )}

        {caps.has('cct') && (
          <div>
            <div className="section-title">Color temperature</div>
            <div className="param-row">
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className="dot" style={{ color: `rgb(${kelvinToRgb255(cct).join(',')})` }} />CCT</span>
              <Fader label="Color temperature" min={2000} max={8000} step={50} value={cct} onChange={(v) => { setCct(v); setParam('cct', v); }} />
              <span className="val">{cct}K</span>
            </div>
          </div>
        )}

        {caps.has('pantilt') && (
          <div>
            <div className="section-title">Position</div>
            <XYPad pan={pt.pan} tilt={pt.tilt} onChange={(pan, tilt) => {
              const prev = pt; setPt({ pan, tilt });
              if (pan !== prev.pan) setParam('pan', pan);
              if (tilt !== prev.tilt) setParam('tilt', tilt);
            }} />
            <div className="row hint" style={{ marginTop: 6 }}>Pan {pt.pan}° · Tilt {pt.tilt}°<span className="spacer" />
              <button className="btn sm" onClick={() => { setPt({ pan: 0, tilt: 0 }); setParam('pan', 0); setParam('tilt', 0); }}>Home</button></div>
          </div>
        )}

        {(caps.has('zoom') || caps.has('focus')) && (
          <div>
            <div className="section-title">Beam</div>
            {caps.has('zoom') && <ParamSlider label="Zoom" value={first.zoom ?? 50} selKey={key} onChange={(v) => setParam('zoom', v)} />}
            {caps.has('focus') && <ParamSlider label="Focus" value={first.focus ?? 50} selKey={key} onChange={(v) => setParam('focus', v)} />}
          </div>
        )}

        {lastResult && (
          <div className="last-result" role="status">
            <span className={`badge ${lastResult.delivery === 'sent' ? 'commanded' : lastResult.delivery === 'simulated' ? 'sim' : 'err'}`}>{lastResult.delivery}</span>
            <div className="grow">{lastResult.message}{lastResult.osc && lastResult.osc.length > 0 && <code>{lastResult.delivery === 'sent' ? '' : 'would send: '}{lastResult.osc.join('  ·  ')}</code>}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ParamSlider({ label, value, selKey, onChange }: { label: string; value: number; selKey: string; onChange(v: number): void }) {
  const [v, setV] = useLocalValue(value, [selKey, value]);
  return (
    <div className="param-row" style={{ marginBottom: 6 }}>
      <span>{label}</span>
      <Fader label={label} value={v} onChange={(x) => { setV(x); onChange(x); }} />
      <span className="val">{Math.round(v)}</span>
    </div>
  );
}

export function GroupCards({ volunteerOnly = false }: { volunteerOnly?: boolean }) {
  const config = useApp((s) => s.config);
  const levels = useApp((s) => s.levels);
  const select = useApp((s) => s.select);
  const groups = (config?.groups ?? []).filter((g) => !volunteerOnly || g.volunteerVisible);
  return (
    <div className="group-cards" style={{ width: '100%' }}>
      {groups.map((g) => <GroupCard key={g.id} id={g.id} name={g.name} color={g.color} channels={g.channels}
        level={levels?.levels[g.channels.find((c) => levels.levels[c]) ?? -1]?.intensity ?? 0} onSelect={volunteerOnly ? undefined : () => select(g.channels)} />)}
    </div>
  );
}

function GroupCard({ id, name, color, channels, level, onSelect }: { id: string; name: string; color: string; channels: number[]; level: number; onSelect?(): void }) {
  const [v, setV] = useLocalValue(level, [level]);
  return (
    <div className="group-card">
      <header>
        <span className="dot" style={{ color }} />{name}
        <span className="lvl">{Math.round(v)}%</span>
      </header>
      <Fader label={`${name} intensity`} value={v} onChange={(x) => {
        setV(x);
        void sendCommand({ kind: 'setIntensity', target: { type: 'group', groupId: id }, value: x }).then((r) => { if (!r.ok) setV(level); });
      }} />
      {onSelect && <button className="btn sm ghost" onClick={onSelect} aria-label={`Select ${name} (${channels.length} channels)`}>Select · {channels.length} ch</button>}
    </div>
  );
}
