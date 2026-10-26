/**
 * FAKE Eos console for development and automated tests — NOT a real Ion.
 *
 * Listens like Eos does (TCP 3032 length-prefixed, TCP 3037 SLIP, UDP 8000) and
 * answers a few documented requests so the full stack can be exercised without
 * hardware. It prints every OSC message it receives so you can see exactly what
 * Sanctuary Light would send to the real console.
 *
 *   npm run eos-sim            then set Console IP = 127.0.0.1 in Settings
 */
import dgram from 'node:dgram';
import net from 'node:net';
import { decodePacket, encodeMessage, float, formatMessage, str, type OscMessage } from '../src/osc/codec';
import { LengthPrefixDecoder, SlipDecoder, lengthPrefixEncode, slipEncode } from '../src/osc/framing';

export interface FakeEosOptions { slipPort?: number; lengthPort?: number; udpRx?: number; udpTx?: number; quiet?: boolean }

export interface FakeEos { received: string[]; ports: { slip: number; length: number }; close(): void }

export function startFakeEos(opts: FakeEosOptions = {}): Promise<FakeEos> {
const log = (s: string) => { if (!opts.quiet) console.log(s); };
const received: string[] = [];
const UDP_RX = opts.udpRx ?? 8000;
const UDP_TX = opts.udpTx ?? 8001;

let active = { list: 1, cue: '1', label: 'Fake cue' };

function respond(m: OscMessage, reply: (r: OscMessage) => void) {
  received.push(formatMessage(m));
  log(`[fake-eos] rx ${formatMessage(m)}`);
  const a = m.address.replace(/^\/eos\/user\/\d+/, '/eos');
  if (a === '/eos/ping') reply({ address: '/eos/out/ping', args: [] });
  if (a === '/eos/get/version') reply({ address: '/eos/out/get/version', args: [str('0.0.0 FAKE')] });
  if (a === '/eos/subscribe') reply({ address: '/eos/out/show/name', args: [str('FAKE SHOW (not a real console)')] });
  const fire = a.match(/^\/eos\/cue\/(\d+)\/([\d.]+)\/fire$/);
  if (fire) active = { list: Number(fire[1]), cue: fire[2], label: `Fake cue ${fire[2]}` };
  if (fire || (a === '/eos/key/go_0' && m.args[0]?.value === 1)) {
    if (!fire) active = { ...active, cue: String(Number(active.cue) + 1), label: `Fake cue ${Number(active.cue) + 1}` };
    reply({ address: '/eos/out/active/cue/text', args: [str(`${active.list}/${active.cue} ${active.label} 3 0%`)] });
    let p = 0;
    const t = setInterval(() => {
      p = Math.min(1, p + 0.1);
      reply({ address: `/eos/out/active/cue/${active.list}/${active.cue}`, args: [float(p)] });
      if (p >= 1) {
        clearInterval(t);
        reply({ address: '/eos/out/active/cue/text', args: [str(`${active.list}/${active.cue} ${active.label} 3 100%`)] });
      }
    }, 300);
  }
  if (a === '/eos/get/patch/count') reply({ address: '/eos/out/get/patch/count', args: [{ type: 'i', value: 2 }] });
  const pi = a.match(/^\/eos\/get\/patch\/index\/(\d+)$/);
  if (pi) {
    const i = Number(pi[1]); const ch = i + 1;
    reply({ address: `/eos/out/get/patch/${ch}/1/list/${i}/2`, args: [{ type: 'i', value: i }, str(`uid-${ch}`), str(`Fake ${ch}`), str('ETC'), str('Fake Fixture'), { type: 'i', value: 100 + ch }] });
  }
  if (a === '/eos/get/cuelist/count') reply({ address: '/eos/out/get/cuelist/count', args: [{ type: 'i', value: 0 }] });
}

function tcpServer(port: number, framing: 'slip' | 'length'): Promise<net.Server> {
  const srv = net.createServer((sock) => {
    log(`[fake-eos] TCP ${framing} client connected`);
    const dec = framing === 'slip' ? new SlipDecoder() : new LengthPrefixDecoder();
    const reply = (r: OscMessage) => { const p = encodeMessage(r); sock.write(framing === 'slip' ? slipEncode(p) : lengthPrefixEncode(p)); };
    sock.on('data', (d) => { for (const pkt of dec.push(d)) for (const m of decodePacket(pkt)) respond(m, reply); });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => {
    log(`[fake-eos] TCP ${framing} on 127.0.0.1:${(srv.address() as net.AddressInfo).port}`);
    resolve(srv);
  }));
}

const udp = dgram.createSocket('udp4');
udp.on('message', (buf, rinfo) => {
  for (const m of decodePacket(buf)) respond(m, (r) => udp.send(encodeMessage(r), UDP_TX, rinfo.address));
});

return Promise.all([tcpServer(opts.lengthPort ?? 3032, 'length'), tcpServer(opts.slipPort ?? 3037, 'slip')]).then(([len, slip]) => {
  if (!opts.quiet) udp.bind(UDP_RX, '127.0.0.1', () => log(`[fake-eos] UDP rx :${UDP_RX}, replies to :${UDP_TX}`));
  log('[fake-eos] THIS IS A SIMULATOR. No real lighting is connected.');
  return {
    received,
    ports: { length: (len.address() as net.AddressInfo).port, slip: (slip.address() as net.AddressInfo).port },
    close() { len.close(); slip.close(); try { udp.close(); } catch { /* not bound */ } },
  };
});
}

if (process.argv[1] && /fake-eos\.ts$/.test(process.argv[1])) void startFakeEos();
