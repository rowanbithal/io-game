import { ResourceType } from './types';
import { DARK_FOREST_BAND, SEA_BAND, SEA_SAND_WIDTH, DESERT_BAND, TREE_SPAN, FOREST_TREE_SCALE, FOREST_ROCK_SCALE } from './constants';

/**
 * How far the dark forest's edge wanders above/below DARK_FOREST_BAND at a
 * given world x — three summed sine waves at different wavelengths and
 * phases, the same "sum of sines" trick lakeHarmonics uses to give a lake's
 * coastline real coves and bays instead of a bumpy circle. Summing a few
 * mismatched frequencies is what keeps a 4000-unit-wide border from reading
 * as one obviously-periodic wave.
 *
 * Pure function of x, so server and client compute the identical border
 * independently — nothing about the meander needs to cross the network.
 */
const WAVE_A = 95;
const WAVE_B = 45;
const WAVE_C = 20;

/** Furthest the border can push above/below DARK_FOREST_BAND — the sum of the three waves' amplitudes. */
export const DARK_FOREST_EDGE_AMPLITUDE = WAVE_A + WAVE_B + WAVE_C;

export function darkForestEdgeOffset(worldX: number): number {
  const a = Math.sin((worldX / 950) * Math.PI * 2 + 0.6) * WAVE_A;
  const b = Math.sin((worldX / 370) * Math.PI * 2 + 2.3) * WAVE_B;
  const c = Math.sin((worldX / 140) * Math.PI * 2 + 4.8) * WAVE_C;
  return a + b + c;
}

/** The dark forest's actual boundary y at a given world x — DARK_FOREST_BAND is just its average. */
export function darkForestBandAt(worldX: number): number {
  return DARK_FOREST_BAND + darkForestEdgeOffset(worldX);
}

// ── Sea coastline ────────────────────────────────────────────────────────────
// The bottom-of-map ocean's edge meanders the exact same way the dark
// forest's does (see darkForestEdgeOffset) — a few summed sine waves, just
// with different wavelengths/phases so the two borders don't read as mirror
// images of the same wave.

const SEA_WAVE_A = 130;
const SEA_WAVE_B = 55;
const SEA_WAVE_C = 24;

/** Furthest the coastline can push north/south of SEA_BAND — the sum of the three waves' amplitudes. */
export const SEA_EDGE_AMPLITUDE = SEA_WAVE_A + SEA_WAVE_B + SEA_WAVE_C;

export function seaEdgeOffset(worldX: number): number {
  const a = Math.sin((worldX / 1100) * Math.PI * 2 + 1.4) * SEA_WAVE_A;
  const b = Math.sin((worldX / 410) * Math.PI * 2 + 3.7) * SEA_WAVE_B;
  const c = Math.sin((worldX / 160) * Math.PI * 2 + 0.2) * SEA_WAVE_C;
  return a + b + c;
}

/** The water's actual coastline y at a given world x — SEA_BAND is just its average. */
export function seaCoastAt(worldX: number): number {
  return SEA_BAND + seaEdgeOffset(worldX);
}

/** Where the sandy beach begins (the grass/sand seam) — SEA_SAND_WIDTH north of the water's own coastline. */
export function seaSandStartAt(worldX: number): number {
  return seaCoastAt(worldX) - SEA_SAND_WIDTH;
}

/** True south of the water's coastline — mirrors isInLakeWater's "gameplay water" role, but for the sea. */
export function isInSea(worldX: number, worldY: number): boolean {
  return worldY >= seaCoastAt(worldX);
}

// ── Desert (top-right corner) ───────────────────────────────────────────────
// The east third of the dark forest's band, carved out of it — bounded on
// its west by its own wandering vertical border (below, meandering the same
// way the dark forest's and sea's own edges do — see
// darkForestEdgeOffset/seaEdgeOffset — a few summed sine waves, own
// wavelengths/phases so the three borders don't echo each other; the one
// difference is axis, since this one wanders as a function of y rather than
// x) and on its south by darkForestBandAt itself — the exact same line the
// dark forest's own southern edge already uses, not a second independently-
// wandering one, so the two biomes share that seam without ever disagreeing
// about where it runs.

const DESERT_WAVE_A = 110;
const DESERT_WAVE_B = 48;
const DESERT_WAVE_C = 22;

/** Furthest the border can push west/east of DESERT_BAND — the sum of the three waves' amplitudes. */
export const DESERT_EDGE_AMPLITUDE = DESERT_WAVE_A + DESERT_WAVE_B + DESERT_WAVE_C;

export function desertEdgeOffset(worldY: number): number {
  const a = Math.sin((worldY / 980) * Math.PI * 2 + 3.1) * DESERT_WAVE_A;
  const b = Math.sin((worldY / 390) * Math.PI * 2 + 5.4) * DESERT_WAVE_B;
  const c = Math.sin((worldY / 150) * Math.PI * 2 + 1.7) * DESERT_WAVE_C;
  return a + b + c;
}

/** The desert's actual boundary x at a given world y — DESERT_BAND is just its average. */
export function desertBandAt(worldY: number): number {
  return DESERT_BAND + desertEdgeOffset(worldY);
}

/**
 * True inside the desert corner: east of its own wandering western border
 * AND still within the dark forest's own band (north of darkForestBandAt) —
 * mirrors isInSea's "gameplay biome" role, but for a bounded corner rather
 * than an edge-to-edge band. South of that shared line it's plains, same as
 * everywhere else the dark forest gives way to them.
 */
