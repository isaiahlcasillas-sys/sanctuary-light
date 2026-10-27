/**
 * Record to Eos (operator-assisted). Sanctuary Light checks every precondition and gives the
 * exact Eos keystrokes; the operator presses them on Eos; Sanctuary Light then reads the cue
 * list back and only calls the cue recorded if Eos reports it. Sanctuary Light never presses
 * Record itself (yet).
 */
import { useState } from 'react';
import { BookCheck, ClipboardList, Search } from 'lucide-react';
import type { Look } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { useApp } from '../../state/store';
import { Modal } from '../ui';

type PlanResult = { ok: true; steps: string[]; warnings: string[] } | { ok: false; error: string };
type VerifyResult = { status: 'confirmed' | 'label-differs' | 'not-found' | 'read-incomplete' | 'error'; message: string };

export function RecordToEosDialog({ look, onClose }: { look: Look | null; onClose(): void }) {
  const lists = useApp((s) => s.config?.cueLists ?? []);
  const mode = useApp((s) => s.status?.mode ?? 'offline');
  const [list, setList] = useState<number>(lists[0]?.list ?? 1);
  const [cue, setCue] = useState('');
  const [label, setLabel] = useState(look?.name ?? '');
  const [fade, setFade] = useState<number>(look?.fadeSeconds ?? 0);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [ack, setAck] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (!look) return null;
  const body = { lookId: look.id, list, cue: cue.trim(), label: label.trim(), fadeSeconds: fade };

  const check = async () => {
    setBusy(true); setVerify(null);
    try { setPlan(await api.post<PlanResult>('/api/record/plan', body)); }
    catch (e) { setPlan({ ok: false, error: (e as Error).message }); }
    setBusy(false);
  };
  const confirm = async () => {
    setBusy(true);
    try { setVerify(await api.post<VerifyResult>('/api/record/verify', body)); }
    catch (e) { setVerify({ status: 'error', message: (e as Error).message }); }
    setBusy(false);
  };

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose(); }} title={`Record “${look.name}” to Eos`}>
      <p className="hint">This stores the look as a new cue in the <strong>show loaded in Eos</strong>. Sanctuary Light checks everything first, gives you the exact keys to press on Eos, then reads the cue list back to confirm. It never presses Record itself, and never overwrites an existing cue.</p>
      {mode !== 'eos-live' && <div className="param-note warn">Recording needs LIVE mode (the look is applied to Eos first). Arm LIVE in the top bar.</div>}
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <label className="field"><span>Cue list</span>
          <select className="select" value={list} onChange={(e) => { setList(Number(e.target.value)); setPlan(null); }}>
            {lists.map((l) => <option key={l.list} value={l.list}>{l.list}{l.label ? ` · ${l.label}` : ''}</option>)}
          </select>
        </label>
        <label className="field"><span>New cue number</span><input className="input" value={cue} placeholder="e.g. 105" onChange={(e) => { setCue(e.target.value); setPlan(null); }} /></label>
        <label className="field"><span>Label</span><input className="input" value={label} maxLength={40} onChange={(e) => { setLabel(e.target.value); setPlan(null); }} /></label>
        <label className="field"><span>Time (s)</span><input className="input" type="number" min={0} max={60} step={0.5} value={fade} onChange={(e) => { setFade(Number(e.target.value) || 0); setPlan(null); }} /></label>
      </div>
      <button className="btn" disabled={busy || !cue.trim()} onClick={() => void check()}><ClipboardList size={15} />Check and show the steps</button>

      {plan && !plan.ok && <div className="param-note warn" style={{ marginTop: 10 }}>{plan.error}</div>}
      {plan && plan.ok && (
        <>
          <ul className="reason-list warn-list">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          <label className="row" style={{ alignItems: 'flex-start', margin: '10px 0' }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I understand this changes the Eos show. The show was backed up today, and the console person agrees.</span>
          </label>
          {ack && (
            <ol className="record-steps">{plan.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          )}
          <button className="btn primary" disabled={!ack || busy} onClick={() => void confirm()}><Search size={15} />{busy ? 'Reading Eos…' : 'Check Eos for the new cue'}</button>
        </>
      )}
      {verify && (
        <div className={`param-note ${verify.status === 'confirmed' ? 'ok' : 'warn'}`} style={{ marginTop: 10 }} role="status">
          {verify.status === 'confirmed' && <BookCheck size={14} />} <span><strong>{verify.status === 'confirmed' ? 'Recorded: confirmed by Eos.' : verify.status === 'not-found' ? 'Not recorded.' : verify.status === 'label-differs' ? 'Recorded, but the label differs.' : 'Not confirmed.'}</strong> {verify.message}</span>
        </div>
      )}
      <div className="actions"><button className="btn" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
