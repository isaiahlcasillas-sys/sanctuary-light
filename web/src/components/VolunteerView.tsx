/**
 * Volunteer Mode: a calm, simple screen for the person running lights during worship.
 * It shows what's happening now, what comes next, GO/BACK when they're authorised, the
 * approved look buttons and the approved room-light controls. No Eos commands or channel
 * numbers. Everything is still checked by the server: hiding a button is only a courtesy.
 */
import { useState } from 'react';
import { ChevronsLeft, CircleHelp, Eye, LogIn, Play, Radio, ShieldCheck, Sparkles, Zap, ZapOff } from 'lucide-react';
import { collectionOf, lookPalette, volunteerCanUseLook, volunteerCanUseSub, type Look } from '@sanctuary/shared';
import { sendCommand, useApp } from '../state/store';
import { GroupCards } from './GroupCards';
import { LOOK_ICONS } from './LooksGrid';
import { StageView } from './StageView';
import { SubmasterBank } from './SubmasterBank';

function StatusStrip() {
  const status = useApp((s) => s.status);
  const socket = useApp((s) => s.socketState);
  const mode = status?.mode ?? 'offline';
  const conn = status?.connection;
  const [icon, title, text] = socket !== 'open'
    ? [<Radio key="i" size={18} />, 'Reconnecting…', 'The lighting computer is restarting Sanctuary Light. Eos keeps running.']
    : mode === 'offline'
      ? [<ZapOff key="i" size={18} />, 'Practice mode', 'Nothing you press here changes the lights in the room.']
      : mode === 'eos-monitor'
        ? [<Eye key="i" size={18} />, 'Watching the lighting console', 'Buttons are read-only right now.']
        : [<Zap key="i" size={18} />, 'Live', 'Buttons change the real lights in the room.'];
  const connected = mode === 'offline' || (conn?.state === 'connected' && !conn.stale);
  return (
    <div className="vol-status" data-mode={socket !== 'open' ? 'error' : mode} role="status">
      {icon}
      <div className="grow"><strong>{title}</strong><span>{text}</span></div>
      {mode !== 'offline' && <span className="vol-conn" data-ok={connected}><span className="dot" />{connected ? 'Connected' : 'Not connected: use the console'}</span>}
    </div>
  );
}

function NowNext() {
  const status = useApp((s) => s.status);
  const config = useApp((s) => s.config);
  const fb = status?.feedback;
  const playback = status?.volunteerPlayback;
  const nowLook = status?.activeLook;
  const cue = fb?.activeCue;
  const cueLabel = (c: typeof cue) => {
    if (!c?.cue) return null;
    const user = config?.cueLists.find((l) => l.list === c.list)?.cues.find((q) => q.cue === c.cue)?.label;
    return user || c.label || `Cue ${c.cue}`;
  };
  const now = cueLabel(cue) ?? nowLook?.name ?? null;
  const next = playback ? null : cueLabel(fb?.pendingCue ?? null);
  return (
    <div className="vol-nownext">
      <div className="vol-card" aria-label="Now">
        <span className="vol-k">Now</span>
        <strong className="vol-v">{now ?? 'Nothing played yet'}</strong>
        {cue?.progress != null && cue.cue && <div className="progress" role="progressbar" aria-valuenow={Math.round(cue.progress)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${cue.progress}%` }} /></div>}
      </div>
      <div className="vol-card" aria-label="Next">
        <span className="vol-k">Next</span>
        <strong className="vol-v">{next ?? (playback ? 'Choose a look below' : '—')}</strong>
      </div>
    </div>
  );
}

function GoBack() {
  const role = useApp((s) => s.role);
  const why = useApp((s) => s.status?.volunteerPlayback ?? null);
  const [details, setDetails] = useState(false);
  // The server enforces this for volunteers; operators may always use GO/BACK.
  const allowed = role === 'operator' || (role === 'volunteer' && !why);
  if (role === 'volunteer' && why) {
    return (
      <div className="vol-goback-off">
        <ShieldCheck size={18} aria-hidden />
        <div className="grow">
          <strong>GO and BACK aren't set up for volunteers yet.</strong>
          <span>Use the look buttons, or ask the lighting lead.</span>
          {details ? <p className="hint">{why}</p> : <button className="linkish" onClick={() => setDetails(true)}>Why?</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="vol-goback">
      <button className="vol-back" disabled={!allowed} onClick={() => void sendCommand({ kind: 'back' })}><ChevronsLeft size={22} />BACK</button>
      <button className="vol-go" disabled={!allowed} onClick={() => void sendCommand({ kind: 'go' })}><Play size={26} fill="currentColor" />GO</button>
    </div>
  );
}

function LookButtons() {
  const config = useApp((s) => s.config)!;
  const role = useApp((s) => s.role);
  const active = useApp((s) => s.status?.activeLook?.id);
  const looks = config.looks.filter((l) => volunteerCanUseLook(l));
  if (!looks.length) return <p className="hint">No looks have been approved for volunteers yet.</p>;
  const groups = new Map<string, Look[]>();
  for (const l of looks) groups.set(collectionOf(l), [...(groups.get(collectionOf(l)) ?? []), l]);
  return (
    <div className="vol-looks">
      {[...groups.entries()].map(([name, list]) => (
        <section key={name}>
          {groups.size > 1 && <h3 className="vol-collection">{name}</h3>}
          <div className="vol-look-grid">
            {list.map((l) => {
              const Icon = LOOK_ICONS[l.icon] ?? Sparkles;
              const [a, b] = l.fixtures?.length ? lookPalette(config, l) : l.gradient;
              return (
                <button key={l.id} className="vol-look" data-active={active === l.id} disabled={!role}
                  style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => void sendCommand({ kind: 'fireLook', lookId: l.id })}>
                  <Icon size={26} aria-hidden />
                  <span className="vol-look-name">{l.name}</span>
                  {l.description && <span className="vol-look-desc">{l.description}</span>}
                  {active === l.id && <span className="vol-look-on">On now</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function VolunteerView() {
  const role = useApp((s) => s.role);
  const config = useApp((s) => s.config);
  const [showStage, setShowStage] = useState(false);
  const hasRoomLights = !!config && (config.groups.some((g) => g.volunteerVisible) || config.submasters.some((s) => volunteerCanUseSub(s)));

  return (
    <main className="volunteer2">
      <StatusStrip />
      {!role && (
        <div className="vol-signin"><LogIn size={18} aria-hidden /><span><strong>Sign in</strong> with the volunteer PIN (top right) to use the buttons.</span></div>
      )}
      <div className="vol-grid">
        <div className="vol-main">
          <NowNext />
          <GoBack />
          <h2 className="vol-h">Looks</h2>
          <LookButtons />
          <button className="btn sm ghost" onClick={() => setShowStage(!showStage)} aria-expanded={showStage}>{showStage ? 'Hide' : 'Show'} stage preview</button>
          {showStage && <div className="vol-stage"><StageView compact /></div>}
        </div>
        <aside className="vol-side">
          <section className="panel">
            <div className="panel-head"><h2>Room lights</h2></div>
            <div className="panel-body">
              {hasRoomLights ? <><GroupCards volunteerOnly /><SubmasterBank volunteer /></> : <p className="hint">The lighting lead hasn't approved any room-light controls yet.</p>}
            </div>
          </section>
          <div className="help">
            <div className="row" style={{ marginBottom: 6 }}><CircleHelp size={16} /><strong>If something looks wrong</strong></div>
            The lighting console in the booth is always in charge and can override anything here. Ask the lighting lead.
            Closing this screen never turns the lights off.
          </div>
        </aside>
      </div>
    </main>
  );
}
