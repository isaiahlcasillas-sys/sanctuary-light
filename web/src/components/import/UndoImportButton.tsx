/**
 * Undo the last Eos import. If anything was changed after the import (e.g. the stage was
 * arranged), the server refuses first and the operator is asked again before forcing it.
 */
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useApp } from '../../state/store';
import { Confirm } from '../ui';

async function postUndo(force: boolean): Promise<{ ok: boolean; error?: string; changedSince?: boolean }> {
  const token = useApp.getState().token;
  const res = await fetch('/api/import/eos/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ confirm: true, force }),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return res.ok ? { ok: true } : { ok: false, error: data.error, changedSince: data.changedSince };
}

export function UndoImportButton({ fileName, className = 'btn', onDone }: { fileName?: string; className?: string; onDone?(): void }) {
  const [ask, setAsk] = useState(false);
  const [askForce, setAskForce] = useState<string | null>(null);
  const toast = useApp.getState().toast;
  const run = async (force: boolean) => {
    const r = await postUndo(force);
    if (r.ok) { toast('info', 'Import undone: your previous fixtures, groups, looks, cue lists and submasters are back.'); onDone?.(); return; }
    if (r.changedSince && !force) { setAskForce(r.error ?? ''); return; }
    toast('error', r.error ?? 'Undo failed');
  };
  return (
    <>
      <button className={className} onClick={() => setAsk(true)}><Undo2 size={15} />Undo{fileName ? ' last Eos' : ''} import</button>
      <Confirm open={ask} onOpenChange={setAsk} title="Undo the Eos import?" confirmLabel="Undo import"
        body={<>Puts back the fixtures, groups, looks, cue lists and submasters from before importing{fileName ? <> <strong>{fileName}</strong></> : ''}. Settings and the stage layout stay as they are. A backup is saved first. Eos is not affected.</>}
        onConfirm={() => void run(false)} />
      <Confirm open={askForce !== null} onOpenChange={(o) => !o && setAskForce(null)} danger title="Undo anyway?" confirmLabel="Undo anyway"
        body={<>{askForce} A backup of the current setup is still saved first.</>}
        onConfirm={() => void run(true)} />
    </>
  );
}
