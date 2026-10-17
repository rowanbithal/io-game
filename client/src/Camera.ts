import { MAP_SIZE } from '@io-game/shared';

const GAMEPLAY_ZOOM = 1.6; // >1 zooms in (renders the world larger, shows less of it)

// ── Cinematic follow ─────────────────────────────────────────────────────────
// The camera eases after its target instead of being bolted to it, leads a
// little into the direction of travel, and shakes on impacts. Zoom stays
// fixed at GAMEPLAY_ZOOM — the view never grows or shrinks with what the
// player is doing. All of this is purely
// presentational — gameplay positions and aim math read the same camera
// x/y they always did, so everything stays consistent with what's on screen.

/** How quickly the camera closes the gap to its target, per second (exponential). Higher = tighter. */
const FOLLOW_SHARPNESS = 16;
/** Seconds of current velocity the camera leads by at full build-up — how far ahead of a moving player it sits. */
const LEAD_SECONDS = 0.18;
/**
 * How fast the lead builds toward velocity × LEAD_SECONDS, per second
 * (exponential). Players reach full speed instantly, so a lead tied straight
 * to velocity would just snap out to the same fixed offset on every keypress;
 * building it up over time makes the shift track how much — and how long —
 * the player has actually been moving. A quick tap barely moves the view, a
 * long run builds the full lead, slower ground (desert) gives proportionally
 * less.
 */
const LEAD_BUILD = 1.4;
/** How fast the lead relaxes back when the player slows, stops or turns — quicker than it builds, so stopping doesn't leave the view hanging ahead. */
const LEAD_RELEASE = 3;
/** Cap on velocity lead, world units — keeps a teleport-ish jump in velocity from flinging the view. */
const MAX_VELOCITY_LEAD = 35;
/** A target jump bigger than this (respawn, spectate switch) snaps instead of gliding across the map. */
const SNAP_DISTANCE = 600;

/** Maximum shake offset in screen pixels, reached at trauma = 1. */
const MAX_SHAKE_PX = 7;
/** Trauma lost per second — a full-strength jolt settles in well under a second. */
const TRAUMA_DECAY = 1.8;

export interface CameraFocus {
  /** World position being followed. */
  x: number;
  y: number;
}

export class Camera {
  x = 0; // World-space position of the top-left of the viewport
  y = 0;
  zoom = GAMEPLAY_ZOOM;

  // Smoothed follow state: where the view's center is, separate from x/y so
  // shake can be layered on top without feeding back into the smoothing.
  private cx = 0;
  private cy = 0;
  private hasFocus = false;
  private lastTargetX = 0;
  private lastTargetY = 0;
  private velX = 0;
  private velY = 0;
  private leadX = 0;
  private leadY = 0;

  private trauma = 0;
  private shakeTime = 0;

  /**
   * Snaps straight onto a point at normal gameplay zoom, no smoothing — kept
   * for anything that wants a hard cut.
   */
  follow(playerX: number, playerY: number, vpW: number, vpH: number): void {
    this.zoom = GAMEPLAY_ZOOM;
    this.cx = playerX;
    this.cy = playerY;
    this.lastTargetX = playerX;
    this.lastTargetY = playerY;
    this.velX = 0;
    this.velY = 0;
    this.leadX = 0;
    this.leadY = 0;
    this.hasFocus = true;
    this.place(vpW, vpH, 0, 0);
  }

