import { DARK_FOREST_BAND } from './constants';

/**
 * How far the dark forest's edge wanders above/below DARK_FOREST_BAND at a
 * given world x — three summed sine waves at different wavelengths and
 * phases, the same "sum of sines" trick lakeHarmonics uses to give a lake's
 * coastline real coves and bays instead of a bumpy circle. Summing a few
 * mismatched frequencies is what keeps a 4000-unit-wide border from reading
 * as one obviously-periodic wave.
 *
 * Pure function of x, so server and client compute the identical border
 * independently — nothing about the meander needs to cross the network.
 */
const WAVE_A = 95;
const WAVE_B = 45;
const WAVE_C = 20;

/** Furthest the border can push above/below DARK_FOREST_BAND — the sum of the three waves' amplitudes. */
export const DARK_FOREST_EDGE_AMPLITUDE = WAVE_A + WAVE_B + WAVE_C;

export function darkForestEdgeOffset(worldX: number): number {
  const a = Math.sin((worldX / 950) * Math.PI * 2 + 0.6) * WAVE_A;
  const b = Math.sin((worldX / 370) * Math.PI * 2 + 2.3) * WAVE_B;
  const c = Math.sin((worldX / 140) * Math.PI * 2 + 4.8) * WAVE_C;
  return a + b + c;
}

/** The dark forest's actual boundary y at a given world x — DARK_FOREST_BAND is just its average. */
export function darkForestBandAt(worldX: number): number {
  return DARK_FOREST_BAND + darkForestEdgeOffset(worldX);
}
