import { ResourceState, ResourceType } from '@io-game/shared';

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
  berry: 20,
  mushroom: 15,
  wheat: 18,
  purple_berry: 20,
  gold: 150, // Rare and confined to the top of the dark forest — respawns slowly
};

export const RESOURCE_DROPS: Record<ResourceType, { type: string; count: number }[]> = {
  tree: [
    { type: 'wood', count: 3 },
    { type: 'berry', count: 1 },
  ],
  rock: [{ type: 'stone', count: 3 }],
  berry: [{ type: 'berry', count: 2 }],
  mushroom: [{ type: 'mushroom', count: 1 }],
  wheat: [{ type: 'wheat', count: 2 }],
  purple_berry: [{ type: 'purple_berry', count: 3 }], // A dark-forest delicacy — richer than a plains berry bush
  gold: [{ type: 'gold', count: 2 }],
};

// ── Entity ───────────────────────────────────────────────────────────────────

let nextId = 0;

export class ServerResource {
  readonly id: string;
  readonly type: ResourceType;
  readonly x: number;
  readonly y: number;

  hp: number;
  readonly maxHp: number;
  isDead = false;
  private respawnTimer = 0;

  constructor(type: ResourceType, x: number, y: number) {
    this.id = `r${nextId++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.maxHp = RESOURCE_HP[type];
    this.hp = this.maxHp;
  }

  /** Returns drops if this strike kills the resource, otherwise empty array. */
  damage(amount: number): { type: string; count: number }[] {
    if (this.isDead) return [];
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) {
      this.isDead = true;
      this.respawnTimer = RESOURCE_RESPAWN[this.type];
      return RESOURCE_DROPS[this.type];
    }
    return [];
  }

  /** Returns true when the resource respawns this frame. */
  update(dt: number): boolean {
    if (!this.isDead) return false;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.isDead = false;
      this.hp = this.maxHp;
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
