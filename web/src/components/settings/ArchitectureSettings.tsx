import { Plus, Trash2 } from 'lucide-react';
import type { SceneStationDmxRole, SceneStationLossAction, SceneStationRecord, Tri, UpstreamDevice } from '@sanctuary/shared';
import { SaveBar, useSection } from './useSection';

const ROLES: [SceneStationDmxRole, string][] = [
  ['unknown', 'Not checked'], ['inline-backup', 'In-line with console (backup)'], ['output-only', 'DMX Output Only (DIP 4)'],
  ['wireless-remote', 'Wireless remote station'], ['separate-universe', 'Separate DMX line'],
];
const LOSS: [SceneStationLossAction, string][] = [
  ['unknown', 'Not checked'], ['hold-last-look', 'Hold Last Look'], ['snap-to-current', 'Snap to Current Preset'],
  ['fade-to-current', 'Fade to Current Preset'], ['fade-to-black', 'Fade to Black'], ['activate-preset', 'Activate Preset (x)'],
];
const UPSTREAM: [UpstreamDevice['lossBehavior'], string][] = [
  ['unknown', 'Not checked'], ['holds-last-look', 'Holds last look'], ['stops-output', 'Stops output'], ['fades-out', 'Fades out'],
];

export function ArchitectureSettings() {
  const { draft, setDraft, dirty, save, saving, revert } = useSection('architecture');
  const setStation = (id: string, patch: Partial<SceneStationRecord>) => setDraft({ ...draft, stations: draft.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const setUp = (id: string, patch: Partial<UpstreamDevice>) => setDraft({ ...draft, upstream: draft.upstream.map((u) => (u.id === id ? { ...u, ...patch } : u)) });

  return (
    <div>
      <h4>Architectural lighting audit</h4>
      <p className="hint">Record what the physical audit (docs/SYSTEM_AUDIT.md) found. This is documentation only. Sanctuary Light never sends anything to SceneStation, and changing these fields changes no lighting.</p>

      {draft.stations.map((s) => (
        <div key={s.id} className="card">
          <div className="row wrap">
            <input className="input grow" value={s.name} aria-label="Station name" onChange={(e) => setStation(s.id, { name: e.target.value })} />
            <label className="row hint"><input type="checkbox" checked={s.verified} onChange={(e) => setStation(s.id, { verified: e.target.checked, verifiedAt: e.target.checked ? Date.now() : null })} />Physically verified</label>
            <button className="btn sm icon ghost" aria-label={`Delete ${s.name}`} onClick={() => setDraft({ ...draft, stations: draft.stations.filter((x) => x.id !== s.id) })}><Trash2 size={14} /></button>
          </div>
          <div className="form-grid">
            <label className="field"><span>Location</span><input className="input" value={s.location} onChange={(e) => setStation(s.id, { location: e.target.value })} /></label>
            <label className="field"><span>Model (e.g. SS-305)</span><input className="input" value={s.model} onChange={(e) => setStation(s.id, { model: e.target.value })} /></label>
            <label className="field"><span>Firmware</span><input className="input" value={s.firmware} onChange={(e) => setStation(s.id, { firmware: e.target.value })} /></label>
            <label className="field"><span>DMX role</span>
              <select className="select" value={s.dmxRole} onChange={(e) => setStation(s.id, { dmxRole: e.target.value as SceneStationDmxRole })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field"><span>DMX line / universe</span><input className="input" value={s.dmxLine} onChange={(e) => setStation(s.id, { dmxLine: e.target.value })} /></label>
            <label className="field"><span>When console DMX stops</span>
              <select className="select" value={s.lossAction} onChange={(e) => setStation(s.id, { lossAction: e.target.value as SceneStationLossAction })}>{LOSS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {s.lossAction === 'activate-preset' && <label className="field"><span>Preset (1–64)</span><input className="input" type="number" value={s.lossPreset ?? ''} onChange={(e) => setStation(s.id, { lossPreset: e.target.value ? Number(e.target.value) : null })} /></label>}
            <label className="field"><span>Locks buttons while console active</span>
              <select className="select" value={s.locksButtonsWhenConsoleActive} onChange={(e) => setStation(s.id, { locksButtonsWhenConsoleActive: e.target.value as Tri })}><option value="unknown">Not checked</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            <label className="field"><span>Verified by</span><input className="input" value={s.verifiedBy} onChange={(e) => setStation(s.id, { verifiedBy: e.target.value })} /></label>
          </div>
          <label className="field"><span>What each button does</span><input className="input" value={s.buttons} onChange={(e) => setStation(s.id, { buttons: e.target.value })} /></label>
          <label className="field" style={{ marginTop: 8 }}><span>Notes</span><input className="input" value={s.notes} onChange={(e) => setStation(s.id, { notes: e.target.value })} /></label>
        </div>
      ))}
      <button className="btn sm" onClick={() => setDraft({ ...draft, stations: [...draft.stations, { id: `ss-${Date.now()}`, name: 'New station', location: '', model: '', firmware: '', dmxRole: 'unknown', dmxLine: '', lossAction: 'unknown', lossPreset: null, locksButtonsWhenConsoleActive: 'unknown', buttons: '', verified: false, verifiedBy: '', verifiedAt: null, notes: '' }] })}><Plus size={14} />Add station</button>

      <h4 style={{ marginTop: 20 }}>DMX devices between Eos and the lights</h4>
      <table className="data-table">
        <thead><tr><th>Device</th><th>When Eos stops</th><th>Feeds lines</th><th>Verified</th><th>Notes</th><th /></tr></thead>
        <tbody>
          {draft.upstream.map((u) => (
            <tr key={u.id}>
              <td><input className="input" value={u.name} aria-label="Device name" onChange={(e) => setUp(u.id, { name: e.target.value })} /></td>
              <td><select className="select" value={u.lossBehavior} aria-label="Loss behavior" onChange={(e) => setUp(u.id, { lossBehavior: e.target.value as UpstreamDevice['lossBehavior'] })}>{UPSTREAM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td><input className="input" value={u.feedsLines} aria-label="Feeds" onChange={(e) => setUp(u.id, { feedsLines: e.target.value })} /></td>
              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={u.verified} aria-label="Verified" onChange={(e) => setUp(u.id, { verified: e.target.checked })} /></td>
              <td><input className="input" value={u.notes} aria-label="Notes" onChange={(e) => setUp(u.id, { notes: e.target.value })} /></td>
              <td><button className="btn sm icon ghost" aria-label={`Delete ${u.name}`} onClick={() => setDraft({ ...draft, upstream: draft.upstream.filter((x) => x.id !== u.id) })}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setDraft({ ...draft, upstream: [...draft.upstream, { id: `up-${Date.now()}`, name: 'New device', role: '', lossBehavior: 'unknown', feedsLines: '', verified: false, notes: '' }] })}><Plus size={14} />Add device</button>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <label className="field"><span>Audit done by</span><input className="input" value={draft.auditBy} onChange={(e) => setDraft({ ...draft, auditBy: e.target.value })} /></label>
        <label className="row" style={{ alignSelf: 'end' }}><input type="checkbox" checked={draft.auditCompletedAt != null} onChange={(e) => setDraft({ ...draft, auditCompletedAt: e.target.checked ? Date.now() : null })} />Audit completed</label>
      </div>
      <label className="field"><span>Guidance shown to volunteers</span><textarea className="input" rows={3} value={draft.volunteerGuidance} onChange={(e) => setDraft({ ...draft, volunteerGuidance: e.target.value })} /></label>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onRevert={revert} />
    </div>
  );
}
