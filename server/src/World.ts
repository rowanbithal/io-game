import { MAP_SIZE, GRID_CELL, TREE_SPAN, ROCK_SPAN, WHEAT_SPAN, GOLD_SPAN, GOLD_TOP_BAND, DARK_FOREST_BAND, PLAYER_RADIUS, FOX_RADIUS, SOLID_COLLISION_RADIUS, ResourceType, LakeState, darkForestBandAt } from '@io-game/shared';
import { ServerResource } from './entities/Resource';

// ── Lakes ─────────────────────────────────────────────────────────────────────
// Placed before any resource so trees/rocks/berries/mushrooms can be kept
// off the water and its shore.

const LAKE_COUNT = 5;
const LAKE_MIN_RADIUS = 90;
const LAKE_MAX_RADIUS = 180;
const LAKE_MIN_SHORE = 30;
const LAKE_MAX_SHORE = 50;
const LAKE_SPACING = 150; // Minimum gap left between two lakes' shores
// The client renders each lake's coastline as an irregular blob (lobes/coves
// via sine harmonics, see Renderer.ts's lakeHarmonics) that can bulge up to
// ~1.4x the nominal radius. These gameplay checks are circular for
// simplicity, so pad them out to reduce (not fully eliminate) mismatch
// between the visible water/shore and where it actually blocks/slows.
const LAKE_LOBE_BUFFER = 1.2;

// Players can walk through the branch bridging two connected trees (see
// Renderer.ts's drawBranch) rather than being walled off between them —
// the branch corridor is a capsule around the segment joining the two tree
// centers, wide enough for a player to comfortably pass through.
const CORRIDOR_HALF_WIDTH = PLAYER_RADIUS + 6;

