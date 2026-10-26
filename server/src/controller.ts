/**
 * The control backend. Every lighting command from any browser goes through
 * Controller.execute(), which:
 *   1. checks the caller's role,
 *   2. resolves the target against the configured patch,
 *   3. applies safety rules (protected channels, read-only monitor mode, arming),
 *   4. either updates the simulation only, or transmits OSC to the Ion,
 *   5. reports back exactly which of those happened.
 */
import {
  MODE_INFO, clamp, eosCapabilities, parseEosVersion,
  type CommissioningRecord, type GoBackStatus, type GroupVerification,
  type AppConfig, type Capability, type Command, type CommandResult, type CueFeedback, type FeedbackCapability,
  type Fixture, type FixtureState, type LevelsSnapshot, type LogEntry, type OperatingMode, type ParamKey,
  type Role, type ServerMessage, type ServerStatus, type Target, type ValueSource,
} from '@sanctuary/shared';
import { formatMessage, type OscMessage } from './osc/codec';
import { EosCommandBuilder, paramValueForEos } from './engine/eosCommands';
import { EosOscEngine } from './engine/eosOscEngine';
import { DirectDmxEngine } from './engine/directDmxEngine';
import { splitAbsoluteAddress, type FeedbackEvent } from './engine/eosFeedback';
import type { EngineConnection } from './engine/types';
import type { ConfigStore } from './store/configStore';
import { GroupVerifier } from './groupVerifier';

const PARAM_CAPABILITY: Record<ParamKey, Capability> = {
  red: 'rgb', green: 'rgb', blue: 'rgb', white: 'white', amber: 'amber', uv: 'uv',
  cct: 'cct', pan: 'pantilt', tilt: 'pantilt', zoom: 'zoom', focus: 'focus',
};

const VOLUNTEER_KINDS = new Set<Command['kind']>(['fireLook', 'go', 'back', 'setSub', 'setIntensity', 'select', 'fireCue', 'testConnection']);

interface ResolvedTarget { channels: number[]; eosGroup: number | null; fixtures: Fixture[]; label: string }

export interface SyncResult {
  startedAt: number;
  patch: { channel: number; label: string; manufacturer: string; model: string; dmx: { universe: number; address: number } | null }[];
  cueLists: { list: number; label: string; cues: { cue: string; label: string }[] }[];
}

class CommandRateLimiter {
  private slots = new Map<string, { last: number; timer: NodeJS.Timeout | null; pending: (() => void) | null }>();
  constructor(private intervalMs: () => number) {}

  /** Run now if allowed; otherwise keep only the latest pending call for this key. */
  run(key: string, fn: () => void): 'now' | 'queued' {
    const now = Date.now();
    const slot = this.slots.get(key) ?? { last: 0, timer: null, pending: null };
    this.slots.set(key, slot);
    const wait = slot.last + this.intervalMs() - now;
    if (wait <= 0 && !slot.timer) {
      slot.last = now;
      fn();
      return 'now';
    }
    slot.pending = fn;
    if (!slot.timer) {
      slot.timer = setTimeout(() => {
        slot.timer = null;
        slot.last = Date.now();
        const p = slot.pending; slot.pending = null;
        p?.();
      }, Math.max(0, wait));
    }
    return 'queued';
  }

  /** Drop anything not yet sent (used when leaving live mode). */
  clear() {
    for (const s of this.slots.values()) if (s.timer) clearTimeout(s.timer);
    this.slots.clear();
  }
}

export class Controller {
  mode: OperatingMode = 'offline';
  private eos: EosOscEngine | null = null;
  private levels: Record<number, FixtureState> = {};
  private sources: Record<number, ValueSource> = {};
  private subs: Record<number, number> = {};
  private feedback: ServerStatus['feedback'] = { activeCue: null, pendingCue: null, previousCue: null, commandLine: null, capabilities: {} };
  private consoleVersion: string | null = null;
  private showName: string | null = null;
  private protectedUnlockedUntil: number | null = null;
  private logBuf: LogEntry[] = [];
  private logId = 0;
  private limiter: CommandRateLimiter;
  private engineStartedAt = 0;
  private simFade: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout;
  private levelsDirty: NodeJS.Timeout | null = null;
  private seenCueFeedback = false;
  private groupVerifier = new GroupVerifier();
  syncResult: SyncResult | null = null;

  constructor(private store: ConfigStore, private broadcast: (msg: ServerMessage) => void, private defaultPins: () => boolean) {
    this.limiter = new CommandRateLimiter(() => 1000 / this.cfg.settings.connection.maxCommandRateHz);
    for (const f of this.cfg.fixtures) { this.levels[f.channel] = { intensity: 0 }; this.sources[f.channel] = 'simulated'; }
    this.statusTimer = setInterval(() => this.pushStatus(), 1000);
    this.log('info', 'Sanctuary Light started in Offline Simulation mode. Nothing is transmitted until you change mode.');
  }

  private get cfg(): AppConfig { return this.store.get(); }

  // ───────────────────────────── status / broadcast ─────────────────────────────

  log(level: LogEntry['level'], message: string) {
    const entry: LogEntry = { id: ++this.logId, at: Date.now(), level, message };
    this.logBuf.push(entry);
    if (this.logBuf.length > 500) this.logBuf.splice(0, this.logBuf.length - 500);
    this.broadcast({ t: 'log', entry });
  }

