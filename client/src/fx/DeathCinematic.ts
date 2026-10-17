import { clamp01, smoothstep } from '@io-game/shared';

// ── Death freeze-frame ───────────────────────────────────────────────────────
// The server respawns the player the instant they die, so there's no
// "dying" world state to linger on. Instead, the last frame before death is
// captured and held: it drains to grey, pushes slowly in on where the player
// fell, and the edges close in red — a beat of drama before the "You died"
// card, rather than a hard cut to a new spawn point.

/** Total length of the freeze-frame, ms. */
export const DEATH_CINEMATIC_MS = 1800;
/** How far the frame pushes in over its run. */
const PUSH_IN = 0.18;

export class DeathCinematic {
  private frame: HTMLCanvasElement | null = null;
  private start = 0;
  private focusX = 0;
  private focusY = 0;

  /** Grab the canvas as it is right now; `fx`/`fy` are the screen point to push in on (where the player fell). */
  capture(source: HTMLCanvasElement, fx: number, fy: number): void {
    const c = this.frame ?? document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    c.getContext('2d')!.drawImage(source, 0, 0);
    this.frame = c;
    this.start = performance.now();
    this.focusX = fx;
    this.focusY = fy;
  }

  get active(): boolean {
    return !!this.frame && performance.now() - this.start < DEATH_CINEMATIC_MS;
  }

  /** Draws the held frame over the whole canvas. Call instead of the normal world render while active. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.frame) return;
    const u = clamp01((performance.now() - this.start) / DEATH_CINEMATIC_MS);
    const ease = smoothstep(u);
    const scale = 1 + PUSH_IN * ease;

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // Scale about the focus point, drifting it toward the screen center as
    // it pushes in so the fallen player ends up framed.
    const tx = this.focusX + (W / 2 - this.focusX) * ease * 0.5;
    const ty = this.focusY + (H / 2 - this.focusY) * ease * 0.5;
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    ctx.translate(-this.focusX, -this.focusY);
    ctx.imageSmoothingEnabled = false;
    // Desaturate fast, then darken slowly.
    const grey = clamp01(u * 3);
    ctx.filter = `grayscale(${grey.toFixed(2)}) brightness(${(1 - 0.35 * ease).toFixed(2)}) contrast(${(1 + 0.15 * ease).toFixed(2)})`;
    ctx.drawImage(this.frame, 0, 0);
    ctx.restore();

    // Red closing-in edges and letterbox bars — the "cut to cinematic" cue.
    ctx.save();
    const r = Math.hypot(W, H) / 2;
    const grad = ctx.createRadialGradient(W / 2, H / 2, r * (0.7 - 0.3 * ease), W / 2, H / 2, r);
    grad.addColorStop(0, 'rgba(90,0,0,0)');
    grad.addColorStop(1, `rgba(90,0,0,${(0.75 * ease).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const bar = Math.round(H * 0.09 * smoothstep(clamp01(u * 2.5)));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
    ctx.restore();
  }
}
