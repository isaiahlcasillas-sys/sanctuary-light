#!/usr/bin/env node
/**
 * Draws the Sanctuary Light shortcut icon (a warm light on a dark tile) and writes
 * deploy/windows/sanctuary-light.ico. No dependencies; run again only to change the design.
 *   node deploy/windows/make-icon.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const nx = (x - c) / (size / 2), ny = (y - c) / (size / 2);
      // Rounded-square tile
      const r = 0.22, ax = Math.max(Math.abs(nx) - (1 - r), 0), ay = Math.max(Math.abs(ny) - (1 - r), 0);
      const inTile = Math.hypot(ax, ay) <= r;
      let px = [0, 0, 0, 0];
      if (inTile) {
        px = [24, 28, 40, 255];
        const d = Math.hypot(nx, ny + 0.05);
        const glow = Math.max(0, 1 - d / 0.78);
        px = [24 + 200 * glow * glow, 28 + 150 * glow * glow, 40 + 40 * glow * glow, 255];
        if (d < 0.36) px = [255, 214, 120, 255];
        if (d < 0.22) px = [255, 244, 214, 255];
      }
      raw.set(px.map((v) => Math.min(255, Math.round(v))), y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const sizes = [16, 32, 48, 256];
const images = sizes.map(png);
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12); offset += images[i].length;
  return e;
});
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sanctuary-light.ico');
fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images]));
console.log(`Wrote ${out}`);
