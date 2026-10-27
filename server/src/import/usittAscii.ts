/**
 * USITT ASCII show files (Browser → File → Export → USITT ASCII, *.asc).
 *
 * Standard records (USITT ASCII Text Representation for Lighting Console Data):
 *   Ident, Manufacturer, Console, Clear, Set, EndData
 *   Patch <page> <channel> <dimmer>[@<level>] …     (written "1<1@FL" with standard delimiters)
 *   Cue <number> [<page>]   then Text, Up <time> [<delay>], Down <time> [<delay>], Followon <time>,
 *                           Link <cue>, Part <n>, Chan <channel>@<level> …
 *   Group <number> [<page>] then Text, Chan …
 *   Sub <number> [<page>]   then Text, Up, Down, Chan …
 * Delimiters are space, tab and , / ; < = > @ (Eos can also write commas only).
 *
 * ETC extensions read here (documented by ETC or seen in Eos exports):
 *   $$Format (header), $$UText (UTF-8 label; a Text record must also exist), $ChanLabel.
 * Eos writes its cue list number in the cue's "page" field. Other manufacturer keywords
 * ($$Param, palettes, effects…) are NOT guessed at: they are counted and listed as not
 * interpreted. Use the CSV export for fixture types and parameters.
 *
 * Chan records inside a cue are TRACKED changes. They are counted, never turned into looks.
 */
import type { ParsedShow } from '@sanctuary/shared';
import { recoverUtf8 } from './decode';
import { parseAddress, parseChannel, ShowBuilder } from './builder';

const DELIM = /[ \t,/;<=>@]+/;
const LEVEL = /^(FL|FULL|H[0-9A-F]{1,2}|\d{1,3}(\.\d+)?)$/i;

const tokens = (s: string) => s.split(DELIM).filter(Boolean);
/** The text after the keyword and its delimiter, for Text-like records. */
const restOf = (line: string, kw: string) => line.trim().slice(kw.length).replace(/^[ \t,]+/, '').trim();

type Ctx =
  | { kind: 'none' }
  | { kind: 'cue'; list: number; cue: NonNullable<ReturnType<ShowBuilder['cue']>>; inPart: boolean; hasText: boolean; utext: string | null }
  | { kind: 'group'; number: number }
  | { kind: 'sub'; number: number };

/** Pairs of channel@level from a Chan record, in either delimiter style. */
function chanPairs(rest: string): { channel: number; level: string }[] | null {
  if (rest.includes('@')) {
    const out: { channel: number; level: string }[] = [];
    for (const m of rest.matchAll(/(\d+(?:\.\d+)?)\s*@\s*([^\s,;/<=>@]+)/g)) {
      const ch = parseChannel(m[1]);
      if (ch) out.push({ channel: ch.channel, level: m[2] });
    }
    return out.length ? out : null;
  }
  const t = tokens(rest);
  if (t.length % 2 !== 0) return null;
  const out: { channel: number; level: string }[] = [];
  for (let i = 0; i < t.length; i += 2) {
    const ch = parseChannel(t[i]);
    if (!ch || !LEVEL.test(t[i + 1])) return null;
    out.push({ channel: ch.channel, level: t[i + 1] });
  }
  return out;
}

/** Patch entries: channel, dimmer (absolute DMX address), level. */
function patchEntries(rest: string): { channel: number; dimmer: number }[] | null {
  const t = tokens(rest);
  if (!t.length) return null;
  const body = rest.replace(/^\s*\d+[ \t,/;=>]+/, ''); // drop the page number
  if (body.includes('<')) {
    const out: { channel: number; dimmer: number }[] = [];
    for (const m of body.matchAll(/(\d+)\s*<\s*(\d+)(?:\s*@\s*[^\s,;]+)?/g)) out.push({ channel: Number(m[1]), dimmer: Number(m[2]) });
    return out.length ? out : null;
  }
  const items = t.slice(1);
  if (items.length && items.length % 3 === 0 && items.every((v, i) => (i % 3 === 2 ? LEVEL.test(v) : /^\d+$/.test(v)))) {
    const out: { channel: number; dimmer: number }[] = [];
    for (let i = 0; i < items.length; i += 3) out.push({ channel: Number(items[i]), dimmer: Number(items[i + 1]) });
    return out;
  }
  return null;
}

