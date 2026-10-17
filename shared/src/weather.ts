import { clamp01, smoothstep } from './biome';
import { DAY_DURATION } from './constants';
import { sunHeightAt } from './daycycle';

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

// ── Morning fog ──────────────────────────────────────────────────────────────
// Some mornings — not all — a haze rolls in shortly before dawn and burns off
// as the sun climbs. Whether a given morning is foggy is a pure function of
// which day it is, so every client agrees, same as the rain. Purely visual:
// the server never needs it.

/** Fraction of mornings that get fog. */
const FOG_CHANCE = 0.4;
/** Sun height (see sunHeightAt) the fog starts rolling in at, and is fully in by. */
const FOG_ROLL_IN_FROM = -0.45;
const FOG_ROLL_IN_TO = -0.15;
/** Sun height the fog starts burning off at, and is gone by. */
const FOG_BURN_OFF_FROM = 0.15;
const FOG_BURN_OFF_TO = 0.5;

/**
 * Which day it is: the number of noons since the server started. Counted
 * from game time *and* dayTime together rather than game time alone —
 * dayTime is integrated from real frame deltas on the server (and sped up
 * by dev speed-ups), so it can drift away from tick / TICK_RATE over a
 * long session. Subtracting dayTime and rounding snaps to the noon that
 * dayTime itself last passed, so the index only ever changes as dayTime
 * wraps through noon, never in the middle of a morning.
 */
export function dayIndexAt(seconds: number, dayTime: number): number {
  return Math.round(seconds / DAY_DURATION - dayTime);
}

/** How thick day `dayIndex`'s morning fog gets: 0 (a clear morning) or 0.55..1. */
export function fogAt(dayIndex: number): number {
  if (hash1(dayIndex * 7 + 90001) >= FOG_CHANCE) return 0;
  return 0.55 + 0.45 * hash1(dayIndex * 13 + 4441);
}

/**
 * Morning fog strength 0..1 right now: the day's fog (fogAt) shaped by the
 * sun — rolling in as dawn approaches, thickest around sunrise, burning
 * off as the sun climbs. Zero on the way down (dusk is never foggy).
 */
export function morningFogAt(seconds: number, dayTime: number): number {
  const t = ((dayTime % 1) + 1) % 1;
  if (t < 0.5) return 0; // noon → midnight: the sun is setting, not rising
  const sun = sunHeightAt(t);
  const rollIn = smoothstep(clamp01((sun - FOG_ROLL_IN_FROM) / (FOG_ROLL_IN_TO - FOG_ROLL_IN_FROM)));
  const burnOff = 1 - smoothstep(clamp01((sun - FOG_BURN_OFF_FROM) / (FOG_BURN_OFF_TO - FOG_BURN_OFF_FROM)));
  if (rollIn * burnOff <= 0) return 0;
  return fogAt(dayIndexAt(seconds, t)) * rollIn * burnOff;
}

// ── Lightning ────────────────────────────────────────────────────────────────
// Thunderstorms are just heavy rain with lightning in it. Game time is cut
// into LIGHTNING_SLOT-second slots; each slot either has one strike, at a
// hashed moment inside it, or none. That's a pure function of the slot
// number, so every client sees a strike on the same tick. The caller gates
// it on how hard it's raining (see LIGHTNING_MIN_RAIN) — no lightning
// without a downpour, and so none over the desert either.

/** Seconds per lightning slot — at most one strike each. */
export const LIGHTNING_SLOT = 6;
/** Chance a slot has a strike in it. */
const LIGHTNING_CHANCE = 0.45;
/** Rain strength (0..1) at or above which strikes happen. */
export const LIGHTNING_MIN_RAIN = 0.85;

export interface LightningStrike {
  /** Game time (seconds) of the flash. */
  time: number;
  /** How many times the flash flickers, 1 or 2. */
  flickers: 1 | 2;
  /** Seconds between the flash and its thunder, 0.5..2 — how far off it struck. */
  thunderDelay: number;
}

export function lightningSlotAt(seconds: number): number {
  return Math.floor(seconds / LIGHTNING_SLOT);
}

/** The strike in slot `slot`, or null if that slot is quiet. */
export function lightningInSlot(slot: number): LightningStrike | null {
  if (hash1(slot * 5 + 70001) >= LIGHTNING_CHANCE) return null;
  return {
    // Kept off the slot's last stretch so two strikes never land back to back.
    time: (slot + hash1(slot * 5 + 70002) * 0.8) * LIGHTNING_SLOT,
    flickers: hash1(slot * 5 + 70003) < 0.6 ? 2 : 1,
    thunderDelay: 0.5 + hash1(slot * 5 + 70004) * 1.5,
  };
}
