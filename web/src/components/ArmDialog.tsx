import { Zap } from 'lucide-react';
import { sendCommand, useApp } from '../state/store';
import { Modal } from './ui';

export function ArmDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const cfg = useApp((s) => s.config);
  const c = cfg?.settings.connection;
  const arm = async () => {
    const r = await sendCommand({ kind: 'setMode', mode: 'eos-live', confirm: true });
    if (r.ok) onOpenChange(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Arm live control of the Ion?"
      description="Live mode sends OSC commands to the console and will change lights in the sanctuary.">
      <ul className="checklist">
        <li>Console: <strong>{c?.consoleIp || 'not set'}</strong> via {c?.transport.toUpperCase()} (Eos {c?.eosVersion || 'version not set'})</li>
        <li>Groups are sent as “Group N” only when the console has confirmed their membership; otherwise each channel is listed explicitly.</li>
        <li>The Ion keeps all DMX output, cues and patch. Sanctuary Light never sends sACN/Art-Net in this mode.</li>
        <li>Fader levels you see are <em>commanded</em>, not confirmed — Eos does not report every channel level back.</li>
        <li>Disconnecting or closing this app never sends a blackout. The Ion stays in its current state.</li>
        <li>Relay/utility channels stay locked until separately unlocked.</li>
      </ul>
      {!c?.consoleIp && <p style={{ color: 'var(--err)' }}>Set the console IP address in Settings → Connection first.</p>}
      <div className="actions">
        <button className="btn" onClick={() => onOpenChange(false)}>Cancel</button>
        <button className="btn danger" disabled={!c?.consoleIp} onClick={arm}><Zap size={16} />Arm Live Control</button>
      </div>
    </Modal>
  );
}
