import { Wand2 } from 'lucide-react';
import {
  checkConnectionCompat, eosCapabilities, recommendConnection,
  type ConnectionSettings as Conn, type GoBackMethod, type OscTransport,
} from '@sanctuary/shared';
import { sendCommand, useApp } from '../../state/store';
import { SaveBar, useSection } from './useSection';

const TRANSPORTS: { v: OscTransport; label: string }[] = [
  { v: 'tcp-1.0', label: 'TCP — OSC 1.0 (packet-length)' },
  { v: 'tcp-1.1', label: 'TCP — OSC 1.1 (SLIP)' },
  { v: 'udp', label: 'UDP' },
];

const SUPPORT_BADGE = { yes: 'confirmed', no: 'err', verify: 'warn' } as const;

export function ConnectionSettings({ onOpenWizard }: { onOpenWizard?(): void }) {
  const { draft, setDraft, dirty, save, saving, revert } = useSection('settings');
  const status = useApp((s) => s.status);
  const c = draft.connection;
  const set = (patch: Partial<Conn>) => setDraft({ ...draft, connection: { ...c, ...patch } });
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const caps = eosCapabilities(c.eosVersion);
  const rec = recommendConnection(c.eosVersion);
  const compat = checkConnectionCompat(c);
  const differsFromRec = caps.known && (c.transport !== rec.transport || (c.transport !== 'udp' && c.tcpPort !== rec.port));

  return (
    <div>
      <div className="row">
        <h4 className="grow">Console connection</h4>
        {onOpenWizard && <button className="btn sm primary" onClick={onOpenWizard}><Wand2 size={14} />Ion Setup Wizard</button>}
      </div>
      <p className="hint">Sanctuary Light talks to the Ion using ETC's documented OSC interface. The Ion keeps its patch, cues and DMX output. Which ports exist depends on the Eos version, so set the version first.</p>
      <div className="form-grid">
        <label className="field"><span>Eos software version (from the Ion's About screen)</span>
          <input className="input" placeholder="e.g. 2.9.3 or 3.2.12" value={c.eosVersion} onChange={(e) => set({ eosVersion: e.target.value.trim() })} />
        </label>
        <label className="field"><span>Ion IP address</span><input className="input" placeholder="e.g. 10.101.100.101" value={c.consoleIp} onChange={(e) => set({ consoleIp: e.target.value.trim() })} /></label>
        <label className="field"><span>Transport</span>
          <select className="select" value={c.transport} onChange={(e) => set({ transport: e.target.value as OscTransport })}>
            {TRANSPORTS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </label>
        {c.transport === 'udp' ? (
          <>
            <label className="field"><span>Send to console port (Eos "OSC UDP RX")</span><input className="input" type="number" value={c.udpConsolePort} onChange={(e) => set({ udpConsolePort: num(e.target.value) })} /></label>
            <label className="field"><span>Listen on port (Eos "OSC UDP TX")</span><input className="input" type="number" value={c.udpLocalPort} onChange={(e) => set({ udpLocalPort: num(e.target.value) })} /></label>
          </>
        ) : (
          <label className="field"><span>TCP port</span>
            <input className="input" type="number" list="eos-tcp-ports" value={c.tcpPort} onChange={(e) => set({ tcpPort: num(e.target.value) })} />
            <datalist id="eos-tcp-ports"><option value={3032}>3032 general OSC TCP</option><option value={3037}>3037 Third Party OSC (3.1+, SLIP)</option></datalist>
          </label>
        )}
        <label className="field"><span>GO / BACK method</span>
          <select className="select" value={c.goBackMethod} onChange={(e) => set({ goBackMethod: e.target.value as GoBackMethod })}>
            <option value="auto">Automatic (cue list where documented)</option>
            <option value="cue-list">Cue list: /eos/cues/&lt;list&gt;/fire · /stop</option>
            <option value="keys">Console keys (master playback)</option>
          </select>
        </label>
        <label className="field"><span>Master cue list</span><input className="input" type="number" value={draft.masterCueList} onChange={(e) => setDraft({ ...draft, masterCueList: num(e.target.value) })} /></label>
        <label className="field"><span>OSC user (blank = console default)</span><input className="input" type="number" value={c.oscUser ?? ''} onChange={(e) => set({ oscUser: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label className="field"><span>GO key (keys method)</span><input className="input" value={c.goKey} onChange={(e) => set({ goKey: e.target.value })} /></label>
        <label className="field"><span>BACK key (keys method)</span><input className="input" value={c.backKey} onChange={(e) => set({ backKey: e.target.value })} /></label>
        <label className="field"><span>Heartbeat (s)</span><input className="input" type="number" value={c.heartbeatSeconds} onChange={(e) => set({ heartbeatSeconds: num(e.target.value) })} /></label>
        <label className="field"><span>Mark stale after (s)</span><input className="input" type="number" value={c.staleSeconds} onChange={(e) => set({ staleSeconds: num(e.target.value) })} /></label>
        <label className="field"><span>Max slider updates / s</span><input className="input" type="number" value={c.maxCommandRateHz} onChange={(e) => set({ maxCommandRateHz: num(e.target.value) })} /></label>
        <label className="field"><span>Sanctuary name</span><input className="input" value={draft.sanctuaryName} onChange={(e) => setDraft({ ...draft, sanctuaryName: e.target.value })} /></label>
      </div>

      {(compat.errors.length > 0 || compat.warnings.length > 0) && (
        <div className="card" role="alert">
          {compat.errors.map((e) => <div key={e} style={{ color: 'var(--err)' }}>✕ {e}</div>)}
          {compat.warnings.map((w) => <div key={w} style={{ color: 'var(--warn)' }}>⚠ {w}</div>)}
        </div>
      )}

      <div className="card">
        <div className="row"><strong>What Eos {caps.known ? c.eosVersion : '(unknown version)'} supports</strong><span className="spacer" />
          {differsFromRec && <button className="btn sm" onClick={() => set({ transport: rec.transport, ...(rec.transport === 'udp' ? {} : { tcpPort: rec.port }) })}>Use recommended</button>}
        </div>
        <p className="hint" style={{ margin: '6px 0' }}>Recommended: {rec.summary}</p>
        <table className="data-table">
          <tbody>
            {([
              ['TCP 3032', caps.tcp3032, caps.tcp3032FramingSetting],
              ['TCP 3037 Third Party OSC (SLIP only)', caps.thirdParty3037, caps.thirdPartyToggle],
              ['Additional OSC TCP ports', caps.customTcpPorts, 'Eos 2.9.0+'],
              ['/eos/get + /eos/subscribe (version, groups, patch)', caps.getApi, ''],
              ['/eos/cues/<list>/fire · /stop', caps.cueListFireStop, 'Documented in the Eos 3.3 OSC Dictionary'],
            ] as const).map(([k, v, note]) => (
              <tr key={k}><td>{k}</td><td><span className={`badge ${SUPPORT_BADGE[v]}`}>{v === 'verify' ? 'unconfirmed' : v}</span></td><td className="hint">{note}</td></tr>
            ))}
          </tbody>
        </table>
        {caps.notes.map((n) => <p key={n} className="hint">• {n}</p>)}
      </div>

      <div className="card">
        <div className="row"><strong>Status</strong><span className="spacer" />
          <button className="btn sm" onClick={() => void sendCommand({ kind: 'testConnection' })}>Test connection</button>
          <button className="btn sm" disabled={caps.getApi === 'no'} onClick={() => void sendCommand({ kind: 'verifyGroups' })}>Verify groups</button>
          <button className="btn sm" disabled={caps.getApi === 'no'} onClick={() => void sendCommand({ kind: 'syncFromConsole' })}>Read patch &amp; cues</button>
        </div>
        <div className="hint" style={{ margin: '6px 0' }}>Mode: {status?.mode} · {status?.connection.detail}{status?.connection.consoleVersion ? ` · console reports Eos ${status.connection.consoleVersion}` : ''}</div>
        {status?.versionMismatch && <div style={{ color: 'var(--warn)' }}>⚠ {status.versionMismatch}</div>}
        {status && <div className="hint">GO/BACK: {status.goBack.note} (<code>{status.goBack.goAddress}</code>, <code>{status.goBack.backAddress}</code>)</div>}
        <table className="data-table" style={{ marginTop: 8 }}>
          <thead><tr><th>Feedback</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            {Object.entries(status?.feedback.capabilities ?? {}).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td><span className={`badge ${v.status === 'available' ? 'confirmed' : v.status === 'unknown' ? 'warn' : 'err'}`}>{v.status}</span></td><td className="hint">{v.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card hint">
        <strong style={{ color: 'var(--text)' }}>Console steps for this version</strong>
        <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>{rec.consoleSteps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p style={{ marginTop: 6 }}>Use a dedicated OSC user number so this app never types into the operator's command line.</p>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onRevert={revert} />
    </div>
  );
}
