import { describe, expect, it } from 'vitest';
import { decodePacket, encodeMessage, float, int, str } from '../src/osc/codec';
import { LengthPrefixDecoder, SlipDecoder, lengthPrefixEncode, slipEncode } from '../src/osc/framing';

describe('OSC codec', () => {
  it('encodes a string message with 4-byte padding', () => {
    const buf = encodeMessage({ address: '/eos/newcmd', args: [str('Chan 1 At 50 #')] });
    expect(buf.length % 4).toBe(0);
    // "/eos/newcmd\0" = 12 bytes, ",s\0\0" = 4 bytes
    expect(buf.subarray(0, 12).toString()).toBe('/eos/newcmd\0');
    expect(buf.subarray(12, 16).toString()).toBe(',s\0\0');
  });

  it('round-trips mixed arguments', () => {
    const msg = { address: '/eos/sub/3', args: [float(0.5), int(7), str('héllo'), { type: 'T' as const, value: true as const }] };
    const [out] = decodePacket(encodeMessage(msg));
    expect(out.address).toBe('/eos/sub/3');
    expect(out.args.map((a) => a.value)).toEqual([0.5, 7, 'héllo', true]);
  });

  it('handles empty argument lists', () => {
    const [out] = decodePacket(encodeMessage({ address: '/eos/ping', args: [] }));
    expect(out).toEqual({ address: '/eos/ping', args: [] });
  });

  it('decodes bundles', () => {
    const a = encodeMessage({ address: '/a', args: [int(1)] });
    const b = encodeMessage({ address: '/b', args: [] });
    const head = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8)]);
    const size = (n: number) => { const s = Buffer.alloc(4); s.writeInt32BE(n); return s; };
    const bundle = Buffer.concat([head, size(a.length), a, size(b.length), b]);
    expect(decodePacket(bundle).map((m) => m.address)).toEqual(['/a', '/b']);
  });

  it('rejects truncated packets', () => {
    const buf = encodeMessage({ address: '/x', args: [int(5)] });
    expect(() => decodePacket(buf.subarray(0, buf.length - 2))).toThrow();
  });
});

describe('TCP framing', () => {
  it('SLIP escapes END/ESC and reassembles across chunks', () => {
    const pkt = Buffer.from([1, 0xc0, 2, 0xdb, 3]);
    const enc = slipEncode(pkt);
    const dec = new SlipDecoder();
    const out = [...dec.push(enc.subarray(0, 3)), ...dec.push(enc.subarray(3))];
    expect(out).toEqual([pkt]);
  });

  it('length-prefix decoder handles split and coalesced packets', () => {
    const p1 = encodeMessage({ address: '/one', args: [] });
    const p2 = encodeMessage({ address: '/two', args: [float(1)] });
    const stream = Buffer.concat([lengthPrefixEncode(p1), lengthPrefixEncode(p2)]);
    const dec = new LengthPrefixDecoder();
    const out = [...dec.push(stream.subarray(0, 5)), ...dec.push(stream.subarray(5))];
    expect(out.flatMap((p) => decodePacket(p)).map((m) => m.address)).toEqual(['/one', '/two']);
  });
});
