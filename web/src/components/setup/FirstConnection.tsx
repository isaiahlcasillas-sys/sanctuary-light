/**
 * Step 6: First Real Connection — the supervised path to the first live command on the
 * sanctuary's Windows 11 PC. Every step is either an operator confirmation or a link to the
 * screen that does it. Nothing here sends a lighting command; the single live test happens
 * only in the Eos Setup Wizard, with three acknowledgements and the channel typed in.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, CircleAlert, ExternalLink, ShieldCheck } from 'lucide-react';
import { firstConnectionSteps, type WorkflowStep } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { AREA_LABELS } from '../../lib/setup';
import { useApp, type SetupStep } from '../../state/store';
import { StepHeader } from './SanctuarySetup';

const ICON = { done: <CheckCircle2 size={20} color="var(--ok)" />, todo: <Circle size={20} />, attention: <CircleAlert size={20} color="var(--warn)" /> };

export function FirstConnection({ goTo }: { goTo(step: SetupStep): void }) {
  const config = useApp((s) => s.config)!;
  const steps = firstConnectionSteps(config);
  const toast = useApp.getState().toast;
  const post = async (body: Record<string, unknown>) => {
    try { await api.post('/api/first-connection', body); return true; }
    catch (e) { toast('error', (e as Error).message); return false; }
  };

  const action = (s: WorkflowStep) => {
    switch (s.id) {
      case 'backup':
        return <label className="row"><input type="checkbox" checked={s.state === 'done'} onChange={(e) => void post({ step: 'backup', done: e.target.checked })} />I saved the Eos show (File → Save, then Save As to USB) today</label>;
      case 'import':
        return <div className="row wrap"><button className="btn sm" onClick={() => goTo('import')}>Open Import</button>
          {config.eosShow && <label className="row"><input type="checkbox" checked={s.state === 'done'} onChange={(e) => void post({ step: 'genuine', done: e.target.checked })} />“{config.eosShow.fileName}” is a genuine export from our sanctuary's Eos</label>}</div>;
      case 'inspect': return <button className="btn sm" onClick={() => goTo('review')}>Open Review Fixtures</button>;
      case 'monitor': return <button className="btn sm" onClick={() => useApp.getState().openWizard(1)}><ExternalLink size={13} />Eos Setup Wizard (version → network → Monitor test)</button>;
      case 'compare': return <button className="btn sm" onClick={() => goTo('verify')}>Open Show Verification</button>;
      case 'choose': return <TestFixturePicker />;
      case 'live': return <button className="btn sm" disabled={steps.find((x) => x.id === 'choose')?.state !== 'done'} onClick={() => useApp.getState().openWizard(4)}><ExternalLink size={13} />Open the supervised Live test</button>;
    }
  };

  const done = steps.filter((s) => s.state === 'done').length;
  return (
    <div>
      <StepHeader title="First real connection" intro="The careful path from 'imported' to 'one light changed on purpose', for the sanctuary's Windows 11 PC. Do it on a weekday, outside worship and events, with someone at Eos and someone watching the room. Nothing on this page sends a lighting command." />
      <div className="card" data-tone="warn">
        <ShieldCheck size={15} style={{ verticalAlign: -3 }} /> <strong>Safety for the whole test:</strong> Sanctuary Light never stops Eos, never changes DMX output, and never touches SceneStation, the Gadget II or the wireless DMX. Relay and house-light channels can't be chosen for the test. Closing Sanctuary Light or switching to SIM never sends anything.
      </div>
      <div className="hint" style={{ margin: '8px 0' }}>{done} of {steps.length} steps done.</div>
      <ol className="workflow">
        {steps.map((s, i) => (
          <li key={s.id} data-state={s.state}>
            <span className="wf-icon">{ICON[s.state]}</span>
            <div className="grow">
              <div className="wf-title">{i + 1}. {s.title}</div>
              <div className="hint">{s.detail}</div>
              <div style={{ marginTop: 6 }}>{action(s)}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="hint">Results from the FAKE simulator or from sample files are never counted as evidence about the real console. Step 2 and step 5 ask specifically for the sanctuary's own Eos.</p>
    </div>
  );
}

function TestFixturePicker() {
  const config = useApp((s) => s.config)!;
  const chosen = config.settings.commissioning.firstConnection?.testFixture;
  const profiles = useMemo(() => new Map(config.profiles.map((p) => [p.id, p])), [config.profiles]);
  const eligible = config.fixtures.filter((f) => !f.protected && f.area !== 'house' && f.area !== 'utility' && !profiles.get(f.profileId)?.capabilities.includes('relay'));
  const [channel, setChannel] = useState<number | ''>(chosen?.channel ?? '');
  const [who, setWho] = useState(chosen?.approvedBy ?? '');
  const save = async () => {
    try {
      await api.post('/api/first-connection', { step: 'testFixture', channel, approvedBy: who });
      useApp.getState().toast('info', `Channel ${channel} recorded as the approved test fixture. Nothing was sent.`);
    } catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };
  return (
    <div className="row wrap">
      <select className="select" style={{ width: 'auto', minWidth: 260 }} value={channel} aria-label="Test fixture" onChange={(e) => setChannel(e.target.value ? Number(e.target.value) : '')}>
        <option value="">Choose a harmless, visible light…</option>
        {eligible.map((f) => <option key={f.channel} value={f.channel}>{f.channel} · {f.label} ({AREA_LABELS[f.area]})</option>)}
      </select>
      <input className="input" style={{ width: 200 }} placeholder="Approved by (name)" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Approved by" />
      <button className="btn sm primary" disabled={!channel || !who.trim()} onClick={() => void save()}>Record</button>
      <span className="hint">Relays, utility and house lights are excluded: house lights matter to SceneStation.</span>
    </div>
  );
}
