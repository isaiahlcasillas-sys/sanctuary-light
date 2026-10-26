import type { ConnectionSettings as Conn, EosVersion, OscTransport } from '@sanctuary/shared';
import { sendCommand, useApp } from '../../state/store';
import { SaveBar, useSection } from './useSection';

const TRANSPORTS: { v: OscTransport; label: string; port?: number }[] = [
  { v: 'tcp-1.1', label: 'TCP — OSC 1.1 (SLIP) · Eos 2.0+', port: 3037 },
  { v: 'tcp-1.0', label: 'TCP — OSC 1.0 (packet length) · Eos 2.0+', port: 3032 },
  { v: 'udp', label: 'UDP · all Eos versions' },
];

export function ConnectionSettings() {
  const { draft, setDraft, dirty, save, saving, revert } = useSection('settings');
  const status = useApp((s) => s.status);
  const c = draft.connection;
  const set = (patch: Partial<Conn>) => setDraft({ ...draft, connection: { ...c, ...patch } });
  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <div>
      <h4>Console connection</h4>
      <p className="hint">Sanctuary Light talks to the Ion using ETC's documented OSC interface. The Ion keeps its patch, cues and DMX output.</p>
      <div className="form-grid">
        <label className="field"><span>Ion IP address</span><input className="input" placeholder="e.g. 10.101.100.101" value={c.consoleIp} onChange={(e) => set({ consoleIp: e.target.value.trim() })} /></label>
        <label className="field"><span>Eos software version</span>
          <select className="select" value={c.eosVersion} onChange={(e) => {
            const v = e.target.value as EosVersion;
            set(v === '1.x' ? { eosVersion: v, transport: 'udp' } : { eosVersion: v });
          }}>
            <option value="1.x">Eos 1.x (UDP only, no data queries)</option>
            <option value="2.x">Eos 2.x</option>
            <option value="3.x">Eos 3.x</option>
          </select>
        </label>
        <label className="field"><span>Transport</span>
          <select className="select" value={c.transport} onChange={(e) => {
            const t = TRANSPORTS.find((x) => x.v === e.target.value)!;
            set({ transport: t.v, ...(t.port ? { tcpPort: t.port } : {}) });
          }}>
            {TRANSPORTS.map((t) => <option key={t.v} value={t.v} disabled={c.eosVersion === '1.x' && t.v !== 'udp'}>{t.label}</option>)}
          </select>
        </label>
        {c.transport === 'udp' ? (
          <>
            <label className="field"><span>Send to console port (Eos "OSC UDP RX")</span><input className="input" type="number" value={c.udpConsolePort} onChange={(e) => set({ udpConsolePort: num(e.target.value) })} /></label>
            <label className="field"><span>Listen on port (Eos "OSC UDP TX")</span><input className="input" type="number" value={c.udpLocalPort} onChange={(e) => set({ udpLocalPort: num(e.target.value) })} /></label>
          </>
        ) : (
          <label className="field"><span>TCP port</span><input className="input" type="number" value={c.tcpPort} onChange={(e) => set({ tcpPort: num(e.target.value) })} /></label>
        )}
        <label className="field"><span>OSC user (blank = console default)</span><input className="input" type="number" value={c.oscUser ?? ''} onChange={(e) => set({ oscUser: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label className="field"><span>Heartbeat (s)</span><input className="input" type="number" value={c.heartbeatSeconds} onChange={(e) => set({ heartbeatSeconds: num(e.target.value) })} /></label>
        <label className="field"><span>Mark stale after (s)</span><input className="input" type="number" value={c.staleSeconds} onChange={(e) => set({ staleSeconds: num(e.target.value) })} /></label>
        <label className="field"><span>Max slider updates / s</span><input className="input" type="number" value={c.maxCommandRateHz} onChange={(e) => set({ maxCommandRateHz: num(e.target.value) })} /></label>
        <label className="field"><span>GO key name</span><input className="input" value={c.goKey} onChange={(e) => set({ goKey: e.target.value })} /></label>
        <label className="field"><span>BACK key name</span><input className="input" value={c.backKey} onChange={(e) => set({ backKey: e.target.value })} /></label>
        <label className="field"><span>Sanctuary name</span><input className="input" value={draft.sanctuaryName} onChange={(e) => setDraft({ ...draft, sanctuaryName: e.target.value })} /></label>
        <label className="field"><span>Master cue list</span><input className="input" type="number" value={draft.masterCueList} onChange={(e) => setDraft({ ...draft, masterCueList: num(e.target.value) })} /></label>
      </div>

      <div className="card">
        <div className="row"><strong>Status</strong><span className="spacer" />
          <button className="btn sm" onClick={() => void sendCommand({ kind: 'testConnection' })}>Test connection</button>
          <button className="btn sm" disabled={c.eosVersion === '1.x'} onClick={() => void sendCommand({ kind: 'syncFromConsole' })}>Read patch &amp; cues from console</button>
        </div>
        <div className="hint" style={{ margin: '6px 0' }}>Mode: {status?.mode} · {status?.connection.detail}{status?.connection.consoleVersion ? ` · Eos ${status.connection.consoleVersion}` : ''}</div>
        <table className="data-table">
          <thead><tr><th>Feedback</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            {Object.entries(status?.feedback.capabilities ?? {}).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td><span className={`badge ${v.status === 'available' ? 'confirmed' : v.status === 'unknown' ? 'warn' : 'err'}`}>{v.status}</span></td><td className="hint">{v.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card hint">
        <strong style={{ color: 'var(--text)' }}>On the Ion</strong> (Setup → System → Show Control → OSC, and the Shell network settings): enable <em>OSC RX</em> and <em>OSC TX</em>.
        For UDP, set the console's OSC UDP TX IP address to this computer and match the ports above. TCP needs no TX address — replies come back on the same connection.
        Use a dedicated OSC user number so this app never types into the operator's command line. Verify GO/BACK key names against your Eos version's OSC key list.
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onRevert={revert} />
    </div>
  );
}
