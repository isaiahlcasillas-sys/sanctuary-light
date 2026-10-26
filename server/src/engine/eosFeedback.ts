/**
 * Parse the documented Eos OSC output ("/eos/out/...") into structured feedback.
 * Unknown addresses are ignored (they are still visible in the traffic log).
 * Address formats follow the OSC Dictionary in the Eos Family v3.3 manual and the
 * 2017 Eos Family Show Control User Guide.
 */
import type { CueFeedback } from '@sanctuary/shared';
import { argValue, type OscMessage } from '../osc/codec';

export type FeedbackEvent =
  | { kind: 'ping' }
  | { kind: 'version'; version: string }
  | { kind: 'showName'; name: string }
  | { kind: 'commandLine'; text: string }
  | { kind: 'cueText'; which: 'active' | 'pending' | 'previous'; cue: CueFeedback }
  | { kind: 'cueChanged'; which: 'pending' | 'previous'; list: number; cue: string }
  | { kind: 'cueProgress'; list: number; cue: string; progress: number }
  | { kind: 'patchEntry'; channel: number; part: number; label: string; manufacturer: string; model: string; absoluteAddress: number | null }
  | { kind: 'cueEntry'; list: number; cue: string; part: number; label: string }
  | { kind: 'cueListEntry'; list: number; label: string }
  | { kind: 'groupInfo'; group: number; label: string }
  /** One packet of a group's channel list; `argIndex` is its position in the full argument list. */
  | { kind: 'groupChannels'; group: number; argIndex: number; argCount: number; total: number | null; values: string[]; channels: number[]; unparsed: string[] }
  | { kind: 'notify'; target: string }
  | { kind: 'count'; what: 'patch' | 'cuelist' | 'cue' | 'group'; list?: number; count: number }
  | { kind: 'other' };

/**
 * Eos cue text: "<list>/<cue> <label> <duration>" with an optional trailing "<percent>%".
 * Examples from ETC docs: "1/1 Label 5.0", "1/1 Label 5.00 100%".
 */
const CUE_TEXT = /^\s*(\d+)\/(\d+(?:\.\d+)?)(?:\s+(.*?))??(?:\s+(\d+(?:\.\d+)?|\d+:\d{2}(?:\.\d+)?))?(?:\s+(\d{1,3})%)?\s*$/;

export function parseCueText(text: string, now = Date.now()): CueFeedback {
  const m = text.match(CUE_TEXT);
  if (!m) return { list: null, cue: null, label: text.trim() || null, text, progress: null, receivedAt: now, source: 'confirmed' };
  return {
    list: Number(m[1]),
    cue: m[2],
    label: m[3]?.trim() || null,
    text,
    progress: m[5] != null ? Number(m[5]) : null,
    receivedAt: now,
    source: 'confirmed',
  };
}

/**
 * OSC List Convention: "/.../list/<index>/<total>" where <index> is the zero-based offset of
 * this packet's first argument in the entire list and <total> is the number of elements in
 * the entire list (Eos manual, OSC Third-Party Integration).
 */
function listArgIndex(address: string): number | null {
  const m = address.match(/\/list\/(\d+)\/\d+$/);
  return m ? Number(m[1]) : null;
}

function listTotal(address: string): number | null {
  const m = address.match(/\/list\/\d+\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * OSC number lists: whole numbers as int32, decimals as strings, consecutive runs as "x-y" strings.
 * Anything we can't read is returned in `unparsed` so callers can refuse to trust the list.
 */
export function parseNumberList(values: unknown[]): { numbers: number[]; unparsed: string[] } {
  const numbers: number[] = [];
  const unparsed: string[] = [];
  for (const v of values) {
    if (typeof v === 'number' && Number.isInteger(v)) { numbers.push(v); continue; }
    const s = String(v).trim();
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]); const b = Number(range[2]);
      if (b >= a && b - a <= 100000) { for (let i = a; i <= b; i++) numbers.push(i); continue; }
    }
    if (/^\d+$/.test(s)) { numbers.push(Number(s)); continue; }
    unparsed.push(s); // e.g. "12.3" (channel part) or "x > y" display text
  }
  return { numbers, unparsed };
}

