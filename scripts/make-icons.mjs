// Draws the logo (three slanted bars on blue) into PNG icons for iOS home screens: node scripts/make-icons.mjs
import fs from "node:fs";
import zlib from "node:zlib";

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };

function png(size, bleed = 0) {
  const raw = Buffer.alloc((size * 3 + 1) * size), SS = 4, k = Math.tan((14 * Math.PI) / 180);
  const bg = [0x0a, 0x5b, 0xd3], bars = [[7, 1], [13, 0.7], [19, 0.4]];
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        // pixel -> 32x32 logo space (with optional padding so the logo sits inside the safe area)
        const X = ((px + (sx + 0.5) / SS) / size) * (32 + 2 * bleed) - bleed, Y = ((py + (sy + 0.5) / SS) / size) * (32 + 2 * bleed) - bleed;
        const x = X - 6 + k * Y;
        let a = 0;
        if (Y >= 7 && Y <= 25) for (const [bx, op] of bars) if (x >= bx && x <= bx + 4) a = op;
        r += bg[0] * (1 - a) + 255 * a; g += bg[1] * (1 - a) + 255 * a; b += bg[2] * (1 - a) + 255 * a;
      }
      const o = py * (size * 3 + 1) + 1 + px * 3, n = SS * SS;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

for (const [name, size, bleed] of [["apple-touch-icon.png", 180, 0], ["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["icon-maskable-512.png", 512, 6]]) {
  fs.writeFileSync(`public/assets/${name}`, png(size, bleed));
  console.log("wrote", name);
}
