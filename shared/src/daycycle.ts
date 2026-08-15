import { DAY_FRACTION } from './constants';

/**
 * Warps linear dayTime (0..1, 0 = noon, 0.5 = midnight, wraps at 1) into the
 * phase fed to cos(2π·phase) for sun height/angle, so the sun spends
 * DAY_FRACTION of the cycle above the horizon instead of a fixed 50/50
 * split — day runs longer (or shorter) than night while noon/midnight stay
 * fixed at dayTime 0/0.5 and the horizon crossings stay continuous.
 */
export function dayPhase(dayTime: number): number {
  const half = DAY_FRACTION / 2;
  const t = ((dayTime % 1) + 1) % 1;

  if (t < half) {
    // Noon -> dusk start
    return (t / half) * 0.25;
  }
  if (t < 1 - half) {
    // Dusk -> midnight -> dawn
    return 0.25 + ((t - half) / (1 - DAY_FRACTION)) * 0.5;
  }
  // Dawn end -> noon
  return 0.75 + ((t - (1 - half)) / half) * 0.25;
}

/** Sun height: 1 = noon (overhead), 0 = horizon, -1 = midnight. */
export function sunHeightAt(dayTime: number): number {
  return Math.cos(dayPhase(dayTime) * Math.PI * 2);
}

/** True while the sun is above the horizon. */
export function isDaytime(dayTime: number): boolean {
  return sunHeightAt(dayTime) > 0;
}