export function parseUsittAscii(text: string, fileName: string, encoding: string): ParsedShow {
  const b = new ShowBuilder();
  const lines = text.split(/\r\n|\r|\n/);
  let ctx: Ctx = { kind: 'none' };
  let headerDone = false;
  let ended = false;
  let sawIdent = false;

  const closeCue = () => {
    if (ctx.kind === 'cue' && ctx.utext) {
      if (ctx.hasText) ctx.cue.label = ctx.utext;
      else b.issue('info', `Cue ${ctx.list}/${ctx.cue.cue}: $$UText without a Text record was ignored (ETC requires both).`);
    }
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\u001a$/, '').trim();
    if (!line || line.startsWith('!')) return;
    if (ended) { b.skip('after EndData', lineNo, line); return; }
    const kwRaw = line.split(DELIM)[0];
    const kw = kwRaw.toLowerCase();
    const rest = restOf(line, kwRaw);
    const t = tokens(rest);

    switch (kw) {
      case 'ident': sawIdent = true; b.source.Ident = rest; return;
      case 'manufacturer': b.source.Manufacturer = rest; return;
      case 'console': b.source.Console = rest; return;
      case 'clear': case 'set': return;
      case 'enddata': closeCue(); ended = true; return;

      case 'patch': {
        headerDone = true; closeCue(); ctx = { kind: 'none' };
        const entries = patchEntries(rest);
        if (!entries) { b.issue('warning', 'Patch line not understood; skipped.', lineNo); b.skip('Patch (unreadable)', lineNo, line); return; }
        for (const e of entries) {
          const ch = parseChannel(String(e.channel));
          if (!ch) { b.issue('warning', `Patch: channel ${e.channel} is out of range; skipped.`, lineNo); continue; }
          if (e.dimmer === 0) continue; // unpatched
          const dmx = parseAddress(String(e.dimmer));
          if (dmx === 'invalid') { b.issue('warning', `Patch: dimmer ${e.dimmer} for channel ${ch.channel} is not a valid address.`, lineNo); continue; }
          // Several dimmers on one channel (a "two-fer") add addresses; they are not duplicates.
          if (b.hasChannel(ch.channel)) b.address(ch.channel, dmx); else b.patch(ch.channel, { dmx }, lineNo);
        }
        return;
      }
      case 'cue': {
        headerDone = true; closeCue();
        const page = Number(t[1] ?? '1');
        const list = Number.isInteger(page) && page > 0 ? page : 1;
        const q = t[0] ? b.cue(list, t[0], lineNo) : null;
        if (!q) { ctx = { kind: 'none' }; if (!t[0]) b.issue('warning', 'Cue record without a number; skipped.', lineNo); return; }
        b.cueList(list);
        ctx = { kind: 'cue', list, cue: q, inPart: false, hasText: false, utext: null };
        return;
      }
      case 'group': case 'sub': {
        headerDone = true; closeCue();
        const n = Number(t[0]);
        if (!Number.isInteger(n) || n < 1) { b.issue('warning', `${kwRaw} record without a valid number; skipped.`, lineNo); ctx = { kind: 'none' }; return; }
        if (kw === 'group') { b.group(n, null, lineNo); ctx = { kind: 'group', number: n }; }
        else { b.sub(n, null); ctx = { kind: 'sub', number: n }; }
        return;
      }
      case 'part': {
        if (ctx.kind !== 'cue') { b.skip('Part outside a cue', lineNo, line); return; }
        const n = Number(t[0]);
        if (Number.isInteger(n) && n > 0) ctx.cue.parts = Math.max(ctx.cue.parts, n);
        ctx.inPart = true;
        return;
      }
      case 'text': case 'label': {
        if (ctx.kind === 'cue') { if (!ctx.inPart) { ctx.cue.label = rest; ctx.hasText = true; } return; }
        if (ctx.kind === 'group') { b.group(ctx.number, rest, lineNo); return; }
        if (ctx.kind === 'sub') { b.sub(ctx.number, rest); return; }
        b.skip('Text outside a cue/group/sub', lineNo, line);
        return;
      }
      case '$$utext': {
        if (ctx.kind === 'cue' && !ctx.inPart) { ctx.utext = recoverUtf8(rest, encoding); return; }
        if (ctx.kind === 'group') { b.group(ctx.number, recoverUtf8(rest, encoding), lineNo); return; }
        if (ctx.kind === 'sub') { b.sub(ctx.number, recoverUtf8(rest, encoding)); return; }
        b.skip('$$UText outside a cue/group/sub', lineNo, line);
        return;
      }
      case 'up': case 'down': case 'followon': case 'link': {
        if (ctx.kind !== 'cue') { if (ctx.kind === 'sub') return; b.skip(`${kwRaw} outside a cue`, lineNo, line); return; }
        if (ctx.inPart) return; // part timing: the base cue keeps its own
        const tm = ctx.cue.timing;
        if (kw === 'up') { if (t[0]) tm.time = t[0]; if (t[1]) tm.upDelay = t[1]; }
        else if (kw === 'down') { if (t[0]) tm.down = t[0]; if (t[1]) tm.downDelay = t[1]; }
        else if (kw === 'followon') { if (t[0]) tm.follow = t[0]; }
        else if (t[0]) tm.link = t[0];
        return;
      }
      case 'chan': {
        const pairs = chanPairs(rest);
        if (!pairs) { b.issue('warning', 'Chan line not understood; skipped.', lineNo); b.skip('Chan (unreadable)', lineNo, line); return; }
        if (ctx.kind === 'group') for (const p of pairs) b.groupChannel(ctx.number, p.channel);
        else if (ctx.kind === 'sub') for (const p of pairs) b.subChannel(ctx.number, p.channel);
        else if (ctx.kind === 'cue') for (const p of pairs) b.cueMove(ctx.list, ctx.cue, p.channel);
        else b.skip('Chan outside a cue/group/sub', lineNo, line);
        return;
      }
      case '$chanlabel': {
        const m = rest.match(/^(\d+)[ \t,]+(.*)$/);
        const ch = m ? parseChannel(m[1]) : null;
        if (ch && m![2].trim()) { b.label(ch.channel, m![2].trim(), lineNo); return; }
        b.skip('$ChanLabel (unreadable)', lineNo, line);
        return;
      }
      default: {
        if (kw.startsWith('$') && !headerDone) { b.source[kwRaw] = rest.replace(/^"(.*)"$/, '$1'); return; }
        b.skip(kw.startsWith('$') ? kwRaw : `${kwRaw} (unknown keyword)`, lineNo, line);
      }
    }
  });
  closeCue();
  if (!sawIdent) b.issue('info', 'No "Ident" header line: the file may not be a complete USITT ASCII export.');
  if (!ended) b.issue('warning', 'No "EndData" line: the file may be cut short.');
  return b.finish('usitt-ascii', 'USITT ASCII show file', fileName, encoding);
}
