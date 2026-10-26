/** Small IPv4 helpers for the setup wizard's network check. */

export interface LocalInterface { name: string; address: string; netmask: string; cidr: string | null }

const toInt = (ip: string): number | null => {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
};

export const isIPv4 = (ip: string) => toInt(ip) != null;

export function sameSubnet(a: string, b: string, netmask: string): boolean {
  const x = toInt(a); const y = toInt(b); const m = toInt(netmask);
  if (x == null || y == null || m == null) return false;
  return ((x & m) >>> 0) === ((y & m) >>> 0);
}

/** Classify an address the operator typed for the console. */
export function describeConsoleIp(ip: string): { ok: boolean; note: string } {
  const n = toInt(ip);
  if (n == null) return { ok: false, note: 'Not an IPv4 address.' };
  const first = n >>> 24;
  if (ip === '127.0.0.1') return { ok: true, note: 'Loopback — only valid for the development console simulator.' };
  if (first === 169 && ((n >>> 16) & 255) === 254) return { ok: true, note: 'Link-local (169.254.x.x): the Ion assigned this itself because no DHCP server answered. It can change; prefer a static address.' };
  if (first === 0 || first >= 224) return { ok: false, note: 'Not a usable host address.' };
  return { ok: true, note: '' };
}
