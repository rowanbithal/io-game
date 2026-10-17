import { StructureState, StructureType, CAMPFIRE_LIFETIME } from '@io-game/shared';

/** Owner id for structures the world itself places (island treasure chests) — never matches a player. */
export const WORLD_OWNER = '__world__';

let nextId = 0;

/**
 * How long each structure type lasts once placed, in seconds. A type absent
 * here stands indefinitely — until its owner dies, which clears everything
 * they built (see Game.removeStructuresOwnedBy).
 *
 * Only the campfire burns out. It's the one structure that's consumable by
 * nature: a bench is a workshop you come back to, a fire is fuel you spend.
 */
const STRUCTURE_LIFETIME: Partial<Record<StructureType, number>> = {
  campfire: CAMPFIRE_LIFETIME,
};

/** A placed world object — player-built (campfire, bench, wall, chest) or the world's own (treasure chest). */
export class ServerStructure {
  readonly id: string;
  readonly type: StructureType;
  readonly x: number;
  readonly y: number;
  readonly ownerId: string;

  /** Seconds left before this burns out, or null if it never does. */
  private life: number | null;

  /** Storage chests only: what's inside, item type → count. */
  readonly storage: Map<string, number> | null;

  /** Treasure chests only: seconds until it refills after being looted, 0 while full. */
  refillRemaining = 0;

  /** Seconds since this was placed — sent for walls so the client can weather them (see StructureState.age). */
  private age = 0;

  constructor(type: StructureType, x: number, y: number, ownerId: string) {
    this.id = `s${nextId++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.life = STRUCTURE_LIFETIME[type] ?? null;
    this.storage = type === 'chest' ? new Map() : null;
  }

  /** A treasure chest that's been looted and hasn't refilled yet. */
  get looted(): boolean {
    return this.refillRemaining > 0;
  }

  /** Returns true when this structure's time runs out this frame. */
  update(dt: number): boolean {
    this.age += dt;
    if (this.refillRemaining > 0) this.refillRemaining = Math.max(0, this.refillRemaining - dt);
    if (this.life === null) return false;
    this.life -= dt;
    return this.life <= 0;
  }

  toState(): StructureState {
    const state: StructureState = { id: this.id, type: this.type, x: this.x, y: this.y, life: this.life };
    if (this.type === 'treasure_chest') state.opened = this.looted;
    // Whole seconds — walls only, the one structure that visibly weathers.
    if (this.type === 'wall') state.age = Math.floor(this.age);
    return state;
  }
}
