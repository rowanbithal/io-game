import { TICK_RATE, MAP_SIZE, isInDesert, clamp01, smoothstep, mulberry32, naturalRainAt } from '@io-game/shared';
import { Camera } from '../Camera';
import { Effects } from './Effects';
import { isHigh } from './quality';

// ── Atmosphere ───────────────────────────────────────────────────────────────
// Screen-wide mood: the color grade that moves through golden hour, dusk,
// night and dawn; drifting cloud shadows; rain; and the lens vignette. All
// client-side and presentational.
//
// Weather is a pure function of the server's tick counter (see the shared
// naturalRainAt), so every client agrees on when it's raining without any
// extra network traffic — unless someone's "/rain" is overriding it, which
// arrives as GameState.rainOverride.

/** Cloud-shadow texture: CLOUD_CELLS² cells of CLOUD_CELL world units, tiled. */
const CLOUD_CELLS = 128;
const CLOUD_CELL = 12;
const CLOUD_TILE = CLOUD_CELLS * CLOUD_CELL;
/** World units per second the cloud field drifts. */
const WIND_X = 13;
const WIND_Y = 5;

const RAIN_DROPS_HIGH = 320;
const RAIN_DROPS_LOW = 110;

interface Drop {
  x: number;
  y: number;
  speed: number;
  len: number;
  /** Seconds until it hits the ground. */
  life: number;
}

