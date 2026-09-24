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
  /** Random dark knots in the grain. On by default — a nice touch on a big panel, but turn off for anything small enough that a knot could land on/beside content sitting on top of it (see woodTile's own default). */
  knots?: boolean;
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
  const { plankH = 13, border = 3, seed = 1, nails = false, knots = true } = opts;
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

  drawPlanks(ctx, x + border, y + border, w - border * 2, h - border * 2, plankH, seed, knots);

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
  knots: boolean = true,
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
    if (knots && plankH >= 10 && rand() < 0.3) {
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
  /** Random dark knots in the grain — off by default here (unlike woodPanel's own default): a tile this small has a carved icon sitting on top of it with real gaps in its own silhouette (an open sign board, the space between a paw's toes), and a knot showing through one reads as a stray dark blob on the icon rather than as wood grain. */
  knots?: boolean;
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
  const { radius = 5, plankH = 11, seed = 17, hover = false, active = false, knots = false } = opts;
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
  drawPlanks(ctx, x + 2, y + 2, w - 4, h - 4, plankH, seed, knots);
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

// A paw print stamped on the animal compendium's button — a big round pad
// plus four toes fanned above it, carved into the board with the same
// lip/outline/fill trick drawCarvedBook uses. Cells sit on a whole-number
// lattice (unlike a naive filled-circle union) so the fill layer can be
// derived by erosion — dropping any cell missing an orthogonal neighbor —
// the same "outline, then the shape inset by one ring" idea drawCarvedBook
// gets for free from its rectangular rows. Without that, toes only a couple
// of cells across have no clean interior left once the lip/outline is on top
// of them, and the whole print reads as a muddy blob instead of five
// separate pads.
function pawCells(): { gx: number; gy: number }[] {
  const set = new Set<string>();
  const addBlob = (rx: number, ry: number, ox: number, oy: number): void => {
    const spanX = Math.ceil(rx);
    const spanY = Math.ceil(ry);
    for (let dy = -spanY; dy <= spanY; dy++) {
      for (let dx = -spanX; dx <= spanX; dx++) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1) set.add(`${ox + dx},${oy + dy}`);
      }
    }
  };

  addBlob(3, 2, 0, 3); // main pad: a wide oval at the bottom
  // Four toes fanned well above it, each spaced a clear cell or more from
  // its neighbors *and* from the pad — real paw prints show every toe as
  // its own separate mark, not fused to the pad behind it.
  addBlob(1, 1, -4, 0);
  addBlob(1, 1, -2, -3);
  addBlob(1, 1, 2, -3);
  addBlob(1, 1, 4, 0);

  return Array.from(set, (key) => {
    const [gx, gy] = key.split(',').map(Number);
    return { gx, gy };
  });
}

const PAW_CELLS = pawCells();
const PAW_CELL_SET = new Set(PAW_CELLS.map((c) => `${c.gx},${c.gy}`));

/** Cells with all four orthogonal neighbors also in the shape — erosion by one ring, for the carve's interior fill (see pawCells' comment). */
const PAW_INNER_CELLS = PAW_CELLS.filter(
  (c) =>
    PAW_CELL_SET.has(`${c.gx + 1},${c.gy}`) &&
    PAW_CELL_SET.has(`${c.gx - 1},${c.gy}`) &&
    PAW_CELL_SET.has(`${c.gx},${c.gy + 1}`) &&
    PAW_CELL_SET.has(`${c.gx},${c.gy - 1}`),
);

/**
 * The paw-print glyph for the animal compendium's button: same carved-into-
 * the-board treatment as drawCarvedBook (a light lip below, a dark outline,
 * a filled body a shade lighter so the rim stays visible), just built from
 * round pad shapes instead of a rectangular silhouette.
 */
export function drawCarvedPaw(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const b = Math.max(1, size / 12);

  const stamp = (cells: { gx: number; gy: number }[], fill: string, offY = 0): void => {
    ctx.fillStyle = fill;
    for (const c of cells) {
      ctx.fillRect(
        Math.round(cx + c.gx * b - b / 2),
        Math.round(cy + c.gy * b - b / 2 + offY),
        Math.ceil(b),
        Math.ceil(b),
      );
    }
  };

  // The lip of the carve: the whole shape in light, offset down.
  ctx.globalAlpha = 0.5;
  stamp(PAW_CELLS, WOOD.light, Math.max(1, Math.round(b / 2)));
  ctx.globalAlpha = 1;

  // Outline, then the interior (eroded by one ring) a shade lighter so the
  // outline rim stays visible all the way around, tiny toes included.
  stamp(PAW_CELLS, WOOD.edge);
  stamp(PAW_INNER_CELLS, WOOD.dark);
}

