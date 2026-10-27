import { useRef, useState } from 'react';
import { Download, FileUp, Plus, Trash2, Upload } from 'lucide-react';
import type { AreaId, Fixture } from '@sanctuary/shared';
import { api, downloadText } from '../../lib/api';
import { useApp } from '../../state/store';
import { Confirm } from '../ui';
import { SaveBar, useSection } from './useSection';

const AREAS: AreaId[] = ['stage', 'front', 'house', 'scenic', 'utility'];

interface SyncResult { patch: { channel: number; label: string; manufacturer: string; model: string; dmx: Fixture['dmx'] }[]; cueLists: { list: number; label: string; cues: { cue: string; label: string }[] }[] }

export function PatchSettings() {
  const { draft, setDraft, dirty, save, saving, revert } = useSection('fixtures');
  const profiles = useApp((s) => s.config!.profiles);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<{ fixtures: Fixture[]; warnings: string[] } | null>(null);
  const [confirmImport, setConfirmImport] = useState<'replace' | 'merge' | null>(null);
  const [sync, setSync] = useState<SyncResult | null | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<Fixture>) => setDraft(draft.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const shown = draft.filter((f) => !filter || `${f.channel} ${f.label} ${f.profileId} ${f.area}`.toLowerCase().includes(filter.toLowerCase()));

  const onFile = async (file: File) => {
    const content = await file.text();
    const format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
    try { setPreview(await api.post('/api/patch/import', { format, content })); }
    catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  const applyImport = async (how: 'replace' | 'merge') => {
    if (!preview) return;
    let next: Fixture[];
    if (how === 'replace') next = preview.fixtures;
    else {
      const map = new Map(draft.map((f) => [f.channel, f]));
      for (const f of preview.fixtures) map.set(f.channel, f);
      next = [...map.values()].sort((a, b) => a.channel - b.channel);
    }
    if (await save(next)) setPreview(null);
  };

  const exportAs = async (format: 'csv' | 'json') => {
    try {
      const token = useApp.getState().token;
      const res = await fetch(`/api/patch/export?format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
      downloadText(`sanctuary-patch.${format}`, await res.text(), format === 'csv' ? 'text/csv' : 'application/json');
    } catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  const loadSync = async () => {
    try { setSync(await api.get<SyncResult | null>('/api/sync')); }
    catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  const applySync = () => {
    if (!sync) return;
    const map = new Map(draft.map((f) => [f.channel, f]));
    for (const p of sync.patch) {
      const prev = map.get(p.channel);
      map.set(p.channel, {
        id: `fx-${p.channel}`, channel: p.channel, label: p.label || prev?.label || `Channel ${p.channel}`,
        profileId: prev?.profileId ?? 'generic', dmx: p.dmx, area: prev?.area ?? 'stage', protected: prev?.protected ?? false,
        stage: prev?.stage ?? { x: 60 + (p.channel % 20) * 55, y: 760, rotation: 0 },
        notes: `${p.manufacturer} ${p.model}`.trim() || prev?.notes,
      });
    }
    setDraft([...map.values()].sort((a, b) => a.channel - b.channel));
    useApp.getState().toast('info', 'Console patch merged into the draft. Review, then Save.');
  };

  const nextChannel = Math.max(0, ...draft.map((f) => f.channel)) + 1;

  return (
    <div>
      <h4>Fixture patch</h4>
      <p className="hint"><strong>Channel</strong> = Eos channel number (what you type in Eos). <strong>Universe/Address</strong> = DMX, informational only — Eos's patch is authoritative. Rows marked as samples were guessed from the preliminary channel groupings; replace them with your real patch.</p>
      <div className="row wrap">
        <input className="input grow" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter fixtures" />
        <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        <button className="btn sm primary" onClick={() => useApp.getState().setImportOpen(true)}><FileUp size={14} />Import Eos Show</button>
        <button className="btn sm" onClick={() => fileRef.current?.click()}><Upload size={14} />Import CSV/JSON</button>
        <button className="btn sm" onClick={() => exportAs('csv')}><Download size={14} />CSV</button>
        <button className="btn sm" onClick={() => exportAs('json')}><Download size={14} />JSON</button>
        <button className="btn sm" onClick={loadSync}>Console sync results</button>
        <button className="btn sm" onClick={() => setDraft([...draft, { id: `fx-${nextChannel}`, channel: nextChannel, label: `Channel ${nextChannel}`, profileId: 'generic', dmx: null, area: 'stage', protected: false, stage: { x: 600, y: 400, rotation: 0 } }])}><Plus size={14} />Add</button>
      </div>

      {preview && (
        <div className="card">
          <strong>Import preview: {preview.fixtures.length} fixtures</strong>
          {preview.warnings.length > 0 && <ul className="hint">{preview.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}{preview.warnings.length > 12 && <li>…and {preview.warnings.length - 12} more</li>}</ul>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => setPreview(null)}>Cancel</button>
            <span className="spacer" />
            <button className="btn sm" disabled={!preview.fixtures.length} onClick={() => setConfirmImport('merge')}>Merge into patch</button>
            <button className="btn sm danger" disabled={!preview.fixtures.length} onClick={() => setConfirmImport('replace')}>Replace patch</button>
          </div>
        </div>
      )}

      {sync === null && <div className="card hint">No console sync results yet. Connect in Monitor or Live mode and use Connection → "Read patch &amp; cues from console" (Eos 2.0+). <button className="btn sm" onClick={() => setSync(undefined)}>Close</button></div>}
      {sync && (
        <div className="card">
          <strong>Read from console: {sync.patch.length} patched channels, {sync.cueLists.length} cue lists</strong>
          <div className="hint">Read-only data from the Eos third-party OSC API. Applying merges labels and DMX addresses into the draft below; nothing is written to Eos.</div>
          <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setSync(undefined)}>Close</button><span className="spacer" />
            <button className="btn sm primary" disabled={!sync.patch.length} onClick={applySync}>Merge into draft</button></div>
        </div>
      )}

      <div className="table-scroll" style={{ marginTop: 10 }}>
        <table className="data-table">
          <thead><tr><th style={{ width: 70 }}>Chan</th><th>Label</th><th>Fixture profile</th><th style={{ width: 64 }}>Univ</th><th style={{ width: 70 }}>Addr</th><th style={{ width: 100 }}>Area</th><th style={{ width: 70 }}>Protect</th><th style={{ width: 36 }} /></tr></thead>
          <tbody>
            {shown.map((f) => (
              <tr key={f.id}>
                <td><input className="input" type="number" value={f.channel} aria-label="Eos channel" onChange={(e) => update(f.id, { channel: Number(e.target.value) })} /></td>
                <td><input className="input" value={f.label} aria-label="Label" onChange={(e) => update(f.id, { label: e.target.value })} /></td>
                <td><select className="select" value={f.profileId} aria-label="Profile" onChange={(e) => update(f.id, { profileId: e.target.value })}>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.verified ? '' : ' (unverified)'}</option>)}</select></td>
                <td><input className="input" type="number" value={f.dmx?.universe ?? ''} aria-label="DMX universe" onChange={(e) => update(f.id, { dmx: e.target.value ? { universe: Number(e.target.value), address: f.dmx?.address ?? 1 } : null })} /></td>
                <td><input className="input" type="number" value={f.dmx?.address ?? ''} aria-label="DMX address" onChange={(e) => update(f.id, { dmx: e.target.value ? { universe: f.dmx?.universe ?? 1, address: Number(e.target.value) } : null })} /></td>
                <td><select className="select" value={f.area} aria-label="Area" onChange={(e) => update(f.id, { area: e.target.value as AreaId })}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={f.protected} aria-label="Protected" onChange={(e) => update(f.id, { protected: e.target.checked })} /></td>
                <td><button className="btn sm icon ghost" aria-label={`Delete channel ${f.channel}`} onClick={() => setDraft(draft.filter((x) => x.id !== f.id))}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">CSV columns: <code>channel, label, profile, universe, address, area, protected, x, y, rotation, notes</code> (also accepts <code>dmx</code> as "2/101" or an absolute address).</p>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save(draft.map((f) => ({ ...f, id: `fx-${f.channel}` })))} onRevert={revert} />
      <Confirm open={confirmImport !== null} onOpenChange={(o) => !o && setConfirmImport(null)} danger={confirmImport === 'replace'}
        title={confirmImport === 'replace' ? 'Replace the whole patch?' : 'Merge imported fixtures?'}
        confirmLabel={confirmImport === 'replace' ? 'Replace' : 'Merge'}
        body={<>This updates Sanctuary Light's local patch ({preview?.fixtures.length} fixtures). A backup of the current configuration is kept automatically. The Eos show file is not changed.</>}
        onConfirm={() => confirmImport && void applyImport(confirmImport)} />
    </div>
  );
}
