/**
 * First-time Eos setup: identify Eos version → network → Monitor test → one explicitly
 * authorized single-channel live test. Each step only acts when the operator presses
 * its button; nothing is sent to the console automatically.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Eye, Lightbulb, Network, ShieldCheck, Undo2, Zap } from 'lucide-react';
import {
  checkConnectionCompat, describeConsoleIp, eosCapabilities, parseEosVersion, recommendConnection, sameSubnet, versionAtLeast,
  type LocalInterface, type Settings,
} from '@sanctuary/shared';
import { api } from '../lib/api';
import { sendCommand, useApp } from '../state/store';
import { Fader, Modal } from './ui';

const STEPS = ['Before you start', 'Eos version', 'Network', 'Monitor test', 'Live test', 'Summary'];

export function SetupWizard({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const config = useApp((s) => s.config);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Settings | null>(null);
  useEffect(() => { if (open && config) { setDraft(structuredClone(config.settings)); setStep(0); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!config || !draft) return null;

  // Merge onto the server's current settings so test results recorded meanwhile are kept.
  const saveSettings = async (next: Settings) => {
    const cur = useApp.getState().config!.settings;
    const merged: Settings = {
      ...cur,
      connection: next.connection,
      commissioning: {
        ...cur.commissioning,
        versionConfirmedAt: next.commissioning.versionConfirmedAt ?? cur.commissioning.versionConfirmedAt,
        networkCheckedAt: next.commissioning.networkCheckedAt ?? cur.commissioning.networkCheckedAt,
        notes: next.commissioning.notes,
      },
    };
    try { await api.put('/api/config/settings', merged); return true; }
    catch (e) { useApp.getState().toast('error', (e as Error).message); return false; }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Eos Setup Wizard" wide>
      <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <strong style={{ fontSize: 16 }}>Eos Setup Wizard</strong>
        <span className="hint">Nothing is sent to Eos until you press a button that says so.</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => onOpenChange(false)}>Close</button>
      </div>
      <div className="settings">
        <nav className="settings-nav" aria-label="Wizard steps">
          {STEPS.map((s, i) => (
            <button key={s} data-state={i === step ? 'active' : undefined} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              {i < step ? <CheckCircle2 size={15} color="var(--ok)" /> : <Circle size={15} />}{i + 1}. {s}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {step === 0 && <IntroStep />}
          {step === 1 && <VersionStep draft={draft} setDraft={setDraft} onSave={saveSettings} />}
          {step === 2 && <NetworkStep draft={draft} setDraft={setDraft} onSave={saveSettings} />}
          {step === 3 && <MonitorStep />}
          {step === 4 && <LiveTestStep />}
          {step === 5 && <SummaryStep onSave={saveSettings} />}
          <div className="row" style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={16} />Back</button>
            <span className="spacer" />
            {step < STEPS.length - 1
              ? <button className="btn primary" onClick={() => setStep(step + 1)}>Next<ChevronRight size={16} /></button>
              : <button className="btn primary" onClick={() => onOpenChange(false)}>Finish</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function IntroStep() {
  return (
    <div>
      <h4>Before you start</h4>
      <p className="hint">Do this outside of services, with someone standing at the Eos computer who can see the room.</p>
      <ul className="checklist">
        <li>Steps 1–3 only read from the console. Step 3 connects in <strong>Monitor (read-only)</strong> mode.</li>
        <li>Step 4 sends <strong>exactly one command</strong> to <strong>one channel</strong> you choose, and only after you confirm it.</li>
        <li>Protected relay/utility channels can't be chosen for the test.</li>
        <li>Disconnecting or closing the wizard never sends anything to Eos.</li>
        <li>Eos stays in charge: anyone at the console can override what this app does.</li>
      </ul>
    </div>
  );
}

function VersionStep({ draft, setDraft, onSave }: { draft: Settings; setDraft(s: Settings): void; onSave(s: Settings): Promise<boolean> }) {
  const [readOnConsole, setReadOnConsole] = useState(false);
  const caps = eosCapabilities(draft.connection.eosVersion);
  const set = (eosVersion: string) => setDraft({ ...draft, connection: { ...draft.connection, eosVersion } });
  return (
    <div>
      <h4>1. Identify the Eos version</h4>
      <p className="hint">In Eos, open <strong>Browser → Help → About</strong> (or the About tab). Type the version number exactly as shown, for example <code>2.9.3</code> or <code>3.2.12</code>.</p>
      <div className="form-grid">
        <label className="field"><span>Eos software version</span>
          <input className="input" autoFocus placeholder="e.g. 2.9.3" value={draft.connection.eosVersion} onChange={(e) => set(e.target.value.trim())} />
        </label>
      </div>
      {caps.known ? (
        <div className="card">
          <ul className="checklist">
            <li>TCP 3032: <strong>{caps.tcp3032}</strong></li>
            <li>TCP 3037 Third Party OSC: <strong>{caps.thirdParty3037}</strong></li>
            <li>Reading version/groups/patch over OSC: <strong>{caps.getApi}</strong></li>
            <li>Cue-list GO/BACK (/eos/cues): <strong>{caps.cueListFireStop === 'verify' ? 'unconfirmed for this version' : caps.cueListFireStop}</strong></li>
          </ul>
          {caps.notes.map((n) => <p key={n} className="hint">• {n}</p>)}
        </div>
      ) : draft.connection.eosVersion ? <p style={{ color: 'var(--err)' }}>That doesn't look like a version number.</p> : null}
      <p className="hint">Ion Classic consoles running Windows XP stop at Eos 2.9.x; Windows 7 Ion Classics and newer consoles can run 3.x.</p>
      <label className="row"><input type="checkbox" checked={readOnConsole} onChange={(e) => setReadOnConsole(e.target.checked)} />I read this version on the console itself.</label>
      <button className="btn primary" style={{ marginTop: 10 }} disabled={!caps.known || !readOnConsole}
        onClick={async () => {
          const rec = recommendConnection(draft.connection.eosVersion);
          const next: Settings = {
            ...draft,
            connection: { ...draft.connection, transport: rec.transport, ...(rec.transport === 'udp' ? {} : { tcpPort: rec.port }) },
            commissioning: { ...draft.commissioning, versionConfirmedAt: Date.now() },
          };
          if (await onSave(next)) { setDraft(next); useApp.getState().toast('info', `Saved Eos ${next.connection.eosVersion}; connection set to the recommended option.`); }
        }}>Save version</button>
    </div>
  );
}

function NetworkStep({ draft, setDraft, onSave }: { draft: Settings; setDraft(s: Settings): void; onSave(s: Settings): Promise<boolean> }) {
  const [ifaces, setIfaces] = useState<LocalInterface[] | null>(null);
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  useEffect(() => { api.get<LocalInterface[]>('/api/network/interfaces').then(setIfaces).catch(() => setIfaces([])); }, []);
  const c = draft.connection;
  const set = (patch: Partial<Settings['connection']>) => setDraft({ ...draft, connection: { ...c, ...patch } });
  const ip = describeConsoleIp(c.consoleIp);
  const rec = recommendConnection(c.eosVersion);
  const compat = checkConnectionCompat(c);
  const onSubnet = ifaces?.filter((i) => c.consoleIp && sameSubnet(i.address, c.consoleIp, i.netmask)) ?? [];
  const allChecked = rec.consoleSteps.every((_, i) => checks[i]);
  const sameComputer = c.consoleIp === '127.0.0.1' || c.consoleIp === 'localhost';
  const loopbackDocumented = versionAtLeast(parseEosVersion(c.eosVersion), 3, 2);

  return (
    <div>
      <h4><Network size={16} style={{ verticalAlign: -2 }} /> 2. Network</h4>
      <div className="card">
        <strong>Where does Eos run?</strong>
        <label className="row" style={{ margin: '6px 0' }}>
          <input type="radio" name="eos-where" checked={sameComputer} onChange={() => set({ consoleIp: '127.0.0.1' })} />
          <span><strong>On this computer</strong> (ETCnomad on the same PC as Sanctuary Light). Uses 127.0.0.1; nothing leaves this PC.</span>
        </label>
        <label className="row" style={{ margin: '6px 0' }}>
          <input type="radio" name="eos-where" checked={!sameComputer} onChange={() => set({ consoleIp: '' })} />
          <span><strong>On another console or computer</strong> (e.g. an Eos console). Its IP is in its network settings (ECU/Shell, or Setup → Device Settings → Network on 3.3+).</span>
        </label>
        {sameComputer && !loopbackDocumented && (
          <p style={{ color: 'var(--warn)' }}>127.0.0.1 is documented for Eos 3.2 and later. On Eos {c.eosVersion || 'this version'}, if the Monitor test gets no reply, use this PC's own network address instead:
            {ifaces?.map((i) => <button key={i.address} className="btn sm" style={{ marginLeft: 6 }} onClick={() => set({ consoleIp: i.address })}>{i.address}</button>)}
          </p>
        )}
      </div>
      <div className="form-grid">
        {!sameComputer && <label className="field"><span>Eos console / computer IP address</span><input className="input" placeholder="e.g. 10.101.100.101" value={c.consoleIp} onChange={(e) => set({ consoleIp: e.target.value.trim() })} /></label>}
        <label className="field"><span>Transport</span>
          <select className="select" value={c.transport} onChange={(e) => set({ transport: e.target.value as typeof c.transport })}>
            <option value="tcp-1.0">TCP — OSC 1.0 (packet-length)</option><option value="tcp-1.1">TCP — OSC 1.1 (SLIP)</option><option value="udp">UDP</option>
          </select>
        </label>
        {c.transport !== 'udp' && <label className="field"><span>TCP port</span><input className="input" type="number" value={c.tcpPort} onChange={(e) => set({ tcpPort: Number(e.target.value) })} /></label>}
        <label className="field"><span>OSC user (recommended: a spare user number)</span><input className="input" type="number" value={c.oscUser ?? ''} onChange={(e) => set({ oscUser: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      </div>
      {c.consoleIp && !ip.ok && <p style={{ color: 'var(--err)' }}>{ip.note}</p>}
      {ip.note && ip.ok && !sameComputer && <p style={{ color: 'var(--warn)' }}>{ip.note}</p>}
      <div className="card">
        <strong>This computer</strong>
        {ifaces == null ? <div className="hint">Checking…</div> : ifaces.length === 0 ? <div className="hint">No network interfaces found.</div> : (
          <ul className="checklist">{ifaces.map((i) => <li key={i.name + i.address}>{i.name}: <code>{i.address}</code> / {i.netmask}{c.consoleIp && sameSubnet(i.address, c.consoleIp, i.netmask) ? ' — same subnet as Eos ✓' : ''}</li>)}</ul>
        )}
        {c.consoleIp && ip.ok && c.consoleIp !== '127.0.0.1' && ifaces && ifaces.length > 0 && onSubnet.length === 0 && (
          <p style={{ color: 'var(--warn)' }}>No interface on this computer is on the same subnet as {c.consoleIp}. Unless a router connects them, Eos will be unreachable.</p>
        )}
        {c.transport === 'udp' && onSubnet[0] && <p className="hint">For UDP, set Eos's OSC UDP TX IP address to <code>{onSubnet[0].address}</code>.</p>}
      </div>
      {(compat.errors.length > 0 || compat.warnings.length > 0) && (
        <div className="card" role="alert">
          {compat.errors.map((e) => <div key={e} style={{ color: 'var(--err)' }}>✕ {e}</div>)}
          {compat.warnings.map((w) => <div key={w} style={{ color: 'var(--warn)' }}>⚠ {w}</div>)}
        </div>
      )}
      <div className="card">
        <strong>In Eos {c.eosVersion || '(version ?)'}</strong>
        <p className="hint">{rec.summary}</p>
        {rec.consoleSteps.map((s, i) => (
          <label key={s} className="row" style={{ alignItems: 'flex-start', margin: '6px 0' }}>
            <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks({ ...checks, [i]: e.target.checked })} /><span>{s}</span>
          </label>
        ))}
      </div>
      <button className="btn primary" disabled={!ip.ok || compat.errors.length > 0 || !allChecked}
        onClick={async () => {
          const next = { ...draft, commissioning: { ...draft.commissioning, networkCheckedAt: Date.now() } };
          if (await onSave(next)) { setDraft(next); useApp.getState().toast('info', 'Network settings saved on this computer.'); }
        }}>Save network settings</button>
      {!allChecked && <span className="hint" style={{ marginLeft: 10 }}>Tick each console step once done.</span>}
    </div>
  );
}

function MonitorStep() {
  const status = useApp((s) => s.status);
  const config = useApp((s) => s.config)!;
  const mt = config.settings.commissioning.monitorTest;
  const conn = status?.connection;
  const gv = Object.values(status?.groupVerification ?? {}).filter((g) => g.state !== 'not-applicable');
  return (
    <div>
      <h4><Eye size={16} style={{ verticalAlign: -2 }} /> 3. Monitor (read-only) test</h4>
      <p className="hint">Monitor mode connects and listens. Only ping and read-only queries are allowed out; lighting commands are blocked at the network layer.</p>
      <div className="row wrap">
        <button className="btn" disabled={status?.mode === 'eos-monitor'} onClick={() => void sendCommand({ kind: 'setMode', mode: 'eos-monitor' })}>Connect in Monitor mode</button>
        <button className="btn primary" disabled={status?.mode === 'offline'} onClick={() => void sendCommand({ kind: 'testConnection' })}>Run connection test</button>
        <button className="btn" disabled={status?.mode === 'offline'} onClick={() => void sendCommand({ kind: 'verifyGroups' })}>Verify Eos groups</button>
      </div>
      <div className="card">
        <div>Connection: <strong>{status?.mode === 'offline' ? 'offline' : conn?.state}</strong>{conn?.stale && status?.mode !== 'offline' ? ' (stale)' : ''} — <span className="hint">{conn?.detail}</span></div>
        {conn?.consoleVersion && <div>Console reports Eos <strong>{conn.consoleVersion}</strong>{conn.showName ? ` · show “${conn.showName}”` : ''}</div>}
        {status?.versionMismatch && <div style={{ color: 'var(--warn)' }}>⚠ {status.versionMismatch}</div>}
        <div>Cue feedback: <strong>{status?.feedback.capabilities.activeCue?.status}</strong> <span className="hint">{status?.feedback.capabilities.activeCue?.note}</span></div>
        <div>GO/BACK: <span className="hint">{status?.goBack.note}</span></div>
      </div>
      {mt && (
        <div className="card">
          <strong>Last test {new Date(mt.at).toLocaleString()}:</strong> {mt.ok ? <span style={{ color: 'var(--ok)' }}>passed</span> : <span style={{ color: 'var(--err)' }}>failed</span>} — {mt.detail}
        </div>
      )}
      {gv.length > 0 && <GroupTable />}
      <p className="hint">In Eos, press GO on a harmless cue: the cue card in Sanctuary Light should update with a green CONSOLE badge.</p>
    </div>
  );
}

export function GroupTable() {
  const status = useApp((s) => s.status);
  const groups = useApp((s) => s.config?.groups ?? []);
  return (
    <table className="data-table" style={{ marginTop: 8 }}>
      <thead><tr><th>Group</th><th>Eos group</th><th>Verification</th><th>Detail</th></tr></thead>
      <tbody>
        {groups.map((g) => {
          const v = status?.groupVerification[g.id];
          return (
            <tr key={g.id}>
              <td>{g.name}</td><td>{g.eosGroup ?? '—'}</td>
              <td><GroupBadge state={v?.state ?? 'unverified'} /></td>
              <td className="hint">{v?.detail}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function GroupBadge({ state }: { state: string }) {
  const cls = state === 'verified' ? 'confirmed' : state === 'not-applicable' ? '' : state === 'unverified' ? 'warn' : 'err';
  const label = state === 'not-applicable' ? 'channels' : state;
  return <span className={`badge ${cls}`}>{label}</span>;
}

function LiveTestStep() {
  const status = useApp((s) => s.status);
  const config = useApp((s) => s.config)!;
  const candidates = useMemo(() => config.fixtures.filter((f) => !f.protected), [config.fixtures]);
  const [channel, setChannel] = useState<number>(candidates.find((f) => f.area === 'front')?.channel ?? candidates[0]?.channel ?? 0);
  const [level, setLevel] = useState(50);
  const [typed, setTyped] = useState('');
  const [acks, setAcks] = useState([false, false, false]);
  const lt = config.settings.commissioning.liveTest;
  const live = status?.mode === 'eos-live';
  const connected = status?.connection.state === 'connected' && !status.connection.stale;
  const fixture = config.fixtures.find((f) => f.channel === channel);
  const ready = connected && acks.every(Boolean) && Number(typed) === channel;

  const setConfirmed = async (v: boolean) => {
    if (!lt) return;
    const s = config.settings;
    try { await api.put('/api/config/settings', { ...s, commissioning: { ...s.commissioning, liveTest: { ...lt, operatorConfirmedLight: v } } }); }
    catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  return (
    <div>
      <h4><Lightbulb size={16} style={{ verticalAlign: -2 }} /> 4. Single-channel live test</h4>
      <p className="hint">This sends one command, <code>Chan {channel || '?'} At {level}</code>, to Eos. Choose a channel whose light is easy to see and harmless to turn on.</p>
      {!connected && <p style={{ color: 'var(--warn)' }}>Complete the Monitor test first. The console must be connected and responding.</p>}
      <div className="form-grid">
        <label className="field"><span>Channel (protected channels are excluded)</span>
          <select className="select" value={channel} onChange={(e) => { setChannel(Number(e.target.value)); setTyped(''); }}>
            {candidates.map((f) => <option key={f.id} value={f.channel}>{f.channel} — {f.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Level: {level}%</span><Fader label="Test level" min={1} max={100} value={level} onChange={setLevel} /></label>
      </div>
      <div className="card">
        {[
          'Someone is at the Eos computer and can see the room.',
          `Channel ${channel} (${fixture?.label ?? '?'}) is a light, not a relay or anything that switches power.`,
          'Nobody is on a ladder or lift, and no service or event is in progress.',
        ].map((t, i) => (
          <label key={i} className="row" style={{ margin: '6px 0' }}>
            <input type="checkbox" checked={acks[i]} onChange={(e) => setAcks(acks.map((a, j) => (j === i ? e.target.checked : a)))} />{t}
          </label>
        ))}
        <label className="field" style={{ maxWidth: 260, marginTop: 8 }}><span>Type the channel number to confirm</span>
          <input className="input" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <div className="row wrap">
        <button className="btn danger" disabled={!ready || live} onClick={() => void sendCommand({ kind: 'setMode', mode: 'eos-live', confirm: true })}><Zap size={15} />1. Arm Live Control</button>
        <button className="btn danger" disabled={!ready || !live} onClick={() => void sendCommand({ kind: 'singleChannelTest', channel, level, confirmChannel: Number(typed) })}><Lightbulb size={15} />2. Send Chan {channel} At {level}</button>
        <button className="btn" disabled={!live || !lt} onClick={() => void sendCommand({ kind: 'release', target: { type: 'channels', channels: [lt!.channel] } })}><Undo2 size={15} />3. Release (Sneak)</button>
        <button className="btn" disabled={status?.mode !== 'eos-live'} onClick={() => void sendCommand({ kind: 'setMode', mode: 'eos-monitor' })}><ShieldCheck size={15} />4. Back to Monitor</button>
      </div>
      {lt && (
        <div className="card">
          <div>Sent <strong>Chan {lt.channel} At {lt.level}</strong> at {new Date(lt.at).toLocaleTimeString()}{lt.released ? ' · released' : ''}.</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span>Did channel {lt.channel} come on in the room?</span>
            <button className={`btn sm ${lt.operatorConfirmedLight === true ? 'active' : ''}`} onClick={() => setConfirmed(true)}>Yes</button>
            <button className={`btn sm ${lt.operatorConfirmedLight === false ? 'active' : ''}`} onClick={() => setConfirmed(false)}>No</button>
          </div>
          {lt.operatorConfirmedLight === false && <p className="hint">Check the OSC user, that OSC RX is enabled, and the Traffic Log. Use Eos to restore the channel if needed.</p>}
        </div>
      )}
      <p className="hint">"Release" sends <code>Chan {channel} Sneak</code>, which returns the channel to what the current cue says. You can also do this in Eos.</p>
    </div>
  );
}

function SummaryStep({ onSave }: { onSave(s: Settings): Promise<boolean> }) {
  const config = useApp((s) => s.config)!;
  const s = config.settings;
  const c = s.commissioning;
  const [notes, setNotes] = useState(c.notes);
  const t = (n: number | null | undefined) => (n ? new Date(n).toLocaleString() : 'not done');
  return (
    <div>
      <h4>5. Summary</h4>
      <table className="data-table">
        <tbody>
          <tr><td>Eos version</td><td>{s.connection.eosVersion || '—'} (confirmed {t(c.versionConfirmedAt)})</td></tr>
          <tr><td>Connection</td><td>{s.connection.consoleIp || '—'} · {s.connection.transport}{s.connection.transport !== 'udp' ? ` port ${s.connection.tcpPort}` : ''} (saved {t(c.networkCheckedAt)})</td></tr>
          <tr><td>Monitor test</td><td>{c.monitorTest ? `${c.monitorTest.ok ? 'passed' : 'failed'} ${t(c.monitorTest.at)} — ${c.monitorTest.detail}` : 'not done'}</td></tr>
          <tr><td>Live test</td><td>{c.liveTest ? `Chan ${c.liveTest.channel} At ${c.liveTest.level} ${t(c.liveTest.at)} · light ${c.liveTest.operatorConfirmedLight == null ? 'not confirmed' : c.liveTest.operatorConfirmedLight ? 'confirmed on' : 'did NOT come on'}${c.liveTest.released ? ' · released' : ''}` : 'not done'}</td></tr>
        </tbody>
      </table>
      <label className="field" style={{ marginTop: 12 }}><span>Commissioning notes (ports changed, key names, anything odd)</span>
        <textarea className="input" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button className="btn" style={{ marginTop: 8 }} onClick={async () => { if (await onSave({ ...s, commissioning: { ...c, notes } })) useApp.getState().toast('info', 'Notes saved.'); }}>Save notes</button>
      <p className="hint">Next: run the remaining checks in docs/COMMISSIONING.md (GO/BACK, submasters, color, relay lock) before using Live mode in a service.</p>
    </div>
  );
}
