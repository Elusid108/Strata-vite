// Generates PWA icons (PNG) without any image dependency: a rounded blue
// square with three "strata" layers. Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const BLUE = [37, 99, 235];
function paint(maskable) {
  return (x, y, size) => {
    const pad = maskable ? 0 : size * 0.06;
    const r = maskable ? 0 : size * 0.22;
    const s = size - pad * 2;
    const lx = x - pad, ly = y - pad;
    // rounded rect mask
    const inX = lx >= 0 && lx < s, inY = ly >= 0 && ly < s;
    let inside = inX && inY;
    if (inside && r > 0) {
      const cx = lx < r ? r : lx > s - r ? s - r : lx;
      const cy = ly < r ? r : ly > s - r ? s - r : ly;
      inside = Math.hypot(lx - cx, ly - cy) <= r;
    }
    if (!inside) return [0, 0, 0, 0];
    // three layered bars (strata)
    const u = lx / s, v = ly / s;
    const bars = [
      { y0: 0.30, y1: 0.40, x0: 0.22, x1: 0.78 },
      { y0: 0.46, y1: 0.56, x0: 0.28, x1: 0.84 },
      { y0: 0.62, y1: 0.72, x0: 0.16, x1: 0.72 },
    ];
    for (const b of bars) if (v >= b.y0 && v < b.y1 && u >= b.x0 && u < b.x1) return [255, 255, 255, 255];
    return [...BLUE, 255];
  };
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, paint(false)));
writeFileSync('public/icons/icon-512.png', png(512, paint(false)));
writeFileSync('public/icons/maskable-512.png', png(512, paint(true)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, paint(true)));
console.log('icons written');
