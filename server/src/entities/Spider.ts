import { SpiderState, SPIDER_MAX_HP } from '@io-game/shared';

let nextId = 0;

/** A hostile mob that chases and bites the nearest player at night (see Game.ts's spider AI). */
export class ServerSpider {
  readonly id: string;
  x: number;
  y: number;
  angle = 0;
  hp = SPIDER_MAX_HP;
  readonly maxHp = SPIDER_MAX_HP;

  /** Seconds until this spider can bite again. */
  attackCooldown = 0;

  /**
   * Bites landed so far — bumped once per bite in Game.ts and sent as
   * SpiderState.attackSeq, so the client can play a lunge the instant it
   * changes (see Renderer's mob attack anim).
   */
  attackSeq = 0;

  /** Where an idle (untargeted) spider is currently ambling toward — see Game.ts's wanderSpider. Null until it first goes idle. */
  wanderTarget: { x: number; y: number } | null = null;

  /** Seconds until wanderTarget is replaced, even if not yet reached — keeps an idle spider from beelining forever. */
  wanderTimer = 0;

  /** When this spider spawned (Date.now() ms) — sent as SpiderState.age so the client can play its emerge-from-the-ground anim. */
  readonly spawnedAt = Date.now();

  constructor(x: number, y: number) {
    this.id = `sp${nextId++}`;
    this.x = x;
    this.y = y;
  }

  toState(): SpiderState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      angle: this.angle,
      hp: this.hp,
      maxHp: this.maxHp,
      attackSeq: this.attackSeq,
      age: (Date.now() - this.spawnedAt) / 1000,
    };
  }
}
