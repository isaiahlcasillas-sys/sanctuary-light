/**
 * Apply to Eos: send a designed look to the real lighting system. Live mode only; the server
 * checks everything again. Shows exactly what will be sent, what is skipped and what is left
 * out before anything goes out, then exactly what happened. A transmitted command is never
 * presented as proof that a light changed.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Send, XCircle } from 'lucide-react';
import type { ApplyReport, LivePlan, Look } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { sendCommand, useApp } from '../../state/store';
import { Modal } from '../ui';

interface PlanResponse { block: string | null; plan: LivePlan; lastApply: ApplyReport | null }

export function ApplyToEosDialog({ look, onClose }: { look: Look | null; onClose(): void }) {
  const mode = useApp((s) => s.status?.mode ?? 'offline');
  const [useFade, setUseFade] = useState(false);
  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ApplyReport | null>(null);
  const [ack, setAck] = useState(false);
  const fade = useFade ? look?.fadeSeconds ?? 0 : null;

  useEffect(() => {
    if (!look) return;
    setReport(null); setAck(false); setError(null);
    api.get<PlanResponse>(`/api/live/plan?lookId=${encodeURIComponent(look.id)}${fade ? `&fade=${fade}` : ''}`).then(setData, (e) => setError((e as Error).message));
  }, [look, fade, mode]);

  if (!look) return null;
  const plan = data?.plan;
  const block = data?.block ?? null;
  const apply = async () => {
    setBusy(true);
    const r = await sendCommand({ kind: 'applyLook', lookId: look.id, fadeSeconds: fade, confirm: true });
    setBusy(false);
    if (r.report) setReport(r.report);
    else setError(r.message);
  };

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose(); }} title={`Apply “${look.name}” to Eos`}>
      {report ? <ReportView report={report} /> : (
        <>
          <div className="live-warning" role="alert"><AlertTriangle size={16} /> <span><strong>This changes the real sanctuary lights</strong> through Eos. Only do it outside worship and rehearsals, with someone at Eos.</span></div>
          {mode !== 'eos-live' && <p className="hint">Sanctuary Light is in {mode === 'offline' ? 'SIM' : 'MONITOR'}. Arm <strong>LIVE</strong> in the top bar first. To see the look without changing anything, use <strong>Preview</strong>.</p>}
          {block && mode === 'eos-live' && <div className="param-note warn">{block}</div>}
          {error && <div className="param-note warn">{error}</div>}
          {plan && (
            <>
              {plan.errors.map((e) => <div key={e} className="param-note warn">{e}</div>)}
              <h4 className="dlg-h">Will be sent ({plan.commands.length} command{plan.commands.length === 1 ? '' : 's'}, intensity only)</h4>
              <ul className="cmd-list">{plan.commands.map((c) => <li key={c.text}><code>{c.text.replace(/ #$/, ' Enter')}</code></li>)}</ul>
              {plan.skipped.length > 0 && (
                <>
                  <h4 className="dlg-h">Skipped ({plan.skipped.length})</h4>
                  <ul className="reason-list">{plan.skipped.map((s) => <li key={s.channel}><CircleSlash size={13} /> <strong>{s.channel} {s.label}</strong>: {s.reason}</li>)}</ul>
                </>
              )}
              {plan.omitted.length > 0 && (
                <>
                  <h4 className="dlg-h">Left out</h4>
                  <ul className="reason-list">{plan.omitted.map((o) => <li key={o.channel}><CircleSlash size={13} /> Channel {o.channel}: {o.params.join(', ')}. {o.reason}</li>)}</ul>
                </>
              )}
              {(look.fadeSeconds ?? 0) > 0 && (
                <label className="row" style={{ margin: '10px 0' }}>
                  <input type="checkbox" checked={useFade} onChange={(e) => setUseFade(e.target.checked)} />
                  Fade over {look.fadeSeconds} s (sent as Eos manual time; not yet verified on our console)
                </label>
              )}
              <label className="row" style={{ alignItems: 'flex-start', margin: '10px 0' }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I'm outside worship and rehearsals, someone is at Eos, and I know how to return these channels to Eos's programming (Sneak, below).</span>
              </label>
            </>
          )}
          <div className="actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn danger" disabled={busy || !ack || !!block || !plan || plan.errors.length > 0 || mode !== 'eos-live'} onClick={() => void apply()}>
              <Send size={15} />{busy ? 'Sending…' : 'Apply to Eos'}
            </button>
          </div>
        </>
      )}
      {report && <div className="actions"><button className="btn primary" onClick={onClose}>Done</button></div>}
    </Modal>
  );
}

export function ReportView({ report }: { report: ApplyReport }) {
  const channels = report.sent.map((t) => t.replace(/^Chan (.*) At .*$/, '$1'));
  return (
    <div className="apply-report">
      <ul className="reason-list">
        {report.sent.map((t) => <li key={t}><CheckCircle2 size={13} color="var(--ok)" /> Sent to Eos: <code>{t.replace(/ #$/, ' Enter')}</code></li>)}
        {report.failed.map((f) => <li key={f.text}><XCircle size={13} color="var(--err)" /> Failed: <code>{f.text}</code> ({f.error})</li>)}
        {report.notSent.map((f) => <li key={f.text}><CircleSlash size={13} color="var(--warn)" /> Not sent: <code>{f.text}</code> ({f.reason})</li>)}
        {report.skipped.map((s) => <li key={`s${s.channel}`}><CircleSlash size={13} /> Skipped {s.channel} {s.label}: {s.reason}</li>)}
        {report.omitted.map((o) => <li key={`o${o.channel}`}><CircleSlash size={13} /> Channel {o.channel}: {o.params.join(', ')} not sent. {o.reason}</li>)}
      </ul>
      <div className="param-note"><AlertTriangle size={13} /> <span><strong>Sent is not the same as confirmed.</strong> Eos doesn't report channel levels back. Look at the fixtures and the Eos Live display to see what really happened.</span></div>
      {report.sent.length > 0 && (
        <div className="restore-box">
          <strong>To return these channels to Eos's programming</strong> (the supervising operator, on Eos):
          <ol>
            {channels.map((c) => <li key={c}><code>[Chan] {c.replace(/\+/g, '[+]').replace(/Thru/g, '[Thru]')} [Sneak] [Enter]</code></li>)}
          </ol>
          <span className="hint">Sneak releases the manual levels so the channels return to what the current cue or submasters give them. Sanctuary Light doesn't do this automatically. Don't use Go To Cue 0 or Clear.</span>
        </div>
      )}
    </div>
  );
}
