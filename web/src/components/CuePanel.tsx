import { useEffect, useState } from 'react';
import { ChevronsLeft, Play } from 'lucide-react';
import type { CueFeedback } from '@sanctuary/shared';
import { api } from '../lib/api';
import { sendCommand, useApp } from '../state/store';
import { SourceBadge, Tip } from './ui';

function CueCard({ title, cue, fallback, showProgress }: { title: string; cue: CueFeedback | null; fallback: string; showProgress?: boolean }) {
  const labels = useApp((s) => s.config?.cueLists);
  const userLabel = cue?.list != null ? labels?.find((l) => l.list === cue.list)?.cues.find((c) => c.cue === cue.cue)?.label : undefined;
  return (
    <div className="cue-card">
      <div className="k">{title}{cue && <SourceBadge source={cue.source} />}</div>
      {cue ? (
        <>
          <div className="num">{cue.cue ? `${cue.list}/${cue.cue}` : '—'}</div>
          <div className="lbl" title={cue.text}>{userLabel ?? cue.label ?? cue.text}</div>
          {showProgress && <div className="progress" role="progressbar" aria-valuenow={cue.progress ?? 0} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${cue.progress ?? 0}%` }} /></div>}
        </>
      ) : <div className="lbl" style={{ marginTop: 8 }}>{fallback}</div>}
    </div>
  );
}

export function CuePanel({ volunteer = false }: { volunteer?: boolean }) {
  const status = useApp((s) => s.status);
  const config = useApp((s) => s.config);
  const role = useApp((s) => s.role);
  const master = config?.settings.masterCueList ?? 1;
  const list = config?.cueLists.find((l) => l.list === master);
  const fb = status?.feedback;
  const cap = fb?.capabilities.activeCue;
  const noFeedback = status?.mode !== 'offline' && cap?.status !== 'available';
  const fallback = status?.mode === 'offline' ? 'Press GO to preview' : noFeedback ? 'No cue feedback from console' : '—';

  return (
    <section className="panel" aria-label="Cue control">
      <div className="panel-head">
        <h2>Cues</h2>
        <span className="badge">List {master}{list ? ` · ${list.label}` : ''}</span>
        {status?.goBack.method === 'keys' && (
          <Tip label={status.goBack.note}><span className="badge warn" tabIndex={0}>GO = master playback</span></Tip>
        )}
        <span className="spacer" />
        {noFeedback && <Tip label={cap?.note ?? ''}><span className="badge warn" tabIndex={0}>Feedback unavailable</span></Tip>}
      </div>
      <div className="panel-body">
        <div className="cue-now">
          <CueCard title="Current" cue={fb?.activeCue ?? null} fallback={fallback} showProgress />
          <CueCard title="Next" cue={fb?.pendingCue ?? null} fallback={noFeedback ? 'Unknown' : '—'} />
        </div>
        {status?.volunteerPlayback && (volunteer || role === 'volunteer'
          ? <p className="hint" role="status">{status.volunteerPlayback}</p>
          : <Tip label={status.volunteerPlayback}><span className="badge warn" tabIndex={0}>Volunteers can't use GO/BACK</span></Tip>)}
        <div className="go-row">
          <Tip label={`${status?.goBack.note ?? ''} BACK sends ${status?.goBack.backAddress ?? ''}`}>
            <button className="back-btn" disabled={role === 'volunteer' && !!status?.volunteerPlayback} onClick={() => void sendCommand({ kind: 'back' })}><ChevronsLeft size={18} style={{ verticalAlign: -3 }} /> BACK</button>
          </Tip>
          <Tip label={`${status?.goBack.note ?? ''} GO sends ${status?.goBack.goAddress ?? ''}`}>
            <button className="go-btn" disabled={role === 'volunteer' && !!status?.volunteerPlayback} onClick={() => void sendCommand({ kind: 'go' })}><Play size={22} fill="currentColor" style={{ verticalAlign: -3 }} /> GO</button>
          </Tip>
        </div>
        {!volunteer && list && <CueTable list={list.list} editable={role === 'operator'} />}
      </div>
    </section>
  );
}

function CueTable({ list, editable }: { list: number; editable: boolean }) {
  const config = useApp((s) => s.config)!;
  const fb = useApp((s) => s.status?.feedback);
  const cueList = config.cueLists.find((l) => l.list === list)!;
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => setLabels({}), [config.cueLists]);

  const saveLabel = async (cue: string) => {
    const label = labels[cue];
    if (label === undefined) return;
    const next = config.cueLists.map((l) => l.list !== list ? l : { ...l, cues: l.cues.map((c) => (c.cue === cue ? { ...c, label } : c)) });
    try { await api.put('/api/config/cueLists', next); useApp.getState().toast('info', 'Label saved locally (Eos cue label unchanged).'); }
    catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  return (
    <div style={{ marginTop: 12, maxHeight: 220, overflow: 'auto' }}>
      <table className="cue-table">
        <thead><tr><th style={{ width: 60 }}>Cue</th><th>Label (this app only)</th><th style={{ width: 70 }} /></tr></thead>
        <tbody>
          {cueList.cues.map((c) => (
            <tr key={c.cue} data-active={fb?.activeCue?.list === list && fb.activeCue.cue === c.cue} data-pending={fb?.pendingCue?.list === list && fb.pendingCue.cue === c.cue}>
              <td><strong>{c.cue}</strong></td>
              <td>{editable
                ? <input className="input" aria-label={`Label for cue ${c.cue}`} value={labels[c.cue] ?? c.label}
                    onChange={(e) => setLabels({ ...labels, [c.cue]: e.target.value })} onBlur={() => saveLabel(c.cue)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                : c.label}</td>
              <td><button className="btn sm" onClick={() => void sendCommand({ kind: 'fireCue', list, cue: c.cue })}>Fire</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
