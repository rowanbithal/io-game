import { TICK_RATE, MAP_SIZE, isInDesert, clamp01, smoothstep, mulberry32, naturalRainAt, morningFogAt, lightningSlotAt, lightningInSlot, LIGHTNING_MIN_RAIN } from '@io-game/shared';
import { Camera } from '../Camera';
import { Effects } from './Effects';
import { isHigh } from './quality';
import { sound } from './Sound';

// ── Atmosphere ───────────────────────────────────────────────────────────────
// Screen-wide mood: the color grade that moves through golden hour, dusk,
// night and dawn; drifting cloud shadows; rain; and the lens vignette. All
// client-side and presentational.
//
// Weather is a pure function of the server's tick counter (see the shared
// naturalRainAt), so every client agrees on when it's raining without any
// extra network traffic — unless someone's "/rain" is overriding it, which
// arrives as GameState.rainOverride. The same goes for morning fog (see
// morningFogAt — keyed off which day it is) and a thunderstorm's lightning
// (see lightningInSlot — keyed off game time, gated on heavy rain).

/** Cloud-shadow texture: CLOUD_CELLS² cells of CLOUD_CELL world units, tiled. */
const CLOUD_CELLS = 128;
const CLOUD_CELL = 12;
const CLOUD_TILE = CLOUD_CELLS * CLOUD_CELL;
/** World units per second the cloud field drifts — campfire smoke leans with it too (see Renderer). */
export const WIND_X = 13;
export const WIND_Y = 5;

const RAIN_DROPS_HIGH = 320;
const RAIN_DROPS_LOW = 110;

/**
 * Fog-bank texture: like the cloud shadows, a tileable low-res field scaled
 * up nearest-neighbour, just coarser (bigger, softer banks) and drifting
 * slower — fog hangs, it doesn't race along with the clouds.
 */
const FOG_CELLS = 96;
const FOG_CELL = 24;
const FOG_TILE = FOG_CELLS * FOG_CELL;
const FOG_DRIFT = 0.45; // fraction of the wind speed the banks drift at
const FOG_COLOR = [206, 214, 222];
/** Peak alpha of the even wash over the whole view, at full fog. */
const FOG_WASH_ALPHA = 0.2;
/**
 * Peak alpha of the drifting banks on top of the wash. Kept well short of
 * opaque — fog should soften the morning, not hide the player's surroundings.
 */
const FOG_BANK_ALPHA = 0.36;