  recentLog() { return this.logBuf.slice(-200); }

  levelsSnapshot(): LevelsSnapshot {
    return { levels: this.levels, sources: this.sources, subs: this.subs };
  }

  private markLevelsDirty() {
    if (this.levelsDirty) return;
    this.levelsDirty = setTimeout(() => { this.levelsDirty = null; this.broadcast({ t: 'levels', levels: this.levelsSnapshot() }); }, 30);
  }

  private connection(): EngineConnection {
    if (this.mode === 'offline') return { state: 'disabled', detail: 'Offline simulation — no network traffic', target: null, lastRxAt: null, lastTxAt: null };
    return this.eos?.connection() ?? { state: 'disabled', detail: 'No engine', target: null, lastRxAt: null, lastTxAt: null };
  }

  private capabilities(): Record<string, FeedbackCapability> {
    const v1 = eosCapabilities(this.cfg.settings.connection.eosVersion).getApi !== 'yes';
    const offline = this.mode === 'offline';
    const conn = this.connection();
    const off: FeedbackCapability = { status: 'unavailable', note: 'Offline simulation — not connected to the console.' };
    return {
      activeCue: offline ? off : this.seenCueFeedback
        ? { status: 'available', note: 'Active/pending cue reported by the console.' }
        : { status: 'unknown', note: 'No cue feedback yet. Requires OSC TX enabled on the console.' },
      cueProgress: offline ? off : this.seenCueFeedback
        ? { status: 'available', note: 'Fade progress from /eos/out/active/cue.' }
        : { status: 'unknown', note: 'Waiting for console feedback.' },
      channelLevels: { status: 'unavailable', note: 'Eos OSC does not stream every channel level to third-party apps. Levels shown are simulated or commanded, never confirmed.' },
      submasterLevels: { status: 'unavailable', note: 'Submaster positions are not reported back over OSC by this app; the console may differ (e.g. if moved on the Ion).' },
      version: offline ? off : v1
        ? { status: 'unavailable', note: 'Version query needs the Eos 2.x+ /eos/get API (or set the Eos version in Settings).' }
        : this.consoleVersion ? { status: 'available', note: this.consoleVersion } : { status: 'unknown', note: conn.state === 'connected' ? 'Asked; no reply yet.' : 'Not connected.' },
      patchSync: v1
        ? { status: 'unavailable', note: 'Reading the patch over OSC needs Eos 2.0+. Use CSV/JSON import.' }
        : offline ? off : { status: this.syncResult?.patch.length ? 'available' : 'unknown', note: 'Read-only third-party API (/eos/get/patch). Verify results before applying.' },
    };
  }

  status(): ServerStatus {
    const conn = this.connection();
    const now = Date.now();
    const staleMs = this.cfg.settings.connection.staleSeconds * 1000;
    const stale = this.mode !== 'offline' && (conn.lastRxAt == null ? now - this.engineStartedAt > staleMs : now - conn.lastRxAt > staleMs);
    if (this.protectedUnlockedUntil && this.protectedUnlockedUntil < now) {
      this.protectedUnlockedUntil = null;
      this.log('info', 'Protected channels re-locked automatically.');
    }
    return {
      mode: this.mode,
      connection: { ...conn, stale, consoleVersion: this.consoleVersion, showName: this.showName },
      feedback: { ...this.feedback, capabilities: this.capabilities() },
      protectedUnlockedUntil: this.protectedUnlockedUntil,
      groupVerification: this.groupVerification(now),
      goBack: this.goBackStatus(),
      versionMismatch: this.versionMismatch(),
      defaultPinsInUse: this.defaultPins(),
      serverTime: now,
    };
  }

  pushStatus() { this.broadcast({ t: 'status', status: this.status() }); }

  /** Called after configuration changes. Restart the engine if connection settings changed. */
  onConfigChanged(prev: AppConfig) {
    for (const f of this.cfg.fixtures) {
      if (!this.levels[f.channel]) { this.levels[f.channel] = { intensity: 0 }; this.sources[f.channel] = 'simulated'; }
    }
    const a = JSON.stringify(prev.settings.connection); const b = JSON.stringify(this.cfg.settings.connection);
    if (a !== b && this.eos) {
      this.log('info', 'Connection settings changed — reconnecting (nothing is sent to the console on disconnect).');
      const mode = this.mode;
      this.stopEngine();
      this.startEngine(mode === 'eos-live');
    } else if (JSON.stringify(prev.groups) !== JSON.stringify(this.cfg.groups)) {
      this.requestGroupVerification();
    }
    this.pushStatus();
  }

  // ───────────────────────────── group verification ─────────────────────────────

  private groupVerification(now = Date.now()): Record<string, GroupVerification> {
    return this.groupVerifier.evaluate(this.cfg.groups, this.cfg.fixtures, now, this.cfg.settings.connection.transport !== 'udp');
  }

  /** Ask the console (read-only) for every Eos group referenced by a local group or preset look. */
  private requestGroupVerification(force = false) {
    const eos = this.eos;
    if (!eos || !eos.supportsThirdPartyApi) return;
    if (force) this.groupVerifier.invalidate();
    const wanted = this.cfg.groups.map((g) => g.eosGroup).filter((n): n is number => n != null);
    const todo = this.groupVerifier.needsRequest(wanted);
    if (!todo.length) return;
    this.groupVerifier.markRequested(todo);
    try { eos.requestGroups(todo); this.log('info', `Reading Eos group membership (read-only): ${todo.join(', ')}`); }
    catch (e) { this.log('warn', `Could not read groups: ${(e as Error).message}`); }
  }

