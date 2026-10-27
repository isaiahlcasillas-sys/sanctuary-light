/**
 * The installer runs this test suite on the sanctuary PC, where the real Eos (ETCnomad) may be
 * running. Tests must only ever talk to the FAKE console on random free ports. This guard makes
 * any attempt to connect to, send to or listen on a port Eos uses fail loudly instead.
 */
import dgram from 'node:dgram';
import net from 'node:net';

/** Eos OSC ports: TCP 3032 (OSC 1.0) / 3036 / 3037 (Third Party OSC), UDP 8000–8001 defaults. */
export const EOS_PORTS = new Set([3032, 3036, 3037, 8000, 8001]);

const portOf = (args: unknown[]): number | null => {
  const a = args[0];
  // net.connect() passes its normalised arguments to Socket#connect as one array.
  if (Array.isArray(a)) return portOf(a);
  if (typeof a === 'number') return a;
  if (typeof a === 'string' && /^\d+$/.test(a)) return Number(a);
  if (a && typeof a === 'object' && 'port' in a) return Number((a as { port: unknown }).port);
  return null;
};
const refuse = (what: string, port: number) => {
  throw new Error(`Test safety guard: refused to ${what} port ${port}, which Eos uses. Tests must use the FAKE console on a free port.`);
};

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const port = portOf(args);
  if (port != null && EOS_PORTS.has(port)) refuse('connect to', port);
  return (connect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (this: net.Server, ...args: unknown[]) {
  const port = portOf(args);
  if (port != null && EOS_PORTS.has(port)) refuse('listen on', port);
  return (listen as (...a: unknown[]) => net.Server).apply(this, args);
} as typeof net.Server.prototype.listen;

const send = dgram.Socket.prototype.send;
dgram.Socket.prototype.send = function (this: dgram.Socket, ...args: unknown[]) {
  // send(msg, port, ...) or send(msg, offset, length, port, ...)
  const port = typeof args[1] === 'number' && typeof args[3] !== 'number' ? args[1] : args[3];
  if (typeof port === 'number' && EOS_PORTS.has(port)) refuse('send to', port);
  return (send as (...a: unknown[]) => void).apply(this, args);
} as typeof dgram.Socket.prototype.send;

const bind = dgram.Socket.prototype.bind;
dgram.Socket.prototype.bind = function (this: dgram.Socket, ...args: unknown[]) {
  const port = portOf(args);
  if (port != null && EOS_PORTS.has(port)) refuse('listen on', port);
  return (bind as (...a: unknown[]) => dgram.Socket).apply(this, args);
} as typeof dgram.Socket.prototype.bind;
