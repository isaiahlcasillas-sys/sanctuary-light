/**
 * Turn the bytes of an exported file into text. Eos offers ASCII/Latin1, UTF-8 and UTF-16
 * for CSV export, and Windows tools often add a byte-order mark, so all of these are handled.
 */

export interface DecodedText { text: string; encoding: string; binary: boolean }

const decoder = (label: string, fatal = false) => new TextDecoder(label, { fatal });

/** Rough check for data that is not text at all (a native show file, an image…). */
function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  if (!n) return false;
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0 || (b < 9) || (b > 13 && b < 32 && b !== 26 && b !== 27)) control++;
  }
  return control / n > 0.02;
}

export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: decoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8', binary: false };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16 LE', binary: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16 BE', binary: false };

  // UTF-16 without a byte-order mark: every other byte of ordinary text is 0.
  const sample = bytes.subarray(0, Math.min(bytes.length, 2000));
  let evenZero = 0; let oddZero = 0;
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) { if (i % 2) oddZero++; else evenZero++; }
  const half = sample.length / 2;
  if (half > 4 && oddZero > half * 0.6 && evenZero < half * 0.05) return { text: decoder('utf-16le').decode(bytes), encoding: 'UTF-16 LE', binary: false };
  if (half > 4 && evenZero > half * 0.6 && oddZero < half * 0.05) return { text: decoder('utf-16be').decode(bytes), encoding: 'UTF-16 BE', binary: false };

  if (looksBinary(bytes)) return { text: '', encoding: 'binary', binary: true };
  try {
    const text = decoder('utf-8', true).decode(bytes);
    return { text, encoding: /[^\x00-\x7f]/.test(text) ? 'UTF-8' : 'ASCII', binary: false };
  } catch {
    // Eos "ASCII/Latin1" exports and older Windows files.
    return { text: decodeCp1252(bytes), encoding: 'Windows-1252 (Latin-1)', binary: false };
  }
}

/**
 * ETC's $$UText lines carry UTF-8 text. If the rest of the file was read as Latin-1, recover
 * the original characters; otherwise return the text unchanged.
 */
export function recoverUtf8(text: string, fileEncoding: string): string {
  if (!fileEncoding.startsWith('Windows-1252')) return text;
  // Windows-1252 maps 0x80–0x9F to characters such as € and ’, so reverse the real table.
  const back = cp1252Reverse();
  const bytes: number[] = [];
  for (const c of text) { const b = back.get(c); if (b === undefined) return text; bytes.push(b); }
  try { return decoder('utf-8', true).decode(Uint8Array.from(bytes)); }
  catch { return text; }
}

/**
 * Windows-1252. Node's TextDecoder treats 0x80–0x9F as Latin-1 control characters, but
 * Windows (and Eos's "ASCII/Latin1" option) use them for € ‘ ’ “ ” – — œ and others.
 */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
export function decodeCp1252(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, i + 8192);
    out += String.fromCharCode(...Array.from(chunk, (b) => (b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b)));
  }
  return out;
}

let reverse: Map<string, number> | null = null;
function cp1252Reverse(): Map<string, number> {
  if (reverse) return reverse;
  reverse = new Map();
  for (let b = 0; b < 256; b++) reverse.set(decodeCp1252(Uint8Array.of(b)), b);
  return reverse;
}
