import { Camera, Plus, Trash2 } from 'lucide-react';
import type { Look, LookAction } from '@sanctuary/shared';
import { needsApproval } from '@sanctuary/shared';
import { useApp } from '../../state/store';
import { LOOK_ICONS, actionLabel } from '../LooksGrid';
import { SaveBar, useSection } from './useSection';
import { previewFromStage } from '../../lib/looks';

const ACTION_TYPES: { v: LookAction['type']; label: string }[] = [
  { v: 'none', label: 'Not mapped (preview only)' },
  { v: 'cue', label: 'Fire Eos cue' },
  { v: 'preset', label: 'Apply preset to Eos group' },
  { v: 'macro', label: 'Run Eos macro' },
  { v: 'sub', label: 'Set submaster level' },
  { v: 'snapshot', label: 'Recall snapshot' },
];

function defaultAction(t: LookAction['type'], masterList: number): LookAction {
  switch (t) {
    case 'none': return { type: 'none' };
    case 'cue': return { type: 'cue', list: masterList, cue: '1' };
    case 'preset': return { type: 'preset', preset: 1, eosGroup: 1 };
    case 'macro': return { type: 'macro', macro: 1 };
    case 'sub': return { type: 'sub', sub: 1, level: 100 };
    case 'snapshot': return { type: 'snapshot', snapshot: 1 };
  }
}

export function LookSettings() {
  const { draft, setDraft, dirty, save, saving, revert } = useSection('looks');
  const config = useApp((s) => s.config!);
  const levels = useApp((s) => s.levels);
  const update = (id: string, patch: Partial<Look>) => setDraft(draft.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const setAction = (l: Look, patch: Record<string, unknown>) => update(l.id, { action: { ...l.action, ...patch } as LookAction });

  /** Store what the stage currently shows as this look's simulated preview. */
  const capture = (l: Look) => {
    const preview = previewFromStage(config, levels);
    update(l.id, { preview });
    useApp.getState().toast('info', `Captured the current preview into “${l.name}”. Save to keep it.`);
  };

  return (
    <div>
      <h4>Looks</h4>
      <div className="card" role="note">
        <strong>Two kinds of looks.</strong> <span className="badge sim">Local look</span> lives only in Sanctuary Light: firing it changes the on-screen preview and nothing in Eos. <span className="badge confirmed">Eos</span> looks trigger a cue, preset, macro, submaster or snapshot that already exists in the Eos show file. Editing a look here never changes the show file. Record or update cues in Eos itself.
      </div>
      <p className="hint">Each look button can trigger one Eos action. These are proposed worship looks, not cues that exist on your Eos system — map each one to a real cue, preset, macro or submaster after checking the show file. Eos presets apply to channels; they are not whole-stage scenes like Lightkey's.</p>
      {draft.map((l) => {
        const a = l.action;
        return (
          <div key={l.id} className="card">
            <div className="row wrap">
              <div style={{ width: 54, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${l.gradient[0]}, ${l.gradient[1]})` }} />
              <input className="input grow" value={l.name} aria-label="Look name" onChange={(e) => update(l.id, { name: e.target.value })} />
              <select className="select" value={l.icon} aria-label="Icon" onChange={(e) => update(l.id, { icon: e.target.value })}>{Object.keys(LOOK_ICONS).map((k) => <option key={k}>{k}</option>)}</select>
              <input type="color" aria-label="Gradient start" value={l.gradient[0]} onChange={(e) => update(l.id, { gradient: [e.target.value, l.gradient[1]] })} />
              <input type="color" aria-label="Gradient end" value={l.gradient[1]} onChange={(e) => update(l.id, { gradient: [l.gradient[0], e.target.value] })} />
              <label className="row hint" title={needsApproval(l) && !l.approval ? 'Approve it first in Setup → Worship looks' : undefined}><input type="checkbox" checked={l.volunteerVisible} disabled={needsApproval(l) && !l.approval} onChange={(e) => update(l.id, { volunteerVisible: e.target.checked })} />Volunteer{needsApproval(l) && !l.approval ? ' (needs approval)' : ''}</label>
              <button className="btn sm" onClick={() => capture(l)}><Camera size={14} />Capture preview</button>
              <button className="btn sm icon ghost" aria-label={`Delete ${l.name}`} onClick={() => setDraft(draft.filter((x) => x.id !== l.id))}><Trash2 size={14} /></button>
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <input className="input grow" value={l.description} aria-label="Description" onChange={(e) => update(l.id, { description: e.target.value })} />
              <select className="select" value={a.type} aria-label="Action" onChange={(e) => update(l.id, { action: defaultAction(e.target.value as LookAction['type'], config.settings.masterCueList) })}>
                {ACTION_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
              {a.type === 'cue' && <>
                <label className="row hint">List<input className="input num" type="number" value={a.list} onChange={(e) => setAction(l, { list: Number(e.target.value) })} /></label>
                <label className="row hint">Cue<input className="input num" value={a.cue} onChange={(e) => setAction(l, { cue: e.target.value })} /></label>
              </>}
              {a.type === 'preset' && <>
                <label className="row hint">Group<input className="input num" type="number" value={a.eosGroup ?? ''} onChange={(e) => setAction(l, { eosGroup: e.target.value ? Number(e.target.value) : null })} /></label>
                <label className="row hint">Preset<input className="input num" type="number" value={a.preset} onChange={(e) => setAction(l, { preset: Number(e.target.value) })} /></label>
              </>}
              {a.type === 'macro' && <label className="row hint">Macro<input className="input num" type="number" value={a.macro} onChange={(e) => setAction(l, { macro: Number(e.target.value) })} /></label>}
              {a.type === 'sub' && <>
                <label className="row hint">Sub<input className="input num" type="number" value={a.sub} onChange={(e) => setAction(l, { sub: Number(e.target.value) })} /></label>
                <label className="row hint">Level %<input className="input num" type="number" value={a.level} onChange={(e) => setAction(l, { level: Number(e.target.value) })} /></label>
              </>}
              {a.type === 'snapshot' && <label className="row hint">Snapshot<input className="input num" type="number" value={a.snapshot} onChange={(e) => setAction(l, { snapshot: Number(e.target.value) })} /></label>}
              <span className="badge">{actionLabel(l)}</span>
            </div>
          </div>
        );
      })}
      <button className="btn sm" onClick={() => setDraft([...draft, { id: `look-${Date.now()}`, name: 'New look', description: '', icon: 'sparkles', gradient: ['#334155', '#94a3b8'], action: { type: 'none' }, preview: [], volunteerVisible: false }])}><Plus size={14} />Add look</button>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onRevert={revert} />
    </div>
  );
}
