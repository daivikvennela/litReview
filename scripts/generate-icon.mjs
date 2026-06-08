#!/usr/bin/env node
/**
 * 512×512 app icon for electron-builder + web favicon.
 * Theme: literature review — stacked papers, magnifying lens, AI sparkle.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const W = 512;
const H = 512;

const OUT_PATHS = [
  path.join(root, "build", "icon.png"),
  path.join(root, "frontend", "public", "icon.png"),
];

function crc32(buf) {
  let c = 0xffffffff;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    table[n] = v;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function clamp(v, lo = 0, hi = 255) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  return [
    clamp(lerp(c1[0], c2[0], t)),
    clamp(lerp(c1[1], c2[1], t)),
    clamp(lerp(c1[2], c2[2], t)),
    clamp(lerp(c1[3], c2[3], t)),
  ];
}

function blendPixel(px, src) {
  const a = src[3] / 255;
  if (a <= 0) return;
  const ia = 1 - a;
  px[0] = clamp(px[0] * ia + src[0] * a);
  px[1] = clamp(px[1] * ia + src[1] * a);
  px[2] = clamp(px[2] * ia + src[2] * a);
  px[3] = clamp(px[3] + src[3] * ia);
}

function roundedRectSdf(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function fillRoundedRect(px, cx, cy, hw, hh, r, color, softness = 1.2) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = roundedRectSdf(x + 0.5, y + 0.5, cx, cy, hw, hh, r);
      const a = clamp(1 - d / softness, 0, 1);
      if (a > 0) {
        const i = (y * W + x) * 4;
        blendPixel(px.subarray(i, i + 4), [color[0], color[1], color[2], color[3] * a]);
      }
    }
  }
}

function strokeCircle(px, cx, cy, radius, width, color) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius);
      const a = clamp(1 - d / (width / 2), 0, 1);
      if (a > 0) {
        const i = (y * W + x) * 4;
        blendPixel(px.subarray(i, i + 4), [color[0], color[1], color[2], color[3] * a]);
      }
    }
  }
}

function fillCircle(px, cx, cy, radius, color) {
  strokeCircle(px, cx, cy, radius, radius * 2, color);
}

function fillPolygon(px, pts, color) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pxp = x + 0.5;
      const pyp = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        const intersect =
          yi > pyp !== yj > pyp && pxp < ((xj - xi) * (pyp - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      if (inside) {
        const i = (y * W + x) * 4;
        blendPixel(px.subarray(i, i + 4), color);
      }
    }
  }
}

function fillRect(px, x0, y0, x1, y1, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      blendPixel(px.subarray(i, i + 4), color);
    }
  }
}

function drawLine(px, x0, y0, x1, y1, width, color) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = lerp(x0, x1, t);
    const y = lerp(y0, y1, t);
    fillCircle(px, x, y, width / 2, color);
  }
}

function drawSparkle(px, cx, cy, size, color) {
  drawLine(px, cx - size, cy, cx + size, cy, 3, color);
  drawLine(px, cx, cy - size, cx, cy + size, 3, color);
  drawLine(px, cx - size * 0.65, cy - size * 0.65, cx + size * 0.65, cy + size * 0.65, 2.2, color);
  drawLine(px, cx - size * 0.65, cy + size * 0.65, cx + size * 0.65, cy - size * 0.65, 2.2, color);
  fillCircle(px, cx, cy, 4, color);
}

// --- compose icon ---
const px = new Uint8ClampedArray(W * H * 4);

// Background gradient inside squircle
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = roundedRectSdf(x + 0.5, y + 0.5, W / 2, H / 2, W / 2 - 8, H / 2 - 8, 96);
    if (d > 1.5) continue;
    const t = (x + y) / (W + H);
    const tl = lerpColor([15, 23, 42, 255], [30, 58, 138, 255], t * 1.4);
    const br = lerpColor([67, 56, 202, 255], [109, 40, 217, 255], t);
    const c = lerpColor(tl, br, (y / H) * 0.85);
    const edge = clamp(1 - d / 1.5, 0, 1);
    const i = (y * W + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255 * edge;
  }
}

// Soft inner glow
fillCircle(px, 256, 280, 180, [56, 189, 248, 18]);

// Back paper (shadow stack)
fillPolygon(px, [
  [148, 168],
  [372, 148],
  [388, 332],
  [132, 352],
], [148, 163, 184, 90]);

// Middle paper
fillPolygon(px, [
  [132, 152],
  [356, 132],
  [372, 316],
  [116, 336],
], [226, 232, 240, 230]);

// Front paper
fillPolygon(px, [
  [116, 136],
  [340, 116],
  [356, 300],
  [100, 320],
], [248, 250, 252, 255]);

// Paper fold line
drawLine(px, 116, 136, 340, 116, 2, [203, 213, 225, 180]);

// Text lines on front paper
const lineColor = [148, 163, 184, 200];
const accentLine = [59, 130, 246, 220];
for (let i = 0; i < 7; i++) {
  const y = 168 + i * 18;
  const w = i === 0 ? 170 : 200 - (i % 3) * 22;
  fillRect(px, 138, y, 138 + w, y + 5, i === 0 ? accentLine : lineColor);
}

// Citation bracket hint
drawLine(px, 128, 162, 128, 278, 3, [96, 165, 250, 160]);
drawLine(px, 128, 162, 142, 162, 3, [96, 165, 250, 160]);
drawLine(px, 128, 278, 142, 278, 3, [96, 165, 250, 160]);

// Magnifying glass (research)
const glassCx = 332;
const glassCy = 248;
strokeCircle(px, glassCx, glassCy, 52, 10, [255, 255, 255, 245]);
strokeCircle(px, glassCx, glassCy, 52, 5, [56, 189, 248, 200]);
fillCircle(px, glassCx - 12, glassCy - 14, 14, [255, 255, 255, 60]);
drawLine(px, glassCx + 36, glassCy + 36, glassCx + 78, glassCy + 78, 14, [255, 255, 255, 240]);
drawLine(px, glassCx + 36, glassCy + 36, glassCx + 78, glassCy + 78, 8, [56, 189, 248, 180]);

// AI sparkle cluster
drawSparkle(px, 392, 118, 16, [250, 204, 21, 240]);
drawSparkle(px, 418, 148, 9, [255, 255, 255, 200]);
drawSparkle(px, 368, 142, 7, [125, 211, 252, 220]);

// Subtle outer ring
strokeCircle(px, 256, 256, 238, 3, [255, 255, 255, 35]);

const png = encodePng(px, W, H);
for (const outPath of OUT_PATHS) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log("Wrote", outPath);
}