interface Corridor {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

// ── Spatial grid ──────────────────────────────────────────────────────────────
// Divides the map into fixed-size cells so we can look up nearby resources in
// O(1) instead of iterating every resource in the world each tick.

const CELL = 120; // Cell size in world units
const COLS = Math.ceil(MAP_SIZE / CELL);
const ROWS = Math.ceil(MAP_SIZE / CELL);

function cellKey(cx: number, cy: number): number {
  return cy * COLS + cx;
}

// ── Navigation grid ───────────────────────────────────────────────────────────
// A coarse walkability bitmap, used by the fox AI (and bot player steering) to
// route around solid resources instead of walking into them (see findPath).
// Every solid resource stamps out a disc of cells inflated by FOX_RADIUS, so a
// path traced through free cells always leaves room to squeeze past without
// clipping the obstacle.
//
// Each cell is reference-counted rather than a plain bit: a resource's
// footprint is stamped in once at generation (see buildNavGrid) and then
// toggled off/on as it dies/respawns (see setResourceNavBlocking), instead of
// rebaking the whole grid. Counting rather than a flat bit matters because
// footprints overlap in dense clusters — a cell can be inside two trees'
// discs at once, and unblocking it the moment just one of them dies would let
// a fox cut through ground the other tree still occupies.
const NAV_CELL = 20;
const NAV_COLS = Math.ceil(MAP_SIZE / NAV_CELL);
const NAV_ROWS = NAV_COLS;

/** Cap on A* expansions per search, so a hopeless query can't stall a tick. */
const NAV_MAX_EXPANSIONS = 4000;
/** How far out to look for a stand-in goal when the target itself sits inside an obstacle. */
const NAV_GOAL_SEARCH_RADIUS = 8;

const SQRT2 = Math.SQRT2;

/** Min-heap over (cell, fScore), so A* always expands the most promising cell next. */
class MinHeap {
  private readonly cells: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: number, cost: number): void {
    this.cells.push(cell);
    this.costs.push(cost);
    let i = this.cells.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.cells[0];
    const lastCell = this.cells.pop()!;
    const lastCost = this.costs.pop()!;
    if (this.cells.length > 0) {
      this.cells[0] = lastCell;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.cells.length && this.costs[left] < this.costs[smallest]) smallest = left;
        if (right < this.cells.length && this.costs[right] < this.costs[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}

// ── Spawn config ──────────────────────────────────────────────────────────────
// Berries and mushrooms scatter freely, same as before. Purple berries are a
// dark forest exclusive — same free scatter, just confined to the biome (see
// `darkForestOnly` below and its handling in generate()).

interface SpawnConfig {
  type: ResourceType;
  /** Resources per square unit of world area (of the area it's actually confined to — see darkForestOnly). */
  density: number;
  /** Confines placement to y < darkForestBandAt(x), i.e. inside the dark forest, instead of the whole map. */
  darkForestOnly?: boolean;
}

const SCATTER_CONFIG: SpawnConfig[] = [
  { type: 'berry', density: 0.00003 },
  { type: 'mushroom', density: 0.00002 },
  { type: 'purple_berry', density: 0.00003, darkForestOnly: true },
];

// Trees, rocks, and wheat spawn as clusters on the fine GRID_CELL grid, but
// each one reserves an NxN block of cells (its "span") rather than a single
// cell — that's what lets one tree cover multiple grid squares. Trees grow
// as a contiguous connected patch (a "forest"), rocks scatter loosely around
// a seed without needing to touch (a "quarry"), and wheat grows as a large
// contiguous patch of small, tightly-packed clumps (a "field").
interface ClusterConfig {
  type: ResourceType;
  /** World-unit footprint (must be a multiple of GRID_CELL). */
  span: number;
  targetCount: number;
  minClusterSize: number;
  maxClusterSize: number;
  /** How many SPANs from the seed a scattered (non-contiguous) member can land. */
  spreadRadius: number;
  /** Members must be orthogonally adjacent (one SPAN away) to an existing cluster member. */
  contiguous: boolean;
}

const CLUSTER_CONFIG: ClusterConfig[] = [
  { type: 'wheat', span: WHEAT_SPAN, targetCount: 90, minClusterSize: 10, maxClusterSize: 22, spreadRadius: 1, contiguous: true },
];

// Trees and rocks are each seeded as two fully independent, biome-confined
// passes (rather than one map-wide pass) — see generateClusters — so the
// plains and the dark forest's densities (and, for rocks, clustering) can be
// tuned separately without one pass's count change bleeding into the other
// biome.
//
// Confined to the plains (y >= the band, see forestBandRowsAt in
// generateClusters).
//
// targetCount bumped again (180 -> 200 -> 235) for a noticeably fuller
// plains.
const PLAINS_TREE_CONFIG: ClusterConfig = {
  type: 'tree',
  span: TREE_SPAN,
  targetCount: 235,
  minClusterSize: 2,
  maxClusterSize: 4,
  spreadRadius: 1,
  contiguous: true,
};

// Confined to the dark forest band (see forestBandRowsAt in
// generateClusters) — this is what makes the biome read as a noticeably
// denser forest rather than just a darker-colored version of the normal one.
//
// Clusters stay smaller than the plains' (which run up to 4): the forest's
// trees render oversized, so a long contiguous run of them merges into one
// shapeless mass of canopy. Singles and pairs keep the same tree count while
// leaving gaps that read as individual trunks.
//
// targetCount has been walked in both directions to taste (220 -> 185 -> 160
// -> 185) — dense enough to read as proper forest, with enough gaps left that
// the oversized canopies don't merge into one shapeless mass.
const DARK_FOREST_TREE_BOOST: ClusterConfig = {
  type: 'tree',
  span: TREE_SPAN,
  targetCount: 185,
  minClusterSize: 1,
  maxClusterSize: 2,
  spreadRadius: 1,
  contiguous: true,
};

// Confined to the plains, same as PLAINS_TREE_CONFIG — the familiar
// clustered "quarry" look (3-7 rocks scattered loosely around a seed).
const PLAINS_ROCK_CONFIG: ClusterConfig = {
  type: 'rock',
  span: ROCK_SPAN,
  targetCount: 120,
  minClusterSize: 3,
  maxClusterSize: 7,
  spreadRadius: 2,
  contiguous: false,
};

// Confined to the dark forest band, same as DARK_FOREST_TREE_BOOST — but
// unlike every other cluster config, minClusterSize/maxClusterSize are both
// 1, so a seed never grows a cluster around itself: forest rocks stand
// alone, sparser than the plains' quarries. They also render larger, and
// with a scatter of small, non-interactive pebbles around each one (see
// Renderer.ts's isForestRock/FOREST_ROCK_SCALE/forestRockPebbles) — all
// purely render-time, keyed off world position, so it applies regardless of
// which pass placed the rock.
//
// targetCount trimmed down again (70 -> 40 -> 20) — the pebble scatter
// added around each one is what keeps the ground from reading too empty at
// this lower a count.
const DARK_FOREST_ROCK_CONFIG: ClusterConfig = {
  type: 'rock',
  span: ROCK_SPAN,
  targetCount: 20,
  minClusterSize: 1,
  maxClusterSize: 1,
  spreadRadius: 0,
  contiguous: false,
};

// Gold deposits: a rock-like, non-contiguous "vein" scatter (see
// CLUSTER_CONFIG's rock entry for the same contiguous: false pattern),
// confined to the northernmost stretch of the dark forest — see
// GOLD_TOP_BAND below and its use in generateClusters. Rare and clustered in
// small veins rather than spread thin across the whole biome, so finding one
// feels like reaching the "back" of the forest rather than just another
// resource dotted around.
const GOLD_CLUSTER: ClusterConfig = {
  type: 'gold',
  span: GOLD_SPAN,
  targetCount: 28,
  minClusterSize: 2,
  maxClusterSize: 4,
  spreadRadius: 2,
  contiguous: false,
};

// ── World class ───────────────────────────────────────────────────────────────

export class World {
  readonly resources = new Map<string, ServerResource>();
  readonly lakes: LakeState[] = [];

  /** Spatial grid: cellKey → set of resource IDs in that cell */
  private readonly grid = new Map<number, Set<string>>();

  /** Branch corridors between orthogonally-adjacent trees (see CORRIDOR_HALF_WIDTH). */
  private readonly treeCorridors: Corridor[] = [];

  /** Per-cell count of alive solid resources covering it — cell is blocked while > 0. See NAV_CELL. */
  private readonly navBlockCount = new Uint16Array(NAV_COLS * NAV_ROWS);
  /** Cells inside a tree-branch corridor — always walkable regardless of navBlockCount (see buildTreeCorridors). */
  private readonly navCorridorOpen = new Uint8Array(NAV_COLS * NAV_ROWS);
  /** Each solid resource's precomputed footprint cells, so death/respawn can toggle navBlockCount without rescanning. */
  private readonly navFootprint = new Map<string, number[]>();

  // ── Generation ─────────────────────────────────────────────────────────────

  generate(): void {
    const margin = Math.max(TREE_SPAN, GOLD_SPAN); // comfortably fits the largest footprint, a multiple of GRID_CELL

    this.generateLakes(margin);
    this.generateClusters(margin);
    this.buildTreeCorridors();
    this.buildNavGrid();

    const area = MAP_SIZE * MAP_SIZE;
    // Dark-forest-confined scatter types are seeded over just the biome's own
    // area (map width x average forest depth) rather than the whole map, so
    // their areal density within the forest matches a map-wide type's —
    // reusing the full `area` here would read as noticeably sparser once
    // confined to a third of the map.
    const darkForestArea = MAP_SIZE * DARK_FOREST_BAND;
    for (const { type, density, darkForestOnly } of SCATTER_CONFIG) {
      const count = Math.round((darkForestOnly ? darkForestArea : area) * density);
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 20) {
        attempts++;
        const x = margin + Math.random() * (MAP_SIZE - margin * 2);
        const y = darkForestOnly
          ? margin + Math.random() * Math.max(1, darkForestBandAt(x) - margin)
          : margin + Math.random() * (MAP_SIZE - margin * 2);
        if (this.isBlockedByLake(x, y)) continue;
        this.spawnAt(type, x, y);
        placed++;
      }
    }

    console.log(`[World] Generated ${this.resources.size} resources, ${this.lakes.length} lakes`);
  }

  /** Places non-overlapping lakes, each with a water body and a surrounding sand/pebble shore. */
  private generateLakes(margin: number): void {
    let attempts = 0;

    while (this.lakes.length < LAKE_COUNT && attempts < LAKE_COUNT * 40) {
      attempts++;
      const radius = LAKE_MIN_RADIUS + Math.random() * (LAKE_MAX_RADIUS - LAKE_MIN_RADIUS);
      const shoreWidth = LAKE_MIN_SHORE + Math.random() * (LAKE_MAX_SHORE - LAKE_MIN_SHORE);
      const clear = margin + radius + shoreWidth;
      const x = clear + Math.random() * (MAP_SIZE - clear * 2);
      const y = clear + Math.random() * (MAP_SIZE - clear * 2);

      const tooClose = this.lakes.some((lake) => {
        const minDist = radius + shoreWidth + lake.radius + lake.shoreWidth + LAKE_SPACING;
        return Math.hypot(x - lake.x, y - lake.y) < minDist;
      });
      if (tooClose) continue;

      this.lakes.push({
        id: `lake${this.lakes.length}`,
        x,
        y,
        radius,
        shoreWidth,
        seed: Math.floor(Math.random() * 0xffffffff),
      });
    }
  }

  /** True if (x, y) falls within any lake's water or shore. */
  isBlockedByLake(x: number, y: number, extraMargin = 0): boolean {
    for (const lake of this.lakes) {
      // Rendered coastlines bulge out into coves/inlets beyond the nominal
      // radius (see Renderer.ts's lakeHarmonics) — this simple circular
      // check pads out a bit so resources stay clear of the biggest bulges.
      const clear = (lake.radius + lake.shoreWidth) * LAKE_LOBE_BUFFER + extraMargin;
      if (Math.hypot(x - lake.x, y - lake.y) < clear) return true;
    }
    return false;
  }

  /** True if (x, y) falls within any lake's water specifically (not just its shore). */
  isInLakeWater(x: number, y: number): boolean {
    for (const lake of this.lakes) {
      if (Math.hypot(x - lake.x, y - lake.y) < lake.radius * LAKE_LOBE_BUFFER) return true;
    }
    return false;
  }

  /** Mirrors the client's adjacency check (Renderer.ts drawTreeBranches) to find every connected tree pair. */
  private buildTreeCorridors(): void {
    const byCell = new Map<string, ServerResource>();
    for (const r of this.resources.values()) {
      if (r.type !== 'tree') continue;
      const gx = Math.round(r.x / TREE_SPAN);
      const gy = Math.round(r.y / TREE_SPAN);
      byCell.set(`${gx},${gy}`, r);
    }
    for (const r of byCell.values()) {
      const gx = Math.round(r.x / TREE_SPAN);
      const gy = Math.round(r.y / TREE_SPAN);
      const east = byCell.get(`${gx + 1},${gy}`);
      if (east) this.treeCorridors.push({ ax: r.x, ay: r.y, bx: east.x, by: east.y });
      const south = byCell.get(`${gx},${gy + 1}`);
      if (south) this.treeCorridors.push({ ax: r.x, ay: r.y, bx: south.x, by: south.y });
    }
  }

  // ── Fox navigation ─────────────────────────────────────────────────────────

  /** Stamps every solid resource's footprint into navBlockCount, inflated by FOX_RADIUS. */
  private buildNavGrid(): void {
    for (const r of this.resources.values()) {
      const solid = SOLID_COLLISION_RADIUS[r.type];
      if (solid === undefined) continue;

      const clear = solid + FOX_RADIUS;
      const minCx = Math.max(0, Math.floor((r.x - clear) / NAV_CELL));
      const maxCx = Math.min(NAV_COLS - 1, Math.floor((r.x + clear) / NAV_CELL));
      const minCy = Math.max(0, Math.floor((r.y - clear) / NAV_CELL));
      const maxCy = Math.min(NAV_ROWS - 1, Math.floor((r.y + clear) / NAV_CELL));

      const footprint: number[] = [];
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const centerX = (cx + 0.5) * NAV_CELL;
          const centerY = (cy + 0.5) * NAV_CELL;
          if (Math.hypot(centerX - r.x, centerY - r.y) > clear) continue;
          const cell = cy * NAV_COLS + cx;
          footprint.push(cell);
          this.navBlockCount[cell]++;
        }
      }
      // Kept even for an empty footprint (shouldn't happen, but keeps the
      // map's presence the single source of truth for "this id is solid" —
      // see setResourceNavBlocking) so death/respawn can find it again
      // without recomputing bounds from the resource's live x/y/type.
      this.navFootprint.set(r.id, footprint);
    }

    // Carve the tree corridors permanently open. Both trees either side of a
    // branch block, but anything standing inside the branch capsule is exempt
    // from being pushed out (see isInTreeCorridor), so these gaps are
    // genuinely walkable. Leaving them stamped shut would make the grid
    // disagree with the physics in the worst possible direction: an agent
    // that squeezed through one would find every route back out apparently
    // sealed, and sit there with no path anywhere. Marked in a separate mask
    // rather than decrementing navBlockCount so a dying/respawning corridor
    // tree can freely toggle its own count without ever re-sealing the gap.
    for (const c of this.treeCorridors) {
      const steps = Math.max(1, Math.ceil(Math.hypot(c.bx - c.ax, c.by - c.ay) / (NAV_CELL / 2)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = Math.floor((c.ax + (c.bx - c.ax) * t) / NAV_CELL);
        const cy = Math.floor((c.ay + (c.by - c.ay) * t) / NAV_CELL);
        if (cx < 0 || cy < 0 || cx >= NAV_COLS || cy >= NAV_ROWS) continue;
        this.navCorridorOpen[cy * NAV_COLS + cx] = 1;
      }
    }
  }

  /**
   * Adds or removes a solid resource's footprint from the nav grid — call
   * when a tree/rock/gold deposit dies or respawns, so fox pathfinding (and
   * bot player steering, which shares this grid) notices the ground opening
   * up or sealing shut again instead of treating a harvested stump as still
   * solid until it grows back. No-op for resource types that were never solid
   * (see buildNavGrid/navFootprint).
   */
  setResourceNavBlocking(resourceId: string, blocked: boolean): void {
    const footprint = this.navFootprint.get(resourceId);
    if (!footprint) return;
    const delta = blocked ? 1 : -1;
    for (const cell of footprint) {
      this.navBlockCount[cell] = Math.max(0, this.navBlockCount[cell] + delta);
    }
  }

  /** True if the given flattened nav cell is solid — corridor cells are always exempt. */
  private cellBlocked(cell: number): boolean {
    return this.navCorridorOpen[cell] === 0 && this.navBlockCount[cell] > 0;
  }

  /** True if (x, y) sits in a blocked nav cell, or off the map entirely. */
  isNavBlocked(x: number, y: number): boolean {
    const cx = Math.floor(x / NAV_CELL);
    const cy = Math.floor(y / NAV_CELL);
    if (cx < 0 || cy < 0 || cx >= NAV_COLS || cy >= NAV_ROWS) return true;
    return this.cellBlocked(cy * NAV_COLS + cx);
  }

  /**
   * True if a straight line from (x0, y0) to (x1, y1) stays on walkable
   * ground. Sampled at half-cell steps against the same grid paths are traced
   * through, so "clear" here means exactly what "free cell" means there.
   */
  hasClearPath(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.hypot(dx, dy) / (NAV_CELL / 2));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      if (this.isNavBlocked(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  /**
   * Nearest standable point to (x, y) — (x, y) itself when it's already on
   * open ground. Null if everything within NAV_GOAL_SEARCH_RADIUS is solid.
   * Used to dig an agent back out when it ends up wedged inside geometry,
   * where a path search would otherwise start from a cell it can't leave.
   */
  nearestOpenPoint(x: number, y: number): { x: number; y: number } | null {
    const cx = Math.floor(x / NAV_CELL);
    const cy = Math.floor(y / NAV_CELL);
    if (cx < 0 || cy < 0 || cx >= NAV_COLS || cy >= NAV_ROWS) return null;
    if (!this.cellBlocked(cy * NAV_COLS + cx)) return { x, y };

    const free = this.nearestFreeCell(cx, cy);
    return free ? { x: (free.cx + 0.5) * NAV_CELL, y: (free.cy + 0.5) * NAV_CELL } : null;
  }

  /** Nearest walkable cell to (cx, cy), searched outward ring by ring. */
  private nearestFreeCell(cx: number, cy: number): { cx: number; cy: number } | null {
    for (let r = 1; r <= NAV_GOAL_SEARCH_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // perimeter of this ring only
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= NAV_COLS || ny >= NAV_ROWS) continue;
          if (!this.cellBlocked(ny * NAV_COLS + nx)) return { cx: nx, cy: ny };
        }
      }
    }
    return null;
  }