  /** "Group N" is only ever sent when the console has confirmed N matches and has no protected channels. */
  private groupAddressable(groupId: string): GroupVerification | null {
    const g = this.cfg.groups.find((x) => x.id === groupId);
    if (!g || g.eosGroup == null) return null;
    const v = this.groupVerifier.evaluate([g], this.cfg.fixtures, Date.now(), this.cfg.settings.connection.transport !== 'udp')[groupId];
    return v?.state === 'verified' ? v : null;
  }

  // ───────────────────────────── GO / BACK ─────────────────────────────

  goBackStatus(list = this.cfg.settings.masterCueList): GoBackStatus {
    const c = this.cfg.settings.connection;
    const configured = eosCapabilities(c.eosVersion);
    // If the console reports a version, use whichever of the two is more conservative.
    const reported = this.consoleVersion ? eosCapabilities(this.consoleVersion) : null;
    const documented = configured.cueListFireStop === 'yes' && (!reported?.known || reported.cueListFireStop === 'yes');
    const method = c.goBackMethod === 'cue-list' ? 'cue-list' : c.goBackMethod === 'keys' ? 'keys' : documented ? 'cue-list' : 'keys';
    if (method === 'cue-list') {
      return {
        method, list, goAddress: `/eos/cues/${list}/fire`, backAddress: `/eos/cues/${list}/stop`,
        note: documented
          ? `GO/BACK act on cue list ${list} directly.`
          : `GO/BACK act on cue list ${list} directly (forced; not documented for Eos ${c.eosVersion || 'unknown'} — test first).`,
      };
    }
    return {
      method, list: null,
      goAddress: `/eos/key/${c.goKey}`, backAddress: `/eos/key/${c.backKey}`,
      note: `GO/BACK press the console's ${c.goKey}/${c.backKey} keys, which act on whatever cue list is on the master playback — not necessarily list ${list}.`,
    };
  }

  private versionMismatch(): string | null {
    const configured = parseEosVersion(this.cfg.settings.connection.eosVersion);
    const reported = parseEosVersion(this.consoleVersion);
    if (!configured || !reported) return null;
    if (configured.major === reported.major && configured.minor === reported.minor) return null;
    return `Console reports Eos ${this.consoleVersion}, but Settings say ${this.cfg.settings.connection.eosVersion}. Update the version in the Setup Wizard.`;
  }

  private recordCommissioning(patch: Partial<CommissioningRecord>) {
    const s = this.cfg.settings;
    try {
      const next = this.store.update('settings', { ...s, commissioning: { ...s.commissioning, ...patch } }, { backup: false });
      this.broadcast({ t: 'config', config: next });
    } catch (e) {
      // The command itself already went out; never report it as failed because of bookkeeping.
      this.log('warn', `Could not record commissioning result: ${(e as Error).message}`);
    }
  }

  // ───────────────────────────── engine lifecycle ─────────────────────────────

  private startEngine(allowLighting: boolean) {
    const engine = new EosOscEngine(this.cfg.settings.connection, {
      log: (level, message) => this.log(level, message),
      onFeedback: (ev, raw) => this.onFeedback(ev, raw),
      onConnectionChange: () => this.pushStatus(),
      onOpen: () => { this.groupVerifier.invalidate(); this.requestGroupVerification(); },
    });
    engine.allowLighting = allowLighting;
    this.eos = engine;
    this.engineStartedAt = Date.now();
    engine.start();
  }

  private stopEngine() {
    this.limiter.clear();
    this.eos?.stop();
    this.eos = null;
    this.groupVerifier.invalidate();
    this.consoleVersion = null;
    this.showName = null;
    this.seenCueFeedback = false;
    this.feedback = { activeCue: null, pendingCue: null, previousCue: null, commandLine: null, capabilities: {} };
  }

  private setMode(mode: OperatingMode, confirm: boolean): CommandResult {
    if (mode === this.mode) return { ok: true, delivery: 'simulated', message: `Already in ${MODE_INFO[mode].label}` };
    if (mode === 'direct-dmx') {
      try { new DirectDmxEngine().start(); } catch (e) { return { ok: false, delivery: 'blocked', message: (e as Error).message }; }
    }
    if (mode === 'eos-live' && this.cfg.settings.safety.requireConfirmToArm && !confirm) {
      return { ok: false, delivery: 'blocked', message: 'Arming live control needs explicit confirmation.' };
    }
    const prev = this.mode;
    if (prev === 'offline') {
      // Simulated cue state must never be mistaken for console feedback.
      if (this.simFade) { clearInterval(this.simFade); this.simFade = null; }
      this.feedback = { activeCue: null, pendingCue: null, previousCue: null, commandLine: null, capabilities: {} };
    }
    if (mode === 'offline') {
      this.stopEngine();
    } else if (this.eos && (prev === 'eos-monitor' || prev === 'eos-live')) {
      // Monitor ⇄ Live: keep the same connection, just open/close the gate.
      this.limiter.clear();
      this.eos.allowLighting = mode === 'eos-live';
    } else {
      this.startEngine(mode === 'eos-live');
    }
    this.mode = mode;
    if (mode === 'eos-live') {
      // Levels on screen came from the simulation, not the console.
      for (const ch of Object.keys(this.sources)) this.sources[Number(ch)] = 'simulated';
      this.markLevelsDirty();
    }
    this.log(mode === 'eos-live' ? 'warn' : 'info', `Mode: ${MODE_INFO[prev].label} → ${MODE_INFO[mode].label}`);
    this.pushStatus();
    return { ok: true, delivery: 'simulated', message: `Now in ${MODE_INFO[mode].label}` };
  }

