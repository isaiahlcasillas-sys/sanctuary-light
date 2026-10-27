/**
 * The Look Designer's bar above the stage: name, collection, fade time, preview and save.
 * Saving writes a LOCAL look in Sanctuary Light. Nothing is recorded in Eos, and a local look
 * never becomes a live lighting command.
 */
import { useState } from 'react';
import { CopyPlus, Palette, PlayCircle, Save, X } from 'lucide-react';
import { MAX_FADE_SECONDS, lookCollections } from '@sanctuary/shared';
import { useApp } from '../../state/store';
import { LOOK_ICONS } from '../LooksGrid';
import { Confirm, Tip } from '../ui';

export function DesignerBar() {
  const d = useApp((s) => s.designer)!;
  const looks = useApp((s) => s.config?.looks ?? []);
  const st = useApp.getState();
  const [confirmClose, setConfirmClose] = useState(false);
  const count = Object.keys(d.states).length;
  const collections = lookCollections(looks);
  const close = () => (d.dirty ? setConfirmClose(true) : st.closeDesigner());

  return (
    <div className="designer-bar" role="region" aria-label="Look Designer">
      <span className="designer-tag"><Palette size={14} />{d.lookId ? 'Editing look' : 'New look'}</span>
      <input className="input designer-name" aria-label="Look name" value={d.name} maxLength={60} onChange={(e) => st.designerMeta({ name: e.target.value })} />
      <label className="designer-field"><span>Collection</span>
        <input className="input" list="look-collections" aria-label="Collection" value={d.collection} maxLength={40} onChange={(e) => st.designerMeta({ collection: e.target.value })} />
        <datalist id="look-collections">{collections.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="designer-field"><span>Fade</span>
        <input className="input num" type="number" min={0} max={MAX_FADE_SECONDS} step={0.5} aria-label="Fade time in seconds" value={d.fadeSeconds}
          onChange={(e) => st.designerMeta({ fadeSeconds: Number(e.target.value) || 0 })} /><span className="unit">s</span>
      </label>
      <label className="designer-field"><span>Icon</span>
        <select className="select" aria-label="Icon" value={d.icon} onChange={(e) => st.designerMeta({ icon: e.target.value })}>
          {Object.keys(LOOK_ICONS).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <span className="hint">{count} light{count === 1 ? '' : 's'}{d.dirty ? ' · unsaved' : ' · saved'}</span>
      <span className="spacer" />
      <Tip label="Preview the fade from dark on the stage (draft only)"><button className="btn sm" disabled={!d.fadeSeconds} onClick={() => st.previewDesignerFade()}><PlayCircle size={14} />Preview fade</button></Tip>
      {d.lookId && <Tip label="Save as a new look and keep the original"><button className="btn sm" onClick={() => void st.saveDesigner(true)}><CopyPlus size={14} />Save copy</button></Tip>}
      <button className="btn sm primary" disabled={!d.dirty || !d.name.trim()} onClick={() => void st.saveDesigner()}><Save size={14} />Save look</button>
      <Tip label="Close the Look Designer"><button className="btn sm icon" aria-label="Close the Look Designer" onClick={close}><X size={15} /></button></Tip>
      <Confirm open={confirmClose} onOpenChange={setConfirmClose} title="Discard unsaved changes?" confirmLabel="Discard" danger
        body={<>“{d.name}” has changes that aren't saved. Closing discards them.</>} onConfirm={() => st.closeDesigner()} />
    </div>
  );
}
