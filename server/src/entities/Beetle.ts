import { BeetleState, BEETLE_MAX_HP } from '@io-game/shared';

let nextId = 0;

/** A hostile mob that hunts players in and around the desert, day or night (see Game.ts's beetle AI). */
export class ServerBeetle {
  readonly id: string;
  x: number;
  y: number;
  angle = 0;
  hp = BEETLE_MAX_HP;
  readonly maxHp = BEETLE_MAX_HP;

  /** Seconds until this beetle can bite again. */
  attackCooldown = 0;

  /**
   * Player this beetle is currently hunting, if any. Held onto across ticks
   * so the chase is sticky: it keeps after this one until they escape
   * BEETLE_LOSE_INTEREST_RANGE rather than re-picking the nearest every tick.
   */
  targetId: string | null = null;

  /**
   * Seconds since this beetle last had a target. Counts up while idle, reset
   * to zero the instant it acquires one — see BEETLE_IDLE_DESPAWN_TIME and
   * Game.ts's updateBeetle, which despawns the beetle once this crosses that
   * threshold.
   */
  idleTimer = 0;

  constructor(x: number, y: number) {
    this.id = `bt${nextId++}`;
    this.x = x;
    this.y = y;
  }

  toState(): BeetleState {
    return { id: this.id, x: this.x, y: this.y, angle: this.angle, hp: this.hp, maxHp: this.maxHp };
  }
}
