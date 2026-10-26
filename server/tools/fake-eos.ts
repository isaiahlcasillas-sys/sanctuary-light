/**
 * FAKE Eos console for development and automated tests — NOT a real Ion.
 *
 * Listens like Eos does and answers a subset of the documented OSC API so the full
 * stack can be exercised without hardware:
 *   TCP 3032  OSC 1.0 packet-length (the Eos default framing for 3032)
 *   TCP 3037  OSC 1.1 SLIP "Third Party OSC" (Eos 3.1+; disabled when --version is 2.x)
 *   UDP 8000  replies to the sender on 8001
 * It prints every OSC message it receives so you can see exactly what Sanctuary Light
 * would send to the real console.
 *
 *   npm run eos-sim                         # behaves like Eos 3.3
 *   npm run eos-sim -- --version 2.9.3      # behaves like Eos 2.9 (no 3037, no /eos/cues)
 */
import dgram from 'node:dgram';
import net from 'node:net';
import { parseEosVersion, versionAtLeast } from '@sanctuary/shared';
import { decodePacket, encodeMessage, float, formatMessage, int, str, type OscArg, type OscMessage } from '../src/osc/codec';
import { LengthPrefixDecoder, SlipDecoder, lengthPrefixEncode, slipEncode } from '../src/osc/framing';

export interface FakeEosOptions {
  slipPort?: number;
  lengthPort?: number;
  udpRx?: number;
  udpTx?: number;
  quiet?: boolean;
  /** Reported Eos version; controls which addresses the fake understands. */
  version?: string;
  /** Eos groups: whole numbers or "x-y" range strings, as Eos sends them. */
  groups?: Record<number, (number | string)[]>;
}

export interface FakeEos {
  received: string[];
  ports: { slip: number | null; length: number };
  /** Change a group and notify subscribed clients, like editing it on the console. */
  setGroup(n: number, channels: (number | string)[]): void;
  close(): void;
}

export const FAKE_GROUPS: Record<number, (number | string)[]> = {
  1: ['20-29'],
  2: ['31-54', '71-78'],
  // Deliberately includes relay channels 61–62 to exercise group safety.
  3: ['1-19', 30, 61, 62, 79, 80],
};

