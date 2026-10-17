import {
  GameState,
  PlayerState,
  ResourceType,
  MAX_AIR,
  CAMPFIRE_BURNOUT_FADE,
  isInDesert,
  seaCoastAt,
  seaSandStartAt,
  forestFactor,
  clamp01,
  smoothstep,
} from '@io-game/shared';
import { Camera } from '../Camera';
import { isHigh } from './quality';
import { sound } from './Sound';

// ── Impact & ambient effects ─────────────────────────────────────────────────
// Everything here is client-only presentation, derived by diffing the
// server's snapshots: hp going down means something was hit, an id vanishing
// at low hp means it was destroyed, a player's air starting to drain means
// they just stepped into water. Nothing here is sent anywhere or affects
// gameplay — two clients can (and will) see slightly different chips fly.

/** Kinds of hittable thing, for picking particle colors/amounts. */
type Target = ResourceType | 'spider' | 'fox' | 'beetle' | 'player';

interface Particle {
  x: number;
  y: number;
  /** Fake height above the ground — draws offset upward by this, so debris arcs up and lands. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Pulls vz down each second; 0 for things that float (embers, pollen, leaves). */
  gravity: number;
  /** Fraction of horizontal velocity kept per second (0..1). */
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** 'lit' particles draw additively after the night tint; 'ring' are expanding ripples. */
  kind: 'debris' | 'puff' | 'lit' | 'ring' | 'leaf';
  /** Per-particle phase, for flutter/twinkle. */
  phase: number;
}

interface DamageNumber {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  drift: number;
}

interface Tracked {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  type: Target;
}

const MAX_PARTICLES_HIGH = 900;
const MAX_PARTICLES_LOW = 240;

/** Seconds a hit entity flashes white for. */
const FLASH_SECONDS = 0.12;
/** Seconds a hit entity freezes in place for (hit-stop). */
const HITSTOP_SECONDS = 0.06;
/**
 * Smallest health drop on a *player* that counts as an impact. Survival
 * drains (starving, freezing, drowning) also take health every tick, in
 * small steps; real hits (bites, swords) are all well above this.
 */
const PLAYER_HIT_MIN = 5;

/** Particle colors per hittable type: [hit colors, extra burst colors on destroy]. */
const HIT_COLORS: Record<Target, string[]> = {
  tree: ['#8b5a2b', '#a8723c', '#6e4520'],
  rock: ['#8d8f94', '#6f7176', '#b3b5b9'],
  gold: ['#e8c547', '#b8952a', '#8d8f94'],
  diamond: ['#7fe3f0', '#c8f6fb', '#6f7176'],
  berry: ['#c0392b', '#2f6b2d', '#4c8f3e'],
  purple_berry: ['#8e44ad', '#2f6b2d', '#4c8f3e'],
  mushroom: ['#d9c7a7', '#b5523f', '#efe4cf'],
  wheat: ['#d8b862', '#b89740', '#efd88f'],
  spider: ['#3b2a4a', '#5b3a6e', '#1e1626'],
  fox: ['#8e1f1f', '#b5532a', '#f0d9b5'],
  beetle: ['#a3a83a', '#5a6b1f', '#2d2a1f'],
  player: ['#a82424', '#7a1414', '#c94a4a'],
};

