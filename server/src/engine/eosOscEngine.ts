import type { ConnectionSettings } from '@sanctuary/shared';
import { formatMessage, type OscMessage } from '../osc/codec';
import { TcpLink, UdpLink, type OscLink } from '../osc/transport';
import { EosCommandBuilder, isReadOnlyAddress } from './eosCommands';
import { parseFeedback } from './eosFeedback';
import type { EngineConnection, EngineHooks, OutputEngine } from './types';

export class EosOscEngine implements OutputEngine {
  readonly id = 'eos-osc' as const;
  readonly builder: EosCommandBuilder;
  private link: OscLink | null = null;
  private running = false;
  private heartbeat: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 2000;
  private conn: EngineConnection = { state: 'disabled', detail: 'Not started', target: null, lastRxAt: null, lastTxAt: null };
  /** When false (Monitor mode) only read-only addresses may be transmitted. */
  allowLighting = false;
  private syncQueue: OscMessage[] = [];
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(private settings: ConnectionSettings, private hooks: EngineHooks) {
    this.builder = new EosCommandBuilder(settings.oscUser);
  }

  get supportsThirdPartyApi() { return this.settings.eosVersion !== '1.x'; }

  connection(): EngineConnection { return { ...this.conn }; }

  private setConn(patch: Partial<EngineConnection>) {
    this.conn = { ...this.conn, ...patch };
    this.hooks.onConnectionChange();
  }

  start() {
    if (this.running) return;
    const s = this.settings;
    if (!s.consoleIp) {
      this.setConn({ state: 'error', detail: 'No console IP address configured (Settings → Connection)' });
      return;
    }
    if (s.transport !== 'udp' && s.eosVersion === '1.x') {
      this.setConn({ state: 'error', detail: 'OSC over TCP needs Eos 2.0 or later. Use UDP for Eos 1.x.' });
      return;
    }
    this.running = true;
    this.openLink();
    this.heartbeat = setInterval(() => this.ping(), Math.max(1, s.heartbeatSeconds) * 1000);
  }

  private openLink() {
    const s = this.settings;
    const link: OscLink = s.transport === 'udp'
      ? new UdpLink({ host: s.consoleIp, consolePort: s.udpConsolePort, localPort: s.udpLocalPort })
      : new TcpLink({ host: s.consoleIp, port: s.tcpPort, framing: s.transport === 'tcp-1.1' ? 'slip' : 'length' });
    this.link = link;
    this.setConn({ state: 'connecting', detail: `Connecting: ${link.description}`, target: link.description });
    link.on('open', () => {
      this.reconnectDelay = 2000;
      this.setConn({
        state: link.kind === 'udp' ? 'connecting' : 'connected',
        detail: link.kind === 'udp' ? 'UDP socket ready — waiting for a reply from the console' : 'TCP connected',
      });
      this.hooks.log('info', `OSC link open (${link.description})`);
      this.onOpen();
    });
    link.on('message', (m) => this.onMessage(m));
    link.on('error', (e) => {
      this.hooks.log('error', `OSC ${link.kind}: ${e.message}`);
      this.setConn({ detail: e.message, ...(link.isOpen ? {} : { state: 'error' as const }) });
    });
    link.on('close', (why) => {
      if (this.link !== link) return;
      this.link = null;
      if (!this.running) return;
      this.setConn({ state: 'disconnected', detail: `Lost connection (${why}); retrying in ${Math.round(this.reconnectDelay / 1000)}s` });
      this.hooks.log('warn', `OSC link closed: ${why}`);
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; if (this.running) this.openLink(); }, this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
    });
    link.open();
  }

  private onOpen() {
    this.ping();
    if (this.supportsThirdPartyApi) {
      this.transmit([this.builder.getVersion(), this.builder.subscribe()]);
    }
  }

  private onMessage(m: OscMessage) {
    const now = Date.now();
    const first = this.conn.lastRxAt == null || this.conn.state !== 'connected';
    this.conn.lastRxAt = now;
    if (first) this.setConn({ state: 'connected', detail: 'Receiving OSC from console' });
    if (!m.address.startsWith('/eos/out/ping')) this.hooks.log('rx', formatMessage(m));
    const ev = parseFeedback(m, now);
    if (ev.kind === 'count') this.queueSyncFollowUp(ev);
    if (ev.kind === 'cueListEntry') this.queueSync([{ address: `/eos/get/cue/${ev.list}/count`, args: [] }]);
    this.hooks.onFeedback(ev, m);
  }

  private ping() {
    if (this.link?.isOpen) this.transmit([this.builder.ping()], { quiet: true });
  }

  /**
   * The only path to the network. Enforces read-only Monitor mode as a final gate,
   * independent of the controller's checks.
   */
  transmit(msgs: OscMessage[], opts: { quiet?: boolean } = {}): string[] {
    if (!this.link?.isOpen) throw new Error(`Not connected to console (${this.conn.detail})`);
    const blocked = msgs.find((m) => !this.allowLighting && !isReadOnlyAddress(m.address));
    if (blocked) throw new Error(`Blocked in read-only mode: ${blocked.address}`);
    const sent: string[] = [];
    for (const m of msgs) {
      this.link.send(m);
      const f = formatMessage(m);
      sent.push(f);
      if (!opts.quiet) this.hooks.log('tx', f);
    }
    this.conn.lastTxAt = Date.now();
    return sent;
  }

  /** Read show data via the Eos 2.x third-party API. Read-only. */
  requestSync() {
    if (!this.supportsThirdPartyApi) throw new Error('Reading patch/cue data needs Eos 2.0 or later; use CSV/JSON import instead.');
    this.queueSync([
      { address: '/eos/get/patch/count', args: [] },
      { address: '/eos/get/cuelist/count', args: [] },
    ]);
  }

  private queueSyncFollowUp(ev: { what: 'patch' | 'cuelist' | 'cue'; list?: number; count: number }) {
    const n = Math.min(Math.max(0, Math.trunc(ev.count)), 2000);
    const base = ev.what === 'cue' ? `/eos/get/cue/${ev.list}` : `/eos/get/${ev.what}`;
    const msgs: OscMessage[] = [];
    for (let i = 0; i < n; i++) msgs.push({ address: `${base}/index/${i}`, args: [] });
    this.queueSync(msgs);
  }

  /** Drip sync requests (~200/s) so we never flood the console. */
  private queueSync(msgs: OscMessage[]) {
    this.syncQueue.push(...msgs);
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      const batch = this.syncQueue.splice(0, 10);
      if (batch.length === 0 || !this.link?.isOpen) {
        clearInterval(this.syncTimer!); this.syncTimer = null; this.syncQueue = [];
        return;
      }
      try { this.transmit(batch, { quiet: true }); } catch (e) { this.hooks.log('warn', `Sync request failed: ${(e as Error).message}`); }
    }, 50);
  }

  stop() {
    // Never send anything on stop: no blackout, no release. The Ion keeps its state.
    this.running = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.heartbeat = this.reconnectTimer = this.syncTimer = null;
    this.syncQueue = [];
    const link = this.link;
    this.link = null;
    link?.close();
    this.setConn({ state: 'disabled', detail: 'Disconnected by operator (nothing was sent to the console)', lastRxAt: null });
  }
}