/** Lightning flash: peak alpha of the pale screen-blended flash. */
const LIGHTNING_FLASH_ALPHA = 0.6;
const LIGHTNING_COLOR = [214, 224, 255];
/** Don't replay a strike that happened longer ago than this (e.g. one that landed while the tab was loading). */
const LIGHTNING_LATE = 0.6;

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
  /** Current eased morning-fog strength 0..1. */
  fog = 0;

  private readonly drops: Drop[] = [];
  private cloudTex: HTMLCanvasElement | null = null;
  private fogTex: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private time = 0;
  private dryness = 1;

  // Lightning: the last slot already handled (see lightningInSlot), the
  // current flash's age and flicker count, and the thunder still on its way.
  private lastStrikeSlot = -1;
  private flashAge = Infinity;
  private flashFlickers: 1 | 2 = 1;
  private thunderIn = -1;
  private thunderVolume = 0;

  /**
   * `rainOverride` is GameState.rainOverride — a "/rain" forcing rain on
   * (true) or off (false). `dayTime` is GameState.dayTime, for the morning
   * fog; leave it out and there's no fog.
   */
  update(dt: number, tick: number, rainOverride: boolean | undefined, camera: Camera, viewW: number, viewH: number, effects: Effects, dayTime?: number): void {
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

    // Desert mornings are dry and clear too. Eased like the rain, so a
    // morning's fog drifts in and thins out rather than popping.
    const seconds = tick / TICK_RATE;
    const fogTarget = dayTime === undefined ? 0 : morningFogAt(seconds, dayTime) * this.dryness;
    this.fog += (fogTarget - this.fog) * (1 - Math.exp(-dt * 0.5));

    this.updateLightning(dt, seconds);
    this.updateDrops(dt, camera, viewW, viewH, effects);
  }

  // ── Lightning ──────────────────────────────────────────────────────────────

  /**
   * Watches for the current slot's strike (see lightningInSlot) to come due,
   * then flashes and queues its thunder. Only while it's pouring — this.rain
   * already fades out over the desert, so there's never lightning there.
   */
  private updateLightning(dt: number, seconds: number): void {
    this.flashAge += dt;

    if (this.thunderIn >= 0) {
      this.thunderIn -= dt;
      if (this.thunderIn < 0) sound.play('thunder', this.thunderVolume);
    }

    const slot = lightningSlotAt(seconds);
    if (slot === this.lastStrikeSlot) return;
    const strike = lightningInSlot(slot);
    if (strike && seconds < strike.time) return; // not due yet — check again next frame
    this.lastStrikeSlot = slot;
    if (!strike || seconds - strike.time > LIGHTNING_LATE || this.rain < LIGHTNING_MIN_RAIN) return;

    this.flashAge = 0;
    this.flashFlickers = strike.flickers;
    // Farther strikes (a longer wait for the thunder) rumble quieter.
    this.thunderIn = strike.thunderDelay;
    this.thunderVolume = 1 - (strike.thunderDelay - 0.5) * 0.3;
  }

  /**
   * The flash's brightness 0..1 at its current age: one or two hard flickers
   * then a short tail, in a few flat steps rather than a smooth curve — it
   * reads as lightning, and it fits the stepped look of everything else.
   * ~0.3s in all.
   */
  private flashLevel(): number {
    const a = this.flashAge;
    if (a < 0.06) return 1;
    if (a < 0.1) return 0.2;
    if (this.flashFlickers === 2) {
      if (a < 0.16) return 0.8;
      if (a < 0.22) return 0.4;
      if (a < 0.3) return 0.15;
      return 0;
    }
    if (a < 0.18) return 0.35;
    if (a < 0.26) return 0.12;
    return 0;
  }

  /**
   * The lightning flash, full screen and screen-space — drawn after the
   * night layer and grade, so for an instant it lifts the darkness right
   * off the scene ('screen' brightens without flattening what's under it
   * the way an opaque white fill would).
   */
  drawLightning(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const level = this.flashLevel();
    if (level <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = rgba(LIGHTNING_COLOR, level * LIGHTNING_FLASH_ALPHA);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ── Morning fog ────────────────────────────────────────────────────────────

  /** A tileable field of big soft fog banks, quantized to a few alpha steps like the cloud texture. */
  private buildFogTexture(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = FOG_CELLS;
    c.height = FOG_CELLS;
    const g = c.getContext('2d')!;
    const img = g.createImageData(FOG_CELLS, FOG_CELLS);

    // Periodic value noise, so the texture wraps seamlessly (same approach
    // as buildCloudTexture, coarser lattices for broader banks).
    const rng = mulberry32(9157);
    const lattices = [3, 6, 12].map((n) => ({ n, v: Array.from({ length: n * n }, () => rng()) }));
    const sample = (lat: { n: number; v: number[] }, u: number, v: number): number => {
      const x = u * lat.n;
      const y = v * lat.n;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = smoothstep(x - x0);
      const fy = smoothstep(y - y0);
      const at = (i: number, j: number): number => lat.v[(((j % lat.n) + lat.n) % lat.n) * lat.n + (((i % lat.n) + lat.n) % lat.n)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
      return a + (b - a) * fy;
    };

    for (let j = 0; j < FOG_CELLS; j++) {
      for (let i = 0; i < FOG_CELLS; i++) {
        const u = i / FOG_CELLS;
        const v = j / FOG_CELLS;
        const f = sample(lattices[0], u, v) * 0.55 + sample(lattices[1], u, v) * 0.3 + sample(lattices[2], u, v) * 0.15;
        const raw = clamp01((f - 0.42) / 0.22);
        // Four steps: clear, wisp, bank, thick bank.
        const a = raw < 0.2 ? 0 : raw < 0.5 ? 0.35 : raw < 0.8 ? 0.7 : 1;
        const k = (j * FOG_CELLS + i) * 4;
        img.data[k] = FOG_COLOR[0];
        img.data[k + 1] = FOG_COLOR[1];
        img.data[k + 2] = FOG_COLOR[2];
        img.data[k + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /**
   * Morning fog: a light, even wash over the view plus big pale banks
   * drifting slowly downwind. World space, before the night layer, so
   * pre-dawn fog sits dim and blue and brightens with the sunrise.
   */
  drawFog(ctx: CanvasRenderingContext2D, camera: Camera, viewW: number, viewH: number): void {
    if (this.fog <= 0.01) return;
    if (!this.fogTex) this.fogTex = this.buildFogTexture();
    const tex = this.fogTex;

    ctx.save();
    ctx.fillStyle = rgba(FOG_COLOR, this.fog * FOG_WASH_ALPHA);
    ctx.fillRect(0, 0, viewW, viewH);

    const ox = (((this.time * WIND_X * FOG_DRIFT) % FOG_TILE) + FOG_TILE) % FOG_TILE;
    const oy = (((this.time * WIND_Y * FOG_DRIFT) % FOG_TILE) + FOG_TILE) % FOG_TILE;
    const startX = Math.floor((camera.x - ox) / FOG_TILE) * FOG_TILE + ox;
    const startY = Math.floor((camera.y - oy) / FOG_TILE) * FOG_TILE + oy;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = this.fog * FOG_BANK_ALPHA;
    for (let ty = startY; ty < camera.y + viewH; ty += FOG_TILE) {
      for (let tx = startX; tx < camera.x + viewW; tx += FOG_TILE) {
        ctx.drawImage(tex, Math.round(tx - camera.x), Math.round(ty - camera.y), FOG_TILE, FOG_TILE);
      }
    }
    ctx.restore();
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