// A market stand for the trading post's button — a scalloped awning on a
// rail, two poles framing an open sign board, and a counter with a raised
// top ledge (a plain silhouette read at a glance, the same shape a real
// market-stall icon uses). Wider than it is tall, like an actual stall
// (and unlike this icon's own first draft) — see the block-size comment in
// drawCarvedStand for how that's kept inside the button's square footprint.
// Built from named rect pieces, like drawCarvedBook's cover/spine/pages,
// rather than one tapered row-shape like drawCarvedPaw/that first draft
// used — the poles need real empty space between them for the sign board
// to read as open, which a single span-per-row silhouette can't leave.
// Same carved-into-the-board treatment throughout: a light lip below, a
// dark outline, each piece filled a shade lighter so the rim stays visible
// — except the poles and awning teeth, too thin at this scale to inset at
// all, which just stay the outline's own dark tone, reading as a clean
// line rather than a two-tone piece with no room left for a rim.
const STAND_COLS = 13;
const STAND_ROWS = 9;

/** Every piece of the stand, as (gx, gy, cols, rows) rects — shared by the silhouette pass and the per-piece fills below. */
function standPieces(cell: (gx: number, gy: number, cols?: number, rows?: number) => void): void {
  cell(1, 0, 11, 1); // awning rail
  cell(1, 1, 11, 1); // awning band
  cell(1, 2); // scalloped teeth — alternating, so the awning's bottom edge
  cell(3, 2); // reads as wavy rather than a straight cut. Odd columns only:
  cell(5, 2); // the gaps between them fall outside the silhouette entirely,
  cell(7, 2); // showing the bare board through rather than another color.
  cell(9, 2);
  cell(11, 2);
  cell(1, 3, 1, 3); // left pole
  cell(11, 3, 1, 3); // right pole — the 9-wide gap between the poles (cols
  // 2..10) is deliberately empty: the stand's open sign board, same as the
  // reference icon's blank panel.
  cell(1, 6, 11, 1); // counter ledge
  cell(1, 7, 11, 2); // counter body
}

export function drawCarvedStand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  // Sized off whichever dimension is larger (unlike the other carved icons,
  // all taller than wide, which could just divide by their row count) — a
  // wide, short shape like this one would otherwise blow past `size`
  // sideways if the block size were still picked from the (now smaller)
  // row count alone.
  const b = Math.max(1, Math.floor(size / Math.max(STAND_COLS, STAND_ROWS)));
  const ox = Math.round(cx - (STAND_COLS * b) / 2);
  const oy = Math.round(cy - (STAND_ROWS * b) / 2);
  const cell = (gx: number, gy: number, cols = 1, rows = 1): void => {
    ctx.fillRect(ox + gx * b, oy + gy * b, cols * b, rows * b);
  };
  const silhouette = (): void => standPieces(cell);

  // The lip of the carve: the whole shape in light, offset down.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = WOOD.light;
  ctx.save();
  ctx.translate(0, Math.max(1, Math.round(b / 2)));
  silhouette();
  ctx.restore();
  ctx.globalAlpha = 1;

  // Outline — every piece starts this color, so the poles/teeth (skipped
  // below, no room to inset) simply stay it.
  ctx.fillStyle = WOOD.edge;
  silhouette();

  // Awning: the same off-white WOOD.nail tone the counter's own ledge below
  // uses (and drawCarvedPouch's coin/drawCarvedBook's pages before it) —
  // not a fabric color of its own, just this icon set's one shared
  // highlight tone. Rail and band inset by one ring; the teeth are one
  // cell each, too small to inset, so they're recolored whole.
  ctx.fillStyle = WOOD.nail;
  cell(2, 0, 9, 1);
  cell(2, 1, 9, 1);
  cell(1, 2);
  cell(3, 2);
  cell(5, 2);
  cell(7, 2);
  cell(9, 2);
  cell(11, 2);

  // Counter: the same ledge highlight, the body itself inset by one ring.
  ctx.fillStyle = WOOD.nail;
  cell(2, 6, 9, 1);
  ctx.fillStyle = WOOD.dark;
  cell(2, 7, 9, 2);
}

// ── Animal compendium: leather book chrome ──────────────────────────────────
// A different material vocabulary from the wood panels above — a stitched
// leather cover around cream parchment pages — so the compendium reads as a
// naturalist's field journal rather than another wooden crafting sign.