  /**
   * A* from (fromX, fromY) to (toX, toY) over the nav grid, returned as
   * world-space waypoints. Null when no route turns up within
   * NAV_MAX_EXPANSIONS.
   *
   * A blocked *start* is allowed (a fox shoved inside an obstacle still needs
   * a way out); a blocked *goal* — a player standing tight against a trunk —
   * falls back to the nearest walkable cell so the fox still closes in rather
   * than giving up. The raw cell path is then string-pulled, dropping any
   * waypoint whose neighbours can already see each other, so a fox runs a few
   * long diagonals instead of stair-stepping cell by cell.
   */
  findPath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] | null {
    const startCx = Math.floor(fromX / NAV_CELL);
    const startCy = Math.floor(fromY / NAV_CELL);
    if (startCx < 0 || startCy < 0 || startCx >= NAV_COLS || startCy >= NAV_ROWS) return null;

    let goalCx = Math.floor(toX / NAV_CELL);
    let goalCy = Math.floor(toY / NAV_CELL);
    if (goalCx < 0 || goalCy < 0 || goalCx >= NAV_COLS || goalCy >= NAV_ROWS) return null;

    let goalRelocated = false;
    if (this.cellBlocked(goalCy * NAV_COLS + goalCx)) {
      const free = this.nearestFreeCell(goalCx, goalCy);
      if (!free) return null;
      goalCx = free.cx;
      goalCy = free.cy;
      goalRelocated = true;
    }

    const start = startCy * NAV_COLS + startCx;
    const goal = goalCy * NAV_COLS + goalCx;
    if (start === goal) return [{ x: toX, y: toY }];

    const octile = (cx: number, cy: number): number => {
      const dx = Math.abs(cx - goalCx);
      const dy = Math.abs(cy - goalCy);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };

    const gScore = new Map<number, number>([[start, 0]]);
    const cameFrom = new Map<number, number>();
    const closed = new Set<number>();
    const open = new MinHeap();
    open.push(start, octile(startCx, startCy));

    let expansions = 0;
    let found = false;

    while (open.size > 0 && expansions < NAV_MAX_EXPANSIONS) {
      const current = open.pop();
      if (current === goal) {
        found = true;
        break;
      }
      if (closed.has(current)) continue;
      closed.add(current);
      expansions++;

      const cx = current % NAV_COLS;
      const cy = (current - cx) / NAV_COLS;
      const baseG = gScore.get(current)!;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= NAV_COLS || ny >= NAV_ROWS) continue;

          const neighbor = ny * NAV_COLS + nx;
          if (this.cellBlocked(neighbor)) continue;

          // Don't cut a diagonal past the corner of an obstacle — that would
          // thread a fox through a gap it can't physically fit through.
          if (dx !== 0 && dy !== 0) {
            if (this.cellBlocked(cy * NAV_COLS + nx)) continue;
            if (this.cellBlocked(ny * NAV_COLS + cx)) continue;
          }

          const tentative = baseG + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
          const known = gScore.get(neighbor);
          if (known !== undefined && tentative >= known) continue;

          gScore.set(neighbor, tentative);
          cameFrom.set(neighbor, current);
          open.push(neighbor, tentative + octile(nx, ny));
        }
      }
    }

    if (!found) return null;

    const cells: number[] = [];
    for (let node = goal; node !== start; node = cameFrom.get(node)!) cells.push(node);
    cells.reverse();

    const points = cells.map((cell) => {
      const cx = cell % NAV_COLS;
      const cy = (cell - cx) / NAV_COLS;
      return { x: (cx + 0.5) * NAV_CELL, y: (cy + 0.5) * NAV_CELL };
    });

    // Aim at the real target for the last leg — but only when the goal cell
    // is genuinely the target's own cell. If it was relocated out of an
    // obstacle, the cell centre is as close as a fox can actually stand.
    if (!goalRelocated && points.length > 0) {
      points[points.length - 1] = { x: toX, y: toY };
    }

    return this.simplifyPath(fromX, fromY, points);
  }

  /** Greedy string-pull: keep a waypoint only when the previous one can't already see past it. */
  private simplifyPath(
    fromX: number,
    fromY: number,
    points: { x: number; y: number }[],
  ): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    let anchorX = fromX;
    let anchorY = fromY;

    for (let i = 0; i < points.length; i++) {
      const isLast = i === points.length - 1;
      if (isLast || !this.hasClearPath(anchorX, anchorY, points[i + 1].x, points[i + 1].y)) {
        out.push(points[i]);
        anchorX = points[i].x;
        anchorY = points[i].y;
      }
    }

    return out;
  }

  /**
   * Places trees and rocks as clusters. Occupancy is tracked on the fine
   * GRID_CELL grid, but each resource reserves an NxN block of those cells
   * (its own SPAN) — so a single tree can span multiple grid squares, and
   * two contiguous cluster members (SPAN apart) always sit edge-to-edge.
   */
  private generateClusters(margin: number): void {
    const fineCols = Math.floor((MAP_SIZE - margin * 2) / GRID_CELL);
    const fineRows = fineCols;
    const occupied = new Set<string>();
    const key = (gx: number, gy: number): string => `${gx},${gy}`;
    const inBounds = (gx: number, gy: number): boolean => gx >= 0 && gy >= 0 && gx < fineCols && gy < fineRows;

    const footprintFree = (gx: number, gy: number, spanCells: number): boolean => {
      for (let dy = 0; dy < spanCells; dy++) {
        for (let dx = 0; dx < spanCells; dx++) {
          if (!inBounds(gx + dx, gy + dy) || occupied.has(key(gx + dx, gy + dy))) return false;
        }
      }
      const span = spanCells * GRID_CELL;
      const centerX = margin + gx * GRID_CELL + span / 2;
      const centerY = margin + gy * GRID_CELL + span / 2;
      if (this.isBlockedByLake(centerX, centerY, span / 2)) return false;
      return true;
    };

    const place = (type: ResourceType, gx: number, gy: number, spanCells: number, span: number): void => {
      const x = margin + gx * GRID_CELL + span / 2;
      const y = margin + gy * GRID_CELL + span / 2;
      const r = new ServerResource(type, x, y);
      this.resources.set(r.id, r);
      this.insertGrid(r);
      for (let dy = 0; dy < spanCells; dy++) {
        for (let dx = 0; dx < spanCells; dx++) {
          occupied.add(key(gx + dx, gy + dy));
        }
      }
    };

    // Seeds and grows one cluster config's worth of members, optionally
    // confining seed placement to fine-grid rows `[seedGYMinForX(seedGX),
    // seedGYMaxForX(seedGX))` — used to keep a pass entirely within one
    // biome (plains-only, forest-only) or to pile extra members into the
    // dark forest band on top of a separate map-wide pass, without touching
    // that other pass's own distribution. Taking a function of the seed's
    // own column (rather than one fixed row cutoff) is what lets a
    // biome-confined pass follow the meandering biome edge instead of
    // stopping at a flat line.
    const runClusterConfig = (
      cfg: ClusterConfig,
      seedGYMinForX: (seedGX: number) => number,
      seedGYMaxForX: (seedGX: number) => number,
    ): void => {
      const spanCells = Math.round(cfg.span / GRID_CELL);
      let placed = 0;
      let seedAttempts = 0;

      while (placed < cfg.targetCount && seedAttempts < cfg.targetCount * 30) {
        seedAttempts++;
        const seedGX = Math.floor(Math.random() * Math.max(1, fineCols - spanCells));
        const seedGYMax = Math.min(seedGYMaxForX(seedGX), fineRows);
        const seedGYMin = Math.max(0, Math.min(seedGYMinForX(seedGX), seedGYMax - spanCells));
        const seedGYRange = Math.max(1, seedGYMax - spanCells - seedGYMin);
        const seedGY = seedGYMin + Math.floor(Math.random() * seedGYRange);
        if (!footprintFree(seedGX, seedGY, spanCells)) continue;

        place(cfg.type, seedGX, seedGY, spanCells, cfg.span);
        placed++;

        const clusterSize = cfg.minClusterSize + Math.floor(Math.random() * (cfg.maxClusterSize - cfg.minClusterSize + 1));
        const members: [number, number][] = [[seedGX, seedGY]];
        let memberCount = 1;
        let growAttempts = 0;

        while (memberCount < clusterSize && placed < cfg.targetCount && growAttempts < clusterSize * 10) {
          growAttempts++;

          let nx: number, ny: number;
          if (cfg.contiguous) {
            // Grow from a random existing member into an orthogonal neighbor
            // one SPAN away — guarantees every new footprint touches the
            // cluster, so the rendered canopies always share an edge.
            const [cx, cy] = members[Math.floor(Math.random() * members.length)];
            const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
            nx = cx + dx * spanCells;
            ny = cy + dy * spanCells;
          } else {
            // Scatter loosely around the seed — members don't need to touch.
            const jitter = (): number => (Math.floor(Math.random() * (cfg.spreadRadius * 2 + 1)) - cfg.spreadRadius) * spanCells;
            nx = seedGX + jitter();
            ny = seedGY + jitter();
          }

          if (!footprintFree(nx, ny, spanCells)) continue;

          place(cfg.type, nx, ny, spanCells, cfg.span);
          members.push([nx, ny]);
          memberCount++;
          placed++;
        }
      }
    };

    for (const cfg of CLUSTER_CONFIG) runClusterConfig(cfg, () => 0, () => fineRows);

    // Row cutoff following the dark forest's actual meandering edge (see
    // darkForestBandAt) — shared by every biome-confined pass below. Forest
    // passes use it as their max row (seed above the line); the plains pass
    // uses it as its min row (seed below the line). Taking it as a function
    // of the seed's own column, rather than one fixed row, is what lets each
    // pass follow the wandering border instead of stopping at a flat line.
    const forestBandRowsAt = (seedGX: number): number => {
      const worldX = margin + seedGX * GRID_CELL;
      return Math.max(1, Math.floor((darkForestBandAt(worldX) - margin) / GRID_CELL));
    };

    // Plains trees/rocks: confined to y >= the band, i.e. everywhere the
    // dark forest passes below aren't — so the two biomes' densities (and,
    // for rocks, clustering) can be tuned independently without one pass's
    // seed pool eating into the other's.
    runClusterConfig(PLAINS_TREE_CONFIG, forestBandRowsAt, () => fineRows);
    runClusterConfig(PLAINS_ROCK_CONFIG, forestBandRowsAt, () => fineRows);

    // Dark forest trees/rocks, seeds confined to y < the band. A seeded
    // cluster can still grow a member or two past the band edge (growth
    // direction is random) — a nice side effect that keeps density trailing
    // off gradually, echoing the ground gradient rather than stopping dead
    // at a hard line. (Doesn't apply to rocks here — DARK_FOREST_ROCK_CONFIG
    // never grows past its single seed.)
    runClusterConfig(DARK_FOREST_TREE_BOOST, () => 0, forestBandRowsAt);
    runClusterConfig(DARK_FOREST_ROCK_CONFIG, () => 0, forestBandRowsAt);

    // Gold veins, seeded only in the rows nearest the top of the map
    // (constant cutoff, not tied to the meandering forest edge like above —
    // "the top of the dark forest" is a fixed depth, not the border itself).
    const goldBandRowsAt = (): number => Math.max(1, Math.floor((GOLD_TOP_BAND - margin) / GRID_CELL));
    runClusterConfig(GOLD_CLUSTER, () => 0, goldBandRowsAt);
  }

  private spawnAt(type: ResourceType, x: number, y: number): void {
    const r = new ServerResource(type, x, y);
    this.resources.set(r.id, r);
    this.insertGrid(r);
  }

  // ── Grid helpers ───────────────────────────────────────────────────────────

  private insertGrid(r: ServerResource): void {
    const cx = Math.floor(r.x / CELL);
    const cy = Math.floor(r.y / CELL);
    const key = cellKey(cx, cy);
    if (!this.grid.has(key)) this.grid.set(key, new Set());
    this.grid.get(key)!.add(r.id);
  }

  // ── Public queries ─────────────────────────────────────────────────────────

  /** True if (x, y) falls within the walkable branch corridor between treeX/treeY and a connected neighbor. */
  isInTreeCorridor(x: number, y: number, treeX: number, treeY: number): boolean {
    for (const c of this.treeCorridors) {
      const matchesA = c.ax === treeX && c.ay === treeY;
      const matchesB = c.bx === treeX && c.by === treeY;
      if (!matchesA && !matchesB) continue;
      if (pointSegmentDist2(x, y, c.ax, c.ay, c.bx, c.by) <= CORRIDOR_HALF_WIDTH * CORRIDOR_HALF_WIDTH) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns living resources within `radius` of (x, y) — or every resource
   * there, dead ones included, with `includeDead`.
   *
   * Harvested resources don't move, they just wait out a respawn timer and
   * come back in the same spot, so anything deciding what may permanently
   * occupy a piece of ground (structure placement) has to count them. Moment
   * -to-moment questions — what can I hit, what am I walking into — want the
   * living ones only.
   */
  getNearby(x: number, y: number, radius: number, includeDead = false): ServerResource[] {
    const result: ServerResource[] = [];
    const r2 = radius * radius;

    const minCx = Math.max(0, Math.floor((x - radius) / CELL));
    const maxCx = Math.min(COLS - 1, Math.floor((x + radius) / CELL));
    const minCy = Math.max(0, Math.floor((y - radius) / CELL));
    const maxCy = Math.min(ROWS - 1, Math.floor((y + radius) / CELL));

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.grid.get(cellKey(cx, cy));
        if (!cell) continue;
        for (const id of cell) {
          const r = this.resources.get(id);
          if (!r) continue;
          if (r.isDead && !includeDead) continue;
          const dx = r.x - x;
          const dy = r.y - y;
          if (dx * dx + dy * dy <= r2) result.push(r);
        }
      }
    }

    return result;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt: number): void {
    for (const r of this.resources.values()) {
      if (r.update(dt)) this.setResourceNavBlocking(r.id, true); // respawned this frame — solid again
    }
  }
}

/** Squared distance from (px, py) to the segment (ax, ay)–(bx, by). */
function pointSegmentDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}
