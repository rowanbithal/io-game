import { StructureState, StructureType, CAMPFIRE_LIFETIME } from '@io-game/shared';

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

/** A player-placed world object (campfires and crafting benches). */
export class ServerStructure {
  readonly id: string;
  readonly type: StructureType;
  readonly x: number;
  readonly y: number;
  readonly ownerId: string;

  /** Seconds left before this burns out, or null if it never does. */
  private life: number | null;

  constructor(type: StructureType, x: number, y: number, ownerId: string) {
    this.id = `s${nextId++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    this.life = STRUCTURE_LIFETIME[type] ?? null;
  }

  /** Returns true when this structure's time runs out this frame. */
  update(dt: number): boolean {
    if (this.life === null) return false;
    this.life -= dt;
    return this.life <= 0;
  }

  toState(): StructureState {
    return { id: this.id, type: this.type, x: this.x, y: this.y, life: this.life };
  }
}
