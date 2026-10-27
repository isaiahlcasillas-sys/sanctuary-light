import dgram from 'node:dgram';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import type { OscTransport } from '@sanctuary/shared';
import { decodePacket, encodeMessage, type OscMessage } from './codec';
import { LengthPrefixDecoder, SlipDecoder, lengthPrefixEncode, slipEncode } from './framing';

export const isLoopback = (host: string) => host === '127.0.0.1' || host === 'localhost';

export interface TransportEvents {
  message: [OscMessage];
  open: [];
  close: [string];
  error: [Error];
}

/** A bidirectional OSC link to an Eos console. */
export interface OscLink extends EventEmitter<TransportEvents> {
  readonly kind: OscTransport;
  readonly description: string;
  /** true when a stream is established (TCP) or the socket is bound (UDP). */
  readonly isOpen: boolean;
  open(): void;
  send(msg: OscMessage): void;
  close(): void;
  /** Drop a connection that has stopped answering so it can be re-opened (TCP only). */
  reset?(): void;
}

export interface UdpOptions { host: string; consolePort: number; localPort: number }

/**
 * UDP: we send to the console's "OSC UDP RX Port" and listen on our own port.
 * The console must be configured (Shell / Network settings) to transmit OSC to this
 * computer's IP and port, otherwise no feedback will arrive.
 */
export class UdpLink extends EventEmitter<TransportEvents> implements OscLink {
  readonly kind = 'udp' as const;
  private socket: dgram.Socket | null = null;
  isOpen = false;
  constructor(private opts: UdpOptions) { super(); }
  get description() { return `UDP → ${this.opts.host}:${this.opts.consolePort}, listening on :${this.opts.localPort}`; }

  open() {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = sock;
    sock.on('message', (buf, rinfo) => {
      if (rinfo.address !== this.opts.host && !isLoopback(this.opts.host)) {
        // Ignore OSC from other machines so a stray device can't fake console feedback.
        return;
      }
      try { for (const m of decodePacket(buf)) this.emit('message', m); }
      catch (e) { this.emit('error', e as Error); }
    });
    sock.on('error', (e) => { this.emit('error', e); });
    sock.on('close', () => { this.isOpen = false; this.emit('close', 'socket closed'); });
    // When Eos runs on this same computer, listen on loopback only: nothing on the network can
    // reach the socket, and Windows Firewall doesn't prompt.
    const address = isLoopback(this.opts.host) ? '127.0.0.1' : undefined;
    sock.bind({ port: this.opts.localPort, address }, () => { this.isOpen = true; this.emit('open'); });
  }

  send(msg: OscMessage) {
    if (!this.socket || !this.isOpen) throw new Error('UDP socket is not open');
    this.socket.send(encodeMessage(msg), this.opts.consolePort, this.opts.host);
  }

  close() {
    const s = this.socket;
    this.socket = null;
    if (s) { this.isOpen = false; try { s.close(); } catch { /* already closed */ } }
  }
}

export interface TcpOptions { host: string; port: number; framing: 'length' | 'slip'; connectTimeoutMs?: number }

/** TCP client to Eos (Eos acts as the server). Reconnection is handled by the engine. */
export class TcpLink extends EventEmitter<TransportEvents> implements OscLink {
  readonly kind: OscTransport;
  private socket: net.Socket | null = null;
  isOpen = false;
  constructor(private opts: TcpOptions) {
    super();
    this.kind = opts.framing === 'slip' ? 'tcp-1.1' : 'tcp-1.0';
  }
  get description() { return `TCP ${this.opts.framing === 'slip' ? 'OSC 1.1 / SLIP' : 'OSC 1.0 / length-prefixed'} → ${this.opts.host}:${this.opts.port}`; }

  open() {
    const decoder = this.opts.framing === 'slip' ? new SlipDecoder() : new LengthPrefixDecoder();
    const sock = net.createConnection({ host: this.opts.host, port: this.opts.port });
    this.socket = sock;
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 5000);
    sock.setTimeout(this.opts.connectTimeoutMs ?? 5000);
    sock.on('connect', () => { sock.setTimeout(0); this.isOpen = true; this.emit('open'); });
    sock.on('timeout', () => { sock.destroy(new Error('connection timed out')); });
    sock.on('data', (chunk) => {
      try {
        for (const pkt of decoder.push(chunk)) for (const m of decodePacket(pkt)) this.emit('message', m);
      } catch (e) { this.emit('error', e as Error); }
    });
    sock.on('error', (e) => this.emit('error', e));
    sock.on('close', () => {
      const was = this.socket === sock;
      this.isOpen = false;
      if (was) this.socket = null;
      this.emit('close', 'connection closed');
    });
  }

  send(msg: OscMessage) {
    if (!this.socket || !this.isOpen) throw new Error('TCP connection is not open');
    const pkt = encodeMessage(msg);
    this.socket.write(this.opts.framing === 'slip' ? slipEncode(pkt) : lengthPrefixEncode(pkt));
  }

  reset() {
    // destroy() (not end()): a console that vanished won't complete a graceful close.
    this.socket?.destroy(new Error('console stopped responding'));
  }

  close() {
    const s = this.socket;
    this.socket = null;
    this.isOpen = false;
    // end() flushes queued writes; we never send anything special on close.
    if (s) s.end();
  }
}
