import { useEffect, useState } from 'react';
import { sendCommand, useApp } from '../state/store';
import { Fader, Tip } from './ui';

export function SubmasterBank({ volunteer = false }: { volunteer?: boolean }) {
  const subs = useApp((s) => s.config?.submasters ?? []);
  const cap = useApp((s) => s.status?.feedback.capabilities.submasterLevels);
  const visible = subs.filter((s) => !volunteer || s.volunteerVisible);
  if (!visible.length) return null;
  return (
    <section className="panel" aria-label="Submasters">
      <div className="panel-head">
        <h2>Submasters</h2><span className="spacer" />
        <Tip label={cap?.note ?? ''}><span className="badge sim" tabIndex={0}>Positions not confirmed</span></Tip>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
        {visible.map((s) => <SubRow key={s.sub} sub={s.sub} label={s.label} locked={s.protected} />)}
      </div>
    </section>
  );
}

function SubRow({ sub, label, locked }: { sub: number; label: string; locked: boolean }) {
  const remote = useApp((s) => s.levels?.subs[sub] ?? 0);
  const [v, setV] = useState(remote);
  useEffect(() => setV(remote), [remote]);
  return (
    <div className="param-row" style={{ gridTemplateColumns: '120px 1fr 46px' }}>
      <span><strong style={{ color: 'var(--text)' }}>S{sub}</strong> {label}{locked ? ' 🔒' : ''}</span>
      <Fader label={`Submaster ${sub} ${label}`} value={v} onChange={(x) => { setV(x); void sendCommand({ kind: 'setSub', sub, value: x }).then((r) => { if (!r.ok) setV(remote); }); }} />
      <span className="val">{Math.round(v)}%</span>
    </div>
  );
}
