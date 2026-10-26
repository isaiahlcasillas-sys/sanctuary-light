/**
 * Stream framing for OSC over TCP, as used by ETC Eos:
 *   - OSC 1.0 style: each packet is prefixed by its size as a big-endian int32 (Eos TCP port 3032)
 *   - OSC 1.1 style: packets are SLIP-encoded, RFC 1055, double-END framing (Eos TCP port 3037)
 */

const END = 0xc0;
const ESC = 0xdb;
const ESC_END = 0xdc;
const ESC_ESC = 0xdd;

export function slipEncode(packet: Buffer): Buffer {
  const out: number[] = [END];
  for (const byte of packet) {
    if (byte === END) out.push(ESC, ESC_END);
    else if (byte === ESC) out.push(ESC, ESC_ESC);
    else out.push(byte);
  }
  out.push(END);
  return Buffer.from(out);
}

export class SlipDecoder {
  private buf: number[] = [];
  private escaping = false;

  push(chunk: Buffer): Buffer[] {
    const packets: Buffer[] = [];
    for (const byte of chunk) {
      if (this.escaping) {
        this.buf.push(byte === ESC_END ? END : byte === ESC_ESC ? ESC : byte);
        this.escaping = false;
      } else if (byte === ESC) {
        this.escaping = true;
      } else if (byte === END) {
        if (this.buf.length > 0) packets.push(Buffer.from(this.buf));
        this.buf = [];
      } else {
        this.buf.push(byte);
      }
    }
    return packets;
  }
}

export function lengthPrefixEncode(packet: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeInt32BE(packet.length);
  return Buffer.concat([head, packet]);
}

const MAX_PACKET = 1 << 20;

export class LengthPrefixDecoder {
  private pending = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const packets: Buffer[] = [];
    while (this.pending.length >= 4) {
      const size = this.pending.readInt32BE(0);
      if (size < 0 || size > MAX_PACKET) {
        // Stream is out of sync; drop everything rather than misparse.
        this.pending = Buffer.alloc(0);
        throw new Error(`Invalid OSC packet length ${size}`);
      }
      if (this.pending.length < 4 + size) break;
      packets.push(Buffer.from(this.pending.subarray(4, 4 + size)));
      this.pending = this.pending.subarray(4 + size);
    }
    return packets;
  }
}
