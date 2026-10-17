// ── Sound ────────────────────────────────────────────────────────────────────
// Every sound is synthesized on the fly with the Web Audio API — no audio
// files to load. One-shot effects (chops, hits, pickups, chimes) are short
// envelopes over noise or oscillators; ambience (rain, waves, wind,
// crickets, birds, fire crackle) is a handful of long-running looped noise
// sources whose gains are steered every frame from what's around the
// player.
//
// Browsers only allow audio after a user gesture, so nothing starts until
// the first click or keypress (see unlock). Muted with N, remembered per
// browser.

const STORAGE_KEY = 'io-game.muted';
const MASTER_VOLUME = 0.55;

export type SfxName =
  | 'chop'
  | 'mine'
  | 'hitMob'
  | 'hurt'
  | 'kill'
  | 'fell'
  | 'swing'
  | 'pickup'
  | 'craft'
  | 'place'
  | 'splash'
  | 'treasure'
  | 'death'
  | 'click'
  | 'stepGrass'
  | 'stepSand'
  | 'stepWater'
  | 'thunder';

/** What the ambience reacts to — fed every frame by the game loop. */
export interface AmbienceInput {
  rain: number; // 0..1
  nightness: number; // 0..1
  /** World distance from the listener to the nearest open sea water. */
  seaDistance: number;
  /** World distance to the nearest campfire, Infinity if none. */
  fireDistance: number;
  inForest: boolean;
  inDesert: boolean;
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = loadMuted();

  // Ambient loop gains, steered by updateAmbience.
  private rainGain: GainNode | null = null;
  private waveGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private waveLfoPhase = 0;
  private cricketTimer = 0;
  private birdTimer = 0;
  private crackleTimer = 0;

  constructor() {
    const unlock = (): void => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // Storage blocked — the setting just won't persist.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(ctx.destination);

    // Two seconds of white noise, shared by every noise-based sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.rainGain = this.loop('highpass', 1200, 0.4);
    this.waveGain = this.loop('lowpass', 500, 0.7);
    this.windGain = this.loop('bandpass', 380, 0.5);
  }

  /** A looped, filtered noise source feeding its own gain (starting silent). */
  private loop(type: BiquadFilterType, freq: number, q: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    return gain;
  }

  // ── Building blocks ────────────────────────────────────────────────────────

