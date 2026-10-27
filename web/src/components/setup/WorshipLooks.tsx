/**
 * Step 4: worship looks. Assign existing Eos cues to look buttons, then review and approve
 * each one before volunteers can use it. Importing a cue is never approval: a cue, preset,
 * macro or submaster can do things Sanctuary Light can't see (including house lights that
 * SceneStation also controls).
 */
import { useState } from 'react';
import { CheckCircle2, ChevronRight, CircleAlert, Eye, EyeOff, Link2, Plus, ShieldCheck } from 'lucide-react';
import { APPROVAL_STATEMENT, PLAYBACK_APPROVAL_STATEMENT, needsApproval, playbackApproved, volunteerCanUseLook, type CueListConfig, type Look, type SubmasterConfig } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { useApp } from '../../state/store';
import { actionLabel } from '../LooksGrid';
import { Modal } from '../ui';
import { StepHeader } from './SanctuarySetup';

type Approving = { kind: 'look'; look: Look } | { kind: 'sub'; sub: SubmasterConfig } | { kind: 'cueList'; list: CueListConfig } | null;

export function WorshipLooks({ onNext }: { onNext(): void }) {
  const config = useApp((s) => s.config)!;
  const lists = config.cueLists;
  const [list, setList] = useState<number>(lists.find((l) => l.list === config.settings.masterCueList)?.list ?? lists[0]?.list ?? 1);
  const [target, setTarget] = useState<string | null>(null);
  const [approving, setApproving] = useState<Approving>(null);
  const current = lists.find((l) => l.list === list);
  const looksForCue = (cue: string) => config.looks.filter((l) => l.action.type === 'cue' && l.action.list === list && l.action.cue === cue);
  const toast = useApp.getState().toast;

  const saveLooks = async (looks: Look[], message: string) => {
    try { await api.put('/api/config/looks', looks); toast('info', message); return true; }
    catch (e) { toast('error', (e as Error).message); return false; }
  };
  const makeLook = (cue: string, label: string) => saveLooks([...config.looks, {
    id: `look-${list}-${cue.replace('.', '_')}-${Date.now().toString(36)}`, name: label || `Cue ${list}/${cue}`,
    description: `Plays Eos cue ${list}/${cue}.`, icon: 'sparkles', gradient: ['#1e293b', '#475569'],
    action: { type: 'cue', list, cue }, preview: [], volunteerVisible: false, approval: null,
  }], `Look “${label || `Cue ${list}/${cue}`}” created. Review and approve it before volunteers can use it.`);
  const assign = (lookId: string, cue: string) => {
    const look = config.looks.find((l) => l.id === lookId)!;
    void saveLooks(config.looks.map((l) => (l.id === lookId ? { ...l, action: { type: 'cue', list, cue } } : l)),
      `“${look.name}” now plays cue ${list}/${cue}.${look.approval ? ' Its volunteer approval was withdrawn because the cue changed.' : ''}`);
    setTarget(null);
  };
  const setVisible = (look: Look, visible: boolean) => saveLooks(config.looks.map((l) => (l.id === look.id ? { ...l, volunteerVisible: visible } : l)),
    visible ? `“${look.name}” is now in Volunteer Mode.` : `“${look.name}” is hidden from volunteers.`);
  const withdraw = async (kind: 'look' | 'sub' | 'cueList', id: string) => {
    try { await api.post('/api/approve', { kind, id, approve: false }); toast('info', 'Approval withdrawn: hidden from volunteers.'); }
    catch (e) { toast('error', (e as Error).message); }
  };
  const subVisible = async (s: SubmasterConfig, visible: boolean) => {
    try { await api.put('/api/config/submasters', config.submasters.map((x) => (x.sub === s.sub ? { ...x, volunteerVisible: visible } : x))); }
    catch (e) { toast('error', (e as Error).message); }
  };

  const eosLooks = config.looks.filter(needsApproval);
  const importedSubs = config.submasters;

  return (
    <div>
      <StepHeader title="Worship looks" intro="Give volunteers simple buttons for the cues you already use. Each button asks Eos to run the real cue. Before volunteers see a button, an operator runs it outside worship, watches what it does, and approves it." />

      <div className="looks-grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Cues in Eos (from your import)</h2></div>
          <div className="panel-body">
            {lists.length === 0 ? <p className="hint">No cue lists yet. Import your Eos show first.</p> : (
              <>
                <div className="tabs" role="tablist">
                  {lists.map((l) => <button key={l.list} role="tab" aria-selected={l.list === list} data-on={l.list === list} onClick={() => setList(l.list)}>List {l.list}{l.label ? ` · ${l.label}` : ''} ({l.cues.length})</button>)}
                </div>
                {current && list === config.settings.masterCueList && (
                  <div className="card" data-tone={playbackApproved(current) ? undefined : 'warn'}>
                    {playbackApproved(current)
                      ? <><CheckCircle2 size={15} color="var(--ok)" style={{ verticalAlign: -3 }} /> <strong>Volunteers may use GO/BACK on this list</strong> (approved {new Date(current.playbackApproval!.at).toLocaleDateString()}). <button className="btn sm" onClick={() => void withdraw('cueList', String(current.list))}>Withdraw</button></>
                      : <><ShieldCheck size={15} style={{ verticalAlign: -3 }} /> <strong>GO/BACK is operator-only for this list.</strong> GO runs whatever cue comes next, so volunteers can only use it after an operator reviews every cue in the list.{current.cues.length > 0 && <> <button className="btn sm" onClick={() => setApproving({ kind: 'cueList', list: current })}>Review & approve list for volunteer GO/BACK</button></>}</>}
                  </div>
                )}
                {target && <div className="card" data-tone="warn">Choose the cue for <strong>{config.looks.find((l) => l.id === target)?.name}</strong>. <button className="btn sm" onClick={() => setTarget(null)}>Cancel</button></div>}
                <div className="table-scroll" style={{ maxHeight: 520 }}>
                  <table className="data-table">
                    <thead><tr><th style={{ width: 70 }}>Cue</th><th>Label</th><th>Timing (as exported)</th><th style={{ width: 170 }} /></tr></thead>
                    <tbody>
                      {current?.cues.map((q) => {
                        const used = looksForCue(q.cue);
                        return (
                          <tr key={q.cue}>
                            <td><strong>{q.cue}</strong></td>
                            <td>{q.label || <span className="hint">no label</span>}</td>
                            <td className="hint">{q.notes ?? '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              {target ? <button className="btn sm primary" onClick={() => assign(target, q.cue)}><Link2 size={13} />Use this cue</button>
                                : used.length ? <span className="hint">Look: {used.map((l) => l.name).join(', ')}</span>
                                  : <button className="btn sm" onClick={() => void makeLook(q.cue, q.label)}><Plus size={13} />Make a look</button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Look buttons</h2></div>
          <div className="panel-body look-review-list">
            {config.looks.map((l) => {
              const eos = needsApproval(l);
              const usable = volunteerCanUseLook(l);
              return (
                <div key={l.id} className="look-review" data-state={!eos ? 'local' : l.approval ? 'approved' : 'review'}>
                  <div className="row">
                    <strong className="grow">{l.name}</strong>
                    {!eos ? <span className="badge">preview only</span> : l.approval ? <span className="badge confirmed"><CheckCircle2 size={12} />approved</span> : <span className="badge warn"><CircleAlert size={12} />needs review</span>}
                  </div>
                  <div className="hint">{actionLabel(l)}{l.approval?.note && /earlier configuration/.test(l.approval.note) ? ' · approved before approvals existed: review it' : ''}</div>
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <button className="btn sm" onClick={() => setTarget(l.id)}><Link2 size={13} />{eos ? 'Change cue' : 'Assign a cue'}</button>
                    {eos && !l.approval && <button className="btn sm primary" onClick={() => setApproving({ kind: 'look', look: l })}><ShieldCheck size={13} />Review & approve</button>}
                    {eos && l.approval && <button className="btn sm ghost" onClick={() => void withdraw('look', l.id)}>Withdraw approval</button>}
                    <span className="spacer" />
                    <button className="btn sm" disabled={eos && !l.approval} title={eos && !l.approval ? 'Approve it first' : undefined}
                      onClick={() => void setVisible(l, !l.volunteerVisible)}>
                      {l.volunteerVisible ? <><Eye size={13} />In Volunteer Mode</> : <><EyeOff size={13} />Hidden from volunteers</>}
                    </button>
                  </div>
                  {usable && <div className="hint" style={{ marginTop: 4 }}>Volunteers can use this button.</div>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {importedSubs.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head"><h2>Submasters (each moves the real Eos sub)</h2></div>
          <div className="panel-body">
            <p className="hint">A submaster can control anything in Eos, and Sanctuary Light can't read what it contains. Each one needs the same review before volunteers can move it. Protected submasters also need the timed unlock.</p>
            <table className="data-table">
              <thead><tr><th>Sub</th><th>Label</th><th>Status</th><th /></tr></thead>
              <tbody>
                {importedSubs.map((s) => (
                  <tr key={s.sub}>
                    <td>{s.sub}</td><td>{s.label}{s.protected && <span className="badge err" style={{ marginLeft: 6 }}>protected</span>}</td>
                    <td>{s.approval ? <span className="badge confirmed">approved</span> : <span className="badge warn">needs review</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      {s.approval
                        ? <><button className="btn sm ghost" onClick={() => void withdraw('sub', String(s.sub))}>Withdraw</button> <button className="btn sm" onClick={() => void subVisible(s, !s.volunteerVisible)}>{s.volunteerVisible ? 'In Volunteer Mode' : 'Hidden from volunteers'}</button></>
                        : <button className="btn sm primary" onClick={() => setApproving({ kind: 'sub', sub: s })}><ShieldCheck size={13} />Review & approve</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="row step-foot">
        <span className="hint">{eosLooks.length ? `${eosLooks.filter((l) => l.approval).length} of ${eosLooks.length} Eos looks approved for volunteers.` : 'Make a look from a cue to start.'}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={onNext}>Verify with Eos<ChevronRight size={16} /></button>
      </div>
      <ApproveDialog item={approving} onClose={() => setApproving(null)} />
    </div>
  );
}

function ApproveDialog({ item, onClose }: { item: Approving; onClose(): void }) {
  const [checked, setChecked] = useState(false);
  const [show, setShow] = useState(true);
  if (!item) return null;
  const name = item.kind === 'look' ? item.look.name : item.kind === 'sub' ? `Sub ${item.sub.sub} · ${item.sub.label}` : `Cue list ${item.list.list}`;
  const what = item.kind === 'look' ? actionLabel(item.look) : item.kind === 'sub' ? `submaster ${item.sub.sub}` : `GO/BACK on cue list ${item.list.list} (${item.list.cues.length} cues, in order)`;
  const id = item.kind === 'look' ? item.look.id : item.kind === 'sub' ? String(item.sub.sub) : String(item.list.list);
  const approve = async () => {
    try {
      await api.post('/api/approve', { kind: item.kind, id, approve: true, acknowledged: true });
      const cfg = useApp.getState().config!;
      if (show && item.kind === 'look') await api.put('/api/config/looks', cfg.looks.map((l) => (l.id === item.look.id ? { ...l, volunteerVisible: true } : l)));
      if (show && item.kind === 'sub') await api.put('/api/config/submasters', cfg.submasters.map((s) => (s.sub === item.sub.sub ? { ...s, volunteerVisible: true } : s)));
      useApp.getState().toast('info', `“${name}” approved${item.kind === 'cueList' ? ' for volunteer GO/BACK' : show ? ' and added to Volunteer Mode' : ''}.`);
      setChecked(false); onClose();
    } catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };
  return (
    <Modal open onOpenChange={(o) => { if (!o) { setChecked(false); onClose(); } }} title={`Approve “${name}” for volunteers?`}>
      <p>This button runs <strong>{what}</strong> in Eos. Sanctuary Light can't see everything a cue, preset or submaster does, so only approve it after you've tried it.</p>
      <ol className="hint" style={{ paddingLeft: 18 }}>
        <li>Outside worship, with someone at Eos, run it (from Eos, or here in Live mode).</li>
        <li>Watch the whole room, including the house lights and anything SceneStation controls.</li>
        <li>Check that it matches its name and that nothing unexpected switched.</li>
      </ol>
      <label className="row" style={{ alignItems: 'flex-start', margin: '10px 0' }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3 }} />
        <span>{item.kind === 'cueList' ? PLAYBACK_APPROVAL_STATEMENT : APPROVAL_STATEMENT}</span>
      </label>
      {item.kind === 'cueList'
        ? <p className="hint">The approval covers these exact cue numbers. Adding, removing or renumbering a cue, or importing the show again, withdraws it.</p>
        : <label className="row"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Also show it in Volunteer Mode now</label>}
      <div className="actions">
        <button className="btn" onClick={() => { setChecked(false); onClose(); }}>Cancel</button>
        <button className="btn primary" disabled={!checked} onClick={() => void approve()}>Approve</button>
      </div>
    </Modal>
  );
}
