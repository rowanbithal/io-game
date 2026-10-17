// Graphics quality: 'high' runs every cinematic effect, 'low' drops the
// expensive ones (bloom, cloud shadows, water glints, most ambient
// particles) so the game stays smooth on cheap laptops. Toggled with G and
// remembered per browser; also drops to 'low' on its own if the frame rate
// sags badly while on 'high' (see autoTune).

export type Quality = 'high' | 'low';

const STORAGE_KEY = 'io-game.quality';

function load(): Quality {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'low' ? 'low' : 'high';
  } catch {
    return 'high';
  }
}

let current: Quality = load();
// Set once the player picks a quality themselves — after that, autoTune
// never overrides them.
let chosenByPlayer = false;

export function quality(): Quality {
  return current;
}

export function isHigh(): boolean {
  return current === 'high';
}

export function setQuality(q: Quality, byPlayer = true): void {
  current = q;
  // An automatic drop is for this session only — one slow patch shouldn't
  // permanently downgrade someone's game.
  if (!byPlayer) return;
  chosenByPlayer = true;
  try {
    localStorage.setItem(STORAGE_KEY, q);
  } catch {
    // Storage blocked — the setting just won't persist.
  }
}

export function toggleQuality(): Quality {
  setQuality(current === 'high' ? 'low' : 'high');
  return current;
}

// Rolling average of frame time, used to back off automatically.
let avgFrameMs = 16;
let slowFor = 0;
const SLOW_FRAME_MS = 26; // ~38fps
const SLOW_SECONDS = 4;

/**
 * Feed every frame's dt (seconds). Returns true the one frame it decides to
 * drop to 'low', so the caller can tell the player why things got simpler.
 */
export function autoTune(dt: number): boolean {
  if (dt <= 0 || dt > 0.25) return false; // tab was backgrounded — not a real frame
  avgFrameMs += (dt * 1000 - avgFrameMs) * 0.05;
  if (current !== 'high' || chosenByPlayer) return false;
  slowFor = avgFrameMs > SLOW_FRAME_MS ? slowFor + dt : 0;
  if (slowFor < SLOW_SECONDS) return false;
  setQuality('low', false);
  return true;
}
