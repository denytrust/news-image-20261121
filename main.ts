// news-image-20261121 — "The World in One Day: Saturday 21 November 2026"
// A front page drawn entirely in code: 33 date-checked stories, 7 regions,
// numbered map pins, region strip, DATE CHECK + LEFT OUT list.
// v2 (revision): bold headlines, rich hero scene bands, balanced headline
// splits, bigger grid icons with tinted tiles, taller map with leader-line
// pins, zebra ALSO list. Pure Node 22 stdlib (fs, zlib). No network, no
// randomness, deterministic: two runs write byte-identical PNGs.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette (flat newspaper) ----------
const INK = [20, 20, 20]; // near-black text
const PAPER = [250, 247, 238]; // warm off-white
const RED = [176, 32, 32]; // masthead red
const NAVY = [18, 42, 76]; // dark band
const NAVY2 = [28, 58, 100];
const GOLD = [176, 132, 32];
const TEAL = [14, 110, 110];
const GREY = [110, 108, 100];
const LINE = [60, 58, 52];
const SEA = [178, 208, 224]; // map ocean
const LAND = [214, 196, 150]; // map land
const PINRED = [176, 32, 32];
const WHITE = [255, 255, 255];
const CREAM = [242, 236, 220];
const GREEN = [30, 120, 60];
const ORANGE = [200, 100, 20];
const PURPLE = [110, 60, 140];

// ---------- CRC32 (PNG chunks) ----------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- framebuffer + primitives ----------
const fb = new Uint8Array(W * H * 3);
function fill(c: number[]): void {
  for (let i = 0; i < W * H; i++) {
    fb[i * 3] = c[0];
    fb[i * 3 + 1] = c[1];
    fb[i * 3 + 2] = c[2];
  }
}
function px(x: number, y: number, c: number[]): void {
  // floor first: a float index (y*W+x)*3 mixes the fractional part of y
  // into the x position, shifting the pixel by ~frac(y)*W.
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
    }
  }
}
function hline(x: number, y: number, w: number, c: number[]): void {
  rect(x, y, w, 1, c);
}
function vline(x: number, y: number, h: number, c: number[]): void {
  rect(x, y, 1, h, c);
}
function frame(x: number, y: number, w: number, h: number, c: number[], t = 1): void {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: number[]): void {
  // Round to integers first: with float endpoints Bresenham's
  // (x === x1 && y === y1) test never fires and the line runs 4096 px.
  let x = Math.round(x0);
  let y = Math.round(y0);
  const x1i = Math.round(x1);
  const y1i = Math.round(y1);
  const dx = Math.abs(x1i - x);
  const dy = Math.abs(y1i - y);
  const sx = x < x1i ? 1 : -1;
  const sy = y < y1i ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 4096; guard++) {
    px(x, y, c);
    if (x === x1i && y === y1i) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
function circle(cx: number, cy: number, r: number, c: number[], fillIt = true): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d2 = x * x + y * y;
      if (fillIt ? d2 <= r * r : d2 <= r * r && d2 >= (r - 1) * (r - 1)) px(cx + x, cy + y, c);
    }
  }
}
function poly(points: [number, number][], c: number[]): void {
  // scanline fill of a simple polygon
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) px(x, y, c);
    }
  }
}

