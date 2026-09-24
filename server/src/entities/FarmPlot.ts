import {
  FarmPlotState,
  CropType,
  WHEAT_GROW_TIME,
  BERRY_GROW_TIME,
  WET_GROWTH_MULTIPLIER,
  WATERING_WET_DURATION,
  FARMED_WHEAT_YIELD,
  FARMED_BERRY_YIELD,
  BERRY_PLANT_REGROW_TIME,
} from '@io-game/shared';

/** Seconds a dry plot takes to bring each crop to maturity — see shared/constants.ts. */
const GROW_TIME: Record<CropType, number> = {
  wheat: WHEAT_GROW_TIME,
  berry: BERRY_GROW_TIME,
};

/** What a mature plot pays out when picked — see shared/constants.ts. */
const HARVEST_YIELD: Record<CropType, number> = {
  wheat: FARMED_WHEAT_YIELD,
  berry: FARMED_BERRY_YIELD,
};

let nextId = 0;

/**
 * A tilled patch of ground, optionally planted — see FarmPlotState's own doc
 * comment for why this is a standalone entity rather than a StructureType.
 *
 * Growth is driven entirely off `update(dt)`, the same tick-driven shape
 * every other entity in the game uses (ServerResource.update,
 * ServerStructure.update) — nothing here reacts to being watered/planted by
 * jumping straight to a result, it just changes what update accumulates
 * toward next tick.
 */
export class ServerFarmPlot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly ownerId: string;

  wet = false;
  private wetRemaining = 0;

  crop: CropType | null = null;
  growth = 0;
  mature = false;
  hasBerry = false;
  berryRegrowth = 0;

  constructor(x: number, y: number, ownerId: string) {
    this.id = `f${nextId++}`;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
  }

  /** Plants a seed into bare soil. No-op if something's already growing here — see Game.handlePlant. */
  plant(crop: CropType): void {
    if (this.crop) return;
    this.crop = crop;
    this.growth = 0;
    this.mature = false;
    this.hasBerry = false;
    this.berryRegrowth = 0;
  }

  /** Wets the soil, (re)starting WATERING_WET_DURATION's countdown back to dry. */
  water(): void {
    this.wet = true;
    this.wetRemaining = WATERING_WET_DURATION;
  }

  /**
   * True while there's something on this plot a harvest swing should pick up
   * — mature wheat, or a berry plant currently holding a ripe batch. Used to
   * decide whether a plot even counts as a harvest target (see
   * Game.findFarmPlotTargets) — an empty or still-growing plot shouldn't
   * eat a swing for nothing.
   */
  isReady(): boolean {
    if (!this.crop || !this.mature) return false;
    return this.crop === 'wheat' || this.hasBerry;
  }

  /**
   * Picks whatever's ready and returns the drop it pays out, or null if
   * nothing was (see isReady — callers should already have checked, this is
   * just the same rule applied at the moment of harvest rather than trusted
   * from a stale check).
   *
   * Wheat is a one-shot: picking it empties the plot back to bare tilled
   * soil, same growth/mature reset as a freshly-tilled one, so it needs
   * replanting. A berry plant stays planted forever once it first matures —
   * picking it only clears hasBerry and starts berryRegrowth counting back up
   * (see update), the plant itself is never removed.
   */
  harvest(): { type: string; count: number } | null {
    if (!this.isReady() || !this.crop) return null;

    const type = this.crop;
    const count = HARVEST_YIELD[type];

    if (type === 'wheat') {
      this.crop = null;
      this.growth = 0;
      this.mature = false;
    } else {
      this.hasBerry = false;
      this.berryRegrowth = 0;
    }

    return { type, count };
  }

  update(dt: number): void {
    if (this.wet) {
      this.wetRemaining -= dt;
      if (this.wetRemaining <= 0) {
        this.wet = false;
        this.wetRemaining = 0;
      }
    }

    if (!this.crop) return;
    const rate = this.wet ? WET_GROWTH_MULTIPLIER : 1;

    if (!this.mature) {
      this.growth = Math.min(1, this.growth + (rate * dt) / GROW_TIME[this.crop]);
      if (this.growth >= 1) {
        this.mature = true;
        // A berry plant's first batch is ready the instant it matures —
        // there's nothing to wait out beyond the growth that just finished.
        if (this.crop === 'berry') this.hasBerry = true;
      }
      return;
    }

    if (this.crop === 'berry' && !this.hasBerry) {
      this.berryRegrowth = Math.min(1, this.berryRegrowth + (rate * dt) / BERRY_PLANT_REGROW_TIME);
      if (this.berryRegrowth >= 1) this.hasBerry = true;
    }
  }

  toState(): FarmPlotState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      wet: this.wet,
      crop: this.crop,
      growth: this.growth,
      mature: this.mature,
      hasBerry: this.hasBerry,
      berryRegrowth: this.berryRegrowth,
    };
  }
}
