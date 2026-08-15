// Generates the baked pixel-art resource sprites used by Renderer.ts.
//
// Usage:  node scripts/gen-sprites.mjs
//
// Requires ImageMagick (`magick`) on PATH to rasterize the intermediate SVG
// to PNG. Only needed when tweaking sprite designs — the PNGs it produces
// are committed to src/assets/sprites/ and loaded at runtime, ImageMagick
// itself is not a runtime dependency.
//
// If you change a shape here, keep client/src/Renderer.ts's SPRITES map
// (w/h/anchorX/anchorY) in sync with what this script prints.

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../src/assets/sprites');
const tmpDir = path.join(__dirname, '.sprite-svg-tmp');

// Same block-shape math as client/src/Renderer.ts, but here 1 cell = 1 native
// pixel of a baked sprite image (instead of BLOCK world-units of a live path).
// Trees and rocks are NOT generated here — they're procedurally drawn at
// runtime (see Renderer.ts: treeCrownCells/rockPatchCells) so clustered
// trees can render as one connected mass with branch bridges between them.
function blockCircle(radius, aspectX = 1) {
  const cells = [];
  const topBand = -Math.round(radius * 0.35);
  const bottomBand = Math.round(radius * 0.45);
  const rx = Math.ceil(radius * aspectX);
  for (let gy = -radius; gy <= radius; gy++) {
    for (let gx = -rx; gx <= rx; gx++) {
      if (Math.hypot(gx / aspectX, gy) > radius + 0.15) continue;
      const shade = gy <= topBand ? 'light' : gy >= bottomBand ? 'dark' : 'base';
      cells.push({ gx, gy, shade });
    }
  }
  return cells;
}

function blockDome(radius) {
  const cells = [];
  const topBand = -Math.round(radius * 0.4);
  for (let gy = -radius; gy <= 0; gy++) {
    for (let gx = -radius; gx <= radius; gx++) {
      if (Math.hypot(gx, gy * 1.15) > radius + 0.15) continue;
      const shade = gy <= topBand ? 'light' : gy >= -1 ? 'dark' : 'base';
      cells.push({ gx, gy, shade });
    }
  }
  const lip = Math.round(radius * 0.7);
  for (let gx = -lip; gx <= lip; gx++) cells.push({ gx, gy: 1, shade: 'dark' });
  return cells;
}

const P = {
  berryBushLight: '#3fc774', berryBush: '#28a55a', berryBushDark: '#1c7a41',
  berry: '#c0392b', berryHighlight: '#e74c3c',
  stem: '#f5f0d8', capOrange: '#e67e22', capMid: '#e2601c', capRed: '#d44000',
  // Dark forest variant of the berry bush above — a cooler, shadowed bush
  // (matches the forest's own darker canopy palette in Renderer.ts) bearing
  // purple berries instead of red.
  forestBushLight: '#3a8f5c', forestBush: '#256b45', forestBushDark: '#194a30',
  purpleBerry: '#7d3c98', purpleBerryHighlight: '#a569bd',
};

// ── Per-sprite part lists (mirrors the old drawBerry/drawMushroom) ─
const sprites = {
  berry: [
    { type: 'rect', x: -1.8, y: 1.8, w: 3.6, h: 0.8, color: 'rgba(0,0,0,0.12)' },
    { type: 'cells', cells: blockCircle(3), ox: 0, oy: 0,
      palette: { light: P.berryBushLight, base: P.berryBush, dark: P.berryBushDark } },
    ...[[-1.1, -1.1], [0.9, -1.1], [0, 0.4], [-1.3, 0.4], [1.2, 0.4]].flatMap(([bx, by]) => {
      const dot = 0.7;
      return [
        { type: 'rect', x: bx - dot / 2, y: by - dot / 2, w: dot, h: dot, color: P.berry },
        { type: 'rect', x: bx - dot / 2, y: by - dot / 2, w: dot / 2, h: dot / 2, color: P.berryHighlight },
      ];
    }),
  ],
  purple_berry: [
    { type: 'rect', x: -1.8, y: 1.8, w: 3.6, h: 0.8, color: 'rgba(0,0,0,0.12)' },
    { type: 'cells', cells: blockCircle(3), ox: 0, oy: 0,
      palette: { light: P.forestBushLight, base: P.forestBush, dark: P.forestBushDark } },
    ...[[-1.1, -1.1], [0.9, -1.1], [0, 0.4], [-1.3, 0.4], [1.2, 0.4]].flatMap(([bx, by]) => {
      const dot = 0.7;
      return [
        { type: 'rect', x: bx - dot / 2, y: by - dot / 2, w: dot, h: dot, color: P.purpleBerry },
        { type: 'rect', x: bx - dot / 2, y: by - dot / 2, w: dot / 2, h: dot / 2, color: P.purpleBerryHighlight },
      ];
    }),
  ],
  mushroom: [
    { type: 'rect', x: -1.6, y: 1.8, w: 3.2, h: 0.7, color: 'rgba(0,0,0,0.1)' },
    { type: 'rect', x: -0.7, y: 0, w: 1.4, h: 2.2, color: P.stem },
    { type: 'cells', cells: blockDome(4), ox: 0, oy: 0,
      palette: { light: P.capOrange, base: P.capMid, dark: P.capRed } },
    ...[[-1.1, -1.6], [0.9, -1.6], [0, -2.4]].map(([sx, sy]) => {
      const s = 0.6;
      return { type: 'rect', x: sx - s / 2, y: sy - s / 2, w: s, h: s, color: 'rgba(255,255,255,0.7)' };
    }),
  ],
};

const PAD = 0.75;
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

for (const [name, parts] of Object.entries(sprites)) {
  // Flatten into plain rects for bounding-box + SVG emission.
  const rects = [];
  for (const part of parts) {
    if (part.type === 'rect') {
      rects.push({ x: part.x, y: part.y, w: part.w, h: part.h, color: part.color });
    } else {
      for (const { gx, gy, shade } of part.cells) {
        rects.push({ x: part.ox + gx - 0.5, y: part.oy + gy - 0.5, w: 1, h: 1, color: part.palette[shade] });
      }
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;

  const W = Math.ceil(maxX - minX);
  const H = Math.ceil(maxY - minY);
  const anchorX = -minX; // image px coord of world-space (0,0)
  const anchorY = -minY;

  const svgRects = rects
    .map((r) => `<rect x="${(r.x - minX).toFixed(3)}" y="${(r.y - minY).toFixed(3)}" width="${r.w}" height="${r.h}" fill="${r.color}" shape-rendering="crispEdges"/>`)
    .join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">\n  ${svgRects}\n</svg>\n`;
  const svgPath = path.join(tmpDir, `${name}.svg`);
  const pngPath = path.join(outDir, `${name}.png`);

  writeFileSync(svgPath, svg);
  execFileSync('magick', ['-background', 'none', svgPath, pngPath]);

  console.log(`${name}: ${W}x${H} anchor=(${anchorX.toFixed(2)},${anchorY.toFixed(2)})`);
}

rmSync(tmpDir, { recursive: true, force: true });