// ---------- 5x7 bitmap font ("#" = on, "." = off) ----------
type Glyph = string[];
const FONT: Record<string, Glyph> = {
  "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  "N": ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "a": [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  "b": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  "c": [".....", ".....", ".####", "#....", "#....", "#....", ".####"],
  "d": ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  "e": [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  "f": ["..##.", ".#..#", ".#...", "###..", ".#...", ".#...", ".#..."],
  "g": [".....", ".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  "h": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  "i": ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  "j": ["...#.", ".....", "..##.", "...#.", "...#.", "...#.", "...#.", ".##.."],
  "k": ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  "l": [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "m": [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  "n": [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  "o": [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  "p": [".....", ".....", "####.", "#...#", "#...#", "####.", "#....", "#...."],
  "q": [".....", ".....", ".####", "#...#", "#...#", ".####", "....#", "....#"],
  "r": [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  "s": [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  "t": [".#...", ".#...", "###..", ".#...", ".#...", ".#...", "..##."],
  "u": [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".###."],
  "v": [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  "w": [".....", ".....", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  "x": [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  "y": [".....", ".....", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  "z": [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#...", "#...."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#...", "#...."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "(": ["...#.", "..#..", "..#..", "..#..", "..#..", "..#..", "...#."],
  ")": [".#...", "..#..", "..#..", "..#..", "..#..", "..#..", ".#..."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
  "*": [".....", ".#.#.", "..#..", "#####", "..#..", ".#.#.", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "<": ["...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
  ">": [".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
  "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
  "–": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "·": [".....", ".....", ".##..", ".##..", ".....", ".....", "....."],
  "✓": ["....#", "...#.", "..#.#", ".#.#.", "#.#..", "#....", "....."],
  "×": [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  "→": [".....", "..#..", "...#.", "#####", "...#.", "..#..", "....."],
};

// Note: a few glyphs have 8 rows (descenders: g, j, p, q, y, comma, semicolon).
// text() uses the glyph's own row count.
function glyphRows(ch: string): string[] {
  return FONT[ch] ?? FONT["?"];
}
function textWidth(s: string, scale: number): number {
  let w = 0;
  for (const ch of s) w += 6 * scale;
  return w - scale; // no trailing gap
}
function drawText(x: number, y: number, s: string, scale: number, c: number[]): void {
  let cx = x;
  for (const ch of s) {
    const g = glyphRows(ch);
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row[col] === "#") rect(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}
function textHeight(scale: number): number {
  return 7 * scale;
}
// Word-wrap a string into lines that fit maxW (pixels) at the given scale.
function wrap(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, scale) <= maxW || cur === "") {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
// Draw wrapped text, return the y just below the last line.
function drawPara(x: number, y: number, s: string, scale: number, maxW: number, c: number[], lh?: number): number {
  const lines = wrap(s, scale, maxW);
  const lineH = lh ?? Math.round(textHeight(scale) * 1.35);
  for (const ln of lines) drawText(x, y, ln, scale, c);
  return y + lines.length * lineH;
}
function centerText(y: number, s: string, scale: number, c: number[], cx = W / 2): void {
  drawText(Math.round(cx - textWidth(s, scale) / 2), y, s, scale, c);
}
// Bold variant: draw the string twice, 1 px apart, so strokes look printed
// rather than spindly. Used for headlines, masthead, numbers, headers.
function drawTextBold(x: number, y: number, s: string, scale: number, c: number[]): void {
  drawText(x, y, s, scale, c);
  drawText(x + 1, y, s, scale, c);
}
function centerTextBold(y: number, s: string, scale: number, c: number[], cx = W / 2): void {
  drawTextBold(Math.round(cx - textWidth(s, scale) / 2), y, s, scale, c);
}
// Split a headline into at most 2 lines, balanced so the second line is not
// a single orphan word. Prefer the longest first line whose second line is
// at least 35% of the first; fall back to greedy wrap.
function splitTwoLines(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  if (words.length <= 1) return [s];
  let best = -1;
  for (let i = words.length - 1; i >= 1; i--) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    if (textWidth(a, scale) > maxW || textWidth(b, scale) > maxW) continue;
    if (textWidth(b, scale) >= textWidth(a, scale) * 0.35) {
      best = i;
      break;
    }
  }
  if (best > 0) return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  return wrap(s, scale, maxW);
}

// ---------- stories: 33, all happened or first reported Sat 21 Nov 2026 ----------
// Regions: ASIA 4, MIDDLE EAST 4, EUROPE 6, AFRICA 3, AMERICAS 9, OCEANIA 1, GLOBAL 6.
type Story = {
  n: number;
  region: string;
  lat: number;
  lon: number;
  headline: string; // hero + grid only, <= 4 words
  caption: string; // hero + grid only, <= 12 words
  source: string;
  icon: string;
  line?: string; // one-liners (14-33): short single line incl. source
  claim?: boolean;
};
const HERO: Story[] = [
  { n: 1, region: "EUROPE", lat: 50.45, lon: 30.52, headline: "MISSILES RAIN ON KYIV", caption: "400 drones, 110 missiles hit Ukraine; two land in Poland.", source: "AP", icon: "missile" },
  { n: 2, region: "GLOBAL", lat: 40.71, lon: -74.0, headline: "STOCKS PLUNGE ON AI", caption: "S&P falls 3.7% into correction; Nasdaq drops 5.3%.", source: "AP", icon: "chart" },
  { n: 3, region: "GLOBAL", lat: 36.9, lon: 30.7, headline: "COP31 STALLS ON FUEL", caption: "Climate talks run past deadline as fossil-fuel split deepens.", source: "AP", icon: "globe" },
];
const GRID: Story[] = [
  { n: 4, region: "EUROPE", lat: 50.85, lon: 4.35, headline: "UK-EU SIGN MEGA DEAL", caption: "Biggest Brexit deal", source: "Reuters", icon: "doc" },
  { n: 5, region: "MIDDLE EAST", lat: 24.71, lon: 46.68, headline: "RIYADH SHIELD HOLDS", caption: "3 missiles stopped.", source: "Al Jazeera", icon: "shield" },
  { n: 6, region: "GLOBAL", lat: 46.2, lon: 6.14, headline: "ROBOT WEAPONS RULES ADVANCE", caption: "128 nations agree rules.", source: "AP", icon: "robot" },
  { n: 7, region: "GLOBAL", lat: 51.5, lon: -0.12, headline: "CANCER PILL BREAKTHROUGH", caption: "Tumours vanish in 1 in 12.", source: "BBC", icon: "pill" },
  { n: 8, region: "EUROPE", lat: 52.52, lon: 13.4, headline: "GEN Z PROTESTS SPREAD", caption: "Protests in 25 countries.", source: "AP", icon: "crowd" },
  { n: 9, region: "AMERICAS", lat: -13.5, lon: -71.9, headline: "6.9 QUAKE SHAKES ANDES", caption: "6.9 quake hits Andes.", source: "AP", icon: "mountain" },
  { n: 10, region: "AMERICAS", lat: 28.3, lon: -80.7, headline: "FLORIDA DROWNS IN RAIN", caption: "28in rain floods coast.", source: "AP", icon: "rain" },
  { n: 11, region: "GLOBAL", lat: 38.9, lon: -77.0, headline: "BAYER PAYS $7.25BN", caption: "$7.25bn Roundup deal.", source: "AP", icon: "scale" },
  { n: 12, region: "OCEANIA", lat: -33.86, lon: 151.2, headline: "CUMMINS KEEPS TEST CAPTAINCY", caption: "Cummins stays captain.", source: "Cricket Aus", icon: "bat" },
  { n: 13, region: "AFRICA", lat: 13.45, lon: -16.57, headline: "GAMBIA STOPS 491 MIGRANTS", caption: "491 migrants stopped.", source: "PANA", icon: "boat" },
];
const ALSO: Story[] = [
  { n: 14, region: "AMERICAS", lat: 38.9, lon: -77.0, headline: "", caption: "", source: "NYT", icon: "", line: "Trump weighs Iran strikes. (NYT)" },
  { n: 15, region: "AMERICAS", lat: 38.9, lon: -77.0, headline: "", caption: "", source: "Telegraph", icon: "", line: "Trump: defund Ukraine. (Telegraph)" },
  { n: 16, region: "AMERICAS", lat: 38.88, lon: -77.1, headline: "", caption: "", source: "AP", icon: "", line: "2nd judge blocks Trump arch. (AP)" },
  { n: 17, region: "EUROPE", lat: 55.68, lon: 12.57, headline: "", caption: "", source: "AP", icon: "", line: "Denmark expels Russia attache. (AP)" },
  { n: 18, region: "EUROPE", lat: 40.42, lon: -3.7, headline: "", caption: "", source: "AP", icon: "", line: "Spain votes 29 Nov. (AP)" },
  { n: 19, region: "AMERICAS", lat: 18.54, lon: -72.34, headline: "", caption: "", source: "AP", icon: "", line: "Haiti: Salvadoran troops hit. (AP)" },
  { n: 20, region: "MIDDLE EAST", lat: 31.5, lon: 34.47, headline: "", caption: "", source: "AP", icon: "", line: "Gaza strikes kill Palestinians (AP)" },
  { n: 21, region: "MIDDLE EAST", lat: 30.5, lon: 47.8, headline: "", caption: "", source: "AP", icon: "", line: "Basra fire: 2 dead, 28 hurt. (AP)" },
  { n: 22, region: "ASIA", lat: -2.0, lon: 113.0, headline: "", caption: "", source: "AP", icon: "", line: "Indonesia forest fires rage. (AP)" },
  { n: 23, region: "ASIA", lat: 28.6, lon: 77.2, headline: "", caption: "", source: "Straits Times", icon: "", line: "India: 11 die, bad alcohol. (AP)" },
  { n: 24, region: "AMERICAS", lat: 34.05, lon: -118.24, headline: "", caption: "", source: "AP", icon: "", line: "Palisades arsonist convicted. (AP)" },
  { n: 25, region: "MIDDLE EAST", lat: 24.0, lon: 58.0, headline: "", caption: "", source: "AP", icon: "", line: "Tankers hit off Oman. (AP)" },
  { n: 26, region: "GLOBAL", lat: 37.77, lon: -122.42, headline: "", caption: "", source: "Horizon", icon: "", line: "CLAIM Riemann proof. (Horizon)", claim: true },
  { n: 27, region: "ASIA", lat: -6.2, lon: 106.8, headline: "", caption: "", source: "AP", icon: "", line: "Indonesia train hits minibus. (AP)" },
  { n: 28, region: "AMERICAS", lat: 15.2, lon: -86.8, headline: "", caption: "", source: "AP", icon: "", line: "Honduras trafficking verdicts. (AP)" },
  { n: 29, region: "EUROPE", lat: 50.45, lon: 30.52, headline: "", caption: "", source: "AP", icon: "", line: "Ukraine double-tap strike. (AP)" },
  { n: 30, region: "AFRICA", lat: 9.06, lon: 7.49, headline: "", caption: "", source: "PANA", icon: "", line: "ECOWAS backs peacebuilding. (PANA)" },
  { n: 31, region: "AMERICAS", lat: 40.71, lon: -74.0, headline: "", caption: "", source: "AP", icon: "", line: "NY teens' funeral held. (AP)" },
  { n: 32, region: "AFRICA", lat: 5.36, lon: -4.0, headline: "", caption: "", source: "PANA", icon: "", line: "AFCON: Ivory Coast draw. (PANA)" },
  { n: 33, region: "ASIA", lat: 34.53, lon: 69.17, headline: "", caption: "", source: "PANA", icon: "", line: "1m Afghan kids malnourished. (PANA)" },
];
const ALL: Story[] = [...HERO, ...GRID, ...ALSO];
const REGION_COUNTS: [string, number][] = (() => {
  const order = ["ASIA", "MIDDLE EAST", "EUROPE", "AFRICA", "AMERICAS", "OCEANIA", "GLOBAL"];
  return order.map((r) => [r, ALL.filter((s) => s.region === r).length] as [string, number]);
})();

// ---------- world map (lon/lat polygons, rough but recognisable) ----------
type LL = [number, number];
const CONTINENTS: LL[][] = [
  // North America
  [[-168, 66], [-150, 70], [-140, 70], [-130, 71], [-125, 72], [-115, 68], [-105, 68], [-95, 69], [-90, 66], [-85, 66], [-80, 73], [-75, 70], [-68, 62], [-60, 55], [-55, 52], [-60, 47], [-65, 44], [-70, 42], [-75, 36], [-76, 34], [-80, 32], [-81, 30], [-84, 30], [-88, 29], [-90, 21], [-94, 19], [-97, 16], [-100, 16], [-104, 18], [-107, 22], [-110, 23], [-114, 28], [-117, 32], [-122, 37], [-124, 42], [-124, 48], [-130, 55], [-140, 60], [-150, 60], [-160, 58], [-168, 66]],
  // Greenland
  [[-58, 64], [-50, 60], [-42, 60], [-40, 65], [-32, 68], [-25, 70], [-30, 74], [-40, 76], [-55, 76], [-60, 72], [-58, 64]],
  // South America
  [[-80, 9], [-77, 8], [-75, 11], [-70, 12], [-64, 10], [-60, 8], [-55, 6], [-52, 4], [-50, 0], [-48, -2], [-44, -3], [-40, -5], [-37, -7], [-35, -9], [-38, -14], [-40, -20], [-42, -23], [-48, -26], [-52, -30], [-55, -34], [-58, -38], [-62, -40], [-65, -43], [-68, -47], [-70, -50], [-73, -53], [-70, -50], [-70, -40], [-71, -32], [-72, -25], [-75, -18], [-78, -10], [-80, -4], [-80, 9]],
  // Europe
  [[-10, 36], [-9, 38], [-9, 43], [-5, 44], [-2, 47], [-4, 48], [-1, 50], [2, 51], [5, 53], [8, 55], [8, 57], [10, 59], [12, 58], [18, 56], [21, 55], [24, 58], [26, 60], [30, 62], [28, 65], [24, 68], [20, 70], [16, 69], [12, 66], [10, 64], [6, 62], [5, 59], [2, 57], [-2, 55], [-5, 53], [-8, 51], [-10, 49], [-10, 44], [-10, 36]],
  // Africa
  [[-17, 15], [-16, 18], [-15, 22], [-12, 26], [-8, 28], [-5, 31], [-1, 34], [3, 36], [8, 37], [11, 34], [15, 32], [20, 32], [25, 31], [30, 31], [32, 29], [34, 27], [36, 24], [38, 20], [40, 16], [43, 12], [46, 11], [50, 12], [51, 10], [48, 5], [44, 2], [41, -2], [40, -6], [39, -10], [37, -14], [35, -18], [33, -22], [31, -26], [29, -30], [26, -33], [22, -34], [19, -34], [16, -30], [13, -24], [12, -18], [10, -10], [9, -4], [8, 0], [6, 4], [2, 6], [-3, 5], [-8, 6], [-12, 8], [-15, 10], [-17, 15]],
  // Asia
  [[30, 36], [33, 36], [36, 36], [39, 38], [42, 39], [45, 40], [48, 41], [51, 43], [54, 44], [57, 46], [60, 48], [63, 51], [66, 54], [69, 57], [72, 60], [75, 63], [78, 66], [82, 68], [86, 69], [90, 70], [95, 71], [100, 72], [105, 72], [110, 73], [115, 73], [120, 73], [125, 72], [130, 72], [135, 72], [140, 72], [145, 72], [150, 71], [155, 70], [160, 69], [165, 68], [170, 67], [178, 65], [175, 64], [170, 62], [165, 60], [162, 58], [160, 55], [158, 52], [155, 50], [150, 48], [146, 46], [142, 44], [140, 40], [138, 37], [135, 35], [132, 33], [130, 31], [127, 29], [124, 27], [121, 25], [118, 24], [114, 22], [110, 20], [108, 18], [106, 12], [104, 9], [102, 7], [100, 6], [99, 9], [97, 12], [95, 15], [93, 18], [91, 22], [89, 22], [87, 21], [85, 19], [83, 17], [81, 14], [79, 10], [77, 8], [76, 10], [74, 15], [72, 20], [70, 22], [67, 24], [64, 25], [61, 25], [58, 26], [55, 26], [52, 26], [50, 28], [48, 29], [46, 30], [44, 31], [42, 33], [40, 35], [37, 36], [34, 36], [30, 36]],
  // Australia
  [[113, -22], [114, -28], [115, -32], [116, -35], [120, -34], [124, -33], [128, -32], [132, -32], [135, -35], [138, -35], [140, -38], [144, -38], [147, -39], [150, -37], [153, -33], [153, -28], [152, -25], [150, -22], [147, -19], [144, -15], [142, -11], [141, -13], [138, -15], [136, -12], [134, -12], [132, -12], [130, -13], [128, -14], [125, -15], [122, -17], [119, -19], [116, -20], [113, -22]],
  // Indonesia / Papua
  [[95, 5], [98, 4], [100, 2], [102, 0], [104, -2], [106, -5], [108, -6], [110, -7], [112, -7], [114, -8], [116, -9], [118, -10], [120, -10], [122, -10], [124, -9], [126, -8], [128, -6], [130, -4], [132, -3], [134, -3], [136, -3], [138, -4], [140, -5], [141, -4], [141, -1], [140, 0], [138, 1], [136, 2], [134, 3], [132, 4], [130, 5], [128, 4], [126, 3], [124, 2], [122, 1], [120, 0], [118, 1], [116, 2], [114, 3], [112, 4], [110, 5], [108, 5], [106, 5], [104, 4], [102, 5], [100, 5], [98, 5], [95, 5]],
];

// ---------- small drawn pictograms (one consistent flat style) ----------
function drawIcon(kind: string, x: number, y: number, s: number, c: number[]): void {
  // s = box size in px; icon drawn inside (x, y, s, s)
  const u = s / 10;
  switch (kind) {
    case "missile": {
      // rocket body diagonal (nose up-right), fin, orange flame
      poly([[x + 4 * u, y + 1 * u], [x + 8 * u, y + 3 * u], [x + 6 * u, y + 7 * u], [x + 3 * u, y + 5 * u]], c);
      circle(x + 6 * u, y + 3 * u, 1.1 * u, WHITE);
      poly([[x + 3 * u, y + 5 * u], [x + 1 * u, y + 8 * u], [x + 4.5 * u, y + 7 * u]], c);
      poly([[x + 2.5 * u, y + 6.5 * u], [x + 0.5 * u, y + 9.5 * u], [x + 5 * u, y + 8 * u]], [220, 80, 20]);
      break;
    }
    case "chart": {
      // descending bars + red down arrow
      rect(x + 1.5 * u, y + 3 * u, 2 * u, 6 * u, c);
      rect(x + 4 * u, y + 5 * u, 2 * u, 4 * u, c);
      rect(x + 6.5 * u, y + 7 * u, 2 * u, 2 * u, c);
      poly([[x + 9 * u, y + 9 * u], [x + 7 * u, y + 7.5 * u], [x + 9 * u, y + 6.5 * u]], RED);
      break;
    }
    case "globe": {
      // filled teal globe, white meridians, red thermometer
      circle(x + 5 * u, y + 5 * u, 4 * u, [16, 120, 120]);
      circle(x + 5 * u, y + 5 * u, 4 * u, c, false);
      line(x + 1.2 * u, y + 5 * u, x + 8.8 * u, y + 5 * u, WHITE);
      line(x + 5 * u, y + 1.2 * u, x + 5 * u, y + 8.8 * u, WHITE);
      // thermometer
      rect(x + 7.4 * u, y + 2 * u, 1.4 * u, 4.5 * u, RED);
      circle(x + 8.1 * u, y + 7.2 * u, 1.5 * u, RED);
      break;
    }
    case "doc": {
      rect(x + 2 * u, y + 1 * u, 6 * u, 8 * u, WHITE);
      frame(x + 2 * u, y + 1 * u, 6 * u, 8 * u, c, 1);
      hline(x + 3 * u, y + 3 * u, 4 * u, c);
      hline(x + 3 * u, y + 5 * u, 4 * u, c);
      hline(x + 3 * u, y + 7 * u, 2.5 * u, RED);
      break;
    }
    case "shield": {
      poly([[x + 5 * u, y + 1 * u], [x + 9 * u, y + 2.5 * u], [x + 9 * u, y + 5.5 * u], [x + 5 * u, y + 9 * u], [x + 1 * u, y + 5.5 * u], [x + 1 * u, y + 2.5 * u]], c);
      line(x + 3 * u, y + 5 * u, x + 4.5 * u, y + 6.5 * u, WHITE);
      line(x + 4.5 * u, y + 6.5 * u, x + 7.5 * u, y + 3.5 * u, WHITE);
      break;
    }
    case "robot": {
      rect(x + 2 * u, y + 3 * u, 6 * u, 5 * u, c);
      line(x + 5 * u, y + 3 * u, x + 5 * u, y + 1 * u, c);
      circle(x + 5 * u, y + 1 * u, 0.9 * u, RED);
      rect(x + 3.2 * u, y + 4.6 * u, 1.4 * u, 1.4 * u, WHITE);
      rect(x + 5.4 * u, y + 4.6 * u, 1.4 * u, 1.4 * u, WHITE);
      hline(x + 3.5 * u, y + 7 * u, 3 * u, WHITE);
      break;
    }
    case "pill": {
      // capsule
      rect(x + 2 * u, y + 4 * u, 6 * u, 2.6 * u, c);
      circle(x + 2 * u, y + 5.3 * u, 1.3 * u, c);
      circle(x + 8 * u, y + 5.3 * u, 1.3 * u, c);
      rect(x + 5 * u, y + 4 * u, 1.2 * u, 2.6 * u, WHITE);
      break;
    }
    case "crowd": {
      circle(x + 3 * u, y + 3 * u, 1.6 * u, c);
      circle(x + 7 * u, y + 3 * u, 1.6 * u, c);
      poly([[x + 1 * u, y + 9 * u], [x + 1.6 * u, y + 5.5 * u], [x + 4.4 * u, y + 5.5 * u], [x + 5 * u, y + 9 * u]], c);
      poly([[x + 5 * u, y + 9 * u], [x + 5.6 * u, y + 5.5 * u], [x + 8.4 * u, y + 5.5 * u], [x + 9 * u, y + 9 * u]], c);
      break;
    }
    case "mountain": {
      poly([[x + 0.5 * u, y + 9 * u], [x + 3.5 * u, y + 2 * u], [x + 6.5 * u, y + 9 * u]], c);
      poly([[x + 4.5 * u, y + 9 * u], [x + 7 * u, y + 4 * u], [x + 9.5 * u, y + 9 * u]], [120, 120, 115]);
      line(x + 3.5 * u, y + 2 * u, x + 4.5 * u, y + 4 * u, RED);
      line(x + 4.5 * u, y + 4 * u, x + 3.8 * u, y + 6 * u, RED);
      break;
    }
    case "rain": {
      circle(x + 3.5 * u, y + 3.5 * u, 2.2 * u, c);
      circle(x + 6 * u, y + 3 * u, 2.4 * u, c);
      rect(x + 1.5 * u, y + 4.5 * u, 6.5 * u, 1.4 * u, c);
      line(x + 2.5 * u, y + 7 * u, x + 2 * u, y + 9 * u, TEAL);
      line(x + 5 * u, y + 7 * u, x + 4.5 * u, y + 9 * u, TEAL);
      line(x + 7.5 * u, y + 7 * u, x + 7 * u, y + 9 * u, TEAL);
      break;
    }
    case "scale": {
      line(x + 5 * u, y + 1 * u, x + 5 * u, y + 8 * u, c);
      line(x + 2 * u, y + 9 * u, x + 8 * u, y + 9 * u, c);
      line(x + 2 * u, y + 2.5 * u, x + 8 * u, y + 2.5 * u, c);
      poly([[x + 1 * u, y + 5.5 * u], [x + 3 * u, y + 5.5 * u], [x + 2 * u, y + 3 * u]], GOLD);
      poly([[x + 7 * u, y + 5.5 * u], [x + 9 * u, y + 5.5 * u], [x + 8 * u, y + 3 * u]], GOLD);
      break;
    }
    case "bat": {
      line(x + 3 * u, y + 1 * u, x + 6 * u, y + 7 * u, c);
      rect(x + 5.4 * u, y + 6.6 * u, 2.4 * u, 1.2 * u, c);
      circle(x + 8 * u, y + 8 * u, 1.1 * u, RED);
      break;
    }
    case "boat": {
      line(x + 5 * u, y + 1 * u, x + 5 * u, y + 6 * u, c);
      poly([[x + 5.4 * u, y + 1.5 * u], [x + 8.5 * u, y + 6 * u], [x + 5.4 * u, y + 6 * u]], WHITE);
      poly([[x + 1 * u, y + 6.5 * u], [x + 9 * u, y + 6.5 * u], [x + 7.5 * u, y + 9 * u], [x + 2.5 * u, y + 9 * u]], c);
      break;
    }
    default:
      circle(x + 5 * u, y + 5 * u, 3.5 * u, c, false);
  }
}

// ---------- hero scene bands (rich coloured backdrop behind the big icon) ----------
function burst(cx: number, cy: number, r: number, c: number[]): void {
  // 8-spike starburst + hot core
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    line(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
    line(cx, cy, cx + Math.cos(a + 0.4) * r * 0.6, cy + Math.sin(a + 0.4) * r * 0.6, c);
  }
  circle(cx, cy, Math.max(2, r * 0.35), [255, 220, 90]);
}
function drawHeroScene(kind: string, x: number, y: number, w: number, h: number): void {
  // x, y, w, h = the scene band rectangle. Draws a dark backdrop, a large
  // icon and extra scene detail so the hero panel is not mostly empty.
  switch (kind) {
    case "missile": {
      rect(x, y, w, h, [24, 32, 56]); // night sky
      const stars: [number, number][] = [[0.07, 0.2], [0.18, 0.12], [0.3, 0.26], [0.44, 0.14], [0.58, 0.24], [0.7, 0.12], [0.84, 0.22], [0.93, 0.34], [0.14, 0.48], [0.52, 0.42], [0.76, 0.52], [0.26, 0.6], [0.9, 0.62], [0.62, 0.68]];
      for (const [fx, fy] of stars) circle(x + fx * w, y + fy * h, 2, WHITE);
      // ground line + two explosion bursts low in the frame
      hline(x + 6, y + h - 12, w - 12, [70, 80, 110]);
      burst(x + w * 0.16, y + h - 16, 13, [240, 140, 30]);
      burst(x + w * 0.84, y + h - 18, 11, [240, 180, 40]);
      // big missile, nose up-right, over the sky
      drawIcon("missile", x + w / 2 - 30, y + 6, 60, WHITE);
      break;
    }
    case "chart": {
      rect(x, y, w, h, [74, 22, 26]); // dark red
      // faint horizontal grid
      for (let i = 1; i < 4; i++) hline(x + 8, y + (h * i) / 4, w - 16, [112, 42, 46]);
      // descending bars, left to right
      const bw = (w - 32) / 7;
      for (let i = 0; i < 7; i++) {
        const bh = (h - 22) * (1 - i / 7) + 8;
        rect(x + 16 + i * bw, y + h - 10 - bh, bw - 4, bh, [150, 52, 52]);
      }
      // bright descending line over the bars
      const pts: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        pts.push([x + 12 + (i / 10) * (w - 24), y + 12 + (i / 10) * (h - 26) + Math.sin(i * 1.3) * 3]);
      }
      for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [255, 220, 120]);
      circle(pts[10][0], pts[10][1], 3, [255, 220, 120]);
      break;
    }
    case "globe": {
      rect(x, y, w, h, [10, 72, 72]); // teal
      // faint latitude rings
      circle(x + w / 2, y + h / 2, 30, [40, 110, 110], false);
      circle(x + w / 2, y + h / 2, 20, [40, 110, 110], false);
      // big globe + thermometer
      drawIcon("globe", x + w / 2 - 32, y + 4, 64, WHITE);
      break;
    }
    default:
      rect(x, y, w, h, CREAM);
      drawIcon(kind, x + w / 2 - 30, y + 6, 60, INK);
  }
}

// ---------- layout ----------
// Project lon/lat to the map box (equirectangular).
const MAP = { x: 16, y: 640, w: 500, h: 270 };
function project(lat: number, lon: number): [number, number] {
  const x = MAP.x + ((lon + 180) / 360) * MAP.w;
  const y = MAP.y + ((90 - lat) / 180) * MAP.h;
  return [x, y];
}

function drawMasthead(): void {
  fill(PAPER);
  // top red rule
  rect(0, 0, W, 6, RED);
  centerTextBold(12, "THE WORLD IN ONE DAY", 2, RED);
  centerTextBold(28, "SATURDAY 21 NOVEMBER 2026", 6, INK);
  centerText(74, "33 STORIES · EVERY CONTINENT · ALL FROM THIS ONE DAY", 2, GREY);
  hline(16, 90, W - 32, INK);
}

function drawRegionStrip(): void {
  rect(16, 94, W - 32, 34, NAVY);
  const parts = REGION_COUNTS.map(([r, n]) => `${r} ${n}`);
  const s = parts.join(" · ");
  centerTextBold(104, s, 2, WHITE);
}

function numberBadge(x: number, y: number, n: number, r: number, scale: number): void {
  circle(x, y, r, PINRED);
  const label = String(n);
  drawTextBold(Math.round(x - textWidth(label, scale) / 2), Math.round(y - textHeight(scale) / 2), label, scale, WHITE);
}

function drawHero(): void {
  const y0 = 132;
  const ph = 218;
  const pw = 320;
  const xs = [16, 344, 672];
  for (let i = 0; i < HERO.length; i++) {
    const st = HERO[i];
    const x = xs[i];
    rect(x, y0, pw, ph, WHITE);
    frame(x, y0, pw, ph, LINE, 2);
    // rich scene band (66 px) with the big icon inside
    drawHeroScene(st.icon, x + 2, y0 + 2, pw - 4, 66);
    numberBadge(x + 16, y0 + 16, st.n, 11, 2);
    // region kicker
    centerTextBold(y0 + 74, st.region, 2, RED, x + pw / 2);
    // headline, balanced 2-line split, bold, centred
    const hl = splitTwoLines(st.headline, 3, pw - 24);
    let hy = y0 + 92;
    for (const ln of hl.slice(0, 2)) {
      centerTextBold(hy, ln, 3, INK, x + pw / 2);
      hy += 26;
    }
    // short red rule under the headline
    rect(x + pw / 2 - 30, hy + 2, 60, 2, RED);
    // caption, centred, up to 3 lines, roomier leading
    const cap = wrap(st.caption, 2, pw - 24);
    let cy = hy + 8;
    for (const ln of cap.slice(0, 3)) {
      centerText(cy, ln, 2, INK, x + pw / 2);
      cy += 17;
    }
    // source, bottom centre
    centerText(y0 + ph - 16, st.source, 2, GREY, x + pw / 2);
  }
}

function drawGrid(): void {
  const y0 = 354;
  const rowH = 132;
  const cw = 192;
  const gap = 6;
  for (let i = 0; i < GRID.length; i++) {
    const st = GRID[i];
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 16 + col * (cw + gap);
    const y = y0 + row * rowH;
    rect(x, y, cw, rowH - 4, WHITE);
    frame(x, y, cw, rowH - 4, LINE, 1);
    numberBadge(x + 13, y + 13, st.n, 9, 1);
    // tinted icon tile, top-right, bigger icon
    rect(x + cw - 46, y + 6, 40, 38, CREAM);
    frame(x + cw - 46, y + 6, 40, 38, LINE, 1);
    drawIcon(st.icon, x + cw - 44, y + 8, 36, INK);
    // region kicker, top-left
    drawTextBold(x + 26, y + 18, st.region, 1, RED);
    // headline, balanced split, bold, up to 2 lines
    const hl = splitTwoLines(st.headline, 2, cw - 16);
    let hy = y + 48;
    for (const ln of hl.slice(0, 2)) {
      drawTextBold(x + 8, hy, ln, 2, INK);
      hy += 18;
    }
    // caption, up to 2 lines
    const cap = wrap(st.caption, 2, cw - 16);
    let cy = hy + 2;
    for (const ln of cap.slice(0, 2)) {
      drawText(x + 8, cy, ln, 2, INK);
      cy += 16;
    }
    drawText(x + 8, y + rowH - 16, st.source, 2, GREY);
  }
}

function drawMapAndAlso(): void {
  // section header rule
  hline(16, 622, W - 32, INK);
  drawTextBold(16, 628, "WHERE IT HAPPENED", 2, RED);
  drawTextBold(528, 628, "ALSO ON SATURDAY 21 NOVEMBER 2026", 2, RED);
  // map (box at y=642, taller than before so pins spread out)
  const mapBox = { x: 16, y: 642, w: 500, h: 270 };
  const proj = (lat: number, lon: number): [number, number] => {
    const x = mapBox.x + ((lon + 180) / 360) * mapBox.w;
    const y = mapBox.y + ((90 - lat) / 180) * mapBox.h;
    return [x, y];
  };
  rect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, SEA);
  frame(mapBox.x, mapBox.y, mapBox.w, mapBox.h, LINE, 1);
  for (const cont of CONTINENTS) {
    const pts = cont.map(([lon, lat]) => proj(lat, lon) as [number, number]);
    poly(pts, LAND);
  }
  // pins, de-collided deterministically (wider spiral, 24 px clearance).
  // A thin leader line joins each pin to its true location when it moved.
  const placed: [number, number][] = [];
  const offsets: [number, number][] = [[0, 0], [24, 0], [0, 24], [-24, 0], [0, -24], [24, 24], [-24, 24], [24, -24], [-24, -24], [48, 0], [0, 48], [-48, 0], [0, -48], [48, 48], [-48, 48], [48, -48], [-48, -48], [72, 0], [0, 72], [-72, 0], [0, -72], [72, 72], [-72, 72]];
  for (const st of ALL) {
    const [bx, by] = proj(st.lat, st.lon);
    let px = bx;
    let py = by;
    for (const [dx, dy] of offsets) {
      const cx = bx + dx;
      const cy = by + dy;
      if (cx < mapBox.x + 12 || cx > mapBox.x + mapBox.w - 12 || cy < mapBox.y + 12 || cy > mapBox.y + mapBox.h - 12) continue;
      if (!placed.some(([ax, ay]) => Math.abs(ax - cx) < 24 && Math.abs(ay - cy) < 24)) {
        px = cx;
        py = cy;
        break;
      }
    }
    placed.push([px, py]);
    if (px !== bx || py !== by) line(px, py, bx, by, GREY);
    circle(Math.round(px), Math.round(py), 10, PINRED);
    circle(Math.round(px), Math.round(py), 10, WHITE, false);
    const label = String(st.n);
    drawTextBold(Math.round(px - textWidth(label, 1) / 2), Math.round(py - textHeight(1) / 2), label, 1, WHITE);
  }
  drawText(16, 918, "Pins 1-33: every story on this page.", 2, GREY);
  // divider
  vline(520, 622, 322, LINE);
  // also list: zebra rows + bold red numbers, 15 px leading
  let y = 642;
  for (let i = 0; i < ALSO.length; i++) {
    const st = ALSO[i];
    if (i % 2 === 0) rect(524, y - 1, W - 32 - 524 + 16, 15, CREAM);
    const num = String(st.n);
    drawTextBold(528, y, num, 2, RED);
    const tx = 528 + 3 * 6 * 2 + 4; // number width (2 digits) + gap
    if (st.claim) drawTextBold(tx, y, st.line ?? "", 2, RED);
    else drawText(tx, y, st.line ?? "", 2, INK);
    y += 15;
  }
}

function drawFooter(): void {
  hline(16, 950, W - 32, INK);
  drawTextBold(16, 958, "DATE CHECK ✓ All 33 stories happened or were first reported on Sat 21 Nov 2026.", 2, INK);
  drawText(16, 975, "LEFT OUT AS OTHER DAYS' NEWS - 19 Nov: Shenzhen summit; ICJ Myanmar ruling;", 2, INK);
  drawText(16, 992, "Anthropic IPO; Greenland 109-0. 20 Nov: FBI NCIC breach; El Chapo Isidro captured.", 2, INK);
  drawText(16, 1009, "Sources: AP, Reuters, AFP, BBC, Al Jazeera, NYT, Telegraph, France 24, PANA", 2, GREY);
}

// ---------- main ----------
function main(): void {
  drawMasthead();
  drawRegionStrip();
  drawHero();
  drawGrid();
  drawMapAndAlso();
  drawFooter();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(fb, W, H);
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
