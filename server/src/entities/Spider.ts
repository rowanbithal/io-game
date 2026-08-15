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

  constructor(x: number, y: number) {
    this.id = `sp${nextId++}`;
    this.x = x;
    this.y = y;
  }

  toState(): SpiderState {
    return { id: this.id, x: this.x, y: this.y, angle: this.angle, hp: this.hp, maxHp: this.maxHp };
  }
}
