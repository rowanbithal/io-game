import { StructureState, StructureType } from '@io-game/shared';

let nextId = 0;

/** A player-placed world object (currently just campfires). */
export class ServerStructure {
  readonly id: string;
  readonly type: StructureType;
  readonly x: number;
  readonly y: number;
  readonly ownerId: string;

  constructor(type: StructureType, x: number, y: number, ownerId: string) {
    this.id = `s${nextId++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
  }

  toState(): StructureState {
    return { id: this.id, type: this.type, x: this.x, y: this.y };
  }
}