export const LEATHER = {
  cover: '#5a3420',
  coverLight: '#7a4a2c',
  coverDark: '#3c2113',
  edge: '#1c0f07',
  stitch: '#caa968',
  stitchDark: '#8a6c3c',
  page: '#f1e6c6',
  pageShade: '#e2d3a6',
  pageDark: '#cdb989',
  spine: '#241209',
  ink: '#3a2a16',
  inkDim: '#8c7857',
};

export interface LeatherCoverOptions {
  /** Grain seed — vary between panels so they don't look stamped. */
  seed?: number;
}

/**
 * A rectangle silhouette with a hand-worn, staircase-jagged edge instead of
 * a clean line — the same "torn edge built from axis-aligned steps" idea the
 * full-map camera view's parchment uses (see Renderer's tatteredMapPath),
 * reimplemented standalone here since wood.ts has no per-instance cache to
 * share that method's memoization through. Every segment is purely
 * horizontal or vertical, like the rest of the game's blocky sprites — a
 * jittered diagonal would anti-alias into a smooth line nothing else here
 * has. `rand` is the caller's own seeded stream, so two calls (outer edge,
 * inset cover) can be given different streams and jag independently.
 */
function raggedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rand: () => number,
  maxJag: number,
  step: number,
): Path2D {
  const corners: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const points: [number, number][] = [corners[0]];
  for (let side = 0; side < 4; side++) {
    const [x0, y0] = corners[side];
    const [x1, y1] = corners[(side + 1) % 4];
    const length = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / length; // unit vector along the side
    const uy = (y1 - y0) / length;
    const nx = uy; // perpendicular to it, pointing outward (corners run clockwise)
    const ny = -ux;

    let jag = 0;
    let along = 0;
    while (along < length) {
      along = Math.min(length, along + step);
      // Move along the edge first (a pure horizontal/vertical segment at the
      // *previous* jog), then jog perpendicular — two right-angle moves
      // instead of one diagonal one, same as a staircase.
      points.push([x0 + ux * along + nx * jag, y0 + uy * along + ny * jag]);
      if (along >= length) break; // leave the corner itself un-jogged
      jag = Math.max(-maxJag, Math.min(maxJag, jag + (rand() < 0.5 ? -step : step)));
      points.push([x0 + ux * along + nx * jag, y0 + uy * along + ny * jag]);
    }
  }

  const path = new Path2D();
  path.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
  for (const [px, py] of points.slice(1)) path.lineTo(Math.round(px), Math.round(py));
  path.closePath();
  return path;
}

/**
 * The compendium's outer cover: a dark leather slab, hand-worn rather than
 * die-cut — a ragged edge (see raggedRectPath) on both the outer silhouette
 * and the inset face, leather grain speckles, a few scuff scratches, corners
 * rubbed lighter from handling, a stitched border, and brass-ish corner
 * studs. Coordinates snap to whole pixels.
 */
