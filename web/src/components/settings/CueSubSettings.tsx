import { Plus, Trash2 } from 'lucide-react';
import type { CueListConfig, SubmasterConfig } from '@sanctuary/shared';
import { SaveBar, useSection } from './useSection';

export function CueSubSettings() {
  const cues = useSection('cueLists');
  const subs = useSection('submasters');
  const updList = (i: number, patch: Partial<CueListConfig>) => cues.setDraft(cues.draft.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const updSub = (i: number, patch: Partial<SubmasterConfig>) => subs.setDraft(subs.draft.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div>
      <h4>Cue lists</h4>
      <p className="hint">Labels here are for this app's display only. Editing them never renames cues in the Eos show file. Use "Read patch &amp; cues from console" (Eos 2.0+) to fetch real cue numbers.</p>
      {cues.draft.map((l, i) => (
        <div key={i} className="card">
          <div className="row">
            <label className="row hint">List<input className="input num" type="number" value={l.list} onChange={(e) => updList(i, { list: Number(e.target.value) })} /></label>
            <input className="input grow" value={l.label} aria-label="Cue list label" onChange={(e) => updList(i, { label: e.target.value })} />
            <button className="btn sm icon ghost" aria-label="Delete cue list" onClick={() => cues.setDraft(cues.draft.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead><tr><th style={{ width: 90 }}>Cue</th><th>Label</th><th style={{ width: 36 }} /></tr></thead>
            <tbody>
              {l.cues.map((c, k) => (
                <tr key={k}>
                  <td><input className="input" value={c.cue} aria-label="Cue number" onChange={(e) => updList(i, { cues: l.cues.map((x, m) => (m === k ? { ...x, cue: e.target.value } : x)) })} /></td>
                  <td><input className="input" value={c.label} aria-label="Cue label" onChange={(e) => updList(i, { cues: l.cues.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} /></td>
                  <td><button className="btn sm icon ghost" aria-label="Delete cue" onClick={() => updList(i, { cues: l.cues.filter((_, m) => m !== k) })}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => updList(i, { cues: [...l.cues, { cue: String((Number(l.cues.at(-1)?.cue) || 0) + 1), label: '' }] })}><Plus size={14} />Add cue</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => cues.setDraft([...cues.draft, { list: Math.max(0, ...cues.draft.map((l) => l.list)) + 1, label: 'New list', cues: [] }])}><Plus size={14} />Add cue list</button>
      <SaveBar dirty={cues.dirty} saving={cues.saving} onSave={() => void cues.save()} onRevert={cues.revert} />

      <h4 style={{ marginTop: 24 }}>Submasters</h4>
      <table className="data-table">
        <thead><tr><th style={{ width: 80 }}>Sub</th><th>Label</th><th style={{ width: 90 }}>Volunteer</th><th style={{ width: 90 }}>Protected</th><th style={{ width: 36 }} /></tr></thead>
        <tbody>
          {subs.draft.map((s, i) => (
            <tr key={i}>
              <td><input className="input" type="number" value={s.sub} aria-label="Submaster number" onChange={(e) => updSub(i, { sub: Number(e.target.value) })} /></td>
              <td><input className="input" value={s.label} aria-label="Submaster label" onChange={(e) => updSub(i, { label: e.target.value })} /></td>
              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={s.volunteerVisible} disabled={!!s.fromEos && !s.approval} title={s.fromEos && !s.approval ? 'From the Eos show: approve it first in Setup → Worship looks' : undefined} aria-label="Visible to volunteers" onChange={(e) => updSub(i, { volunteerVisible: e.target.checked })} /></td>
              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={s.protected} aria-label="Protected" onChange={(e) => updSub(i, { protected: e.target.checked })} /></td>
              <td><button className="btn sm icon ghost" aria-label="Delete submaster" onClick={() => subs.setDraft(subs.draft.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => subs.setDraft([...subs.draft, { sub: Math.max(0, ...subs.draft.map((s) => s.sub)) + 1, label: 'New sub', volunteerVisible: false, protected: false }])}><Plus size={14} />Add submaster</button>
      <SaveBar dirty={subs.dirty} saving={subs.saving} onSave={() => void subs.save()} onRevert={subs.revert} />
    </div>
  );
}
