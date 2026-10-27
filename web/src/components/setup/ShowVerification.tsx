/**
 * Step 4: Show Verification — "Does Sanctuary Light match what's currently loaded in Eos?"
 * Reads only in Monitor (or Live) mode, only when the operator presses Read from Eos, and only
 * with read-only /eos/get queries. Nothing is assumed to match because the import accepted it.
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, FlaskConical, RefreshCw, ScanSearch, TriangleAlert } from 'lucide-react';
import type { CheckItem, CheckStatus, VerificationReport } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { sendCommand, useApp } from '../../state/store';
import { SamePcConnect } from './SamePcConnect';
import { StepHeader } from './SanctuarySetup';

const STATUS: Record<CheckStatus, { label: string; cls: string; tile: string }> = {
  match: { label: 'Matches', cls: 'confirmed', tile: 'Verified matches' },
  different: { label: 'Different', cls: 'err', tile: 'Differences to review' },
  'missing-in-eos': { label: 'Not in Eos', cls: 'err', tile: 'Missing in Eos' },
  'extra-in-eos': { label: 'Only in Eos', cls: 'warn', tile: 'Extra in Eos' },
  unknown: { label: 'Unknown', cls: 'warn', tile: 'Unknown / not yet read' },
  unsupported: { label: 'Not readable', cls: '', tile: 'Not readable over OSC' },
};
const SECTIONS: { id: CheckItem['section']; title: string }[] = [
  { id: 'console', title: 'Console' }, { id: 'patch', title: 'Channels (patch)' }, { id: 'cues', title: 'Cue lists' },
  { id: 'groups', title: 'Groups' }, { id: 'other', title: 'What can\'t be checked over OSC' },
];

export function ShowVerification({ onNext }: { onNext(): void }) {
  const status = useApp((s) => s.status);
  const config = useApp((s) => s.config)!;
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [filter, setFilter] = useState<CheckStatus | 'problems' | 'all'>('problems');
  const mode = status?.mode ?? 'offline';
  const connected = mode !== 'offline' && status?.connection.state === 'connected' && !status.connection.stale;

  const refresh = useCallback(async () => {
    try { setReport(await api.get<VerificationReport>('/api/verification')); } catch { /* shown as offline */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, mode, connected]);
  // Refresh quickly while reading, then gently while connected (group replies and show
  // changes keep arriving after the patch read is done).
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => void refresh(), report?.state === 'reading' ? 700 : 2500);
    return () => clearInterval(t);
  }, [report?.state, refresh, connected]);

  const read = async () => {
    try { await api.post('/api/verification/read', {}); setTimeout(() => void refresh(), 300); }
    catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  const items = (report?.items ?? []).filter((i) => filter === 'all' || (filter === 'problems' ? ['different', 'missing-in-eos', 'extra-in-eos', 'unknown'].includes(i.status) : i.status === filter));
  const last = config.verification;

  return (
    <div>
      <StepHeader title="Does Sanctuary Light match what's loaded in Eos?" intro="Sanctuary Light asks Eos for its patch, cue lists and groups (read-only) and compares them with its own configuration. Only what Eos actually reports counts as a match.">
        {connected && <button className="btn primary" onClick={() => void read()} disabled={report?.state === 'reading'}><ScanSearch size={16} />{report?.state === 'reading' ? 'Reading…' : report?.state === 'complete' ? 'Read again' : 'Read from Eos'}</button>}
      </StepHeader>

      {!connected && (
        <>
          <p className="hint">Monitor mode only listens: it can't change any light. {mode === 'offline' ? 'Sanctuary Light is in SIM (Offline Simulation), so it has no connection to Eos yet.' : status?.connection.detail}</p>
          <SamePcConnect />
          <p className="hint">Eos on another computer? Use the <button className="btn ghost sm" onClick={() => useApp.getState().openWizard(1)}>Eos Setup Wizard</button> instead.</p>
        </>
      )}

      {report?.simulatedConsole && (
        <div className="card" data-tone="warn"><FlaskConical size={15} style={{ verticalAlign: -3 }} /> <strong>Connected to the FAKE simulator, not a real console.</strong> These results test Sanctuary Light itself. They say nothing about whether it matches the sanctuary's Eos.</div>
      )}
      {report?.warnings.map((w) => <div key={w} className="card" data-tone="warn"><TriangleAlert size={15} style={{ verticalAlign: -3 }} /> {w}</div>)}

      {report && report.state !== 'offline' && (
        <>
          <div className="row wrap hint" style={{ margin: '6px 0' }}>
            <span>Eos {report.consoleVersion ?? '?'} · show “{report.showName ?? 'unknown'}”</span>
            <span className="spacer" />
            {report.state === 'reading' && <span><RefreshCw size={13} className="spin" style={{ verticalAlign: -2 }} /> Reading: patch {report.progress?.patch.received ?? 0}/{report.progress?.patch.expected ?? '?'}, cues {report.progress?.cues.received ?? 0}/{report.progress?.cues.expected ?? '?'}</span>}
            {report.state === 'incomplete' && <span className="badge warn">The console stopped answering before the read finished. Read again.</span>}
            {report.state === 'complete' && <span className="badge confirmed">Read complete</span>}
            {report.state === 'not-read' && <span>Not read yet. Press <strong>Read from Eos</strong>.</span>}
          </div>
          <div className="stat-grid">
            {(Object.keys(STATUS) as CheckStatus[]).map((k) => (
              <button key={k} className="stat-tile as-button" data-on={filter === k} data-warn={['different', 'missing-in-eos', 'extra-in-eos'].includes(k) && report.summary[k] > 0} onClick={() => setFilter(filter === k ? 'problems' : k)}>
                <div className="stat-value">{report.summary[k]}</div><div className="stat-label">{STATUS[k].tile}</div>
              </button>
            ))}
          </div>
          <div className="tabs" role="tablist">
            {(['problems', 'all'] as const).map((k) => <button key={k} role="tab" aria-selected={filter === k} data-on={filter === k} onClick={() => setFilter(k)}>{k === 'problems' ? 'Needs review' : 'Everything'}</button>)}
          </div>
          {SECTIONS.map((sec) => {
            const list = items.filter((i) => i.section === sec.id);
            if (!list.length) return null;
            return (
              <section key={sec.id} className="type-section">
                <header><strong>{sec.title}</strong> <span className="hint">({list.length})</span></header>
                <table className="data-table">
                  <thead><tr><th style={{ width: 170 }}>Item</th><th style={{ width: 120 }}>Result</th><th>Sanctuary Light</th><th>Eos reports</th></tr></thead>
                  <tbody>
                    {list.map((i, k) => (
                      <tr key={`${i.key}-${k}`}>
                        <td><strong>{i.key}</strong></td>
                        <td><span className={`badge ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span></td>
                        <td className="hint">{i.local}</td>
                        <td className="hint">{i.console}{i.detail && <div style={{ color: 'var(--text-2)' }}>{i.detail}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
          {!items.length && <p className="hint">Nothing to review in this view.</p>}
        </>
      )}

      <div className="row step-foot">
        <span className="hint">{last ? `Last complete check: ${new Date(last.at).toLocaleString()}${last.simulatedConsole ? ' (simulator)' : ''}.` : 'Never compared with a console.'} Differences are fixed by importing the current show again, or by editing Sanctuary Light. Eos is never changed from here.</span>
        <span className="spacer" />
        <button className="btn primary" onClick={onNext}>Worship looks<ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
