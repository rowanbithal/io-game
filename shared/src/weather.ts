import { clamp01, smoothstep } from './biome';

// ── Weather ──────────────────────────────────────────────────────────────────
// Rain is a pure function of game time (the server's tick counter), so every
// client computes the same weather independently — the same "both sides
// compute it" trick the biome borders use. The server also evaluates it, to
// know whether it's raining when someone types /rain (see
// GameState.rainOverride, which can force it on or off for a while).

/** Seconds per weather "cell" — rain fronts last roughly this long. */
const WEATHER_PERIOD = 110;
/** Value-noise level above which it starts raining — higher = drier world. */
const RAIN_THRESHOLD = 0.66;
/** Natural rain strength above which it counts as "raining" for /rain's toggle. */
export const RAINING_THRESHOLD = 0.3;
/** How long /rain makes it rain for, seconds. */
export const RAIN_OVERRIDE_SECONDS = 120;
/** Longest /rain will hold off a natural rain front for, seconds — it clears sooner if the front ends first. */
export const RAIN_CANCEL_MAX_SECONDS = 600;

function hash1(i: number): number {
  let h = (i * 374761393) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in 0..1. */
function valueNoise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  return hash1(i) + (hash1(i + 1) - hash1(i)) * smoothstep(f);
}

/** Natural rain strength 0..1 at a moment in game time (seconds = tick / TICK_RATE). */
export function naturalRainAt(seconds: number): number {
  const n = valueNoise(seconds / WEATHER_PERIOD) * 0.8 + valueNoise(seconds / (WEATHER_PERIOD * 0.37) + 17) * 0.2;
  return clamp01((n - RAIN_THRESHOLD) / 0.12);
}

/**
 * Seconds from `seconds` until the natural rain front stops (drops below
 * RAINING_THRESHOLD), capped at `max` — how long cancelling it needs to last.
 */
export function secondsUntilRainStops(seconds: number, max: number): number {
  for (let t = 0; t < max; t += 5) {
    if (naturalRainAt(seconds + t) < RAINING_THRESHOLD) return t;
  }
  return max;
}
