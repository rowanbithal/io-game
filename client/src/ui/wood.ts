/**
 * Wooden UI chrome — the planks, frames, buttons and nails the HUD panels are
 * built out of. Everything here draws in whole pixels with flat fills (no
 * gradients, no rounded corners, no anti-aliased curves) so the interface
 * reads as cut from the same pixel art as the world sprites rather than as a
 * modern translucent overlay dropped on top of it.
 *
 * Grain and knots are procedural but *seeded*, so a panel redrawn every frame
 * keeps exactly the same boards instead of shimmering.
 */

/** Board tones, matched to the campfire logs / bench top in Renderer.ts's palette. */
export const WOOD = {
  light: '#a9743f',
  base: '#8a5a2b',
  mid: '#6b4a26',
  dark: '#4a3119',
  frame: '#3a2513',
  edge: '#20140a',
  nail: '#cfc7b2',
  nailDark: '#6d6656',
  // Text burnt into the boards: warm parchment for headings, dimmer for
  // secondary lines, plus the two states an ingredient line can be in.
  ink: '#f4e4c1',
  inkDim: '#c3a67c',
  inkMuted: '#8a7457',
  have: '#9fd88b',
  short: '#e08a6b',
  ember: '#ffb545',
};

/** Deterministic 0..1 stream — same seed, same boards, every frame. */
function seeded(seed: number): () => number {
  let t = (seed * 2654435761) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WoodPanelOptions {
  /** Height of one board, in pixels. Smaller panels want thinner boards. */
  plankH?: number;
  /** Thickness of the dark frame around the boards. */
  border?: number;
  /** Grain seed — vary it between panels so they don't look stamped. */
  seed?: number;
  /** Nail heads in the corners. Off for small rows, on for big panels. */
  nails?: boolean;
}

/**
 * A slab of horizontal boards inside a dark frame. Coordinates are snapped to
 * whole pixels; pass whatever you like.
 */
export function woodPanel(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  opts: WoodPanelOptions = {},
): void {
  const { plankH = 13, border = 3, seed = 1, nails = false } = opts;
  const x = Math.round(rx);
  const y = Math.round(ry);
  const w = Math.round(rw);
  const h = Math.round(rh);
  if (w <= 0 || h <= 0) return;

  // Frame: one pixel of near-black outline, then the darker timber edge.
  ctx.fillStyle = WOOD.edge;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = WOOD.frame;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

  drawPlanks(ctx, x + border, y + border, w - border * 2, h - border * 2, plankH, seed);

  if (nails) {
    const inset = border + 3;
    woodNail(ctx, x + inset, y + inset);
    woodNail(ctx, x + w - inset - 2, y + inset);
    woodNail(ctx, x + inset, y + h - inset - 2);
    woodNail(ctx, x + w - inset - 2, y + h - inset - 2);
  }
}

/**
 * Fills a rect with boards — grain, seams, knots and the light/shadow along
 * the top and bottom edges. Split out of woodPanel so the rounded tile can
 * lay the same timber inside a clipped shape.
 */
function drawPlanks(
  ctx: CanvasRenderingContext2D,
  ix: number,
  iy: number,
  iw: number,
  ih: number,
  plankH: number,
  seed: number,
): void {
  if (iw <= 0 || ih <= 0) return;
  const rand = seeded(seed);

  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();

  for (let py = iy, row = 0; py < iy + ih; py += plankH, row++) {
    ctx.fillStyle = row % 2 === 0 ? WOOD.base : WOOD.mid;
    ctx.fillRect(ix, py, iw, plankH - 1);

    // Seam between boards.
    ctx.fillStyle = WOOD.dark;
    ctx.fillRect(ix, py + plankH - 1, iw, 1);

    // Grain: single-pixel streaks running along the board.
    const streaks = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < streaks; i++) {
      const gw = 10 + Math.floor(rand() * 34);
      const gx = ix + Math.floor(rand() * Math.max(1, iw - gw));
      const gy = py + 1 + Math.floor(rand() * Math.max(1, plankH - 3));
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = rand() < 0.55 ? WOOD.dark : WOOD.light;
      ctx.fillRect(gx, gy, gw, 1);
      ctx.globalAlpha = 1;
    }

    // The odd knot — a dark blob with a lighter core.
    if (plankH >= 10 && rand() < 0.3) {
      const kx = ix + Math.floor(rand() * Math.max(1, iw - 6));
      const ky = py + Math.floor(plankH / 2) - 2;
      ctx.fillStyle = WOOD.dark;
      ctx.fillRect(kx, ky, 5, 4);
      ctx.fillStyle = WOOD.frame;
      ctx.fillRect(kx + 1, ky + 1, 3, 2);
    }
  }

  // Light catching the top board, shadow pooling under the bottom one.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = WOOD.light;
  ctx.fillRect(ix, iy, iw, 1);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = WOOD.edge;
  ctx.fillRect(ix, iy + ih - 1, iw, 1);
  ctx.globalAlpha = 1;

  ctx.restore();
}

/** A 2×2 nail head with a one-pixel shadow, at (x, y) top-left. */
export function woodNail(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.fillStyle = WOOD.nailDark;
  ctx.fillRect(px, py, 3, 3);
  ctx.fillStyle = WOOD.nail;
  ctx.fillRect(px, py, 2, 2);
}

/**
 * A rounded rectangle built out of whole scanlines — corners step down in
 * pixels the way a hand-drawn sprite's would, instead of the smooth
 * anti-aliased arc `arcTo` gives you.
 */
export function pixelRoundRect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const path = new Path2D();
  const radius = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  for (let row = 0; row < h; row++) {
    // Distance from the nearest corner band, or -1 in the straight middle.
    const dy = row < radius ? radius - 1 - row : row >= h - radius ? row - (h - radius) : -1;
    const inset = dy < 0 ? 0 : radius - Math.floor(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    path.rect(x + inset, y + row, w - inset * 2, 1);
  }
  return path;
}

