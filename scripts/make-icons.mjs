// Draws the DipLog app icon (a trade log page with a line that dips and
// rebounds into an arrow, a red ring marking the low point) and writes it as
// PNG files into public/. No dependencies. Run: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BLUE = [47, 107, 255]; // #2F6BFF
const WHITE = [255, 255, 255];
const PALE = [214, 226, 255]; // #D6E2FF
const RED = [240, 68, 82]; // #F04452

// Everything below is in a 0..100 box. The background fills the whole square;
// iOS and Android apply their own corner mask.
const CARD = { x: 24, y: 20, w: 52, h: 62, r: 9 };
const FOOT = { x: 33, y: 68, w: 22, h: 5, r: 2.5 };
// The line falls into a dip, then rebounds in one straight stroke; the last two
// strokes are the arrowhead.
const LINE = [
  [[33, 44], [44, 58]],
  [[44, 58], [67, 35]],
  [[58, 35], [67, 35]],
  [[67, 35], [67, 44]],
];
const LINE_HALF = 3;
const LOW = [44, 58];
const RING_R = 5; // ring centre radius
const RING_HALF = 1.6; // half the ring stroke

function distToSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inRoundRect(px, py, { x, y, w, h, r }) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= r;
}

function shade(u, v) {
  const x = u * 100;
  const y = v * 100;
  const dLow = Math.hypot(x - LOW[0], y - LOW[1]);
  if (dLow <= RING_R - RING_HALF) return WHITE;
  if (dLow <= RING_R + RING_HALF) return RED;
  if (LINE.some(([a, b]) => distToSeg(x, y, a, b) <= LINE_HALF)) return BLUE;
  if (inRoundRect(x, y, FOOT)) return PALE;
  if (inRoundRect(x, y, CARD)) return WHITE;
  return BLUE;
}

function render(size) {
  const ss = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(acc[k] / (ss * ss));
    }
  }
  return png(size, size, raw);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), render(size));
  console.log(`public/icon-${size}.png`);
}
