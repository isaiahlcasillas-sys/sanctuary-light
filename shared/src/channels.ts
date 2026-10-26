/** Turn [1,2,3,5,7,8,9] into "1 Thru 3 + 5 + 7 Thru 9" (Eos command-line syntax). */
export function channelExpression(channels: number[]): string {
  const sorted = [...new Set(channels)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const flush = () => parts.push(start === prev ? `${start}` : prev === start + 1 ? `${start} + ${prev}` : `${start} Thru ${prev}`);
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) { prev = n; continue; }
    flush();
    start = prev = n;
  }
  flush();
  return parts.join(' + ');
}

/** Parse "1-19, 30, 79-80" or "1 thru 19 + 30" into a channel list. */
export function parseChannelList(text: string): number[] {
  const out: number[] = [];
  const cleaned = text.toLowerCase().replace(/thru/g, '-').replace(/\s*-\s*/g, '-');
  for (const part of cleaned.split(/[,+;\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]); const b = Number(m[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      if (hi - lo > 10000) continue;
      for (let i = lo; i <= hi; i++) out.push(i);
    } else if (/^\d+$/.test(part)) {
      out.push(Number(part));
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