/** Linear blend between two [r,g,b] colors. */
function mix(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const rgba = (c: number[], a: number): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

// Grade palette. Night multiplies toward a deep blue (keeps color, unlike a
// black wash which greys everything out); dusk leans magenta, dawn peach,
// golden hour amber — all applied with soft-light so highlights shift hue
// while shadows keep their depth.
const NIGHT_MULTIPLY = [62, 82, 142];
const GOLDEN = [255, 170, 70];
const DUSK = [200, 80, 150];
const DAWN = [255, 150, 120];
const RAIN_MULTIPLY = [150, 162, 180];

export class Atmosphere {
  /** Current eased rain strength 0..1 — read by the grade, clouds, vignette and HUD. */
  rain = 0;

  private readonly drops: Drop[] = [];
  private cloudTex: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private time = 0;
  private dryness = 1;

  /** `rainOverride` is GameState.rainOverride — a "/rain" forcing rain on (true) or off (false). */
  update(dt: number, tick: number, rainOverride: boolean | undefined, camera: Camera, viewW: number, viewH: number, effects: Effects): void {
    if (dt <= 0) return;
    this.time += dt;

    // No rain over the desert — fade it out as the view moves in there.
    const cx = camera.x + viewW / 2;
    const cy = camera.y + viewH / 2;
    const desert = isInDesert(cx, cy) ? 0 : 1;
    this.dryness += (desert - this.dryness) * (1 - Math.exp(-dt * 1.5));

    const natural = rainOverride === undefined ? naturalRainAt(tick / TICK_RATE) : rainOverride ? 1 : 0;
    const target = natural * this.dryness;
    this.rain += (target - this.rain) * (1 - Math.exp(-dt * 0.6));

    this.updateDrops(dt, camera, viewW, viewH, effects);
  }

  // ── Rain ─────────────────────────────────────────────────────────────────

  private updateDrops(dt: number, camera: Camera, viewW: number, viewH: number, effects: Effects): void {
    const want = Math.round(this.rain * (isHigh() ? RAIN_DROPS_HIGH : RAIN_DROPS_LOW));
    // Drops live in world space so they stay put relative to the ground as
    // the camera moves (they'd otherwise slide with the view and read as
    // dirt on the lens).
    while (this.drops.length < want) this.drops.push(this.newDrop(camera, viewW, viewH));
    if (this.drops.length > want) this.drops.length = want;

    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.life -= dt;
      d.y += d.speed * dt;
      d.x += d.speed * 0.22 * dt;
      if (d.life <= 0) {
        // Landed: a little ripple where it hit — only some, or the ground
        // turns into a carpet of rings.
        if (Math.random() < (isHigh() ? 0.35 : 0.12)) effects.ring(d.x, d.y, rangeRand(4, 8), 0.45, 'rgba(210,225,240,0.55)');
        this.drops[i] = this.newDrop(camera, viewW, viewH);
      }
    }
  }

  private newDrop(camera: Camera, viewW: number, viewH: number): Drop {
    const speed = rangeRand(380, 520);
    return {
      x: camera.x - 60 + Math.random() * (viewW + 60),
      y: camera.y - 80 + Math.random() * (viewH + 40),
      speed,
      len: rangeRand(10, 18),
      life: rangeRand(0.15, 0.55),
    };
  }

  /** Rain streaks — world space, inside the zoom transform, before the night tint so they darken with everything else. */
  drawRain(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.drops.length === 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(200,215,235,0.55)';
    ctx.globalAlpha = clamp01(this.rain * 1.5);
    for (const d of this.drops) {
      // A slanted chain of chunky squares rather than an antialiased line —
      // keeps the rain in the same pixel language as everything else.
      const x = d.x - camera.x;
      const y = d.y - camera.y;
      const steps = 4;
      for (let k = 0; k < steps; k++) {
        const t = (k / steps) * d.len;
        ctx.fillRect(Math.round(x - t * 0.22), Math.round(y - t), 1.5, 2.5);
      }
    }
    ctx.restore();
  }

  // ── Cloud shadows ──────────────────────────────────────────────────────────

  /** A tileable field of soft cloud blobs, quantized to a few alpha steps so the edges read as pixel art. */
  private buildCloudTexture(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = CLOUD_CELLS;
    c.height = CLOUD_CELLS;
    const g = c.getContext('2d')!;
    const img = g.createImageData(CLOUD_CELLS, CLOUD_CELLS);

    // Periodic value-noise lattices, so the texture wraps seamlessly.
    const rng = mulberry32(7331);
    const lattices = [4, 8, 16].map((n) => ({ n, v: Array.from({ length: n * n }, () => rng()) }));
    const sample = (lat: { n: number; v: number[] }, u: number, v: number): number => {
      const x = u * lat.n;
      const y = v * lat.n;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = smoothstep(x - x0);
      const fy = smoothstep(y - y0);
      const at = (i: number, j: number): number => lat.v[((j % lat.n) + lat.n) % lat.n * lat.n + (((i % lat.n) + lat.n) % lat.n)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
      return a + (b - a) * fy;
    };

    for (let j = 0; j < CLOUD_CELLS; j++) {
      for (let i = 0; i < CLOUD_CELLS; i++) {
        const u = i / CLOUD_CELLS;
        const v = j / CLOUD_CELLS;
        const f = sample(lattices[0], u, v) * 0.55 + sample(lattices[1], u, v) * 0.3 + sample(lattices[2], u, v) * 0.15;
        const raw = clamp01((f - 0.5) / 0.16);
        // Three steps: clear, penumbra, umbra.
        const a = raw < 0.2 ? 0 : raw < 0.65 ? 0.55 : 1;
        const k = (j * CLOUD_CELLS + i) * 4;
        img.data[k] = 40;
        img.data[k + 1] = 52;
        img.data[k + 2] = 78;
        img.data[k + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /**
   * Big slow shadows sliding across the ground — gives a flat top-down map
   * a sense of sky above it. World space, drawn over the scene but before
   * the night tint; fades out as the sun goes down (no sun, no shadows).
   */
  drawClouds(ctx: CanvasRenderingContext2D, camera: Camera, viewW: number, viewH: number, sunHeight: number): void {
    if (!isHigh()) return;
    const daylight = smoothstep(clamp01((sunHeight + 0.05) / 0.35));
    const strength = daylight * (0.16 + this.rain * 0.22);
    if (strength <= 0.01) return;

    if (!this.cloudTex) this.cloudTex = this.buildCloudTexture();
    const tex = this.cloudTex;

    // Offset the field by the wind, wrapped to one tile.
    const ox = (((this.time * WIND_X) % CLOUD_TILE) + CLOUD_TILE) % CLOUD_TILE;
    const oy = (((this.time * WIND_Y) % CLOUD_TILE) + CLOUD_TILE) % CLOUD_TILE;
    const startX = Math.floor((camera.x - ox) / CLOUD_TILE) * CLOUD_TILE + ox;
    const startY = Math.floor((camera.y - oy) / CLOUD_TILE) * CLOUD_TILE + oy;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = strength;
    ctx.globalCompositeOperation = 'multiply';
    for (let ty = startY; ty < camera.y + viewH; ty += CLOUD_TILE) {
      for (let tx = startX; tx < camera.x + viewW; tx += CLOUD_TILE) {
        if (tx > MAP_SIZE || ty > MAP_SIZE) continue;
        ctx.drawImage(tex, Math.round(tx - camera.x), Math.round(ty - camera.y), CLOUD_TILE, CLOUD_TILE);
      }
    }
    ctx.restore();
  }

  // ── Color grade ────────────────────────────────────────────────────────────

  /**
   * How far into night the multiply layer should go (0..~0.9), matching the
   * curve the old flat tint used so gameplay visibility at night is
   * unchanged in feel — just bluer and more saturated.
   */
  static nightStrength(sunHeight: number): number {
    return smoothstep(clamp01((0.15 - sunHeight) / 0.3)) * 0.9;
  }

  /** The color the night layer is filled with before being multiplied over the scene. */
  static nightColor(rain: number): string {
    const c = mix(NIGHT_MULTIPLY, [50, 62, 100], rain * 0.5);
    return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  }

  /**
   * Everything after the night layer: golden-hour warmth, dusk/dawn hue,
   * and rain's grey-down. `setting` is true between noon and midnight (sun
   * going down), false on the way back up — dusk and dawn get different hues.
   */
  applyGrade(ctx: CanvasRenderingContext2D, W: number, H: number, sunHeight: number, setting: boolean): void {
    const golden = Atmosphere.golden(sunHeight);
    const twilight = smoothstep(clamp01(1 - Math.abs(sunHeight + 0.02) / 0.2));
    const dry = 1 - this.rain;

    ctx.save();
    if (golden > 0.01) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = rgba(GOLDEN, golden * 0.55 * dry);
      ctx.fillRect(0, 0, W, H);
    }
    if (twilight > 0.01) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = rgba(setting ? DUSK : DAWN, twilight * 0.6 * (0.4 + 0.6 * dry));
      ctx.fillRect(0, 0, W, H);
    }
    if (this.rain > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(RAIN_MULTIPLY, this.rain * 0.45);
      ctx.fillRect(0, 0, W, H);
      // Wash some saturation out — rainy light is flat and grey.
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${(this.rain * 0.35).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /** 0..1 golden-hour strength — pollen and water glints key off it too. */
  static golden(sunHeight: number): number {
    return smoothstep(clamp01(1 - Math.abs(sunHeight - 0.2) / 0.25));
  }

  // ── Vignette ───────────────────────────────────────────────────────────────

  private buildVignette(W: number, H: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const r = Math.hypot(W, H) / 2;
    const grad = g.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    return c;
  }

  /**
   * Darkened screen edges, always on — frames the shot. Heavier at night
   * and in the rain; pulses red when the player is hurt.
   */
  drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number, nightness: number, hurt: number): void {
    if (!this.vignette || this.vignette.width !== W || this.vignette.height !== H) this.vignette = this.buildVignette(W, H);
    ctx.save();
    ctx.globalAlpha = clamp01(0.3 + nightness * 0.25 + this.rain * 0.15);
    ctx.drawImage(this.vignette, 0, 0);
    if (hurt > 0.01) {
      // Same falloff, tinted red, added on top.
      ctx.globalAlpha = clamp01(hurt * 0.45);
      ctx.drawImage(this.redVignette(W, H), 0, 0);
    }
    ctx.restore();
  }

  private redCache: HTMLCanvasElement | null = null;
  private redVignette(W: number, H: number): HTMLCanvasElement {
    if (this.redCache && this.redCache.width === W && this.redCache.height === H) return this.redCache;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const r = Math.hypot(W, H) / 2;
    const grad = g.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    grad.addColorStop(0, 'rgba(160,0,0,0)');
    grad.addColorStop(1, 'rgba(170,10,10,0.9)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    this.redCache = c;
    return c;
  }
}

function rangeRand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}