/** Leaves knocked loose by chopping a tree / bursting out when it falls. */
const LEAF_COLORS = ['#3f7d3a', '#5a9e4b', '#2e5f2b', '#7ab55c'];
/** Ambient leaves drifting over the plains — a few autumn ones mixed in so they read as leaves, not grass. */
const AMBIENT_LEAF_COLORS = ['#5a9e4b', '#7ab55c', '#c9a13b', '#c46a2c'];
const SAND_DUST = ['#e6cf98', '#d8bd80', '#efdcae'];
const SPLASH_COLORS = ['#d8f0ff', '#a6d8f0', '#ffffff'];
const EMBER_COLORS = ['#ffb347', '#ff8c2a', '#ffd27a'];
const SMOKE_COLORS = ['#6b6b6b', '#8a8a8a', '#565656'];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export class Effects {
  private readonly particles: Particle[] = [];
  private readonly numbers: DamageNumber[] = [];

  /** id → seconds of white flash remaining. */
  private readonly flashes = new Map<string, number>();
  /** id → frozen draw position and seconds remaining (hit-stop). */
  private readonly frozen = new Map<string, { x: number; y: number; t: number }>();

  // Last raw snapshot's view of every hittable thing, for diffing.
  private tracked = new Map<string, Tracked>();
  private lastMe: PlayerState | null = null;
  private lastAir = new Map<string, number>();

  /** Where the local player's most recent hit landed — the origin for harvest pickup arcs. */
  lastHitWorld: { x: number; y: number; at: number } | null = null;

  /** 0..1 red pulse at the screen edges when the local player is hurt — read by the vignette. */
  hurt = 0;

  // Ambient spawn accumulators.
  private readonly stepTimers = new Map<string, { t: number; x: number; y: number }>();
  private readonly emberTimers = new Map<string, number>();
  private leafTimer = 0;
  private myStepTimer = 0;
  private pollenTimer = 0;

  constructor(private readonly camera: Camera) {}

  /** 0..1 loudness for a sound at (x, y) — full near the middle of the view, silent ~650 units off. */
  private earshot(x: number, y: number): number {
    const { camera } = this;
    const cx = camera.x + window.innerWidth / camera.zoom / 2;
    const cy = camera.y + window.innerHeight / camera.zoom / 2;
    return clamp01(1 - Math.hypot(x - cx, y - cy) / 650);
  }

  // ── Event detection (raw snapshots, once per server tick) ─────────────────

  /**
   * Diff this server snapshot against the last one to find hits, kills and
   * water entries. Uses raw snapshots rather than the interpolated per-frame
   * state so a 10-hp hit registers as one 10-hp event instead of being
   * smeared across several frames of lerp.
   */
  ingest(state: GameState): void {
    const next = new Map<string, Tracked>();
    for (const r of state.resources) next.set(r.id, { x: r.x, y: r.y, hp: r.hp, maxHp: r.maxHp, type: r.type });
    for (const s of state.spiders) next.set(s.id, { x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, type: 'spider' });
    for (const f of state.foxes) next.set(f.id, { x: f.x, y: f.y, hp: f.hp, maxHp: f.maxHp, type: 'fox' });
    for (const b of state.beetles) next.set(b.id, { x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, type: 'beetle' });
    for (const p of state.players) {
      if (!p.isMe) next.set(p.id, { x: p.x, y: p.y, hp: p.health, maxHp: p.maxHealth, type: 'player' });
    }

    const me = state.players.find((p) => p.isMe) ?? null;
    const players = state.players;

    for (const [id, now] of next) {
      const before = this.tracked.get(id);
      if (!before) continue;
      const dmg = before.hp - now.hp;
      if (dmg < (now.type === 'player' ? PLAYER_HIT_MIN : 1)) continue;
      this.onHit(id, now, dmg, Effects.nearest(players, now.x, now.y, id), me);
    }

    for (const [id, before] of this.tracked) {
      if (next.has(id)) continue;
      // Gone. Only counts as destroyed if it was already beaten up and
      // someone was right next to it — otherwise it just left view, or a
      // spider burned off at dawn.
      if (before.type === 'player') continue;
      if (before.hp > before.maxHp * 0.5) continue;
      const striker = Effects.nearest(players, before.x, before.y, id);
      if (!striker || Math.hypot(striker.x - before.x, striker.y - before.y) > 160) continue;
      this.onDestroyed(before, striker, me);
    }

    if (me && this.lastMe && this.lastMe.id === me.id) {
      // A fresh swing resets the harvest cooldown to full.
      if (me.harvestCooldown > this.lastMe.harvestCooldown + 0.2) sound.play('swing', 0.8);
      const dmg = this.lastMe.health - me.health;
      if (dmg >= PLAYER_HIT_MIN) {
        this.camera.shake(Math.min(0.65, 0.18 + dmg / 30));
        this.hurt = Math.min(1, this.hurt + 0.3 + dmg / 50);
        sound.play('hurt');
        this.flash(me.id);
        this.burst(me.x, me.y, HIT_COLORS.player, 6, 40, 'puff');
        this.addNumber(me.x, me.y - 24, `-${Math.round(dmg)}`, '#ff6b6b');
      }
    }
    this.lastMe = me;

    // Splash on stepping into water: air only drains while wading (see
    // ServerPlayer's AIR_DECAY_RATE), so full → not-full is the moment of entry.
    for (const p of players) {
      const prevAir = this.lastAir.get(p.id);
      if (prevAir !== undefined && prevAir >= MAX_AIR - 0.01 && p.air < MAX_AIR - 0.01) {
        this.splash(p.x, p.y, 1);
        sound.play('splash', this.earshot(p.x, p.y));
      }
      this.lastAir.set(p.id, p.air);
    }
    if (this.lastAir.size > players.length * 2 + 16) {
      const live = new Set(players.map((p) => p.id));
      for (const id of this.lastAir.keys()) if (!live.has(id)) this.lastAir.delete(id);
    }

    this.tracked = next;
  }

  private onHit(id: string, t: Tracked, dmg: number, striker: PlayerState | null, me: PlayerState | null): void {
    const mine = !!striker && !!me && striker.id === me.id;
    const isResource = t.type !== 'spider' && t.type !== 'fox' && t.type !== 'beetle' && t.type !== 'player';

    // Debris flies away from whoever struck it.
    let dirX = 0;
    let dirY = 0;
    if (striker) {
      const d = Math.hypot(t.x - striker.x, t.y - striker.y) || 1;
      dirX = (t.x - striker.x) / d;
      dirY = (t.y - striker.y) / d;
    }
    // The impact point: the near side of the target, toward the striker.
    const ix = t.x - dirX * 14;
    const iy = t.y - dirY * 14;

    const vol = mine ? 1 : this.earshot(t.x, t.y) * 0.7;
    if (t.type === 'tree') sound.play('chop', vol);
    else if (t.type === 'rock' || t.type === 'gold' || t.type === 'diamond') sound.play('mine', vol);
    else if (isResource) sound.play('stepGrass', vol * 3);
    else sound.play('hitMob', vol);

    if (isResource) {
      const n = t.type === 'tree' || t.type === 'rock' || t.type === 'gold' || t.type === 'diamond' ? 7 : 4;
      this.burst(ix, iy, HIT_COLORS[t.type], n, 60, 'debris', dirX, dirY);
      if (t.type === 'tree') this.burst(t.x, t.y, LEAF_COLORS, 3, 30, 'leaf', dirX, dirY);
      if (t.type === 'rock' || t.type === 'gold' || t.type === 'diamond') this.burst(ix, iy, SMOKE_COLORS, 2, 15, 'puff');
    } else {
      this.flash(id);
      this.freeze(id, t.x, t.y);
      this.burst(ix, iy, HIT_COLORS[t.type], 6, 55, 'puff', dirX, dirY);
      this.addNumber(t.x, t.y - 22, `${Math.round(dmg)}`, mine ? '#ffffff' : '#ffd2a0');
    }

    if (mine) {
      this.camera.shake(isResource ? 0.14 : 0.24);
      this.lastHitWorld = { x: t.x, y: t.y, at: performance.now() };
    }
  }

  private onDestroyed(t: Tracked, striker: PlayerState, me: PlayerState | null): void {
    const mine = !!me && striker.id === me.id;
    const colors = HIT_COLORS[t.type];
    const vol = mine ? 1 : this.earshot(t.x, t.y) * 0.7;
    if (t.type === 'tree') sound.play('fell', vol);
    else if (t.type === 'spider' || t.type === 'fox' || t.type === 'beetle') sound.play('kill', vol);
    else if (t.type === 'rock' || t.type === 'gold' || t.type === 'diamond') sound.play('mine', vol);
    if (t.type === 'tree') {
      this.burst(t.x, t.y, LEAF_COLORS, 22, 90, 'leaf');
      this.burst(t.x, t.y, colors, 12, 80, 'debris');
      if (mine) this.camera.shake(0.4);
    } else if (t.type === 'rock' || t.type === 'gold' || t.type === 'diamond') {
      this.burst(t.x, t.y, colors, 16, 95, 'debris');
      this.burst(t.x, t.y, SMOKE_COLORS, 8, 35, 'puff');
      if (mine) this.camera.shake(0.36);
    } else if (t.type === 'spider' || t.type === 'fox' || t.type === 'beetle') {
      this.burst(t.x, t.y, colors, 14, 80, 'puff');
      this.burst(t.x, t.y, SMOKE_COLORS, 6, 30, 'puff');
      if (mine) this.camera.shake(0.32);
    } else {
      this.burst(t.x, t.y, colors, 8, 50, 'debris');
    }
    if (mine) this.lastHitWorld = { x: t.x, y: t.y, at: performance.now() };
  }

  private static nearest(players: PlayerState[], x: number, y: number, excludeId: string): PlayerState | null {
    let best: PlayerState | null = null;
    let bestDist = Infinity;
    for (const p of players) {
      if (p.id === excludeId) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  // ── Per-frame ambient update ───────────────────────────────────────────────

  update(dt: number, state: GameState, viewW: number, viewH: number): void {
    if (dt <= 0) return;

    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    for (const [id, t] of this.flashes) {
      if (t - dt <= 0) this.flashes.delete(id);
      else this.flashes.set(id, t - dt);
    }
    for (const [id, f] of this.frozen) {
      f.t -= dt;
      if (f.t <= 0) this.frozen.delete(id);
    }

    this.spawnFootsteps(state.players, dt);
    this.spawnEmbers(state, dt);
    this.spawnAmbient(dt, viewW, viewH, state.isDay);

    // Integrate particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      const keep = Math.pow(p.drag, dt);
      p.vx *= keep;
      p.vy *= keep;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity > 0) {
        p.vz -= p.gravity * dt;
        p.z += p.vz * dt;
        if (p.z <= 0) {
          // Landed — a small bounce, then it lies there and fades.
          p.z = 0;
          p.vz = Math.abs(p.vz) > 40 ? -p.vz * 0.3 : 0;
          p.vx *= 0.5;
          p.vy *= 0.5;
        }
      } else {
        p.z += p.vz * dt;
      }
      if (p.kind === 'leaf') {
        // Flutter: a sideways sway on top of the drift.
        p.x += Math.sin(p.phase + p.life * 4) * 10 * dt;
      }
    }

    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      if (n.life <= 0) this.numbers.splice(i, 1);
      else n.y -= n.drift * dt;
    }
  }

  private spawnFootsteps(players: PlayerState[], dt: number): void {
    for (const p of players) {
      let st = this.stepTimers.get(p.id);
      if (!st) {
        st = { t: 0, x: p.x, y: p.y };
        this.stepTimers.set(p.id, st);
        continue;
      }
      const speed = Math.hypot(p.x - st.x, p.y - st.y) / dt;
      const dirX = p.x - st.x;
      const dirY = p.y - st.y;
      st.x = p.x;
      st.y = p.y;
      if (speed < 30) continue;

      const inWater = p.air < MAX_AIR - 0.01;
      const onSand = isInDesert(p.x, p.y) || (p.y >= seaSandStartAt(p.x) && p.y < seaCoastAt(p.x));

      // The local player's own footsteps, on their own steady cadence.
      if (p.isMe) {
        this.myStepTimer -= dt;
        if (this.myStepTimer <= 0) {
          this.myStepTimer = inWater ? 0.42 : 0.3;
          sound.play(inWater ? 'stepWater' : onSand ? 'stepSand' : 'stepGrass', 0.9);
        }
      }

      st.t -= dt;
      if (st.t > 0) continue;
      if (inWater) {
        // Wading: a wake ring trails behind instead of dust.
        st.t = 0.3;
        this.ring(p.x, p.y, 18, 0.9, 'rgba(220,240,255,0.55)');
        continue;
      }
      if (!onSand) continue;
      st.t = 0.16;
      const d = Math.hypot(dirX, dirY) || 1;
      this.burst(p.x - (dirX / d) * 8, p.y - (dirY / d) * 8 + 6, SAND_DUST, isHigh() ? 3 : 1, 18, 'puff', -dirX / d, -dirY / d);
    }
    if (this.stepTimers.size > players.length + 16) {
      const live = new Set(players.map((p) => p.id));
      for (const id of this.stepTimers.keys()) if (!live.has(id)) this.stepTimers.delete(id);
    }
  }

  private spawnEmbers(state: GameState, dt: number): void {
    const rate = isHigh() ? 9 : 3;
    for (const s of state.structures) {
      if (s.type !== 'campfire') continue;
      const burn = s.life === null ? 1 : smoothstep(clamp01(s.life / CAMPFIRE_BURNOUT_FADE));
      let acc = (this.emberTimers.get(s.id) ?? 0) + dt * rate * burn;
      while (acc >= 1) {
        acc -= 1;
        this.push({
          x: s.x + rand(-7, 7),
          y: s.y + rand(-5, 5),
          z: rand(2, 8),
          vx: rand(-6, 6),
          vy: rand(-4, 2),
          vz: rand(18, 34),
          gravity: 0,
          drag: 0.6,
          life: rand(1.1, 2.2),
          maxLife: 2.2,
          size: Math.random() < 0.25 ? 2.5 : 1.6,
          color: pick(EMBER_COLORS),
          kind: 'lit',
          phase: Math.random() * 10,
        });
      }
      this.emberTimers.set(s.id, acc);
    }
    if (this.emberTimers.size > state.structures.length + 8) {
      const live = new Set(state.structures.map((s) => s.id));
      for (const id of this.emberTimers.keys()) if (!live.has(id)) this.emberTimers.delete(id);
    }
  }

  /** Drifting leaves and pollen over the open plains. */
  private spawnAmbient(dt: number, viewW: number, viewH: number, isDay: boolean): void {
    const { camera } = this;
    const cx = camera.x + viewW / 2;
    const cy = camera.y + viewH / 2;
    const plains = !isInDesert(cx, cy) && forestFactor(cx, cy) < 0.35 && cy < seaSandStartAt(cx) - 40;
    if (!plains) return;

    const high = isHigh();
    this.leafTimer += dt * (high ? 1.6 : 0.5);
    while (this.leafTimer >= 1) {
      this.leafTimer -= 1;
      this.push({
        x: camera.x + Math.random() * viewW,
        y: camera.y + Math.random() * viewH,
        z: rand(30, 60),
        vx: rand(16, 30),
        vy: rand(4, 12),
        vz: rand(-6, -3),
        gravity: 0,
        drag: 1,
        life: rand(5, 8),
        maxLife: 8,
        size: 2.5,
        color: pick(AMBIENT_LEAF_COLORS),
        kind: 'leaf',
        phase: Math.random() * 10,
      });
    }

    if (!isDay || !high) return;
    this.pollenTimer += dt * 5;
    while (this.pollenTimer >= 1) {
      this.pollenTimer -= 1;
      this.push({
        x: camera.x + Math.random() * viewW,
        y: camera.y + Math.random() * viewH,
        z: rand(10, 40),
        vx: rand(4, 12),
        vy: rand(-3, 3),
        vz: rand(-1, 1),
        gravity: 0,
        drag: 1,
        life: rand(4, 7),
        maxLife: 7,
        size: 1.3,
        color: '#fff6c8',
        kind: 'lit',
        phase: Math.random() * 10,
      });
    }
  }

  // ── Spawning helpers ───────────────────────────────────────────────────────

  private push(p: Particle): void {
    const cap = isHigh() ? MAX_PARTICLES_HIGH : MAX_PARTICLES_LOW;
    if (this.particles.length >= cap) {
      // Recycle the oldest-ish slot rather than refusing — impacts should
      // always show, ambient clutter is what gets displaced.
      this.particles[Math.floor(Math.random() * this.particles.length)] = p;
      return;
    }
    this.particles.push(p);
  }

  /**
   * A spray of `count` particles. With a direction, they fan out within
   * ~70° of it; without one, they spread evenly.
   */
  burst(x: number, y: number, colors: string[], count: number, speed: number, kind: Particle['kind'], dirX = 0, dirY = 0): void {
    if (!isHigh()) count = Math.ceil(count / 2);
    const aimed = dirX !== 0 || dirY !== 0;
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const a = aimed ? base + rand(-1.2, 1.2) : Math.random() * Math.PI * 2;
      const v = speed * rand(0.4, 1);
      const debris = kind === 'debris';
      const leaf = kind === 'leaf';
      this.push({
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        z: debris ? rand(4, 10) : leaf ? rand(14, 30) : rand(0, 6),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: debris ? rand(60, 120) : leaf ? rand(-10, -4) : rand(5, 15),
        gravity: debris ? 320 : 0,
        drag: debris ? 0.3 : leaf ? 0.4 : 0.05,
        life: debris ? rand(0.7, 1.2) : leaf ? rand(1.4, 2.4) : rand(0.35, 0.6),
        maxLife: debris ? 1.2 : leaf ? 2.4 : 0.6,
        size: debris ? (Math.random() < 0.3 ? 3.5 : 2.5) : leaf ? 2.5 : rand(3, 5.5),
        color: pick(colors),
        kind,
        phase: Math.random() * 10,
      });
    }
  }

  /** An expanding ripple ring on the ground (water entry, wading wake, raindrop). */
  ring(x: number, y: number, radius: number, life: number, color: string): void {
    this.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 1, life, maxLife: life, size: radius, color, kind: 'ring', phase: 0 });
  }

  splash(x: number, y: number, strength: number): void {
    this.ring(x, y, 26 * strength, 0.9, 'rgba(230,245,255,0.8)');
    this.ring(x, y, 14 * strength, 0.6, 'rgba(230,245,255,0.6)');
    this.burst(x, y, SPLASH_COLORS, Math.round(10 * strength), 70, 'debris');
  }

  private addNumber(x: number, y: number, text: string, color: string): void {
    this.numbers.push({ x: x + rand(-6, 6), y, text, color, life: 0.85, maxLife: 0.85, drift: 34 });
  }

  private flash(id: string): void {
    this.flashes.set(id, FLASH_SECONDS);
  }

  private freeze(id: string, x: number, y: number): void {
    // Hold wherever it's currently drawn, not the new server position.
    if (!this.frozen.has(id)) this.frozen.set(id, { x, y, t: HITSTOP_SECONDS });
  }

  // ── Queries the renderer uses while drawing entities ──────────────────────

  /** 0..1 white-flash strength for this entity right now. */
  flashOf(id: string): number {
    const t = this.flashes.get(id);
    return t ? t / FLASH_SECONDS : 0;
  }

  /** The entity's position, held still for a beat after it's hit (hit-stop). */
  held<T extends { id: string; x: number; y: number }>(e: T): T {
    const f = this.frozen.get(e.id);
    return f ? { ...e, x: f.x, y: f.y } : e;
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  /**
   * Ripple rings (water entry, wading wake, raindrops) — they lie flat on
   * the ground/water, so the renderer draws them in the ground pass, before
   * resources, mobs and players, rather than on top of whoever's wading.
   */
  drawGround(ctx: CanvasRenderingContext2D): void {
    const { camera } = this;
    ctx.lineWidth = 1.2;
    for (const p of this.particles) {
      if (p.kind !== 'ring') continue;
      const u = 1 - p.life / p.maxLife;
      const r = p.size * (0.25 + u * 0.75);
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = p.color;
      // An ellipse — the ground is seen at a slight angle in spirit, and a
      // flattened ring reads as lying on it rather than floating.
      ctx.beginPath();
      ctx.ellipse(Math.round(p.x - camera.x), Math.round(p.y - camera.y), r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Debris, dust and leaves — airborne stuff, drawn over the entities.
   * World-space, inside the renderer's zoom transform, before the night
   * tint so they darken with the scene.
   */
  drawWorld(ctx: CanvasRenderingContext2D): void {
    const { camera } = this;
    for (const p of this.particles) {
      if (p.kind === 'lit' || p.kind === 'ring') continue;
      const fade = clamp01(p.life / (p.maxLife * 0.35));
      const sx = p.x - camera.x;
      const sy = p.y - camera.y - p.z;

      if (p.kind === 'puff') {
        const u = 1 - p.life / p.maxLife;
        ctx.globalAlpha = (1 - u) * 0.75;
        const s = p.size * (0.6 + u * 0.9);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), Math.ceil(s), Math.ceil(s));
        continue;
      }

      // Debris and leaves: a tiny shadow under anything airborne sells the height.
      if (p.z > 2) {
        ctx.globalAlpha = 0.25 * fade;
        ctx.fillStyle = '#000';
        ctx.fillRect(Math.round(sx - p.size / 2), Math.round(p.y - camera.y - p.size / 4), Math.ceil(p.size), Math.ceil(p.size / 2));
      }
      ctx.globalAlpha = p.kind === 'leaf' ? Math.min(fade, clamp01((p.maxLife - p.life) / 0.6)) : fade;
      ctx.fillStyle = p.color;
      // Leaves flip edge-on as they tumble — narrowing width does that cheaply.
      const w = p.kind === 'leaf' ? Math.max(1, p.size * Math.abs(Math.cos(p.phase + p.life * 5))) : p.size;
      ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - p.size / 2), Math.ceil(w), Math.ceil(p.size));
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Embers and pollen — additive, drawn after the night tint so they glow
   * through the dark. `nightness` brightens embers after dark; `golden`
   * (0..1, golden hour) is when pollen catches the light.
   */
  drawLit(ctx: CanvasRenderingContext2D, nightness: number, golden: number): void {
    const { camera } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.kind !== 'lit') continue;
      const ember = p.color !== '#fff6c8';
      const fadeIn = clamp01((p.maxLife - p.life) / 0.5);
      const fadeOut = clamp01(p.life / (p.maxLife * 0.5));
      const twinkle = 0.65 + 0.35 * Math.sin(p.phase + p.life * 9);
      const strength = ember ? 0.55 + 0.45 * nightness : 0.12 + 0.55 * golden;
      ctx.globalAlpha = clamp01(fadeIn * fadeOut * twinkle * strength);
      ctx.fillStyle = p.color;
      const sx = Math.round(p.x - camera.x + Math.sin(p.phase + p.life * 2) * 3);
      const sy = Math.round(p.y - camera.y - p.z);
      ctx.fillRect(sx, sy, p.size, p.size);
    }
    ctx.restore();
  }

  /** Floating damage numbers, in actual screen pixels (outside the zoom transform). */
  drawNumbers(ctx: CanvasRenderingContext2D): void {
    if (this.numbers.length === 0) return;
    const { camera } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.numbers) {
      const u = 1 - n.life / n.maxLife;
      // Pops in big, settles, then fades — reads as an impact, not a label.
      const scale = u < 0.15 ? 1.5 - (u / 0.15) * 0.5 : 1;
      ctx.globalAlpha = clamp01(n.life / (n.maxLife * 0.4));
      ctx.font = `bold ${Math.round(15 * scale)}px "Courier New"`;
      const sx = Math.round((n.x - camera.x) * camera.zoom);
      const sy = Math.round((n.y - camera.y) * camera.zoom);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(n.text, sx, sy);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, sx, sy);
    }
    ctx.restore();
  }
}
