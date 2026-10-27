/**
 * Import Eos Show: recognise an exported file and read it. Offline and read-only — this
 * module has no access to the console connection and never writes the configuration.
 *
 * Native Eos show files (.esf, .esf2, .esf3d) are ETC's own undocumented format. They are
 * recognised and explained, not parsed: guessing at a binary format could silently produce
 * wrong data. The user is shown how to export CSV or USITT ASCII from Eos instead.
 */
import { NATIVE_SHOW_EXTENSIONS, type ParsedShow } from '@sanctuary/shared';
import { decodeText } from './decode';
import { parseEosCsv } from './eosCsv';
import { parseUsittAscii } from './usittAscii';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

function empty(fileName: string, format: ParsedShow['format'], formatLabel: string, encoding: string, message: string, severity: 'error' | 'info' = 'error'): ParsedShow {
  return {
    format, formatLabel, fileName, encoding, source: {}, channels: [], groups: [], cueLists: [], palettes: [], subs: [],
    issues: [{ severity, message }], uninterpreted: { total: 0, byKind: {}, samples: [] },
  };
}

export function parseShowFile(bytes: Uint8Array, fileName: string): ParsedShow {
  const lower = fileName.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  if (NATIVE_SHOW_EXTENSIONS.includes(ext)) {
    return empty(fileName, 'eos-native', 'Eos show file (native)', 'binary',
      'This is a native Eos show file. Its format is ETC\'s own and is not published, so Sanctuary Light does not read it directly. Export the show from Eos as CSV (or USITT ASCII) and import that file instead.', 'info');
  }
  if (bytes.length === 0) return empty(fileName, 'unsupported', 'Empty file', 'none', 'The file is empty.');
  if (bytes.length > MAX_IMPORT_BYTES) return empty(fileName, 'unsupported', 'File too large', 'none', `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB, which is far bigger than an Eos export. Check that you chose the right file.`);

  const { text, encoding, binary } = decodeText(bytes);
  if (binary) {
    return empty(fileName, 'unsupported', 'Not a text export', 'binary',
      'This file is not text, so it is not a CSV or USITT ASCII export. If it is an Eos show file, export it from Eos as CSV and import that instead.');
  }
  const head = text.slice(0, 20000);
  if (/^\s*START_[A-Z0-9_]+\s*,?\s*$/im.test(head)) return parseEosCsv(text, fileName, encoding);
  const asciiHeader = /^\s*(Ident|Manufacturer|Console)\b/im.test(head);
  const asciiRecords = /^\s*(Patch|Cue|Group|Sub)[ \t,]+\d/im.test(head) && !/^[^\n]*,[^\n]*,[^\n]*,/.test(head.split('\n')[0] ?? '');
  if (asciiHeader || ext === '.asc' || (asciiRecords && ext !== '.csv')) return parseUsittAscii(text, fileName, encoding);
  if (ext === '.csv' || ext === '.txt' || head.split('\n')[0]?.includes(',')) return parseEosCsv(text, fileName, encoding);
  return empty(fileName, 'unsupported', 'Not recognised', encoding,
    'This file doesn\'t look like an Eos CSV export or a USITT ASCII show file. In Eos, use File → Export → CSV.');
}
