/**
 * The right-hand inspector. Normally it controls the selected fixtures (through the usual
 * command path, with every safety rule on the server). While a look is being designed it edits
 * the draft instead, which never sends anything.
 */
import { useMemo } from 'react';
import { Crosshair, Minus, MousePointerClick, Plus, ShieldAlert } from 'lucide-react';
import { channelExpression, controlsUnknown, profileAssumed, supportedParams, type AppConfig, type Capability, type Command, type FixtureState } from '@sanctuary/shared';
import { sendCommand, targetForSelection, useApp } from '../../state/store';
import { rgbCss } from '../../lib/color';
import { GroupCards } from '../GroupCards';
import { SourceBadge, Tip } from '../ui';
import { ParamControls, type ParamPatch } from './ParamControls';

/** Union of what the selected fixtures support, and how many have unconfirmed controls. */
export function selectionCaps(config: AppConfig, channels: number[]) {
  const profiles = new Map(config.profiles.map((p) => [p.id, p]));
  const caps = new Set<Capability>();
  let unconfirmed = 0;
  let assumed = 0;
  for (const f of config.fixtures) {
    if (!channels.includes(f.channel)) continue;
    const p = profiles.get(f.profileId);
    for (const c of supportedParams(p)) caps.add(c);
    if (controlsUnknown(p)) unconfirmed++;
    else if (profileAssumed(p)) assumed++;
  }
  return { caps, unconfirmed, assumed };
}

function selectionTitle(config: AppConfig, selection: number[]) {
  const key = [...selection].sort((a, b) => a - b).join(',');
  const g = config.groups.find((x) => [...x.channels].sort((a, b) => a - b).join(',') === key);
  if (g) return g.name;
  if (selection.length === 1) return config.fixtures.find((f) => f.channel === selection[0])?.label ?? `Channel ${selection[0]}`;
  return `${selection.length} fixtures`;
}

export function Inspector() {
  const designer = useApp((s) => s.designer);
  return designer ? <DesignerInspector /> : <LiveInspector />;
}

function LiveInspector() {
  const config = useApp((s) => s.config)!;
  const levels = useApp((s) => s.levels);
  const selection = useApp((s) => s.selection);
  const lastResult = useApp((s) => s.lastResult);
  const { caps, unconfirmed, assumed } = useMemo(() => selectionCaps(config, selection), [config, selection]);
  const fixtures = config.fixtures.filter((f) => selection.includes(f.channel));
  const first: FixtureState = (fixtures[0] && levels?.levels[fixtures[0].channel]) || { intensity: 0 };
  const target = targetForSelection(selection, config);

  if (!selection.length) {
    return (
      <div className="inspector">
        <div className="inspector-empty">
          <Crosshair size={30} aria-hidden />
          <strong>Select lights to adjust them</strong>
          <span className="hint">Click fixtures on the stage, or pick a group on the left. Shift-click to add more.</span>
        </div>
        <div className="inspector-section-title">Quick group levels</div>
        <GroupCards />
      </div>
    );
  }

  const onChange = async (patch: ParamPatch) => {
    const cmds: Command[] = [];
    if (patch.intensity != null) cmds.push({ kind: 'setIntensity', target, value: patch.intensity });
    if (patch.color) cmds.push({ kind: 'setColor', target, rgb: patch.color });
    for (const p of ['white', 'amber', 'uv', 'cct', 'zoom', 'focus', 'pan', 'tilt'] as const) {
      if (patch[p] != null) cmds.push({ kind: 'setParam', target, param: p, value: patch[p]! });
    }
    const results = await Promise.all(cmds.map((c) => sendCommand(c)));
    return results.every((r) => r.ok);
  };

  return (
    <div className="inspector">
      <header className="inspector-head">
        <div className="grow">
          <h2>{selectionTitle(config, selection)}</h2>
          <Tip label="Eos channel numbers"><span className="hint" tabIndex={0}>Channels {channelExpression(selection)}</span></Tip>
        </div>
        {fixtures.some((f) => f.protected) && <span className="badge err"><ShieldAlert size={11} />Protected</span>}
        <SourceBadge source={levels?.sources[selection[0]] ?? 'simulated'} />
      </header>
      <ParamControls caps={caps} state={first} selKey={selection.join(',')} onChange={onChange} unconfirmedCount={unconfirmed} assumedCount={assumed} />
      {lastResult && (
        <div className="last-result" role="status">
          <span className={`badge ${lastResult.delivery === 'sent' ? 'commanded' : lastResult.delivery === 'simulated' ? 'sim' : 'err'}`}>{lastResult.delivery}</span>
          <div className="grow">{lastResult.message}{lastResult.osc && lastResult.osc.length > 0 && <code>{lastResult.delivery === 'sent' ? '' : 'would send: '}{lastResult.osc.join('  ·  ')}</code>}</div>
        </div>
      )}
    </div>
  );
}

