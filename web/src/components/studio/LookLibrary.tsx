/**
 * The look library: every look as a card with a thumbnail, organised into collections.
 * Local looks can be edited in the Look Designer, duplicated, renamed, moved and deleted.
 * Looks that play something in Eos show what they trigger, never an invented preview.
 */
import { useMemo, useState } from 'react';
import { BookPlus, Copy, Eye, FolderInput, MoreHorizontal, Pencil, Play, Plus, Send, Sparkles, Trash2, Type } from 'lucide-react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { collectionOf, lookCollections, lookLevels, type AppConfig, type Look } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { sendCommand, useApp } from '../../state/store';
import { actionLabel, LOOK_ICONS } from '../LooksGrid';
import { Confirm, Modal, Tip } from '../ui';
import { ApplyToEosDialog } from './ApplyToEosDialog';
import { RecordToEosDialog } from './RecordToEosDialog';

/** A small overhead picture of what a look sets. Only drawn for looks Sanctuary Light knows the contents of. */
export function LookThumbnail({ config, look }: { config: AppConfig; look: Look }) {
  const levels = useMemo(() => lookLevels(config, look), [config, look]);
  const W = config.stage.width; const H = config.stage.height;
  const Icon = LOOK_ICONS[look.icon] ?? Sparkles;
  if (look.action.type !== 'none' && levels.size === 0) {
    return (
      <div className="look-thumb eos" style={{ background: `linear-gradient(135deg, ${look.gradient[0]}, ${look.gradient[1]})` }}>
        <Icon size={26} aria-hidden />
        <span>Plays in Eos: contents not visible here</span>
      </div>
    );
  }
  const byChannel = new Map(config.fixtures.map((f) => [f.channel, f]));
  return (
    <svg className="look-thumb" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Preview of ${look.name}`}>
      <defs><filter id="thumb-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation={Math.round(W / 60)} /></filter></defs>
      <rect width={W} height={H} fill="#0b0d14" />
      {config.stage.elements.filter((e) => e.kind !== 'label').map((e) => <rect key={e.id} x={e.x} y={e.y} width={e.w} height={e.h} rx={8} fill="#161b2b" />)}
      <g style={{ mixBlendMode: 'screen' }} filter="url(#thumb-soft)">
        {[...levels.entries()].map(([ch, s]) => {
          const f = byChannel.get(ch);
          if (!f || f.unplaced || s.intensity < 2) return null;
          const c = s.color ?? { r: 100, g: 90, b: 72 };
          const fill = `rgb(${Math.round(c.r * 2.55)},${Math.round(c.g * 2.55)},${Math.round(c.b * 2.55)})`;
          return <circle key={ch} cx={f.stage.x} cy={f.stage.y} r={W / 22} fill={fill} opacity={0.15 + (s.intensity / 100) * 0.6} />;
        })}
      </g>
    </svg>
  );
}

export function LookLibrary() {
  const config = useApp((s) => s.config)!;
  const role = useApp((s) => s.role);
  const filter = useApp((s) => s.lookFilter);
  const setFilter = useApp((s) => s.setLookFilter);
  const active = useApp((s) => s.status?.activeLook?.id);
  const offline = useApp((s) => (s.status?.mode ?? 'offline') === 'offline');
  const designer = useApp((s) => s.designer);
  const collections = lookCollections(config.looks);
  const [extra, setExtra] = useState<string[]>([]);
  const all = [...new Set([...collections, ...extra])];
  const shown = config.looks.filter((l) => filter === 'all' || collectionOf(l) === filter);
  const [renaming, setRenaming] = useState<Look | null>(null);
  const [deleting, setDeleting] = useState<Look | null>(null);
  const [applying, setApplying] = useState<Look | null>(null);
  const [recording, setRecording] = useState<Look | null>(null);
  const mode = useApp((s) => s.status?.mode ?? 'offline');
  const [newCollection, setNewCollection] = useState(false);
  const operator = role === 'operator';

  const saveLooks = async (looks: Look[], message: string) => {
    try { await api.put('/api/config/looks', looks); useApp.getState().toast('info', message); return true; }
    catch (e) { useApp.getState().toast('error', (e as Error).message); return false; }
  };
  const update = (id: string, patch: Partial<Look>, message: string) => saveLooks(config.looks.map((l) => (l.id === id ? { ...l, ...patch } : l)), message);

  return (
    <div className="library">
      <div className="library-bar">
        <div className="chips" role="tablist" aria-label="Collections">
          <button role="tab" className="chip" data-on={filter === 'all'} aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All <span className="count">{config.looks.length}</span></button>
          {all.map((c) => {
            const n = config.looks.filter((l) => collectionOf(l) === c).length;
            return <button key={c} role="tab" className="chip" data-on={filter === c} aria-selected={filter === c} onClick={() => setFilter(c)}>{c} <span className="count">{n}</span></button>;
          })}
          {operator && <button className="chip ghost" onClick={() => setNewCollection(true)}><Plus size={12} />Collection</button>}
        </div>
        <span className="spacer" />
        {operator && (
          <button className="btn sm primary" disabled={!!designer} title={offline ? undefined : 'The Look Designer works in Offline Simulation only'} onClick={() => useApp.getState().openDesigner()}>
            <Plus size={14} />New look
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="library-empty hint">No looks in {filter === 'all' ? 'the library' : `“${filter}”`} yet.{operator ? ' Press New look to design one.' : ''}</div>
      ) : (
        <div className="look-cards">
          {shown.map((l) => (
            <article key={l.id} className="look-card" data-active={active === l.id} data-editing={designer?.lookId === l.id}>
              {/* Local looks: Preview only changes the stage picture, in every mode. Eos looks play their cue/preset in Live. */}
              <Tip label={l.action.type === 'none' ? 'Preview: changes the stage picture only. Nothing is sent to Eos.' : mode === 'eos-live' ? `Play: runs ${actionLabel(l).replace('Eos · ', '')} on the real Eos.` : `Play: preview only in ${mode === 'offline' ? 'SIM' : 'MONITOR'}.`}>
                <button className="look-card-main" onClick={() => void sendCommand({ kind: 'fireLook', lookId: l.id })} aria-label={l.action.type === 'none' ? `Preview ${l.name}` : `Play ${l.name}`}>
                  <LookThumbnail config={config} look={l} />
                  <span className="look-card-play" aria-hidden>{l.action.type === 'none' ? <Eye size={14} /> : <Play size={14} fill="currentColor" />}</span>
                  {l.action.type !== 'none' && mode === 'eos-live' && <span className="look-card-live">LIVE · plays in Eos</span>}
                  {l.eosCue && <span className="look-card-cue">Eos cue {l.eosCue.list}/{l.eosCue.cue}</span>}
                </button>
              </Tip>
              <div className="look-card-meta">
                <div className="grow">
                  <div className="look-card-name" title={l.name}>{l.name}</div>
                  <div className="look-card-sub">{l.action.type === 'none' ? `Local${l.fadeSeconds ? ` · ${l.fadeSeconds}s fade` : ''}` : actionLabel(l)}</div>
                </div>
                {operator && l.action.type === 'none' && (
                  <Tip label={mode === 'eos-live' ? 'Apply to Eos: send this look to the real lights (shows what will be sent first)' : 'Apply to Eos needs LIVE mode'}>
                    <button className="btn sm icon apply-btn" aria-label={`Apply ${l.name} to Eos`} disabled={mode !== 'eos-live'} onClick={() => setApplying(l)}><Send size={14} /></button>
                  </Tip>
                )}
                {operator && (
                  <Menu.Root>
                    <Menu.Trigger asChild><button className="btn sm icon ghost" aria-label={`More actions for ${l.name}`}><MoreHorizontal size={16} /></button></Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content className="menu" sideOffset={4} align="end">
                        {l.action.type === 'none' && <Menu.Item className="menu-item" disabled={!!designer} onSelect={() => useApp.getState().openDesigner(l)}><Pencil size={14} />Edit in Look Designer</Menu.Item>}
                        {l.action.type === 'none' && <Menu.Item className="menu-item" disabled={mode !== 'eos-live'} onSelect={() => setApplying(l)}><Send size={14} />Apply to Eos…{mode !== 'eos-live' ? ' (LIVE only)' : ''}</Menu.Item>}
                        {l.action.type === 'none' && <Menu.Item className="menu-item" onSelect={() => setRecording(l)}><BookPlus size={14} />Record to Eos…</Menu.Item>}
                        <Menu.Item className="menu-item" disabled={!!designer} onSelect={() => useApp.getState().openDesigner(l, { duplicate: true })}><Copy size={14} />Duplicate{l.action.type !== 'none' ? ' as local look' : ''}</Menu.Item>
                        <Menu.Item className="menu-item" onSelect={() => setRenaming(l)}><Type size={14} />Rename</Menu.Item>
                        <Menu.Sub>
                          <Menu.SubTrigger className="menu-item"><FolderInput size={14} />Move to collection</Menu.SubTrigger>
                          <Menu.Portal>
                            <Menu.SubContent className="menu" sideOffset={4}>
                              {all.map((c) => <Menu.Item key={c} className="menu-item" disabled={collectionOf(l) === c} onSelect={() => void update(l.id, { collection: c }, `Moved “${l.name}” to ${c}.`)}>{c}</Menu.Item>)}
                            </Menu.SubContent>
                          </Menu.Portal>
                        </Menu.Sub>
                        <Menu.Separator className="menu-sep" />
                        <Menu.Item className="menu-item danger" onSelect={() => setDeleting(l)}><Trash2 size={14} />Delete</Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu.Root>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <ApplyToEosDialog look={applying} onClose={() => setApplying(null)} />
      {recording && <RecordToEosDialog look={recording} onClose={() => setRecording(null)} />}
      <RenameDialog look={renaming} onClose={() => setRenaming(null)} onSave={(name) => (renaming ? update(renaming.id, { name }, `Renamed to “${name}”.`) : false)} />
      <NameDialog open={newCollection} title="New collection" label="Collection name" placeholder="e.g. Easter" onClose={() => setNewCollection(false)}
        onSave={(name) => { setExtra([...extra, name]); setFilter(name); return true; }} />
      <Confirm open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} danger title={`Delete “${deleting?.name}”?`} confirmLabel="Delete look"
        body={<>This removes the look from Sanctuary Light (a backup of the settings is kept). Nothing in Eos is changed.</>}
        onConfirm={() => { if (deleting) void saveLooks(config.looks.filter((l) => l.id !== deleting.id), `Deleted “${deleting.name}”.`); setDeleting(null); }} />
    </div>
  );
}

function RenameDialog({ look, onClose, onSave }: { look: Look | null; onClose(): void; onSave(name: string): Promise<boolean> | boolean | undefined }) {
  return <NameDialog open={!!look} title="Rename look" label="Look name" initial={look?.name ?? ''} onClose={onClose} onSave={onSave} />;
}

function NameDialog({ open, title, label, initial = '', placeholder, onClose, onSave }: {
  open: boolean; title: string; label: string; initial?: string; placeholder?: string; onClose(): void; onSave(v: string): Promise<boolean> | boolean | undefined;
}) {
  const [v, setV] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) { setLastInitial(initial); setV(initial); }
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={title}>
      <form onSubmit={async (e) => { e.preventDefault(); const name = v.trim().slice(0, 40); if (name && (await onSave(name)) !== false) { onClose(); setV(''); } }}>
        <label className="field"><span>{label}</span><input className="input" autoFocus value={v} maxLength={40} placeholder={placeholder} onChange={(e) => setV(e.target.value)} /></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!v.trim()}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
