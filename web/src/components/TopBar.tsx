import { useState } from 'react';
import { Building2, Eye, Wand2, Lock, LogIn, LogOut, Radio, Settings, ShieldAlert, Unlock, Users, Wrench, Zap, ZapOff } from 'lucide-react';
import { MODE_INFO, type OperatingMode } from '@sanctuary/shared';
import { logout, sendCommand, useApp } from '../state/store';
import { ArmDialog } from './ArmDialog';
import { LoginDialog } from './LoginDialog';
import { Confirm, Tip } from './ui';

const MODES: { mode: OperatingMode; icon: JSX.Element }[] = [
  { mode: 'offline', icon: <ZapOff size={14} /> },
  { mode: 'eos-monitor', icon: <Eye size={14} /> },
  { mode: 'eos-live', icon: <Zap size={14} /> },
  { mode: 'direct-dmx', icon: <Radio size={14} /> },
];

function ago(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

export function TopBar({ onOpenSettings, onOpenWizard }: { onOpenSettings(): void; onOpenWizard(): void }) {
  const status = useApp((s) => s.status);
  const role = useApp((s) => s.role);
  const uiMode = useApp((s) => s.uiMode);
  const setUiMode = useApp((s) => s.setUiMode);
  const socketState = useApp((s) => s.socketState);
  const skew = useApp((s) => s.clockSkew);
  const config = useApp((s) => s.config);
  const [loginOpen, setLoginOpen] = useState(false);
  const [armOpen, setArmOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingAdvanced, setPendingAdvanced] = useState(false);

  const mode = status?.mode ?? 'offline';
  const conn = status?.connection;
  const unlocked = status?.protectedUnlockedUntil && status.protectedUnlockedUntil > Date.now() - skew;

  const chooseMode = (m: OperatingMode) => {
    if (role !== 'operator') { setLoginOpen(true); return; }
    if (m === 'eos-live') { setArmOpen(true); return; }
    void sendCommand({ kind: 'setMode', mode: m });
  };

  const goAdvanced = () => {
    if (role === 'operator') setUiMode('advanced');
    else { setPendingAdvanced(true); setLoginOpen(true); }
  };

  let connLabel = 'Offline';
  if (socketState !== 'open') connLabel = 'Server unreachable';
  else if (conn && mode !== 'offline') connLabel = conn.state === 'connected' ? (conn.stale ? 'Stale' : 'Connected') : conn.state[0].toUpperCase() + conn.state.slice(1);
  const connDetail = socketState !== 'open'
    ? 'Reconnecting to the local Sanctuary Light server…'
    : mode === 'offline' ? 'No network traffic' : conn?.lastRxAt ? `last reply ${ago(Date.now() - skew - conn.lastRxAt)}` : conn?.detail ?? '';

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden>✦</div>
        <div>Sanctuary Light<small>{config?.settings.sanctuaryName ?? 'Connecting…'}</small></div>
      </div>

      <div className="mode-switch" role="radiogroup" aria-label="Operating mode">
        {MODES.map(({ mode: m, icon }) => (
          <Tip key={m} label={<><strong>{MODE_INFO[m].label}</strong><br />{MODE_INFO[m].description}</>}>
            <button
              role="radio" aria-checked={mode === m} data-on={mode === m} data-mode={m}
              disabled={!MODE_INFO[m].available || (uiMode === 'volunteer' && role !== 'operator' && mode !== m)}
              onClick={() => chooseMode(m)}
            >{icon}{MODE_INFO[m].short}</button>
          </Tip>
        ))}
      </div>

      <Tip label={conn?.detail ?? 'Not connected'}>
        <div className="conn-pill" data-state={socketState !== 'open' ? 'error' : mode === 'offline' ? 'disabled' : conn?.state} data-stale={!!conn?.stale && mode !== 'offline'} tabIndex={0}>
          <span className="dot" />
          <span>{connLabel}</span>
          <span className="detail">{connDetail}</span>
        </div>
      </Tip>

      <div className="spacer" />

      {role === 'operator' && !config?.settings.commissioning.monitorTest?.ok && (
        <Tip label="Identify the Eos version, check the network, test in Monitor mode, then one authorized single-channel test."><button className="btn sm primary" onClick={onOpenWizard}><Wand2 size={14} />Ion setup</button></Tip>
      )}
      {role === 'operator' && (
        unlocked
          ? <Tip label="Relays & utility channels are unlocked. Click to lock now."><button className="btn sm danger" onClick={() => void sendCommand({ kind: 'lockProtected' })}><Unlock size={14} />Protected unlocked</button></Tip>
          : <Tip label="Relay and utility channels are protected from accidental operation."><button className="btn sm ghost" onClick={() => setUnlockOpen(true)}><Lock size={14} />Protected</button></Tip>
      )}

      <div className="mode-switch" role="radiogroup" aria-label="Interface">
        <button role="radio" aria-checked={uiMode === 'volunteer'} data-on={uiMode === 'volunteer'} data-mode="offline" onClick={() => setUiMode('volunteer')}><Users size={14} />Volunteer</button>
        <button role="radio" aria-checked={uiMode === 'advanced'} data-on={uiMode === 'advanced'} data-mode="offline" onClick={goAdvanced}><Wrench size={14} />Worship</button>
        <button role="radio" aria-checked={uiMode === 'architecture'} data-on={uiMode === 'architecture'} data-mode="offline" onClick={() => setUiMode('architecture')}><Building2 size={14} />Architectural</button>
      </div>

      {role
        ? <Tip label="Sign out"><button className="btn sm" onClick={() => logout()}><LogOut size={14} />{role === 'operator' ? 'Operator' : 'Volunteer'}</button></Tip>
        : <button className="btn sm primary" onClick={() => setLoginOpen(true)}><LogIn size={14} />Sign in</button>}
      {status?.defaultPinsInUse && role === 'operator' && (
        <Tip label="Default PINs are still in use. Change them in Settings → Security."><span className="badge warn"><ShieldAlert size={12} />Default PIN</span></Tip>
      )}
      <Tip label="Settings"><button className="btn icon" aria-label="Settings" onClick={onOpenSettings} disabled={role !== 'operator'}><Settings size={18} /></button></Tip>

      <LoginDialog open={loginOpen} onOpenChange={(o) => { setLoginOpen(o); if (!o) setPendingAdvanced(false); }}
        onSuccess={(r) => { if (pendingAdvanced && r === 'operator') setUiMode('advanced'); setPendingAdvanced(false); }} />
      <ArmDialog open={armOpen} onOpenChange={setArmOpen} />
      <Confirm open={unlockOpen} onOpenChange={setUnlockOpen} danger title="Unlock relay & utility channels?"
        confirmLabel="Unlock temporarily"
        body={<>Channels marked <strong>protected</strong> (relays 61–70 by default) may switch power to equipment. They will re-lock automatically after {config?.settings.safety.protectedUnlockMinutes ?? 5} minutes.</>}
        onConfirm={() => void sendCommand({ kind: 'unlockProtected', confirm: true })} />
    </header>
  );
}