  shutdown() {
    // Deliberately no blackout / release: the Ion simply keeps running its current state.
    clearInterval(this.statusTimer);
    this.stopEngine();
  }

  // ───────────────────────────── feedback ─────────────────────────────

  private onFeedback(ev: FeedbackEvent, _raw: OscMessage) {
    switch (ev.kind) {
      case 'version': {
        this.consoleVersion = ev.version;
        const mm = this.versionMismatch();
        if (mm) this.log('warn', mm);
        break;
      }
      case 'showName': {
        if (this.showName != null && this.showName !== ev.name) {
          this.log('warn', `Show changed on the console ("${ev.name}") — group verification reset.`);
          this.requestGroupVerification(true);
        }
        this.showName = ev.name;
        break;
      }
      case 'notify':
        if (ev.target === 'group' || ev.target === 'patch') {
          this.log('info', `Console reported ${ev.target} changes — re-reading group membership.`);
          this.requestGroupVerification(true);
        }
        break;
      case 'groupInfo': this.groupVerifier.onInfo(ev.group, ev.label); break;
      case 'groupChannels': this.groupVerifier.onChannels(ev.group, ev.channels, ev.unparsed, Date.now(), ev); break;
      case 'cueChanged': {
        this.seenCueFeedback = true;
        const key = ev.which === 'pending' ? 'pendingCue' : 'previousCue';
        const cur = this.feedback[key];
        if (!cur || cur.list !== ev.list || cur.cue !== ev.cue) {
          this.feedback[key] = { list: ev.list, cue: ev.cue, label: null, text: `${ev.list}/${ev.cue}`, progress: null, receivedAt: Date.now(), source: 'confirmed' };
        }
        break;
      }
      case 'commandLine': this.feedback.commandLine = ev.text; break;
      case 'cueText': {
        this.seenCueFeedback = true;
        const key = ev.which === 'active' ? 'activeCue' : ev.which === 'pending' ? 'pendingCue' : 'previousCue';
        this.feedback[key] = ev.cue;
        break;
      }
      case 'cueProgress': {
        this.seenCueFeedback = true;
        const a = this.feedback.activeCue;
        this.feedback.activeCue = a && a.list === ev.list && a.cue === ev.cue
          ? { ...a, progress: ev.progress, receivedAt: Date.now() }
          : { list: ev.list, cue: ev.cue, label: null, text: `${ev.list}/${ev.cue}`, progress: ev.progress, receivedAt: Date.now(), source: 'confirmed' };
        break;
      }
      case 'patchEntry': {
        if (!this.syncResult) this.syncResult = { startedAt: Date.now(), patch: [], cueLists: [] };
        if (ev.part > 1) break;
        const row = { channel: ev.channel, label: ev.label, manufacturer: ev.manufacturer, model: ev.model, dmx: ev.absoluteAddress ? splitAbsoluteAddress(ev.absoluteAddress) : null };
        const i = this.syncResult.patch.findIndex((p) => p.channel === ev.channel);
        if (i >= 0) this.syncResult.patch[i] = row; else this.syncResult.patch.push(row);
        break;
      }
      case 'cueListEntry':
      case 'cueEntry': {
        if (!this.syncResult) this.syncResult = { startedAt: Date.now(), patch: [], cueLists: [] };
        let list = this.syncResult.cueLists.find((l) => l.list === ev.list);
        if (!list) { list = { list: ev.list, label: '', cues: [] }; this.syncResult.cueLists.push(list); }
        if (ev.kind === 'cueListEntry') list.label = ev.label;
        else if (ev.part <= 1 && !list.cues.some((c) => c.cue === ev.cue)) list.cues.push({ cue: ev.cue, label: ev.label });
        break;
      }
      default: return;
    }
    this.pushStatus();
  }

  // ───────────────────────────── commands ─────────────────────────────

  private resolve(target: Target): ResolvedTarget {
    const fixtures = this.cfg.fixtures;
    if (target.type === 'group') {
      const g = this.cfg.groups.find((x) => x.id === target.groupId);
      if (!g) throw new Error('Unknown group');
      const set = new Set(g.channels);
      const fx = fixtures.filter((f) => set.has(f.channel));
      const unpatched = g.channels.filter((c) => !fx.some((f) => f.channel === c));
      if (unpatched.length) throw new Error(`${g.name} lists channel(s) ${unpatched.slice(0, 6).join(', ')} that are not in this app's patch. Fix the group in Settings → Groups.`);
      // Never trust the local list as proof of what Eos Group N contains.
      const verified = g.eosGroup != null && this.groupAddressable(g.id) != null;
      return {
        channels: g.channels, eosGroup: verified ? g.eosGroup : null, fixtures: fx,
        label: g.eosGroup != null && !verified ? `${g.name} (as channel list; Eos Group ${g.eosGroup} not verified)` : g.name,
      };
    }
    const set = new Set(target.channels);
    const fx = fixtures.filter((f) => set.has(f.channel));
    if (fx.length === 0) throw new Error('None of those channels are in the patch');
    const missing = target.channels.filter((c) => !fx.some((f) => f.channel === c));
    if (missing.length) throw new Error(`Channel(s) ${missing.join(', ')} are not in the patch`);
    return { channels: fx.map((f) => f.channel), eosGroup: null, fixtures: fx, label: fx.length === 1 ? `Chan ${fx[0].channel}` : `${fx.length} channels` };
  }

