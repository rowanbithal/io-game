import { FoxState, FOX_MAX_HP } from '@io-game/shared';

let nextId = 0;

/** A hostile mob that hunts players in and around the dark forest, day or night (see Game.ts's fox AI). */
export class ServerFox {
  readonly id: string;
  x: number;
  y: number;
  angle = 0;
  hp = FOX_MAX_HP;
  readonly maxHp = FOX_MAX_HP;

  /** Seconds until this fox can bite again. */
  attackCooldown = 0;

  /**
   * Remaining waypoints to its target, nearest first (see World.findPath).
   * Empty whenever the fox has a clear run at its target and is just steering
   * straight at it, which is the common case out in the open.
   */
  path: { x: number; y: number }[] = [];

  /** Seconds until the current path is recomputed (see FOX_REPATH_INTERVAL). */
  repathTimer = 0;

  /**
   * Player this fox is currently hunting, if any. Held onto across ticks so
   * the chase is sticky: it keeps after this one until they escape
   * FOX_LOSE_INTEREST_RANGE rather than re-picking the nearest every tick.
   */
  targetId: string | null = null;

  /**
   * Seconds since this fox last had a target. Counts up while idle, reset to
   * zero the instant it acquires one — see FOX_IDLE_DESPAWN_TIME and Game.ts's
   * updateFox, which despawns the fox once this crosses that threshold.
   */
  idleTimer = 0;

  constructor(x: number, y: number) {
    this.id = `fx${nextId++}`;
    this.x = x;
    this.y = y;
  }

  toState(): FoxState {
    return { id: this.id, x: this.x, y: this.y, angle: this.angle, hp: this.hp, maxHp: this.maxHp };
  }
}