export function isInDesert(worldX: number, worldY: number): boolean {
  return worldX >= desertBandAt(worldY) && worldY < darkForestBandAt(worldX);
}

/**
 * True when the dark forest at this world x has been entirely replaced by
 * the desert corner — checked just inside the forest's own y-range, right at
 * its border, since that's the point closest to actually being forest that
 * a given x can have. darkForestBandAt(worldX) itself has no idea the desert
 * exists (it's a pure function of x, unaware of the corner carved out of its
 * own north side) — every effect that assumes "north of the band = real
 * forest" (the tree canopy's approach feather, the minimap's dirt-fringe/
 * grass-shade bleed) has to check this first, or it keeps applying a few
 * hundred units into what's now the desert's own territory, or south of it,
 * with nothing there to be approaching.
 */
export function forestBorderIsDesert(worldX: number): boolean {
  return isInDesert(worldX, darkForestBandAt(worldX) - 1);
}

// ── Forest variants ──────────────────────────────────────────────────────────
// Dark forest trees and rocks are the same shapes drawn bigger (see
// FOREST_TREE_SCALE / FOREST_ROCK_SCALE and the renderer's FOREST_VARIANT).
// Which instances are the oversized kind is decided by the pure functions
// below rather than sent over the wire — the same "both sides compute it
// independently" deal as the border meander above. That matters more here
// than it does for the border, because the answer is now load-bearing on
// *both* sides: the client draws the bigger tree, and the server has to pay
// out the bigger tree's yield (see resourceSizeScale). One shared
// implementation is what keeps a visibly-huge boulder from quietly dropping
// plains-sized stone.

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic per-cell hash → RNG seed, so a given grid cell always
 * generates the same jagged silhouette / shading (stable across frames, no
 * reliance on server-sent random data).
 */
export function hashCell(gx: number, gy: number, salt: number): number {
  let h = (gx * 374761393 + gy * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Per-type salt for hashCell, so a tree and a rock that happen to land in the
 * same grid cell don't derive the identical seed (and therefore the identical
 * shape variation).
 */
export const RESOURCE_SEED_SALT = { tree: 1, rock: 2, wheat: 3, gold: 4, diamond: 5 } as const;

/** Which SPAN-sized cell (x, y) falls in, for a resource with the given footprint span. */
export function resourceCell(x: number, y: number, span: number): { gx: number; gy: number } {
  return { gx: Math.round(x / span), gy: Math.round(y / span) };
}

/**
 * How far the canopy itself has turned over to dark forest, 0..1. This gets
 * its own, much wider feather than the ground: the floor wants a tight seam,
 * but trees flipping over across that same narrow strip would read as a wall
 * of dark trees rather than a forest thickening as you walk into it.
 */
const FOREST_CANOPY_FEATHER = 700;

export function forestFactor(worldX: number, worldY: number): number {
  // This x-column's "dark forest" is actually the desert corner — there's no
  // real canopy anywhere north of here for a tree this far south to be
  // thickening toward, so it stays a plains tree regardless of how close it
  // sits to darkForestBandAt(worldX)'s own line.
  if (forestBorderIsDesert(worldX)) return 0;
  const band = darkForestBandAt(worldX);
  return smoothstep(clamp01((band + FOREST_CANOPY_FEATHER - worldY) / FOREST_CANOPY_FEATHER));
}

/**
 * Whether one tree is a dark forest tree. Rather than flipping every tree at
 * once on a hard y line, each tree makes its own stable coin flip weighted by
 * `forestFactor` — so through the transition the two kinds mix, dark ones
 * thickening as you head north until every tree is one. `seed` is the tree's
 * existing per-cell hash, so a given tree never changes its mind.
 */
export function isForestTree(seed: number, worldX: number, worldY: number): boolean {
  return hashCell(seed, 0, 61) / 4294967295 < forestFactor(worldX, worldY);
}

/**
 * Whether one rock is a dark forest rock — a hard cutoff at the biome's
 * actual border, unlike isForestTree's probabilistic blend. Rocks are already
 * spawned by two entirely separate, hard-confined passes (World.ts's
 * PLAINS_ROCK_CONFIG vs DARK_FOREST_ROCK_CONFIG, split right at this same
 * darkForestBandAt line) — reusing the tree's soft, ~700-unit-wide feathering
 * here would size some genuinely-plains rocks up as "forest" ones for a while
 * past the border, which read as oversized rocks bleeding into the plains.
 * `seed` is unused but kept so this matches the renderer's ForestVariant
 * ['isForest'] signature.
 */
export function isForestRock(seed: number, worldX: number, worldY: number): boolean {
  void seed;
  return worldY < darkForestBandAt(worldX);
}

/**
 * How big this resource actually is, relative to the ordinary plains version
 * of its type — 1 for everything that doesn't vary. Drives both what the
 * client draws and what the server pays out for it (see ServerResource's
 * sizeScale and scaledHp), which is the whole point of it living here rather
 * than in the renderer: a boulder that looks 1.5x should give 1.5x.
 */
export function resourceSizeScale(type: ResourceType, worldX: number, worldY: number): number {
  if (type === 'tree') {
    const { gx, gy } = resourceCell(worldX, worldY, TREE_SPAN);
    const seed = hashCell(gx, gy, RESOURCE_SEED_SALT.tree);
    return isForestTree(seed, worldX, worldY) ? FOREST_TREE_SCALE : 1;
  }
  if (type === 'rock') {
    return isForestRock(0, worldX, worldY) ? FOREST_ROCK_SCALE : 1;
  }
  return 1;
}