  private protectedIn(t: ResolvedTarget): Fixture[] {
    if (this.protectedUnlockedUntil && this.protectedUnlockedUntil > Date.now()) return [];
    return t.fixtures.filter((f) => f.protected);
  }

  private profileOf(f: Fixture) {
    return this.cfg.profiles.find((p) => p.id === f.profileId);
  }

  private builder(): EosCommandBuilder {
    return this.eos?.builder ?? new EosCommandBuilder(this.cfg.settings.connection.oscUser);
  }

  /**
   * Decide what happens to a command based on the operating mode.
   * `build` produces the OSC messages; `simulate` updates the local preview.
   */
  private deliver(description: string, build: () => OscMessage[], simulate: (source: ValueSource) => void, rateKey?: string): CommandResult {
    let msgs: OscMessage[];
    try { msgs = build(); } catch (e) { return { ok: false, delivery: 'error', message: (e as Error).message }; }
    const osc = msgs.map(formatMessage);
    switch (this.mode) {
      case 'offline':
        simulate('simulated');
        return { ok: true, delivery: 'simulated', message: `${description} — preview only (offline). Nothing was sent to the Ion.`, osc };
      case 'eos-monitor':
        return { ok: false, delivery: 'blocked', message: 'Monitor mode is read-only. Switch to Live Control to send commands.', osc };
      case 'direct-dmx':
        return { ok: false, delivery: 'blocked', message: 'Direct DMX mode is not implemented.' };
      case 'eos-live': {
        const eos = this.eos;
        if (!eos || this.connection().state !== 'connected') {
          return { ok: false, delivery: 'error', message: `Not connected to the Ion — nothing was sent. (${this.connection().detail})`, osc };
        }
        const send = () => {
          try { eos.transmit(msgs); }
          catch (e) { this.log('error', `${description}: ${(e as Error).message}`); }
        };
        if (rateKey) {
          const how = this.limiter.run(rateKey, send);
          simulate('commanded');
          return { ok: true, delivery: 'sent', message: `${description} — sent to Ion${how === 'queued' ? ' (rate-limited, latest value)' : ''}`, osc };
        }
        try { eos.transmit(msgs); } catch (e) { return { ok: false, delivery: 'error', message: (e as Error).message, osc }; }
        simulate('commanded');
        return { ok: true, delivery: 'sent', message: `${description} — sent to Ion`, osc };
      }
    }
  }

  private setLevels(channels: number[], source: ValueSource, fn: (prev: FixtureState, f: Fixture) => FixtureState) {
    for (const f of this.cfg.fixtures) {
      if (!channels.includes(f.channel)) continue;
      this.levels[f.channel] = fn(this.levels[f.channel] ?? { intensity: 0 }, f);
      this.sources[f.channel] = source;
    }
    this.markLevelsDirty();
  }

  async execute(cmd: Command, role: Role | null): Promise<CommandResult> {
    if (!role) return { ok: false, delivery: 'blocked', message: 'Sign in with a PIN to control lights.' };
    if (role === 'volunteer' && !VOLUNTEER_KINDS.has(cmd.kind)) {
      return { ok: false, delivery: 'blocked', message: 'This control needs an operator PIN.' };
    }
    try {
      return await this.executeInner(cmd, role);
    } catch (e) {
      return { ok: false, delivery: 'error', message: (e as Error).message };
    }
  }