export function ModeBanner() {
  const status = useApp((s) => s.status);
  const socketState = useApp((s) => s.socketState);
  if (socketState !== 'open') {
    return <div className="banner stale" role="alert">Lost contact with the Sanctuary Light server — controls are unavailable. The Ion console continues to run normally.</div>;
  }
  if (!status) return null;
  const c = status.connection;
  if (status.mode === 'offline') {
    return <div className="banner offline"><ZapOff size={15} />OFFLINE SIMULATION — every control only changes the on-screen preview. Nothing is sent to the Ion.</div>;
  }
  // The mode banner is always shown; connection and version warnings are added below it,
  // never instead of it, so LIVE stays visible whatever else is wrong.
  const modeBanner = status.mode === 'eos-monitor'
    ? <div className="banner monitor"><Eye size={15} />ION MONITOR (READ-ONLY) — showing console feedback. Lighting commands are blocked.{c.consoleVersion && <><span className="spacer" />Eos {c.consoleVersion}{c.showName ? ` · ${c.showName}` : ''}</>}</div>
    : <div className="banner live" role="status"><Zap size={15} />LIVE — controls send commands to the Ion and change real lights.<span className="spacer" />{c.consoleVersion ? `Eos ${c.consoleVersion}` : ''}{c.showName ? ` · ${c.showName}` : ''}</div>;
  return (
    <div>
      {modeBanner}
      {(c.stale || c.state !== 'connected') && (
        <div className="banner stale" role="alert">
          <ShieldAlert size={15} />
          {c.state === 'connected' ? 'Console information is STALE — no reply recently. What you see may be out of date.' : `Not connected to the Ion: ${c.detail}`}
          <span className="spacer" /><span>Use the Ion directly if needed.</span>
        </div>
      )}
      {status.versionMismatch && <div className="banner stale" role="alert"><ShieldAlert size={15} />{status.versionMismatch}</div>}
    </div>
  );
}
