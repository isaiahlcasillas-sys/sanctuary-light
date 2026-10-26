/**
 * Parse the documented Eos OSC output ("/eos/out/...") into structured feedback.
 * Unknown addresses are ignored (they are still visible in the traffic log).
 */
import type { CueFeedback } from '@sanctuary/shared';
import { argValue, type OscMessage } from '../osc/codec';

export type FeedbackEvent =
  | { kind: 'ping' }
  | { kind: 'version'; version: string }
  | { kind: 'showName'; name: string }
  | { kind: 'commandLine'; text: string }
  | { kind: 'cueText'; which: 'active' | 'pending' | 'previous'; cue: CueFeedback }
  | { kind: 'cueProgress'; list: number; cue: string; progress: number }
  | { kind: 'patchEntry'; channel: number; part: number; label: string; manufacturer: string; model: string; absoluteAddress: number | null }
  | { kind: 'cueEntry'; list: number; cue: string; part: number; label: string }
  | { kind: 'cueListEntry'; list: number; label: string }
  | { kind: 'count'; what: 'patch' | 'cuelist' | 'cue'; list?: number; count: number }
  | { kind: 'other' };

const CUE_TEXT = /^\s*(\d+)\/(\d+(?:\.\d+)?)\s*(.*?)\s*(?:(\d[\d:.]*)\s+)?(\d{1,3})%\s*$/;

/** Eos cue text looks like "1/45 Sermon 5 100%" — label and time are optional. */
export function parseCueText(text: string, now = Date.now()): CueFeedback {
  const m = text.match(CUE_TEXT);
  if (!m) return { list: null, cue: null, label: text.trim() || null, text, progress: null, receivedAt: now, source: 'confirmed' };
  return {
    list: Number(m[1]),
    cue: m[2],
    label: m[3] || null,
    text,
    progress: Number(m[5]),
    receivedAt: now,
    source: 'confirmed',
  };
}

export function parseFeedback(msg: OscMessage, now = Date.now()): FeedbackEvent {
  // Strip the per-user prefix Eos uses for user-specific output.
  const a = msg.address.replace(/^\/eos\/out\/user\/\d+\//, '/eos/out/');
  const s0 = typeof argValue(msg.args[0]) === 'string' ? (argValue(msg.args[0]) as string) : '';
  const n0 = typeof argValue(msg.args[0]) === 'number' ? (argValue(msg.args[0]) as number) : null;

  if (a === '/eos/out/ping') return { kind: 'ping' };
  if (a === '/eos/out/get/version') return { kind: 'version', version: s0 };
  if (a === '/eos/out/show/name') return { kind: 'showName', name: s0 };
  if (a === '/eos/out/cmd') return { kind: 'commandLine', text: s0 };

  let m = a.match(/^\/eos\/out\/get\/(patch|cuelist)\/count$/);
  if (m && n0 != null) return { kind: 'count', what: m[1] as 'patch' | 'cuelist', count: n0 };
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

  // Third-party API (Eos 2.x+): /eos/out/get/patch/<chan>/<part>/list/<index>/<count>
  // args: index, uid, label, manufacturer, model, address, ...
  m = a.match(/^\/eos\/out\/get\/patch\/(\d+)\/(\d+)\/list\/\d+\/\d+$/);
  if (m) {
    const v = msg.args.map(argValue);
    const addr = typeof v[5] === 'number' ? v[5] : Number(v[5]);
    return {
      kind: 'patchEntry', channel: Number(m[1]), part: Number(m[2]),
      label: String(v[2] ?? ''), manufacturer: String(v[3] ?? ''), model: String(v[4] ?? ''),
      absoluteAddress: Number.isFinite(addr) && addr > 0 ? addr : null,
    };
  }

  // /eos/out/get/cue/<list>/<cue>/<part>/list/<index>/<count>  args: index, uid, label, ...
  m = a.match(/^\/eos\/out\/get\/cue\/(\d+)\/(\d+(?:\.\d+)?)\/(\d+)\/list\/\d+\/\d+$/);
  if (m) {
    const v = msg.args.map(argValue);
    return { kind: 'cueEntry', list: Number(m[1]), cue: m[2], part: Number(m[3]), label: String(v[2] ?? '') };
  }

  // /eos/out/get/cuelist/<list>/list/<index>/<count>  args: index, uid, label, ...
  m = a.match(/^\/eos\/out\/get\/cuelist\/(\d+)\/list\/\d+\/\d+$/);
  if (m) {
    const v = msg.args.map(argValue);
    return { kind: 'cueListEntry', list: Number(m[1]), label: String(v[2] ?? '') };
  }

  return { kind: 'other' };
}

/** Eos reports absolute DMX addresses (universe 1 = 1–512, universe 2 = 513–1024...). */
export function splitAbsoluteAddress(abs: number): { universe: number; address: number } {
  return { universe: Math.floor((abs - 1) / 512) + 1, address: ((abs - 1) % 512) + 1 };
}