  /** A burst of filtered noise with a fast attack and exponential decay. */
  private noiseHit(type: BiquadFilterType, freq: number, q: number, dur: number, vol: number, delay = 0, sweepTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** A single oscillator note, optionally gliding to `toFreq`. */
  private tone(type: OscillatorType, freq: number, dur: number, vol: number, delay = 0, toFreq?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /**
   * A long, low roll of noise — thunder's body. Unlike noiseHit it loops the
   * noise buffer (a roll outlasts the 2s buffer), swells in over a beat
   * rather than snapping on, sweeps its lowpass down as it fades (the
   * rumble gets duller as it dies away), and wobbles in level on a slow
   * LFO so it rolls instead of hissing evenly.
   */
  private rumble(freq: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // Level wobble: an LFO added on top of a fixed gain of 1.
    const wobble = ctx.createGain();
    wobble.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.5 + Math.random() * 3;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(wobble.gain);
    src.connect(filter).connect(gain).connect(wobble).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    lfo.start(t);
    src.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  // ── One-shot effects ───────────────────────────────────────────────────────

  /** Plays a named effect at `volume` (0..1 — callers scale it by distance). */
  play(name: SfxName, volume = 1): void {
    if (!this.ctx || this.muted || volume <= 0.02) return;
    const v = Math.min(1, volume);
    const jitter = 0.92 + Math.random() * 0.16; // no two chops quite alike
    switch (name) {
      case 'chop':
        this.noiseHit('lowpass', 900 * jitter, 1, 0.12, 0.5 * v);
        this.tone('triangle', 140 * jitter, 0.1, 0.35 * v, 0, 90);
        break;
      case 'mine':
        this.noiseHit('bandpass', 3200 * jitter, 6, 0.08, 0.35 * v);
        this.tone('square', 1900 * jitter, 0.07, 0.07 * v, 0, 1500);
        this.tone('triangle', 2600 * jitter, 0.18, 0.08 * v, 0.01);
        break;
      case 'hitMob':
        this.noiseHit('lowpass', 600 * jitter, 1, 0.1, 0.5 * v);
        this.tone('sine', 180 * jitter, 0.12, 0.4 * v, 0, 70);
        break;
      case 'hurt':
        this.tone('sawtooth', 220, 0.2, 0.18 * v, 0, 110);
        this.noiseHit('lowpass', 500, 1, 0.15, 0.4 * v);
        break;
      case 'kill':
        this.tone('square', 330, 0.08, 0.12 * v);
        this.tone('square', 440, 0.08, 0.12 * v, 0.07);
        this.tone('square', 660, 0.14, 0.12 * v, 0.14);
        break;
      case 'fell':
        // A tree going over: a long creak, then the crash.
        this.tone('sawtooth', 90, 0.45, 0.08 * v, 0, 60);
        this.noiseHit('lowpass', 700, 0.8, 0.6, 0.6 * v, 0.3, 120);
        break;
      case 'swing':
        this.noiseHit('bandpass', 1400 * jitter, 1.5, 0.14, 0.12 * v, 0, 500);
        break;
      case 'pickup':
        this.tone('sine', 880 * jitter, 0.07, 0.12 * v, 0, 1320);
        break;
      case 'craft':
        this.tone('triangle', 523, 0.15, 0.2 * v);
        this.tone('triangle', 784, 0.25, 0.2 * v, 0.1);
        break;
      case 'place':
        this.noiseHit('lowpass', 400, 1, 0.15, 0.6 * v);
        this.tone('sine', 110, 0.15, 0.35 * v, 0, 70);
        break;
      case 'splash':
        this.noiseHit('lowpass', 2400, 0.7, 0.45, 0.5 * v, 0, 300);
        break;
      case 'treasure':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, 0.25, 0.18 * v, i * 0.09));
        this.tone('sine', 2093, 0.5, 0.06 * v, 0.36);
        break;
      case 'death':
        this.tone('triangle', 392, 0.35, 0.25 * v, 0, 330);
        this.tone('triangle', 330, 0.35, 0.25 * v, 0.3, 262);
        this.tone('triangle', 262, 0.9, 0.25 * v, 0.6, 130);
        break;
      case 'click':
        this.tone('square', 1200, 0.03, 0.05 * v);
        break;
      case 'stepGrass':
        this.noiseHit('bandpass', 1800 * jitter, 0.8, 0.05, 0.08 * v);
        break;
      case 'stepSand':
        this.noiseHit('highpass', 2600 * jitter, 0.7, 0.07, 0.07 * v);
        break;
      case 'stepWater':
        this.noiseHit('lowpass', 1300 * jitter, 1, 0.14, 0.14 * v, 0, 500);
        break;
      case 'thunder':
        // A dull crack up front, then overlapping low rolls that tail off
        // over a few seconds — each starting a little later and lower, the
        // echo of the strike coming back off distant ground.
        this.noiseHit('lowpass', 1400 * jitter, 0.6, 0.4, 0.3 * v, 0, 250);
        this.rumble(170 * jitter, 3.4, 0.8 * v, 0.04);
        this.rumble(95 * jitter, 2.8, 0.7 * v, 0.35);
        this.rumble(240 * jitter, 1.6, 0.3 * v, 0.9);
        break;
    }
  }

  // ── Ambience ───────────────────────────────────────────────────────────────

  updateAmbience(dt: number, a: AmbienceInput): void {
    const ctx = this.ctx;
    if (!ctx || !this.rainGain || !this.waveGain || !this.windGain) return;
    const now = ctx.currentTime;
    const ease = 0.4; // seconds to glide to each new level

    this.rainGain.gain.setTargetAtTime(a.rain * 0.22, now, ease);

    // Waves swell and fall on a slow cycle, louder the closer the sea.
    this.waveLfoPhase += dt * 0.35;
    const seaNear = Math.max(0, 1 - a.seaDistance / 700);
    const swell = 0.55 + 0.45 * Math.sin(this.waveLfoPhase * Math.PI * 2);
    this.waveGain.gain.setTargetAtTime(seaNear * swell * 0.3, now, ease);

    // Wind: always a faint bed, stronger in the open desert and the rain.
    const wind = 0.02 + (a.inDesert ? 0.06 : 0) + a.rain * 0.04;
    this.windGain.gain.setTargetAtTime(wind, now, 1.5);

    if (this.muted) return;

    // Crickets at night (not in the rain or the desert).
    const crickets = a.nightness * (1 - a.rain) * (a.inDesert ? 0 : 1);
    this.cricketTimer -= dt;
    if (crickets > 0.2 && this.cricketTimer <= 0) {
      this.cricketTimer = 0.25 + Math.random() * 0.9;
      const f = 4200 + Math.random() * 600;
      for (let i = 0; i < 3; i++) this.tone('sine', f, 0.03, 0.02 * crickets, i * 0.05);
    }

    // Birds by day — more of them in the forest.
    const birds = (1 - a.nightness) * (1 - a.rain) * (a.inDesert ? 0.2 : 1);
    this.birdTimer -= dt;
    if (birds > 0.3 && this.birdTimer <= 0) {
      this.birdTimer = (a.inForest ? 1.5 : 3.5) + Math.random() * 4;
      const base = 1800 + Math.random() * 1400;
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) {
        const f = base * (0.85 + Math.random() * 0.4);
        this.tone('sine', f, 0.08, 0.03 * birds, i * 0.11, f * (Math.random() < 0.5 ? 1.3 : 0.8));
      }
    }

    // Campfire crackle, by distance.
    const fire = Math.max(0, 1 - a.fireDistance / 260);
    this.crackleTimer -= dt;
    if (fire > 0.05 && this.crackleTimer <= 0) {
      this.crackleTimer = 0.04 + Math.random() * 0.25;
      this.noiseHit('highpass', 2500 + Math.random() * 3000, 1, 0.02 + Math.random() * 0.03, 0.12 * fire);
    }
  }
}

export const sound = new SoundEngine();