function DesignerInspector() {
  const config = useApp((s) => s.config)!;
  const designer = useApp((s) => s.designer)!;
  const selection = useApp((s) => s.selection);
  const offline = useApp((s) => (s.status?.mode ?? 'offline') === 'offline');
  const { caps, unconfirmed, assumed } = useMemo(() => selectionCaps(config, selection), [config, selection]);
  const inLook = selection.filter((c) => designer.states[c]);
  const first: FixtureState = designer.states[inLook[0] ?? -1] ?? { intensity: 0 };
  const members = config.fixtures.filter((f) => designer.states[f.channel]).sort((a, b) => a.channel - b.channel);
  const st = useApp.getState();

  return (
    <div className="inspector designer">
      {!offline && <div className="param-note warn">Switch back to <strong>SIM</strong> to keep designing. The Look Designer works in Offline Simulation only.</div>}
      {selection.length === 0 ? (
        <>
          <div className="inspector-empty">
            <MousePointerClick size={28} aria-hidden />
            <strong>Pick the lights for this look</strong>
            <span className="hint">Select fixtures on the stage or a group on the left, then set their intensity and color here. Changes only affect this draft.</span>
          </div>
          <div className="inspector-section-title">In this look ({members.length})</div>
          {members.length === 0 ? <p className="hint">No lights yet. Lights that aren't in the look keep whatever they had when it plays.</p> : (
            <ul className="look-members">
              {members.map((f) => {
                const s = designer.states[f.channel];
                return (
                  <li key={f.id}>
                    <button onClick={() => st.select([f.channel])}>
                      <span className="member-chip" style={{ background: s.color ? rgbCss(s.color) : '#e8dcc0', opacity: 0.25 + (s.intensity / 100) * 0.75 }} aria-hidden />
                      <span className="grow">{f.label}</span>
                      <span className="hint">{Math.round(s.intensity)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <header className="inspector-head">
            <div className="grow">
              <h2>{selectionTitle(config, selection)}</h2>
              <span className="hint">{inLook.length === selection.length ? 'In this look' : inLook.length ? `${inLook.length} of ${selection.length} in this look` : 'Not in this look yet'}</span>
            </div>
            {inLook.length < selection.length && <button className="btn sm primary" disabled={!offline} onClick={() => st.designerSet(selection.filter((c) => !designer.states[c]), { intensity: 100 })}><Plus size={13} />Add</button>}
            {inLook.length > 0 && <Tip label="Take these lights out of the look"><button className="btn sm" disabled={!offline} onClick={() => st.designerRemove(selection)}><Minus size={13} />Remove</button></Tip>}
          </header>
          <ParamControls caps={caps} state={first} selKey={`${selection.join(',')}|${inLook.length}`} disabled={!offline}
            onChange={(patch) => { st.designerSet(selection, patch); return true; }} unconfirmedCount={unconfirmed} assumedCount={assumed} />
          <p className="hint">Adjusting a light adds it to the look. Only what each fixture is known to support is stored.</p>
        </>
      )}
    </div>
  );
}