export function drawLeatherCover(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  opts: LeatherCoverOptions = {},
): void {
  const { seed = 1 } = opts;
  const x = Math.round(rx);
  const y = Math.round(ry);
  const w = Math.round(rw);
  const h = Math.round(rh);
  if (w <= 0 || h <= 0) return;

  const step = 7;
  const outerRand = seeded(seed);
  ctx.fillStyle = LEATHER.edge;
  ctx.fill(raggedRectPath(x, y, w, h, outerRand, 3, step));

  const inset = 4;
  const innerRand = seeded(seed + 97);
  const innerPath = raggedRectPath(x + inset, y + inset, w - inset * 2, h - inset * 2, innerRand, 2, step);
  ctx.fillStyle = LEATHER.cover;
  ctx.fill(innerPath);

  const rand = seeded(seed + 211);
  ctx.save();
  ctx.clip(innerPath);

  // Leather grain: sparse speckles, lighter and darker than the base tone.
  const speckles = Math.floor((w * h) / 900);
  for (let i = 0; i < speckles; i++) {
    const gx = x + inset + Math.floor(rand() * (w - inset * 2));
    const gy = y + inset + Math.floor(rand() * (h - inset * 2));
    ctx.globalAlpha = 0.12 + rand() * 0.15;
    ctx.fillStyle = rand() < 0.5 ? LEATHER.coverDark : LEATHER.coverLight;
    ctx.fillRect(gx, gy, 2, 2);
  }

  // Scuff marks: short axis-aligned scratches, longer and sparser than the
  // grain speckles, for a more battered look.
  const scuffs = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < scuffs; i++) {
    const sx = x + inset + Math.floor(rand() * (w - inset * 2));
    const sy = y + inset + Math.floor(rand() * (h - inset * 2));
    const len = 6 + Math.floor(rand() * 16);
    ctx.globalAlpha = 0.16 + rand() * 0.14;
    ctx.fillStyle = rand() < 0.6 ? LEATHER.coverDark : LEATHER.coverLight;
    if (rand() < 0.5) ctx.fillRect(sx, sy, len, 1);
    else ctx.fillRect(sx, sy, 1, len);
  }

  // Corners rubbed lighter from handling — a book's edges wear first.
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = LEATHER.coverLight;
  for (const [ccx, ccy] of [
    [x + inset + 2, y + inset + 2],
    [x + w - inset - 2, y + inset + 2],
    [x + inset + 2, y + h - inset - 2],
    [x + w - inset - 2, y + h - inset - 2],
  ]) {
    ctx.fillRect(ccx - 7, ccy - 7, 14, 14);
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  // A stitched line inset from the edge, dashed like real saddle-stitching.
  // Comfortably clear of the ragged edge's ±3px wander, so it never clips.
  const stitchInset = 10;
  ctx.fillStyle = LEATHER.stitch;
  for (let px = x + stitchInset; px < x + w - stitchInset; px += 6) {
    ctx.fillRect(px, y + stitchInset, 2, 1);
    ctx.fillRect(px, y + h - stitchInset - 1, 2, 1);
  }
  for (let py = y + stitchInset; py < y + h - stitchInset; py += 6) {
    ctx.fillRect(x + stitchInset, py, 1, 2);
    ctx.fillRect(x + w - stitchInset - 1, py, 1, 2);
  }

  // Brass corner studs at the stitching's corners.
  const studInset = stitchInset - 3;
  for (const scx of [x + studInset, x + w - studInset - 3]) {
    for (const scy of [y + studInset, y + h - studInset - 3]) {
      ctx.fillStyle = LEATHER.stitchDark;
      ctx.fillRect(scx, scy, 3, 3);
      ctx.fillStyle = LEATHER.stitch;
      ctx.fillRect(scx, scy, 2, 2);
    }
  }
}

/**
 * One cream page — a rough parchment rect with a darker underlay (so its
 * edge reads as a sheet with a bit of thickness), scattered foxing spots for
 * an aged look, and a shaded strip down the spine side. The silhouette
 * itself is lightly torn rather than a clean rectangle (see raggedRectPath,
 * shared with drawLeatherCover) — much finer than the cover's worn edge,
 * since a page's rough cut is small frequent nicks, not big worn notches.
 */
export function drawPageSheet(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  seed = 1,
): void {
  const x = Math.round(rx);
  const y = Math.round(ry);
  const w = Math.round(rw);
  const h = Math.round(rh);
  if (w <= 0 || h <= 0) return;

  const step = 4;
  const outerRand = seeded(seed);
  ctx.fillStyle = LEATHER.pageDark;
  ctx.fill(raggedRectPath(x, y, w, h, outerRand, 1, step));

  const innerRand = seeded(seed + 53);
  const innerPath = raggedRectPath(x + 1, y + 1, w - 2, h - 2, innerRand, 1, step);
  ctx.fillStyle = LEATHER.page;
  ctx.fill(innerPath);

  const rand = seeded(seed);
  ctx.save();
  ctx.clip(innerPath);
  for (let i = 0; i < 16; i++) {
    const gx = x + Math.floor(rand() * w);
    const gy = y + Math.floor(rand() * h);
    ctx.globalAlpha = 0.08 + rand() * 0.1;
    ctx.fillStyle = LEATHER.pageShade;
    ctx.fillRect(gx, gy, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * A small leather tab — used for the compendium's prev/next/close controls.
 * Same two-layer edge-then-fill construction as woodTile, just in the
 * leather palette and without the plank texture.
 */
export function drawLeatherTab(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  opts: { hover?: boolean } = {},
): void {
  const { hover = false } = opts;
  const x = Math.round(rx);
  const y = Math.round(ry);
  const w = Math.round(rw);
  const h = Math.round(rh);

  ctx.fillStyle = hover ? LEATHER.stitch : LEATHER.edge;
  ctx.fill(pixelRoundRect(x, y, w, h, 4));
  ctx.fillStyle = hover ? LEATHER.coverLight : LEATHER.coverDark;
  ctx.fill(pixelRoundRect(x + 1, y + 1, w - 2, h - 2, 3));
}
