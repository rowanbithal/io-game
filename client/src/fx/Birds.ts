import { clamp01 } from '@io-game/shared';
import { Camera } from '../Camera';
import { isHigh } from './quality';

// ── Birds overhead ───────────────────────────────────────────────────────────
// Every so often by day a small flock flies across the view in a loose V,
// wings flapping, with their shadows sliding over the ground below them.
// Purely local ambience — each client has its own birds — and they never
// interact with anything.

/** Seconds between flocks, min..max. */
const FLOCK_INTERVAL: [number, number] = [14, 32];
/** Birds per flock, min..max. */
const FLOCK_SIZE: [number, number] = [2, 4];
/** World units per second. */
const BIRD_SPEED: [number, number] = [70, 95];
/** How far a bird's shadow falls from it — they're high up. */
const SHADOW_DROP = 46;
/** Wingbeats per second. */
const FLAP_RATE = 2.4;
/** Size of one pixel of bird art, world units. */
const BIRD_PIXEL = 2.5;
const BIRD_COLOR = '#24242c';

interface Bird {
  x: number;
  y: number;
  /** Phase into the flap cycle, 0..1. */
  flap: number;
  flapRate: number;
}

interface Flock {
  birds: Bird[];
  vx: number;
  vy: number;
  /** Seconds left before it's dropped (long after it's flown off screen). */
  life: number;
}

// Two frames of a bird seen from above, as pixel offsets from its center:
// wings raised in a V, then swept level.
const WINGS_UP: [number, number][] = [[0, 0], [-1, -1], [-2, -2], [1, -1], [2, -2], [0, 1]];
const WINGS_DOWN: [number, number][] = [[0, 0], [-1, 0], [-2, 0], [-3, 1], [1, 0], [2, 0], [3, 1], [0, 1]];

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export class Birds {
  private readonly flocks: Flock[] = [];
  private timer = rand(4, 10);

  /** `daylight` 0..1 and `rain` 0..1 gate the spawns — no birds at night or in a downpour. */
  update(dt: number, camera: Camera, viewW: number, viewH: number, daylight: number, rain: number): void {
    if (dt <= 0) return;
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flocks.splice(i, 1);
        continue;
      }
      for (const b of f.birds) {
        b.x += f.vx * dt;
        b.y += f.vy * dt;
        b.flap = (b.flap + b.flapRate * dt) % 1;
      }
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = rand(...FLOCK_INTERVAL) * (isHigh() ? 1 : 2);
    if (daylight < 0.3 || rain > 0.6) return;
    this.spawnFlock(camera, viewW, viewH);
  }

  /** A flock entering from just off one side of the view, flying across it. */
  private spawnFlock(camera: Camera, viewW: number, viewH: number): void {
    const heading = rand(0, Math.PI * 2);
    const speed = rand(...BIRD_SPEED);
    const vx = Math.cos(heading) * speed;
    const vy = Math.sin(heading) * speed;
    // Start behind the view along the heading, aimed through a random point near its middle.
    const cx = camera.x + viewW * rand(0.25, 0.75);
    const cy = camera.y + viewH * rand(0.25, 0.75);
    const back = Math.hypot(viewW, viewH) * 0.65;
    const sx = cx - Math.cos(heading) * back;
    const sy = cy - Math.sin(heading) * back;

    // A loose V: a leader, then pairs trailing back on either side.
    const count = Math.round(rand(...FLOCK_SIZE));
    const birds: Bird[] = [];
    const bx = -Math.cos(heading);
    const by = -Math.sin(heading);
    const px = -by;
    const py = bx;
    for (let i = 0; i < count; i++) {
      const rank = Math.ceil(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const trail = rank * 14 + rand(-3, 3);
      const out = i === 0 ? 0 : side * rank * 12 + rand(-3, 3);
      birds.push({ x: sx + bx * trail + px * out, y: sy + by * trail + py * out, flap: Math.random(), flapRate: FLAP_RATE * rand(0.85, 1.15) });
    }
    this.flocks.push({ birds, vx, vy, life: (back * 2) / speed + 4 });
  }

  /**
   * Shadows on the ground, then the birds themselves — world space, inside
   * the zoom transform, drawn over the treetops (they're flying above them)
   * and before the night tint. `sunAngle` is the direction shadows fall.
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera, viewW: number, viewH: number, sunAngle: number, daylight: number): void {
    if (this.flocks.length === 0) return;
    const shx = Math.cos(sunAngle) * SHADOW_DROP;
    const shy = Math.sin(sunAngle) * SHADOW_DROP;
    const margin = 60;
    const visible = (x: number, y: number): boolean =>
      x > camera.x - margin && x < camera.x + viewW + margin && y > camera.y - margin && y < camera.y + viewH + margin;

    ctx.save();
    // Shadows only show while there's sun to cast them.
    ctx.fillStyle = `rgba(10,18,12,${(0.22 * clamp01(daylight)).toFixed(3)})`;
    for (const f of this.flocks) {
      for (const b of f.birds) {
        if (visible(b.x + shx, b.y + shy)) this.drawBird(ctx, b, f, b.x + shx - camera.x, b.y + shy - camera.y);
      }
    }
    ctx.fillStyle = BIRD_COLOR;
    for (const f of this.flocks) {
      for (const b of f.birds) {
        if (visible(b.x, b.y)) this.drawBird(ctx, b, f, b.x - camera.x, b.y - camera.y);
      }
    }
    ctx.restore();
  }

  /**
   * One bird's pixels at (sx, sy), turned to face its flight direction.
   * Each rotated pixel is snapped back onto the bird's own pixel grid, so
   * however it's heading it stays crisp, chunky pixel art rather than a
   * scatter of off-grid squares.
   */
  private drawBird(ctx: CanvasRenderingContext2D, b: Bird, f: Flock, sx: number, sy: number): void {
    const frame = b.flap < 0.5 ? WINGS_UP : WINGS_DOWN;
    // Art faces "up" (-y); turn it to the heading.
    const angle = Math.atan2(f.vy, f.vx) + Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ox = Math.round(sx / BIRD_PIXEL) * BIRD_PIXEL;
    const oy = Math.round(sy / BIRD_PIXEL) * BIRD_PIXEL;
    for (const [px, py] of frame) {
      const rx = Math.round(px * cos - py * sin) * BIRD_PIXEL;
      const ry = Math.round(px * sin + py * cos) * BIRD_PIXEL;
      ctx.fillRect(ox + rx - BIRD_PIXEL / 2, oy + ry - BIRD_PIXEL / 2, BIRD_PIXEL, BIRD_PIXEL);
    }
  }
}
