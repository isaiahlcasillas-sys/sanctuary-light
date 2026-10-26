/**
 * Minimal, dependency-free OSC 1.0/1.1 codec (Open Sound Control spec 1.0).
 * Supports the argument types Eos uses: int32 (i), float32 (f), string (s),
 * blob (b), True/False/Nil (T/F/N), plus int64 (h) and double (d) on decode.
 */

export type OscArg =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'b'; value: Buffer }
  | { type: 'h'; value: bigint }
  | { type: 'd'; value: number }
  | { type: 'T'; value: true }
  | { type: 'F'; value: false }
  | { type: 'N'; value: null };

export interface OscMessage {
  address: string;
  args: OscArg[];
}

export const int = (value: number): OscArg => ({ type: 'i', value: Math.trunc(value) });
export const float = (value: number): OscArg => ({ type: 'f', value });
export const str = (value: string): OscArg => ({ type: 's', value });

function padLen(n: number): number {
  return (4 - (n % 4)) % 4;
}

function encodeString(s: string): Buffer {
  const raw = Buffer.from(s, 'utf8');
  // OSC strings are null-terminated and padded to a multiple of 4 bytes.
  return Buffer.concat([raw, Buffer.alloc(1 + padLen(raw.length + 1))]);
}

export function encodeMessage(msg: OscMessage): Buffer {
  if (!msg.address.startsWith('/')) throw new Error(`OSC address must start with "/": ${msg.address}`);
  const parts: Buffer[] = [encodeString(msg.address), encodeString(',' + msg.args.map((a) => a.type).join(''))];
  for (const arg of msg.args) {
    switch (arg.type) {
      case 'i': { const b = Buffer.alloc(4); b.writeInt32BE(arg.value | 0); parts.push(b); break; }
      case 'f': { const b = Buffer.alloc(4); b.writeFloatBE(arg.value); parts.push(b); break; }
      case 'd': { const b = Buffer.alloc(8); b.writeDoubleBE(arg.value); parts.push(b); break; }
      case 'h': { const b = Buffer.alloc(8); b.writeBigInt64BE(arg.value); parts.push(b); break; }
      case 's': parts.push(encodeString(arg.value)); break;
      case 'b': {
        const len = Buffer.alloc(4); len.writeInt32BE(arg.value.length);
        parts.push(len, arg.value, Buffer.alloc(padLen(arg.value.length)));
        break;
      }
      case 'T': case 'F': case 'N': break;
    }
  }
  return Buffer.concat(parts);
}

class Reader {
  pos = 0;
  constructor(private buf: Buffer) {}
  get remaining() { return this.buf.length - this.pos; }
  string(): string {
    const end = this.buf.indexOf(0, this.pos);
    if (end < 0) throw new Error('Unterminated OSC string');
    const s = this.buf.toString('utf8', this.pos, end);
    this.pos = end + 1 + padLen(end + 1 - this.pos);
    return s;
  }
  need(n: number) { if (this.remaining < n) throw new Error('Truncated OSC packet'); }
  int32() { this.need(4); const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v; }
  float32() { this.need(4); const v = this.buf.readFloatBE(this.pos); this.pos += 4; return v; }
  float64() { this.need(8); const v = this.buf.readDoubleBE(this.pos); this.pos += 8; return v; }
  int64() { this.need(8); const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return v; }
  blob() {
    const len = this.int32();
    this.need(len);
    const b = Buffer.from(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len + padLen(len);
    return b;
  }
  bytes(n: number) { this.need(n); const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; }
}

function decodeMessageBody(r: Reader, address: string): OscMessage {
  const args: OscArg[] = [];
  if (r.remaining === 0) return { address, args }; // very old senders omit the type tag
  const tags = r.string();
  if (!tags.startsWith(',')) throw new Error('Missing OSC type tag string');
  for (const t of tags.slice(1)) {
    switch (t) {
      case 'i': args.push({ type: 'i', value: r.int32() }); break;
      case 'f': args.push({ type: 'f', value: r.float32() }); break;
      case 'd': args.push({ type: 'd', value: r.float64() }); break;
      case 'h': args.push({ type: 'h', value: r.int64() }); break;
      case 's': case 'S': args.push({ type: 's', value: r.string() }); break;
      case 'b': args.push({ type: 'b', value: r.blob() }); break;
      case 'T': args.push({ type: 'T', value: true }); break;
      case 'F': args.push({ type: 'F', value: false }); break;
      case 'N': case 'I': args.push({ type: 'N', value: null }); break;
      case 't': r.int64(); args.push({ type: 'N', value: null }); break; // timetag arg, ignored
      default: throw new Error(`Unsupported OSC type tag "${t}"`);
    }
  }
  return { address, args };
}

/** Decode a packet (message or bundle) into a flat list of messages. */
export function decodePacket(buf: Buffer): OscMessage[] {
  const r = new Reader(buf);
  const head = r.string();
  if (head === '#bundle') {
    r.int64(); // timetag — Eos feedback is immediate, we process in arrival order
    const out: OscMessage[] = [];
    while (r.remaining > 0) {
      const size = r.int32();
      out.push(...decodePacket(Buffer.from(r.bytes(size))));
    }
    return out;
  }
  if (!head.startsWith('/')) throw new Error('Not an OSC packet');
  return [decodeMessageBody(r, head)];
}

export function argValue(a: OscArg | undefined): string | number | boolean | null {
  if (!a) return null;
  if (a.type === 'h') return Number(a.value);
  if (a.type === 'b') return `<blob ${a.value.length}b>`;
  return a.value;
}

export function formatMessage(msg: OscMessage): string {
  if (msg.args.length === 0) return msg.address;
  return `${msg.address} ${msg.args.map((a) => (a.type === 's' ? JSON.stringify(a.value) : `${argValue(a)}`)).join(' ')}`;
}
