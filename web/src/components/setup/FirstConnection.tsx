/**
 * Step 6: First Real Connection — the supervised path to the first live command on the
 * sanctuary's Windows 11 PC. Every step is either an operator confirmation or a link to the
 * screen that does it. Nothing here sends a lighting command; the single live test happens
 * only in the Eos Setup Wizard, with three acknowledgements and the channel typed in.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, CircleAlert, ExternalLink, ShieldCheck } from 'lucide-react';
import { firstConnectionSteps, type WorkflowStep } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { AREA_LABELS } from '../../lib/setup';
import { sendCommand, useApp, type SetupStep } from '../../state/store';
import { ApplyToEosDialog } from '../studio/ApplyToEosDialog';
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
      <LiveLookTest />
    </div>
  );
}

/**
 * Live look test: a look designed in Sanctuary Light, applied to ONE approved, non-critical
 * fixture through Eos, with the operator recording what physically happened. Nothing here
 * sends anything by itself; Apply to Eos opens the usual confirmation dialog.
 */
function LiveLookTest() {
  const config = useApp((s) => s.config)!;
  const mode = useApp((s) => s.status?.mode ?? 'offline');
  const tf = config.settings.commissioning.firstConnection?.testFixture;
  const result = config.settings.commissioning.liveLookTest;
  const fixture = tf ? config.fixtures.find((f) => f.channel === tf.channel) : undefined;
  const [level, setLevel] = useState(30);
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState('');
  const [block, setBlock] = useState<string | null>(null);
  const lookId = fixture ? `live-test-${fixture.channel}` : '';
  const look = config.looks.find((l) => l.id === lookId);
  const toast = useApp.getState().toast;

  useEffect(() => {
    if (!look) { setBlock(null); return; }
    api.get<{ block: string | null }>(`/api/live/plan?lookId=${encodeURIComponent(look.id)}`).then((r) => setBlock(r.block), () => setBlock(null));
  }, [look, mode]);

  if (!fixture) return (
    <section className="card live-test"><h3>Live look test</h3><p className="hint">First choose the one approved test fixture (step 6 above).</p></section>
  );
  const createLook = async () => {
    const next = {
      id: lookId, name: `Live test · ${fixture.label}`, description: `One-fixture live test of channel ${fixture.channel}.`, icon: 'lamp', gradient: ['#1e293b', '#475569'] as [string, string],
      action: { type: 'none' as const }, preview: [], volunteerVisible: false, approval: null, collection: 'Special Events', fadeSeconds: 0,
      fixtures: [{ channel: fixture.channel, intensity: level }], updatedAt: Date.now(),
    };
    try {
      await api.put('/api/config/looks', look ? config.looks.map((l) => (l.id === lookId ? { ...l, ...next } : l)) : [...config.looks, next]);
      toast('info', `Test look saved: channel ${fixture.channel} at ${level}%. Nothing was sent.`);
    } catch (e) { toast('error', (e as Error).message); }
  };
  const recordResult = async (responded: boolean | null) => {
    try {
      await api.post('/api/first-connection', { step: 'liveLookTest', lookId, channel: fixture.channel, level: look?.fixtures?.[0]?.intensity ?? level, responded, note });
      toast('info', 'Result recorded. Add it to docs/TESTING_EVIDENCE.md too.');
    } catch (e) { toast('error', (e as Error).message); }
  };
  const lvl = look?.fixtures?.[0]?.intensity ?? level;

  return (
    <section className="card live-test">
      <h3>Live look test: one fixture, through Eos</h3>
      <p className="hint">Outside worship and rehearsals, with someone at Eos and someone watching the room. Uses only the approved test fixture: <strong>{fixture.channel} · {fixture.label}</strong> (approved by {tf!.approvedBy}).</p>
      <ol className="workflow-mini">
        <li>
          <strong>Make the test look</strong> at a modest level:{' '}
          <input className="input num" type="number" min={5} max={50} value={level} aria-label="Test level percent" onChange={(e) => setLevel(Math.max(5, Math.min(50, Number(e.target.value) || 30)))} />%{' '}
          <button className="btn sm" onClick={() => void createLook()}>{look ? 'Update test look' : 'Create test look'}</button>
          {look && <span className="hint"> Saved: channel {fixture.channel} at {lvl}%.</span>}
        </li>
        <li><strong>Preview it in SIM</strong> (stage picture only): <button className="btn sm" disabled={!look} onClick={() => void sendCommand({ kind: 'fireLook', lookId })}>Preview</button></li>
        <li><strong>Verify with Eos in Monitor</strong> in this session (Verify with Eos → Read from Eos). Apply is refused until the patch matches.</li>
        <li><strong>Arm LIVE</strong> in the top bar (operator PIN and confirmation).</li>
        <li>
          <strong>Apply to Eos:</strong>{' '}
          <button className="btn sm danger" disabled={!look || mode !== 'eos-live' || !!block} onClick={() => setApplying(true)}>Apply test look to Eos…</button>
          {look && block && <div className="hint">{block}</div>}
        </li>
        <li>
          <strong>What did the light do?</strong> Watch the fixture and the Eos Live display.
          <div className="row wrap" style={{ marginTop: 6 }}>
            <input className="input" style={{ minWidth: 260 }} placeholder="Note (optional): what you saw" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            <button className="btn sm" onClick={() => void recordResult(true)}>It came on at about {lvl}%</button>
            <button className="btn sm" onClick={() => void recordResult(false)}>Nothing changed</button>
            <button className="btn sm" onClick={() => void recordResult(null)}>Something else happened</button>
          </div>
          {result && <div className="hint" style={{ marginTop: 6 }}>Last result {new Date(result.at).toLocaleString()}: channel {result.channel} at {result.level}%: {result.operatorConfirmedLight === true ? 'came on' : result.operatorConfirmedLight === false ? 'nothing changed' : 'something else happened'}{result.note ? ` (“${result.note}”)` : ''}.</div>}
        </li>
        <li><strong>Give the channel back to Eos</strong> (on Eos): <code>[Chan] {fixture.channel} [Sneak] [Enter]</code>, then switch Sanctuary Light to <strong>SIM</strong>. Don't use Go To Cue 0 or Clear.</li>
      </ol>
      {applying && look && <ApplyToEosDialog look={look} onClose={() => setApplying(false)} />}
    </section>
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