export function parseFeedback(msg: OscMessage, now = Date.now()): FeedbackEvent {
  // Strip the per-user prefix Eos uses for user-specific output.
  const a = msg.address.replace(/^\/eos\/out\/user\/\d+\//, '/eos/out/');
  const v = msg.args.map(argValue);
  const s0 = typeof v[0] === 'string' ? v[0] : '';
  const n0 = typeof v[0] === 'number' ? v[0] : null;

  if (a === '/eos/out/ping') return { kind: 'ping' };
  if (a === '/eos/out/get/version') return { kind: 'version', version: s0 };
  if (a === '/eos/out/show/name') return { kind: 'showName', name: s0 };
  if (a === '/eos/out/cmd') return { kind: 'commandLine', text: s0 };

  let m = a.match(/^\/eos\/out\/notify\/([a-z0-9]+)(?:\/|$)/);
  if (m) return { kind: 'notify', target: m[1] };

  m = a.match(/^\/eos\/out\/get\/(patch|cuelist|group)\/count$/);
  if (m && n0 != null) return { kind: 'count', what: m[1] as 'patch' | 'cuelist' | 'group', count: n0 };
  m = a.match(/^\/eos\/out\/get\/cue\/(\d+)\/count$/);
  if (m && n0 != null) return { kind: 'count', what: 'cue', list: Number(m[1]), count: n0 };

  m = a.match(/^\/eos\/out\/(active|pending|previous)\/cue\/text$/);
  if (m) return { kind: 'cueText', which: m[1] as 'active' | 'pending' | 'previous', cue: parseCueText(s0, now) };

  m = a.match(/^\/eos\/out\/active\/cue\/(\d+)\/(\d+(?:\.\d+)?)$/);
  if (m && n0 != null) {
    // Eos reports progress as 0.0–1.0
    const pct = n0 <= 1 ? n0 * 100 : n0;
    return { kind: 'cueProgress', list: Number(m[1]), cue: m[2], progress: Math.max(0, Math.min(100, pct)) };
  }

  // "/eos/out/pending/cue/<list>/<number>[/<part>]" — sent when the pending cue changes.
  m = a.match(/^\/eos\/out\/(pending|previous)\/cue\/(\d+)\/(\d+(?:\.\d+)?)(?:\/\d+)?$/);
  if (m) return { kind: 'cueChanged', which: m[1] as 'pending' | 'previous', list: Number(m[2]), cue: m[3] };

  // List-convention replies: only the first packet (arg index 0) starts with <list index>, <UID>, <label>, ...
  const argIndex = listArgIndex(a);

  // /eos/out/get/patch/<chan>/<part>/list/<i>/<n>  args: index, uid, label, manufacturer, type, address, ...
  m = a.match(/^\/eos\/out\/get\/patch\/(\d+)\/(\d+)\/list\/\d+\/\d+$/);
  if (m) {
    if (argIndex !== 0) return { kind: 'other' };
    const addr = typeof v[5] === 'number' ? v[5] : Number(v[5]);
    return {
      kind: 'patchEntry', channel: Number(m[1]), part: Number(m[2]),
      label: String(v[2] ?? ''), manufacturer: String(v[3] ?? ''), model: String(v[4] ?? ''),
      absoluteAddress: Number.isFinite(addr) && addr > 0 ? addr : null,
    };
  }

  // /eos/out/get/cue/<list>/<cue>/<part>/list/<i>/<n>  args: index, uid, label, ...
  m = a.match(/^\/eos\/out\/get\/cue\/(\d+)\/(\d+(?:\.\d+)?)\/(\d+)\/list\/\d+\/\d+$/);
  if (m) {
    if (argIndex !== 0) return { kind: 'other' };
    return { kind: 'cueEntry', list: Number(m[1]), cue: m[2], part: Number(m[3]), label: String(v[2] ?? '') };
  }

  // /eos/out/get/cuelist/<list>/list/<i>/<n>  args: index, uid, label, ...
  m = a.match(/^\/eos\/out\/get\/cuelist\/(\d+)\/list\/\d+\/\d+$/);
  if (m) {
    if (argIndex !== 0) return { kind: 'other' };
    return { kind: 'cueListEntry', list: Number(m[1]), label: String(v[2] ?? '') };
  }

  // /eos/out/get/group/<group>/list/<i>/<n>  args: index, uid, label
  m = a.match(/^\/eos\/out\/get\/group\/(\d+)\/list\/\d+\/\d+$/);
  if (m) {
    if (argIndex !== 0) return { kind: 'other' };
    return { kind: 'groupInfo', group: Number(m[1]), label: String(v[2] ?? '') };
  }

  // /eos/out/get/group/<group>/channels/list/<i>/<n>  args: index, uid, (channel number list)
  m = a.match(/^\/eos\/out\/get\/group\/(\d+)\/channels\/list\/\d+\/\d+$/);
  if (m) {
    const idx = argIndex ?? 0;
    // Positions 0 and 1 of the full argument list are <list index> and <UID>.
    const values = v.filter((_, i) => idx + i >= 2);
    const { numbers, unparsed } = parseNumberList(values);
    return { kind: 'groupChannels', group: Number(m[1]), argIndex: idx, argCount: v.length, total: listTotal(a), values: v.map((x) => String(x)), channels: numbers, unparsed };
  }

  return { kind: 'other' };
}

/** Eos reports absolute DMX addresses (universe 1 = 1–512, universe 2 = 513–1024...). */
export function splitAbsoluteAddress(abs: number): { universe: number; address: number } {
  return { universe: Math.floor((abs - 1) / 512) + 1, address: ((abs - 1) % 512) + 1 };
}
