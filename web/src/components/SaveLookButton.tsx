import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { newLocalLook, previewFromStage } from '../lib/looks';
import { useApp } from '../state/store';
import { Modal } from './ui';

/** Save what the stage view shows as a new LOCAL look. Never writes to the Ion. */
export function SaveLookButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const save = async () => {
    const { config, levels, toast } = useApp.getState();
    if (!config || !name.trim()) return;
    try {
      await api.put('/api/config/looks', [...config.looks, newLocalLook(name.trim(), previewFromStage(config, levels))]);
      toast('info', `Saved “${name.trim()}” as a local look. It is not stored on the Ion.`);
      setOpen(false); setName('');
    } catch (e) { toast('error', (e as Error).message); }
  };
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} />Save stage as look</button>
      <Modal open={open} onOpenChange={setOpen} title="Save stage as a local look"
        description="Captures the group levels and colors shown on the stage view into a new look button. It lives only in Sanctuary Light — nothing is recorded on the Ion. To play it on real lights, record a cue on the Ion and map this look to it in Settings → Looks.">
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label className="field"><span>Look name</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Easter Morning" /></label>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={!name.trim()}>Save local look</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
