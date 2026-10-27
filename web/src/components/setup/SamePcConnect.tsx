/**
 * Guided connection to Eos/ETCnomad running on this same Windows PC, for Show Verification.
 * Everything here is either a local setting or Monitor mode (listen-only): no lighting
 * command can be sent, and Live mode is never turned on.
 */
import { useState } from 'react';
import { CheckCircle2, Circle, Eye, Monitor, PlugZap } from 'lucide-react';
import { checkConnectionCompat, eosCapabilities, isLoopback, recommendConnection, type AppConfig } from '@sanctuary/shared';
import { api } from '../../lib/api';
import { sendCommand, useApp } from '../../state/store';

type Settings = AppConfig['settings'];

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li data-state={done ? 'done' : 'todo'}>
      <span className="wf-icon">{done ? <CheckCircle2 size={20} color="var(--ok)" /> : <Circle size={20} />}</span>
      <div className="grow"><div className="wf-title">{n}. {title}</div>{children}</div>
    </li>
  );
}

export function SamePcConnect() {
  const config = useApp((s) => s.config)!;
  const status = useApp((s) => s.status);
  const toast = useApp.getState().toast;
  const c = config.settings.connection;
  const [version, setVersion] = useState(c.eosVersion);
  const [readOnEos, setReadOnEos] = useState(false);
  const caps = eosCapabilities(version);
  const offline = (status?.mode ?? 'offline') === 'offline';
  const versionSaved = !!c.eosVersion && eosCapabilities(c.eosVersion).known && !!config.settings.commissioning.versionConfirmedAt;
  const local = isLoopback(c.consoleIp);
  const rec = recommendConnection(c.eosVersion);
  const compat = checkConnectionCompat(c);
  const reported = status?.connection.consoleVersion;

  const save = async (next: Settings, message: string) => {
    try { await api.put('/api/config/settings', next); toast('info', message); return true; }
    catch (e) { toast('error', (e as Error).message); return false; }
  };
  const saveVersion = () => {
    const r = recommendConnection(version);
    void save({
      ...config.settings,
      connection: { ...c, eosVersion: version, transport: r.transport, ...(r.transport === 'udp' ? {} : { tcpPort: r.port }) },
      commissioning: { ...config.settings.commissioning, versionConfirmedAt: Date.now() },
    }, `Saved Eos ${version}. Connection set to: ${r.summary}`);
  };
  const useThisPc = () => void save({ ...config.settings, connection: { ...c, consoleIp: '127.0.0.1' } }, 'Eos is on this PC: Sanctuary Light will use 127.0.0.1 (nothing leaves this computer).');

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}><Monitor size={18} style={{ verticalAlign: -3 }} /> Connect to Eos on this PC (read-only)</h3>
      <p className="hint">For ETCnomad running on this same Windows PC. Each step is a setting in Sanctuary Light or a read-only connection. Nothing here can change a light, and Live mode is never turned on.</p>
      {!offline && <p className="hint">Switch to <strong>SIM</strong> to change these settings.</p>}
      <ol className="workflow">
        <Step n={1} done={versionSaved} title="Which Eos version is running?">
          <p className="hint">In Eos open <strong>Browser → Help → About</strong> and type the version exactly as shown (for example <code>3.2.12</code>).</p>
          <div className="row wrap">
            <input className="input" style={{ width: 160 }} aria-label="Eos version" placeholder="e.g. 3.2.12" value={version} disabled={!offline} onChange={(e) => setVersion(e.target.value.trim())} />
            <label className="row"><input type="checkbox" checked={readOnEos} onChange={(e) => setReadOnEos(e.target.checked)} />I read this in Eos just now</label>
            <button className="btn sm primary" disabled={!offline || !caps.known || !readOnEos} onClick={saveVersion}>Save version</button>
          </div>
          {version && !caps.known && <p style={{ color: 'var(--err)' }}>That doesn't look like an Eos version number.</p>}
          {reported && <p className="hint">Eos reported version <strong>{reported}</strong> on the last connection.{status?.versionMismatch ? ` ${status.versionMismatch}` : ''}</p>}
        </Step>
        <Step n={2} done={local} title="Eos runs on this PC">
          <div className="row wrap">
            <button className="btn sm" disabled={!offline || local} onClick={useThisPc}>{local ? 'Using 127.0.0.1 (this PC)' : 'Eos is on this PC: use 127.0.0.1'}</button>
            {!local && c.consoleIp && <span className="hint">Currently set to {c.consoleIp} (another computer).</span>}
          </div>
          {[...compat.errors, ...compat.warnings].map((m) => <p key={m} className="hint" style={{ color: compat.errors.includes(m) ? 'var(--err)' : 'var(--warn)' }}>{m}</p>)}
        </Step>
        <Step n={3} done={!offline && status?.connection.state === 'connected'} title="Check OSC is on in Eos (with the console person)">
          {versionSaved ? (
            <>
              <p className="hint">Sanctuary Light will use: {rec.summary}</p>
              <ul className="hint" style={{ paddingLeft: 18, margin: '4px 0' }}>{rec.consoleSteps.map((s) => <li key={s}>{s}</li>)}</ul>
              <p className="hint">Only these OSC settings. Don't change the patch, the outputs, or anything about the Gadget II or DMX.</p>
            </>
          ) : <p className="hint">Save the version first: the Eos settings depend on it.</p>}
        </Step>
        <Step n={4} done={!offline && status?.connection.state === 'connected' && !status.connection.stale} title="Connect in Monitor mode">
          <div className="row wrap">
            <button className="btn sm primary" disabled={!offline || !versionSaved || !c.consoleIp || compat.errors.length > 0} onClick={() => void sendCommand({ kind: 'setMode', mode: 'eos-monitor' })}><Eye size={14} />Connect in Monitor (read-only)</button>
            <button className="btn sm" disabled={offline} onClick={() => void sendCommand({ kind: 'testConnection' })}><PlugZap size={14} />Run connection test</button>
          </div>
          {!offline && <p className="hint">Connection: <strong>{status?.connection.state}</strong>{status?.connection.stale ? ' (stale)' : ''}: {status?.connection.detail}</p>}
          <p className="hint">Monitor mode only sends read-only queries. If Eos doesn't answer, check step 3 and that Eos is open; switching back to SIM never sends anything.</p>
        </Step>
      </ol>
    </div>
  );
}
