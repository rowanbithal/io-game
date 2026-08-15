import { ResourceState, ResourceType, resourceSizeScale } from '@io-game/shared';

// ── Config tables ────────────────────────────────────────────────────────────

const RESOURCE_HP: Record<ResourceType, number> = {
  tree: 90,
  rock: 150,
  berry: 30,
  mushroom: 20,
  wheat: 15,
  purple_berry: 30,
  gold: 260, // Tougher than rock — bigger deposit, more work to crack open
};

const RESOURCE_RESPAWN: Record<ResourceType, number> = {
  tree: 45,
  rock: 90,
  berry: 30,
  mushroom: 30,
  wheat: 18,
  purple_berry: 30,
  gold: 150, // Rare and confined to the top of the dark forest — respawns slowly
};

/**
 * Total each resource yields over its whole lifetime — NOT what one strike
 * gives. Harvesting pays out gradually as HP comes off (see damage), so these
 * are the sum across every hit it takes to clear one, before the size and
 * held-tool multipliers scale them up.
 */
export const RESOURCE_DROPS: Record<ResourceType, { type: string; count: number }[]> = {
  tree: [
    { type: 'wood', count: 3 },
    { type: 'berry', count: 1 },
  ],
  rock: [{ type: 'stone', count: 3 }],
  berry: [{ type: 'berry', count: 1 }],
  mushroom: [{ type: 'mushroom', count: 1 }],
  wheat: [{ type: 'wheat', count: 2 }],
  purple_berry: [{ type: 'purple_berry', count: 1 }], // A dark-forest delicacy — richer than a plains berry bush
  gold: [{ type: 'gold', count: 2 }],
};

/**
 * How a resource's visible size translates into what it's worth. A dark
 * forest boulder is drawn 1.5x a plains rock (see FOREST_ROCK_SCALE), so it
 * gives 1.5x the stone — the scale factor is used directly as the yield
 * multiplier, which is what makes "that one's bigger" a reliable read on
 * "that one's worth more" rather than a purely cosmetic difference.
 *
 * HP scales too, but deliberately by less than the full size difference: a
 * big rock should take longer *and* still be the better use of the time spent
 * on it. At the fractions below a forest boulder costs ~1.3x the swings for
 * 1.5x the stone.
 */
const SIZE_HP_SHARE = 0.6;

function scaledHp(type: ResourceType, sizeScale: number): number {
  return Math.round(RESOURCE_HP[type] * (1 + (sizeScale - 1) * SIZE_HP_SHARE));
}

// ── Entity ───────────────────────────────────────────────────────────────────

let nextId = 0;

export class ServerResource {
  readonly id: string;
  readonly type: ResourceType;
  readonly x: number;
  readonly y: number;
  /** 1 for an ordinary resource, >1 for the oversized dark forest variants. */
  readonly sizeScale: number;

  hp: number;
  readonly maxHp: number;
  isDead = false;
  private respawnTimer = 0;

  /**
   * Sub-unit yield carried between strikes, per drop type. Harvesting pays
   * out in whole items but earns in fractions (a rock worth 3 stone across 5
   * swings earns 0.6 a swing), so the leftover has to survive to the next hit
   * — otherwise every fractional part would be floored away and a rock would
   * quietly pay 0 stone forever. Lives on the resource rather than per
   * player: two people splitting a tree split its yield, they don't each get
   * a full one.
   */
  private readonly yieldCarry = new Map<string, number>();
  /** Fraction of this resource's total yield already handed out, 0..1. */
  private paidFraction = 0;

  constructor(type: ResourceType, x: number, y: number) {
    this.id = `r${nextId++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.sizeScale = resourceSizeScale(type, x, y);
    this.maxHp = scaledHp(type, this.sizeScale);
    this.hp = this.maxHp;
  }

  /**
   * Applies one strike and returns the drops it earned — a share of the
   * resource's total proportional to the HP this strike took off, not the
   * whole lot at the moment it dies. `yieldMultiplier` is the striker's
   * held-tool bonus for a given drop type (see Game.activeToolBonus); it's
   * per-strike rather than fixed at construction because whoever swings next
   * may be holding something better.
   *
   * The final strike settles up: it rounds its share instead of flooring, so
   * a fully-harvested resource always totals what the tables say it's worth
   * however the fractions fell along the way.
   */
  damage(
    amount: number,
    yieldMultiplier: (dropType: string) => number = () => 1,
  ): { drops: { type: string; count: number }[]; destroyed: boolean } {
    if (this.isDead) return { drops: [], destroyed: false };

    this.hp = Math.max(0, this.hp - amount);
    const destroyed = this.hp === 0;

    const harvested = 1 - this.hp / this.maxHp;
    const share = harvested - this.paidFraction;
    this.paidFraction = harvested;

    const drops: { type: string; count: number }[] = [];
    for (const drop of RESOURCE_DROPS[this.type]) {
      const total = drop.count * this.sizeScale * yieldMultiplier(drop.type);
      const earned = (this.yieldCarry.get(drop.type) ?? 0) + total * share;
      const count = destroyed ? Math.round(earned) : Math.floor(earned);
      this.yieldCarry.set(drop.type, earned - count);
      if (count > 0) drops.push({ type: drop.type, count });
    }

    if (destroyed) {
      this.isDead = true;
      this.respawnTimer = RESOURCE_RESPAWN[this.type];
    }
    return { drops, destroyed };
  }

  /** Returns true when the resource respawns this frame. */
  update(dt: number): boolean {
    if (!this.isDead) return false;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.isDead = false;
      this.hp = this.maxHp;
      // A respawned resource is worth its full yield again, so the harvest
      // ledger resets with it.
      this.paidFraction = 0;
      this.yieldCarry.clear();
      return true;
    }
    return false;
  }

  toState(): ResourceState {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      hp: this.hp,
      maxHp: this.maxHp,
    };
  }
}
