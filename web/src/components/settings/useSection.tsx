import { useEffect, useState } from 'react';
import type { AppConfig } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { useApp } from '../../state/store';

/** Records the server writes by itself; a form never edits or overwrites them. */
function withServerOwned<K extends keyof AppConfig>(key: K, value: AppConfig[K], remote: AppConfig[K]): AppConfig[K] {
  if (key !== 'settings') return value;
  return { ...(value as AppConfig['settings']), commissioning: (remote as AppConfig['settings']).commissioning } as AppConfig[K];
}

/**
 * Local editable copy of one config section, with save/revert.
 * When the server changes the section (another browser, or a recorded test result),
 * an untouched form follows it; a form with unsaved edits keeps them.
 */
export function useSection<K extends keyof AppConfig>(key: K) {
  const remote = useApp((s) => s.config![key]);
  const [draft, setDraft] = useState<AppConfig[K]>(remote);
  const [base, setBase] = useState<AppConfig[K]>(remote);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const untouched = JSON.stringify(draft) === JSON.stringify(base);
    setDraft(untouched ? remote : withServerOwned(key, draft, remote));
    setBase(remote);
  }, [remote]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(remote);
  const save = async (value: AppConfig[K] = draft) => {
    setSaving(true);
    try {
      await api.put(`/api/config/${key}`, withServerOwned(key, value, useApp.getState().config![key]));
      useApp.getState().toast('info', 'Saved on this computer.');
      return true;
    } catch (e) {
      useApp.getState().toast('error', (e as Error).message);
      return false;
    } finally { setSaving(false); }
  };
  return { draft, setDraft, dirty, save, saving, revert: () => setDraft(remote) };
}

export function SaveBar({ dirty, saving, onSave, onRevert }: { dirty: boolean; saving: boolean; onSave(): void; onRevert(): void }) {
  return (
    <div className="row" style={{ position: 'sticky', bottom: -18, background: 'var(--panel)', padding: '12px 0', borderTop: '1px solid var(--line)', marginTop: 12 }}>
      <span className="hint">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
      <span className="spacer" />
      <button className="btn" disabled={!dirty || saving} onClick={onRevert}>Revert</button>
      <button className="btn primary" disabled={!dirty || saving} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