  private async executeInner(cmd: Command, role: Role): Promise<CommandResult> {
    const b = this.builder();
    switch (cmd.kind) {
      case 'select':
      case 'setIntensity': {
        if (role === 'volunteer' && (cmd.target.type !== 'group' || !this.cfg.groups.find((g) => g.id === (cmd.target as { groupId: string }).groupId)?.volunteerVisible)) {
          return { ok: false, delivery: 'blocked', message: 'Volunteers can only adjust the groups shown in Volunteer mode.' };
        }
        const t = this.resolve(cmd.target);
        const prot = this.protectedIn(t);
        if (prot.length) return this.protectedBlocked(prot);
        if (cmd.kind === 'select') {
          return this.deliver(`Select ${t.label}`, () => b.select(t), () => {});
        }
        const v = clamp(cmd.value, 0, 100);
        return this.deliver(`${t.label} @ ${Math.round(v)}%`, () => b.intensity(t, v),
          // Key by the target the operator chose, not by how it is addressed, so a group whose
          // verification changes mid-drag keeps one slot and the latest value always wins.
          (src) => this.setLevels(t.channels, src, (p) => ({ ...p, intensity: v })), `int:${cmd.target.type === 'group' ? `g:${cmd.target.groupId}` : t.channels.join(',')}`);
      }
      case 'setColor': {
        const t = this.resolve(cmd.target);
        const prot = this.protectedIn(t);
        if (prot.length) return this.protectedBlocked(prot);
        const capable = t.fixtures.filter((f) => this.profileOf(f)?.capabilities.includes('rgb'));
        if (!capable.length) return { ok: false, delivery: 'error', message: `${t.label} has no RGB-capable fixtures` };
        const rgb = { r: clamp(cmd.rgb.r, 0, 100), g: clamp(cmd.rgb.g, 0, 100), b: clamp(cmd.rgb.b, 0, 100) };
        const names = this.profileOf(capable[0])!.eosParams;
        const sub = { channels: capable.map((f) => f.channel), eosGroup: capable.length === t.fixtures.length ? t.eosGroup : null };
        return this.deliver(`${t.label} color`, () => b.params(sub, [
          { eosName: names.red ?? 'Red', value: rgb.r }, { eosName: names.green ?? 'Green', value: rgb.g }, { eosName: names.blue ?? 'Blue', value: rgb.b },
        ]), (src) => this.setLevels(sub.channels, src, (p) => ({ ...p, color: rgb })), `rgb:${sub.channels.join(',')}`);
      }
      case 'setParam': {
        const t = this.resolve(cmd.target);
        const prot = this.protectedIn(t);
        if (prot.length) return this.protectedBlocked(prot);
        const cap = PARAM_CAPABILITY[cmd.param];
        const capable = t.fixtures.filter((f) => this.profileOf(f)?.capabilities.includes(cap) && this.profileOf(f)?.eosParams[cmd.param]);
        if (!capable.length) return { ok: false, delivery: 'error', message: `${t.label} has no fixtures with ${cmd.param}` };
        const eosName = this.profileOf(capable[0])!.eosParams[cmd.param]!;
        const value = paramValueForEos(cmd.param, cmd.value);
        const sub = { channels: capable.map((f) => f.channel), eosGroup: capable.length === t.fixtures.length ? t.eosGroup : null };
        return this.deliver(`${t.label} ${eosName} ${Math.round(value)}`, () => b.params(sub, [{ eosName, value }]),
          (src) => this.setLevels(sub.channels, src, (p) => ({ ...p, [cmd.param]: value })), `p:${cmd.param}:${sub.channels.join(',')}`);
      }
      case 'fireLook': {
        const look = this.cfg.looks.find((l) => l.id === cmd.lookId);
        if (!look) return { ok: false, delivery: 'error', message: 'Unknown look' };
        if (role === 'volunteer' && !look.volunteerVisible) return { ok: false, delivery: 'blocked', message: 'This look is operator-only.' };
        const applyPreview = () => this.applyLookPreview(look.id);
        const a = look.action;
        if (a.type === 'none') {
          applyPreview();
          return {
            ok: true, delivery: 'simulated',
            message: this.mode === 'eos-live'
              ? `“${look.name}” is not mapped to an Eos cue/preset/macro yet — only the on-screen preview changed. Map it in Settings → Looks.`
              : `“${look.name}” — preview only (not mapped to an Eos action).`,
          };
        }
        if (a.type === 'macro' && role !== 'operator') {
          return { ok: false, delivery: 'blocked', message: 'Macro looks are operator-only — a macro can do anything on the console.' };
        }
        const build = (): OscMessage[] => {
          switch (a.type) {
            case 'cue': return b.fireCue(a.list, a.cue);
            case 'preset': {
              // A preset is applied to "Group N", so the same verification rule applies.
              const verified = this.cfg.groups.some((g) => g.eosGroup === a.eosGroup && this.groupAddressable(g.id));
              if (this.mode !== 'offline' && !verified) {
                throw new Error(`Preset look needs Eos Group ${a.eosGroup} to be verified against a local group (Settings → Groups). Nothing was sent.`);
              }
              return b.preset(a.preset, a.eosGroup);
            }
            case 'macro': return b.macro(a.macro);
            case 'sub': return b.sub(a.sub, a.level);
            case 'snapshot': return b.snapshot(a.snapshot);
          }
        };
        const res = this.deliver(`Look “${look.name}”`, build, () => {
          applyPreview();
          if (a.type === 'cue' && this.mode === 'offline') this.simulateCue(a.list, a.cue);
          if (a.type === 'sub') { this.subs[a.sub] = a.level; this.markLevelsDirty(); }
        });
        return res;
      }
      case 'fireCue': {
        return this.deliver(`Cue ${cmd.list}/${cmd.cue}`, () => b.fireCue(cmd.list, cmd.cue), () => {
          if (this.mode === 'offline') this.simulateCue(cmd.list, cmd.cue);
        });
      }
      case 'go':
      case 'back': {
        const master = this.cfg.settings.masterCueList;
        const list = cmd.list ?? master;
        if (list !== master && role !== 'operator') {
          return { ok: false, delivery: 'blocked', message: `Volunteers can only GO/BACK the master cue list (${master}).` };
        }
        const gb = this.goBackStatus(list);
        if (gb.method === 'keys' && list !== master) {
          return { ok: false, delivery: 'error', message: `GO/BACK use console keys on this Eos version, which act on the master playback — they can't target cue list ${list}.` };
        }
        const go = cmd.kind === 'go';
        const label = `${go ? 'GO' : 'BACK'} ${gb.method === 'cue-list' ? `cue list ${list}` : '(master playback key)'}`;
        const build = () => gb.method === 'cue-list'
          ? (go ? b.cueListGo(list) : b.cueListStop(list))
          : b.key(go ? this.cfg.settings.connection.goKey : this.cfg.settings.connection.backKey);
        return this.deliver(label, build, () => {
          if (this.mode === 'offline') this.simulateStep(go ? 1 : -1, gb.method === 'cue-list' ? list : this.cfg.settings.masterCueList);
        });
      }
      case 'release': {
        const t = this.resolve(cmd.target);
        const prot = this.protectedIn(t);
        if (prot.length) return this.protectedBlocked(prot);
        const res = this.deliver(`Release ${t.label} (Sneak)`, () => b.release(t), (src) => {
          if (src === 'simulated') this.setLevels(t.channels, src, () => ({ intensity: 0 }));
        });
        const lt = this.cfg.settings.commissioning.liveTest;
        if (res.delivery === 'sent' && lt && !lt.released && t.channels.length === 1 && t.channels[0] === lt.channel) {
          this.recordCommissioning({ liveTest: { ...lt, released: true } });
        }
        return res;
      }
      case 'singleChannelTest':
        return this.singleChannelTest(cmd.channel, cmd.level, cmd.confirmChannel);
      case 'verifyGroups': {
        if (this.mode === 'offline' || !this.eos) return { ok: false, delivery: 'blocked', message: 'Connect in Monitor or Live mode to read groups from the console.' };
        if (!this.eos.supportsThirdPartyApi) return { ok: false, delivery: 'error', message: 'Reading groups needs the Eos 2.x+ /eos/get API.' };
        this.requestGroupVerification(true);
        return { ok: true, delivery: 'sent', message: 'Reading group membership from the console (read-only)…' };
      }
      case 'setSub': {
        const sub = this.cfg.submasters.find((s) => s.sub === cmd.sub);
        if (role === 'volunteer' && !sub?.volunteerVisible) return { ok: false, delivery: 'blocked', message: 'This submaster is operator-only.' };
        if (sub?.protected && !(this.protectedUnlockedUntil && this.protectedUnlockedUntil > Date.now())) {
          return { ok: false, delivery: 'blocked', message: `Sub ${cmd.sub} is protected. Unlock protected controls first.` };
        }
        const v = clamp(cmd.value, 0, 100);
        return this.deliver(`Sub ${cmd.sub} @ ${Math.round(v)}%`, () => b.sub(cmd.sub, v), () => { this.subs[cmd.sub] = v; this.markLevelsDirty(); }, `sub:${cmd.sub}`);
      }
      case 'setMode':
        return this.setMode(cmd.mode, !!cmd.confirm);
      case 'unlockProtected': {
        if (!cmd.confirm) return { ok: false, delivery: 'blocked', message: 'Unlocking protected channels needs confirmation.' };
        const mins = this.cfg.settings.safety.protectedUnlockMinutes;
        this.protectedUnlockedUntil = Date.now() + mins * 60_000;
        this.log('warn', `Protected relay/utility channels unlocked for ${mins} minutes.`);
        this.pushStatus();
        return { ok: true, delivery: 'simulated', message: `Protected channels unlocked for ${mins} minutes` };
      }
      case 'lockProtected':
        this.protectedUnlockedUntil = null;
        this.log('info', 'Protected channels locked.');
        this.pushStatus();
        return { ok: true, delivery: 'simulated', message: 'Protected channels locked' };
      case 'testConnection':
        // Only an operator's test is recorded as a commissioning result.
        return this.testConnection(role === 'operator');
      case 'syncFromConsole': {
        if (this.mode === 'offline' || !this.eos) return { ok: false, delivery: 'blocked', message: 'Connect in Monitor or Live mode first.' };
        if (this.connection().state !== 'connected') return { ok: false, delivery: 'error', message: 'Console is not responding yet.' };
        this.syncResult = { startedAt: Date.now(), patch: [], cueLists: [] };
        try { this.eos.requestSync(); } catch (e) { return { ok: false, delivery: 'error', message: (e as Error).message }; }
        this.log('info', 'Requested patch and cue list data from the console (read-only).');
        return { ok: true, delivery: 'sent', message: 'Reading patch and cue lists from the console… results appear in Settings → Patch.' };
      }
    }
  }

