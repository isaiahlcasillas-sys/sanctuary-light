import { HelpCircle } from 'lucide-react';
import { useApp } from '../state/store';
import { GroupCards } from './ControlPanel';
import { CuePanel } from './CuePanel';
import { LooksGrid } from './LooksGrid';
import { StageView } from './StageView';
import { SubmasterBank } from './SubmasterBank';

export function VolunteerView() {
  const role = useApp((s) => s.role);
  const mode = useApp((s) => s.status?.mode);
  return (
    <main className="volunteer">
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <div>
          <h1>Good morning! Choose a look.</h1>
          <div className="hint">Tap a button to change the sanctuary lighting. {mode === 'offline' ? 'You are in simulation — practise freely, nothing changes in the room.' : ''}</div>
        </div>
        {!role && <div className="help"><strong>Sign in</strong> with the volunteer PIN (top right) to use the controls.</div>}
        <LooksGrid volunteer />
        <div className="vol-stage"><StageView compact /></div>
      </div>
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <CuePanel volunteer />
        <section className="panel"><div className="panel-head"><h2>Room levels</h2></div><div className="panel-body"><GroupCards volunteerOnly /></div></section>
        <SubmasterBank volunteer />
        <div className="help">
          <div className="row" style={{ marginBottom: 6 }}><HelpCircle size={16} /><strong>If something looks wrong</strong></div>
          The <strong>ETC Eos lighting console</strong> in the booth is always in charge and can override anything here. Ask the lighting lead, or use Eos's normal controls.
          Closing this screen never turns the lights off.
        </div>
      </div>
    </main>
  );
}
