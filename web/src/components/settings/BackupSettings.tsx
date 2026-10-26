import { useRef, useState } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { api, downloadText } from '../../lib/api';
import { useApp } from '../../state/store';
import { Confirm } from '../ui';

export function BackupSettings() {
  const [restore, setRestore] = useState<unknown>(null);
  const [reset, setReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useApp.getState().toast;

  const download = async () => {
    try { downloadText(`sanctuary-light-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await api.get('/api/backup'), null, 2)); }
    catch (e) { toast('error', (e as Error).message); }
  };

  return (
    <div>
      <h4>Backup &amp; restore</h4>
      <p className="hint">Backups contain Sanctuary Light's layout, patch, groups, looks, cue labels and settings. They never include or modify the Ion show file. A copy is also saved automatically in <code>data/backups/</code> every time anything is saved.</p>
      <div className="row wrap">
        <button className="btn" onClick={download}><Download size={16} />Download backup</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          try { setRestore(JSON.parse(await f.text())); } catch { toast('error', 'That file is not valid JSON'); }
        }} />
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} />Restore from file…</button>
        <button className="btn danger" onClick={() => setReset(true)}><RotateCcw size={16} />Reset to sample configuration</button>
      </div>
      <Confirm open={restore !== null} onOpenChange={(o) => !o && setRestore(null)} danger title="Restore this backup?" confirmLabel="Restore"
        body="This replaces the current layout, patch, looks and settings in Sanctuary Light. The current configuration is backed up first. The Ion is not affected."
        onConfirm={async () => {
          try { await api.post('/api/restore', { confirm: true, backup: restore }); toast('info', 'Backup restored.'); }
          catch (e) { toast('error', (e as Error).message); }
          setRestore(null);
        }} />
      <Confirm open={reset} onOpenChange={setReset} danger title="Reset to the sample configuration?" confirmLabel="Reset"
        body="Replaces everything with the built-in LTUMC sample patch and looks. The current configuration is backed up first."
        onConfirm={async () => {
          try { await api.post('/api/config/reset', { confirm: true }); toast('info', 'Configuration reset.'); }
          catch (e) { toast('error', (e as Error).message); }
        }} />
    </div>
  );
}