  private protectedBlocked(prot: Fixture[]): CommandResult {
    const list = prot.slice(0, 6).map((f) => f.channel).join(', ') + (prot.length > 6 ? '…' : '');
    return { ok: false, delivery: 'blocked', message: `Protected channel(s) ${list} (relays/utility). Unlock protected controls first.` };
  }

  private async testConnection(record: boolean): Promise<CommandResult> {
    if (this.mode === 'offline' || !this.eos) {
      return { ok: false, delivery: 'blocked', message: 'Offline mode sends no network traffic. Switch to Ion Monitor to test the connection.' };
    }
    const before = this.eos.connection().lastRxAt ?? 0;
    const sentAt = Date.now();
    try { this.eos.transmit([this.builder().ping()]); } catch (e) { return { ok: false, delivery: 'error', message: (e as Error).message }; }
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const rx = this.eos?.connection().lastRxAt ?? 0;
      if (rx > before && rx >= sentAt) {
        // Give a version reply a moment to arrive so the record includes it.
        if (!this.consoleVersion && this.eos?.supportsThirdPartyApi) {
          try { this.eos.transmit([this.builder().getVersion()], { quiet: true }); } catch { /* ignore */ }
          for (let j = 0; j < 10 && !this.consoleVersion; j++) await new Promise((r) => setTimeout(r, 100));
        }
        const message = `Console replied in ${rx - sentAt} ms${this.consoleVersion ? ` (Eos ${this.consoleVersion})` : ''}.`;
        if (record) this.recordCommissioning({ monitorTest: { at: Date.now(), ok: true, replyMs: rx - sentAt, reportedVersion: this.consoleVersion, detail: message } });
        return { ok: true, delivery: 'sent', message };
      }
    }
    const message = 'No reply within 3 s. Check IP, ports, transport and that OSC RX/TX are enabled on the console.';
    if (record) this.recordCommissioning({ monitorTest: { at: Date.now(), ok: false, replyMs: null, reportedVersion: null, detail: message } });
    return { ok: false, delivery: 'error', message };
  }

  /**
   * Setup-wizard live test: exactly one channel, typed confirmation, live mode only,
   * never a protected channel and never a channel the console patch doesn't have.
   */
  private singleChannelTest(channel: number, level: number, confirmChannel: number): CommandResult {
    if (this.mode !== 'eos-live') return { ok: false, delivery: 'blocked', message: 'Arm Live Control first (the wizard asks you to).' };
    const conn = this.status().connection;
    if (conn.state !== 'connected' || conn.stale) return { ok: false, delivery: 'error', message: 'The console is not responding — nothing was sent.' };
    if (!Number.isInteger(channel) || channel !== confirmChannel) return { ok: false, delivery: 'blocked', message: 'Type the channel number again to confirm. Nothing was sent.' };
    const f = this.cfg.fixtures.find((x) => x.channel === channel);
    if (!f) return { ok: false, delivery: 'blocked', message: `Channel ${channel} is not in this app's patch.` };
    if (f.protected) return { ok: false, delivery: 'blocked', message: `Channel ${channel} is protected (relay/utility) and cannot be used for the test.` };
    if (this.syncResult?.patch.length && !this.syncResult.patch.some((p) => p.channel === channel)) {
      return { ok: false, delivery: 'blocked', message: `The console patch read in this session has no channel ${channel}.` };
    }
    const v = Math.round(clamp(level, 1, 100));
    const res = this.deliver(`Setup test: Chan ${channel} @ ${v}%`, () => this.builder().intensity({ channels: [channel], eosGroup: null }, v),
      (src) => this.setLevels([channel], src, (p) => ({ ...p, intensity: v })));
    if (res.delivery === 'sent') {
      this.log('warn', `Setup wizard live test sent: Chan ${channel} At ${v}.`);
      this.recordCommissioning({ liveTest: { at: Date.now(), channel, level: v, operatorConfirmedLight: null, released: false } });
    }
    return res;
  }

  // ───────────────────────────── simulation helpers ─────────────────────────────

  private applyLookPreview(lookId: string) {
    const look = this.cfg.looks.find((l) => l.id === lookId);
    if (!look) return;
    for (const entry of look.preview) {
      const g = this.cfg.groups.find((x) => x.id === entry.groupId);
      if (!g) continue;
      this.setLevels(g.channels, 'simulated', (p, f) => {
        const caps = this.profileOf(f)?.capabilities ?? [];
        return {
          ...p,
          intensity: entry.intensity,
          ...(entry.color && caps.includes('rgb') ? { color: entry.color } : {}),
          ...(entry.cct && caps.includes('cct') ? { cct: entry.cct } : {}),
        };
      });
    }
  }

  private simulateCue(list: number, cue: string) {
    const cfgList = this.cfg.cueLists.find((l) => l.list === list);
    const entry = cfgList?.cues.find((c) => c.cue === cue);
    const prev = this.feedback.activeCue;
    const make = (c: string | null, label: string | null, progress: number | null): CueFeedback => ({
      list, cue: c, label, text: c ? `${list}/${c} ${label ?? ''}`.trim() : '', progress, receivedAt: Date.now(), source: 'simulated',
    });
    this.feedback.previousCue = prev;
    this.feedback.activeCue = make(cue, entry?.label ?? null, 0);
    const idx = cfgList?.cues.findIndex((c) => c.cue === cue) ?? -1;
    const next = idx >= 0 ? cfgList!.cues[idx + 1] : undefined;
    this.feedback.pendingCue = next ? make(next.cue, next.label, null) : null;
    // A look mapped to this cue gives the preview something to show.
    const look = this.cfg.looks.find((l) => l.action.type === 'cue' && l.action.list === list && l.action.cue === cue);
    if (look) this.applyLookPreview(look.id);
    if (this.simFade) clearInterval(this.simFade);
    const start = Date.now();
    this.simFade = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / 2500) * 100);
      if (this.feedback.activeCue?.source === 'simulated') this.feedback.activeCue = { ...this.feedback.activeCue, progress: p };
      if (p >= 100 && this.simFade) { clearInterval(this.simFade); this.simFade = null; }
      this.pushStatus();
    }, 100);
    this.pushStatus();
  }

  private simulateStep(dir: 1 | -1, list = this.cfg.settings.masterCueList) {
    const cues = this.cfg.cueLists.find((l) => l.list === list)?.cues ?? [];
    if (!cues.length) return;
    const cur = this.feedback.activeCue?.list === list ? this.feedback.activeCue.cue : null;
    const idx = cur ? cues.findIndex((c) => c.cue === cur) : -1;
    const nextIdx = clamp(idx + dir, 0, cues.length - 1);
    if (dir === -1 && idx <= 0) return;
    this.simulateCue(list, cues[nextIdx].cue);
  }
}
