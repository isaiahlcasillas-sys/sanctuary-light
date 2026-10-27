# Import test files

These files exercise the Import Eos Show parsers. **They were written for the tests, not exported from a real console.**

| File | What it covers |
|---|---|
| `eos-export.csv` | Eos CSV layout. TARGETS and LEVELS column titles are as published from Eos 3.x exports; the patch block is recognised by its columns. Includes multiple cue lists, cue parts, timing columns, groups, subs, presets, IP/FP/CP/BP palettes, macros/effects (not used), an unknown block, a multi-part channel, a duplicate row, a bad channel, a bad address, a channel without a fixture type, and a relay. UTF-8 with BOM, CRLF. The tests also convert it to UTF-16 LE/BE (with and without BOM) and LF. |
| `eos-show.asc` | USITT ASCII with standard delimiters: header, `$$Format`, a two-fer in the patch, `$ChanLabel`, groups, a sub, two cue lists (page field), parts, `$$UText`, Followon, Link, hex levels, unknown manufacturer keywords, an unknown keyword, data after EndData |
| `commas-only.asc` | USITT ASCII with the "commas only" delimiter option |
| `latin1-patch.csv` | A plain patch spreadsheet in Windows-1252 with characters only that code page has (œ, ‘ ’) |
| `truncated.csv` | A cut-short export (unclosed quote, missing END line) |
| `not-eos.csv`, `garbage.bin`, `Sunday.esf3d` | Unrelated CSV, binary data, and a stand-in for a native Eos show file |

Keep these files byte-for-byte (see `.gitattributes`): encodings and line endings are part of what is tested. When a real export shows a difference, add a trimmed, anonymised copy here with a test.