export function startFakeEos(opts: FakeEosOptions = {}): Promise<FakeEos> {
  const log = (s: string) => { if (!opts.quiet) console.log(s); };
  const received: string[] = [];
  const version = opts.version ?? '3.3.10.0';
  const v = parseEosVersion(version);
  const has3037 = versionAtLeast(v, 3, 1);
  const hasCuesApi = versionAtLeast(v, 3, 3);
  const groups = new Map(Object.entries(opts.groups ?? FAKE_GROUPS).map(([k, c]) => [Number(k), c]));
  const subscribers = new Set<(r: OscMessage) => void>();
  const active = new Map<number, number>(); // cue list → active cue number

  const cueText = (list: number, cue: number, pct?: number) => `${list}/${cue} Fake cue ${cue} 3.0${pct != null ? ` ${pct}%` : ''}`;

  function runCue(list: number, cue: number, reply: (r: OscMessage) => void) {
    active.set(list, cue);
    reply({ address: '/eos/out/active/cue/text', args: [str(cueText(list, cue, 0))] });
    reply({ address: `/eos/out/pending/cue/${list}/${cue + 1}`, args: [] });
    reply({ address: '/eos/out/pending/cue/text', args: [str(cueText(list, cue + 1))] });
    let p = 0;
    const t = setInterval(() => {
      p = Math.min(1, p + 0.25);
      reply({ address: `/eos/out/active/cue/${list}/${cue}`, args: [float(p)] });
      if (p >= 1) clearInterval(t);
    }, 100);
  }

  function respond(m: OscMessage, reply: (r: OscMessage) => void) {
    received.push(formatMessage(m));
    log(`[fake-eos] rx ${formatMessage(m)}`);
    const a = m.address.replace(/^\/eos\/user\/\d+/, '/eos');
    const press = m.args.length === 0 || m.args[0]?.value === 1;
    if (a === '/eos/ping') reply({ address: '/eos/out/ping', args: m.args });
    if (a === '/eos/get/version') reply({ address: '/eos/out/get/version', args: [str(version)] });
    if (a === '/eos/subscribe') {
      if (m.args[0]?.value === 1) subscribers.add(reply); else subscribers.delete(reply);
      reply({ address: '/eos/out/show/name', args: [str('FAKE SHOW (not a real console)')] });
    }

    let mm = a.match(/^\/eos\/cue\/(\d+)\/([\d.]+)\/fire$/);
    if (mm && press) runCue(Number(mm[1]), Number(mm[2]), reply);
    mm = a.match(/^\/eos\/cues\/(\d+)\/(fire|stop)$/);
    if (mm && press && hasCuesApi) {
      const list = Number(mm[1]);
      const cur = active.get(list) ?? 0;
      if (mm[2] === 'fire') runCue(list, cur + 1, reply);
      else if (cur > 1) runCue(list, cur - 1, reply);
    }
    if (a === '/eos/key/go_0' && press) runCue(1, (active.get(1) ?? 0) + 1, reply);

    // Groups: info packet, then the channel list split over several packets (OSC List Convention).
    mm = a.match(/^\/eos\/get\/group\/(\d+)$/);
    if (mm) {
      const n = Number(mm[1]);
      const ch = groups.get(n);
      if (ch) {
        const uid = `fake-group-${n}`;
        reply({ address: `/eos/out/get/group/${n}/list/0/3`, args: [int(-1), str(uid), str(`Fake Group ${n}`)] });
        const all: OscArg[] = [int(-1), str(uid), ...ch.map((c) => (typeof c === 'number' ? int(c) : str(c)))];
        for (let i = 0; i < all.length; i += 3) {
          const chunk = all.slice(i, i + 3);
          reply({ address: `/eos/out/get/group/${n}/channels/list/${i}/${all.length}`, args: chunk });
        }
      }
    }

    if (a === '/eos/get/patch/count') reply({ address: '/eos/out/get/patch/count', args: [int(2)] });
    mm = a.match(/^\/eos\/get\/patch\/index\/(\d+)$/);
    if (mm) {
      const ch = Number(mm[1]) + 1;
      reply({ address: `/eos/out/get/patch/${ch}/1/list/0/6`, args: [int(Number(mm[1])), str(`uid-${ch}`), str(`Fake ${ch}`), str('ETC'), str('Fake Fixture'), int(100 + ch)] });
    }
    if (a === '/eos/get/cuelist/count') reply({ address: '/eos/out/get/cuelist/count', args: [int(0)] });
  }

  function tcpServer(port: number, framing: 'slip' | 'length'): Promise<net.Server> {
    const srv = net.createServer((sock) => {
      log(`[fake-eos] TCP ${framing} client connected`);
      const dec = framing === 'slip' ? new SlipDecoder() : new LengthPrefixDecoder();
      const reply = (r: OscMessage) => {
        if (sock.destroyed) return;
        const p = encodeMessage(r);
        sock.write(framing === 'slip' ? slipEncode(p) : lengthPrefixEncode(p));
      };
      sock.on('data', (d) => { try { for (const pkt of dec.push(d)) for (const m of decodePacket(pkt)) respond(m, reply); } catch { /* wrong framing */ } });
      sock.on('close', () => subscribers.delete(reply));
      sock.on('error', () => {});
    });
    return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => {
      log(`[fake-eos] TCP ${framing} on 127.0.0.1:${(srv.address() as net.AddressInfo).port}`);
      resolve(srv);
    }));
  }

  const udp = dgram.createSocket('udp4');
  udp.on('message', (buf, rinfo) => {
    for (const m of decodePacket(buf)) respond(m, (r) => udp.send(encodeMessage(r), opts.udpTx ?? 8001, rinfo.address));
  });

  return Promise.all([
    tcpServer(opts.lengthPort ?? 3032, 'length'),
    has3037 ? tcpServer(opts.slipPort ?? 3037, 'slip') : Promise.resolve(null),
  ]).then(([len, slip]) => {
    if (!opts.quiet) udp.bind(opts.udpRx ?? 8000, '127.0.0.1', () => log(`[fake-eos] UDP rx :${opts.udpRx ?? 8000}, replies to :${opts.udpTx ?? 8001}`));
    log(`[fake-eos] THIS IS A SIMULATOR (reports Eos ${version}). No real lighting is connected.`);
    return {
      received,
      ports: { length: (len.address() as net.AddressInfo).port, slip: slip ? (slip.address() as net.AddressInfo).port : null },
      setGroup(n, channels) {
        groups.set(n, channels);
        for (const s of subscribers) s({ address: '/eos/out/notify/group/list/0/2', args: [int(1), int(n)] });
      },
      close() { len.close(); slip?.close(); try { udp.close(); } catch { /* not bound */ } },
    };
  });
}

if (process.argv[1] && /fake-eos\.ts$/.test(process.argv[1])) {
  const i = process.argv.indexOf('--version');
  void startFakeEos({ version: i > 0 ? process.argv[i + 1] : undefined });
}