  /**
   * The eased, leading, shaking follow used every frame in-game and behind
   * the menu. `dt` in seconds.
   */
  track(focus: CameraFocus, dt: number, vpW: number, vpH: number): void {
    if (!this.hasFocus || Math.hypot(focus.x - this.lastTargetX, focus.y - this.lastTargetY) > SNAP_DISTANCE) {
      this.follow(focus.x, focus.y, vpW, vpH);
    }
    if (dt <= 0) {
      this.place(vpW, vpH, 0, 0);
      return;
    }

    // Velocity of the target itself, smoothed — the network interpolation
    // already makes positions smooth, this just takes the edge off.
    const instVX = (focus.x - this.lastTargetX) / dt;
    const instVY = (focus.y - this.lastTargetY) / dt;
    const vk = 1 - Math.exp(-dt * 6);
    this.velX += (instVX - this.velX) * vk;
    this.velY += (instVY - this.velY) * vk;
    this.lastTargetX = focus.x;
    this.lastTargetY = focus.y;

    let wantX = this.velX * LEAD_SECONDS;
    let wantY = this.velY * LEAD_SECONDS;
    const wantLen = Math.hypot(wantX, wantY);
    if (wantLen > MAX_VELOCITY_LEAD) {
      wantX *= MAX_VELOCITY_LEAD / wantLen;
      wantY *= MAX_VELOCITY_LEAD / wantLen;
    }
    // Growing (target further out along the current lead) builds slowly;
    // shrinking or swinging to a new direction releases faster.
    const growing = wantX * this.leadX + wantY * this.leadY >= 0 && Math.hypot(wantX, wantY) > Math.hypot(this.leadX, this.leadY);
    const lk = 1 - Math.exp(-dt * (growing ? LEAD_BUILD : LEAD_RELEASE));
    this.leadX += (wantX - this.leadX) * lk;
    this.leadY += (wantY - this.leadY) * lk;
    const leadX = this.leadX;
    const leadY = this.leadY;

    const k = 1 - Math.exp(-dt * FOLLOW_SHARPNESS);
    this.cx += (focus.x + leadX - this.cx) * k;
    this.cy += (focus.y + leadY - this.cy) * k;

    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    this.shakeTime += dt;

    this.zoom = GAMEPLAY_ZOOM;

    // Shake is the square of trauma, so small knocks stay subtle and only
    // genuinely big hits throw the view around. Two incommensurate sines per
    // axis read as noise without needing a noise function; rounding to whole
    // screen pixels keeps pixel-art edges crisp mid-shake.
    const s = this.trauma * this.trauma * MAX_SHAKE_PX;
    const t = this.shakeTime;
    const shakePxX = Math.round(s * (Math.sin(t * 61) * 0.6 + Math.sin(t * 97 + 1.3) * 0.4));
    const shakePxY = Math.round(s * (Math.sin(t * 71 + 2.1) * 0.6 + Math.sin(t * 89 + 0.4) * 0.4));
    this.place(vpW, vpH, shakePxX / this.zoom, shakePxY / this.zoom);
  }

  /** Adds camera trauma (0..1, clamped) — call on impacts. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }


  private place(vpW: number, vpH: number, shakeX: number, shakeY: number): void {
    const viewW = vpW / this.zoom;
    const viewH = vpH / this.zoom;
    this.x = Math.max(0, Math.min(MAP_SIZE - viewW, this.cx - viewW / 2)) + shakeX;
    this.y = Math.max(0, Math.min(MAP_SIZE - viewH, this.cy - viewH / 2)) + shakeY;
  }

  /**
   * Zooms out and centers so the whole map fits in the viewport at once —
   * used by the /camera full-map view. Whichever axis has slack (the
   * viewport's aspect ratio rarely matches the map's exactly) gets
   * letterboxed evenly rather than cropped, hence the negative x/y that
   * follow() would never produce.
   */
  frameMap(mapSize: number, vpW: number, vpH: number): void {
    this.zoom = Math.min(vpW / mapSize, vpH / mapSize);
    const viewW = vpW / this.zoom;
    const viewH = vpH / this.zoom;
    this.x = (mapSize - viewW) / 2;
    this.y = (mapSize - viewH) / 2;
  }

  /** World → screen (pre-zoom-scale; the renderer applies ctx.scale(zoom)). */
  toScreen(wx: number, wy: number): { sx: number; sy: number } {
    return { sx: wx - this.x, sy: wy - this.y };
  }

  /** Screen (actual canvas pixels) → world (useful for mouse hit-testing). */
  toWorld(sx: number, sy: number): { wx: number; wy: number } {
    return { wx: sx / this.zoom + this.x, wy: sy / this.zoom + this.y };
  }
}
