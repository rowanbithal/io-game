import { GameState, PlayerState, SpiderState, FoxState, TICK_RATE } from '@io-game/shared';

const TICK_MS = 1000 / TICK_RATE;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  // Handle wrap-around at ±π
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

/**
 * Generic over T so the same interpolation logic serves both the real
 * per-player GameState and the menu backdrop's PreviewState (which carries
 * a couple of extra fields on top — see PreviewState's own doc comment).
 * Defaults to plain GameState so every existing call site is unaffected.
 */
export class StateManager<T extends GameState = GameState> {
  private prev: T | null = null;
  private curr: T | null = null;
  private recvTime = 0; // When we received `curr`

  push(state: T): void {
    this.prev = this.curr;
    this.curr = state;
    this.recvTime = performance.now();
  }

  /**
   * Returns an interpolated snapshot between prev and curr.
   * Alpha is how far we are between ticks (0 = at prev, 1 = at curr).
   */
  interpolated(): T | null {
    if (!this.curr) return null;
    if (!this.prev) return this.curr;

    const alpha = Math.min(1, (performance.now() - this.recvTime) / TICK_MS);

    const players: PlayerState[] = this.curr.players.map((curr) => {
      const prev = this.prev!.players.find((p) => p.id === curr.id);
      if (!prev) return curr;
      return {
        ...curr,
        x: lerp(prev.x, curr.x, alpha),
        y: lerp(prev.y, curr.y, alpha),
        angle: lerpAngle(prev.angle, curr.angle, alpha),
        health: lerp(prev.health, curr.health, alpha),
        hunger: lerp(prev.hunger, curr.hunger, alpha),
        temperature: lerp(prev.temperature, curr.temperature, alpha),
      };
    });

    const spiders: SpiderState[] = this.curr.spiders.map((curr) => {
      const prev = this.prev!.spiders.find((s) => s.id === curr.id);
      if (!prev) return curr;
      return {
        ...curr,
        x: lerp(prev.x, curr.x, alpha),
        y: lerp(prev.y, curr.y, alpha),
        angle: lerpAngle(prev.angle, curr.angle, alpha),
        hp: lerp(prev.hp, curr.hp, alpha),
      };
    });

    const foxes: FoxState[] = this.curr.foxes.map((curr) => {
      const prev = this.prev!.foxes.find((f) => f.id === curr.id);
      if (!prev) return curr;
      return {
        ...curr,
        x: lerp(prev.x, curr.x, alpha),
        y: lerp(prev.y, curr.y, alpha),
        angle: lerpAngle(prev.angle, curr.angle, alpha),
        hp: lerp(prev.hp, curr.hp, alpha),
      };
    });

    // T's extra fields (PreviewState's focus/lakes) pass straight through
    // via the spread untouched — only the interpolated arrays are
    // overridden — so this is safe despite the cast being unable to prove
    // it structurally on its own.
    return { ...this.curr, players, spiders, foxes } as T;
  }
}