export interface WoodTileOptions {
  radius?: number;
  plankH?: number;
  seed?: number;
  hover?: boolean;
  /** Pressed/open: the tile darkens and its outline lights up. */
  active?: boolean;
}

/**
 * A rounded wooden tile — a single squared-off block of timber, used for
 * standalone icon buttons. Same boards as woodPanel, just cut to a rounded
 * silhouette.
 */
export function woodTile(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  opts: WoodTileOptions = {},
): void {
  const { radius = 5, plankH = 11, seed = 17, hover = false, active = false } = opts;
  const x = Math.round(rx);
  const y = Math.round(ry);
  const w = Math.round(rw);
  const h = Math.round(rh);

  // Outline, then the timber edge, then the boards — each a rounded shape one
  // pixel inside the last.
  ctx.fillStyle = active || hover ? WOOD.ember : WOOD.edge;
  ctx.fill(pixelRoundRect(x, y, w, h, radius));
  ctx.fillStyle = WOOD.frame;
  ctx.fill(pixelRoundRect(x + 1, y + 1, w - 2, h - 2, radius - 1));

  ctx.save();
  ctx.clip(pixelRoundRect(x + 2, y + 2, w - 4, h - 4, radius - 1));
  drawPlanks(ctx, x + 2, y + 2, w - 4, h - 4, plankH, seed);
  if (hover || active) {
    ctx.globalAlpha = active ? 0.22 : 0.14;
    ctx.fillStyle = active ? WOOD.edge : WOOD.light;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * A near-black recessed socket. Item sprites are mostly browns and greys, so
 * they disappear against bare boards — everything the UI shows an item in
 * sits in one of these instead.
 */
export function woodSlot(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): void {
  const x = Math.round(rx);
  const y = Math.round(ry);
  const w = Math.round(rw);
  const h = Math.round(rh);
  ctx.fillStyle = WOOD.edge;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  // Rim: shadow at the top-left, catch-light at the bottom-right, so it
  // reads as cut into the board.
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = WOOD.light;
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.globalAlpha = 1;
}

// A closed book stood face-on: spine down the left, page block down the
// fore-edge, stamped cover between them, on an 11×13 lattice. Drawn rather
// than typed, so it's the same pixel vocabulary as the world sprites (and so
// no emoji font gets a say in what it looks like).
const BOOK_COLS = 11;
const BOOK_ROWS = 13;

// The silhouette: top and bottom rows pulled in a pixel, so the corners read
// as rounded rather than as a plain slab.
const BOOK_SHAPE: [number, number][] = [
  [1, 10],
  ...Array.from({ length: BOOK_ROWS - 2 }, () => [0, 11] as [number, number]),
  [1, 10],
];

// Leaves scored down the fore-edge, and the raised bands across the spine.
const BOOK_PAGE_LINES = [3, 5, 7, 9];
const BOOK_SPINE_BANDS = [3, 9];

/**
 * The book glyph for the recipe tile: a closed book cut into the board it
 * sits on. Outlined in near-black with a light lip below — that lip is what
 * sells "cut into the wood" rather than "sticker stuck on top" — then filled
 * in the timber tones so the cover, spine and pages stay separable at a
 * couple of pixels per block.
 */
export function drawCarvedBook(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const b = Math.max(1, Math.floor(size / BOOK_ROWS));
  const ox = Math.round(cx - (BOOK_COLS * b) / 2);
  const oy = Math.round(cy - (BOOK_ROWS * b) / 2);
  const cell = (gx: number, gy: number, cols = 1, rows = 1): void => {
    ctx.fillRect(ox + gx * b, oy + gy * b, cols * b, rows * b);
  };
  const silhouette = (): void => {
    for (let row = 0; row < BOOK_SHAPE.length; row++) {
      const [from, to] = BOOK_SHAPE[row];
      cell(from, row, to - from);
    }
  };

  // The lip of the carve: the whole shape in light, offset down.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = WOOD.light;
  ctx.save();
  ctx.translate(0, Math.max(1, Math.round(b / 2)));
  silhouette();
  ctx.restore();
  ctx.globalAlpha = 1;

  // Outline, then the cover inside it.
  ctx.fillStyle = WOOD.edge;
  silhouette();
  ctx.fillStyle = WOOD.dark;
  cell(1, 1, 9, BOOK_ROWS - 2);

  // Spine down the left, banded — kept lighter than the cover so the binding
  // stays legible at two pixels a block.
  ctx.fillStyle = WOOD.mid;
  cell(1, 1, 2, BOOK_ROWS - 2);
  ctx.fillStyle = WOOD.frame;
  for (const row of BOOK_SPINE_BANDS) cell(1, row, 2);

  // The block of pages along the fore-edge, scored into leaves.
  ctx.fillStyle = WOOD.nail;
  cell(8, 2, 2, BOOK_ROWS - 4);
  ctx.fillStyle = WOOD.nailDark;
  for (const row of BOOK_PAGE_LINES) cell(8, row, 2);

  // Stamp on the cover.
  ctx.fillStyle = WOOD.base;
  cell(5, 5, 2);
  cell(4, 6, 4);
  cell(5, 7, 2);
}

/** A scored line across a board — a seam between sections of a panel. */
export function woodDivider(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
): void {
  const x = Math.round(rx);
  const y = Math.round(ry);
  const w = Math.round(rw);
  ctx.fillStyle = WOOD.edge;
  ctx.fillRect(x, y, w, 1);
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = WOOD.light;
  ctx.fillRect(x, y + 1, w, 1);
  ctx.globalAlpha = 1;
}
