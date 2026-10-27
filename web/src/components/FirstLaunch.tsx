/**
 * First-launch welcome: what Sanctuary Light is doing right now (nothing to the lights), and
 * the path from installation to the first connection. Shown once per computer; reopened from
 * the Setup screen.
 */
import { CheckCircle2, Circle, Eye, FileUp, LayoutGrid, ListChecks, ScanSearch, ShieldCheck } from 'lucide-react';
import { useApp } from '../state/store';
import { Modal } from './ui';
import { SceneStationNotice } from './setup/SceneStationNotice';

const PATH = [
  { icon: <CheckCircle2 size={16} color="var(--ok)" />, title: 'Install', text: 'Done: you\'re running Sanctuary Light.' },
  { icon: <FileUp size={16} />, title: 'Import your Eos show', text: 'Export it from Eos (File → Export → CSV) and drop the file in. Eos isn\'t touched.' },
  { icon: <ListChecks size={16} />, title: 'Review the patch', text: 'See exactly what was imported, what\'s incomplete, and what needs setting up.' },
  { icon: <LayoutGrid size={16} />, title: 'Arrange the sanctuary', text: 'Place fixtures where they really hang. Nothing is placed for you.' },
  { icon: <ScanSearch size={16} />, title: 'Verify the connection', text: 'Connect to Eos on this PC in Monitor mode (read-only) and compare with the running show.' },
];

export function FirstLaunch() {
  const open = useApp((s) => s.welcomeOpen);
  const role = useApp((s) => s.role);
  const close = () => useApp.getState().setWelcomeOpen(false);
  const start = () => { close(); useApp.getState().goToSetup('import'); };
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) close(); }} title="Welcome to Sanctuary Light">
      <div className="card" data-tone="ok" role="status">
        <ShieldCheck size={15} style={{ verticalAlign: -3 }} /> <strong>You're in Offline Simulation (SIM).</strong> Nothing you do here reaches Eos or any light. Sanctuary Light always starts this way, and never switches to Live by itself.
      </div>
      <ol className="welcome-path">
        {PATH.map((p, i) => (
          <li key={p.title}><span className="wf-icon">{i === 0 ? p.icon : <Circle size={16} />}</span><div><strong>{p.title}</strong><div className="hint">{p.text}</div></div></li>
        ))}
      </ol>
      <p className="hint"><Eye size={13} style={{ verticalAlign: -2 }} /> Monitor mode only listens to Eos. Sending anything to the lights needs Live mode, which an operator must arm on purpose, later, with the lighting lead present.</p>
      <SceneStationNotice compact />
      {role !== 'operator' && <p className="hint">To start, close this and <strong>Sign in</strong> (top right) with the operator PIN. On a new installation it's <strong>1234</strong>: change it straight away in Settings.</p>}
      <div className="actions">
        <button className="btn" onClick={close}>Close</button>
        {role === 'operator' && <button className="btn primary" onClick={start}><FileUp size={15} />Start: import my Eos show</button>}
      </div>
    </Modal>
  );
}
