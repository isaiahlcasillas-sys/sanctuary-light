import { useState } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../state/store';
import { Switch } from '../ui';
import { SaveBar, useSection } from './useSection';

export function SecuritySettings() {
  const { draft, setDraft, dirty, save, saving, revert } = useSection('settings');
  const defaults = useApp((s) => s.status?.defaultPinsInUse);
  const [pins, setPins] = useState({ operator: '', volunteer: '' });
  const s = draft.safety;
  const set = (patch: Partial<typeof s>) => setDraft({ ...draft, safety: { ...s, ...patch } });

  const changePin = async (role: 'operator' | 'volunteer') => {
    try {
      await api.post('/api/auth/pin', { role, pin: pins[role] });
      setPins({ ...pins, [role]: '' });
      useApp.getState().toast('info', `${role === 'operator' ? 'Operator' : 'Volunteer'} PIN changed.`);
    } catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  return (
    <div>
      <h4>Safety</h4>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="row"><Switch checked={s.requireConfirmToArm} onChange={(v) => set({ requireConfirmToArm: v })} label="Require confirmation to arm live" /><span>Require a confirmation dialog before arming live control</span></div>
        <label className="row">Protected channels unlock for <input className="input num" type="number" min={1} max={60} value={s.protectedUnlockMinutes} onChange={(e) => set({ protectedUnlockMinutes: Number(e.target.value) })} /> minutes</label>
        <div className="row"><Switch checked={s.localhostOnly} onChange={(v) => set({ localhostOnly: v })} label="Localhost only" /><span>Only allow browsers on this computer (restart required). Turn off to allow tablets on the church network.</span></div>
      </div>
      <ul className="hint">
        <li>The app always starts in Offline Simulation. Live mode is never restored automatically.</li>
        <li>Switching modes, disconnecting or closing the app never sends a blackout or release.</li>
        <li>Monitor mode can only send ping and read-only data queries; this is enforced at the network layer.</li>
        <li>Mark relay/utility channels as <em>Protected</em> in the Patch tab. Architectural (SceneStation) zones should not be in this app's patch unless the Ion already controls them.</li>
      </ul>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onRevert={revert} />

      <h4 style={{ marginTop: 20 }}>PINs</h4>
      {defaults && <p style={{ color: 'var(--warn)' }}>Default PINs are in use (operator 1234 / volunteer 0000). Change them before using live control.</p>}
      <div className="form-grid">
        {(['operator', 'volunteer'] as const).map((r) => (
          <div key={r} className="card">
            <label className="field"><span>New {r} PIN (4–8 digits)</span>
              <input className="input" type="password" inputMode="numeric" value={pins[r]} onChange={(e) => setPins({ ...pins, [r]: e.target.value.replace(/\D/g, '') })} />
            </label>
            <button className="btn sm" style={{ marginTop: 8 }} disabled={pins[r].length < 4} onClick={() => changePin(r)}>Change {r} PIN</button>
          </div>
        ))}
      </div>
    </div>
  );
}
