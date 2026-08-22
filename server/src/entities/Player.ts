import {
  PlayerState,
  PlayerInput,
  PLAYER_SPEED,
  PLAYER_RADIUS,
  MAX_HEALTH,
  MAX_HUNGER,
  HUNGER_DECAY_RATE,
  TEMP_DECAY_RATE,
  TEMP_REGEN_RATE,
  HEALTH_REGEN_RATE,
  HEALTH_REGEN_MIN_HUNGER,
  HEALTH_REGEN_MIN_TEMPERATURE,
  CAMPFIRE_HEALTH_REGEN_RATE,
  STARVATION_DAMAGE,
  COLD_DAMAGE,
  HARVEST_COOLDOWN,
  CAMPFIRE_WARMTH_RATE,
  MAP_SIZE,
  Recipe,
  FishingState,
} from '@io-game/shared';

export class ServerPlayer {
  readonly id: string;
  readonly name: string;

  x: number;
  y: number;
  angle = 0;
  // Usually MAX_HEALTH — a bot's constructor passes a higher value (see
  // ServerBot and BOT_MAX_HEALTH_MULTIPLIER). Not readonly: respawn() resets
  // health against it, but the pool itself never changes mid-life.
  readonly maxHealth: number;
  health: number;
  hunger = MAX_HUNGER;
  temperature = 100;
  score = 0;

  input: PlayerInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    angle: 0,
    harvest: false,
    held: null,
  };

  harvestCooldown = 0;

  // Active craft, if any. Ingredients are consumed up front (in Game), so
  // cancelling/dying mid-craft forfeits them rather than duplicating them.
  crafting: { recipe: Recipe; remaining: number } | null = null;

  // Active fishing cast, if any. `remaining` counts down to a catch and
  // isn't part of the broadcast FishingState — `bite` is, flipping true for
  // the last FISH_BITE_WINDOW seconds as a purely visual flourish.
  fishing: (FishingState & { remaining: number }) | null = null;

  // Message currently floating above this player's head, and the seconds left
  // before it clears. The chat log on each client is fed by the separate
  // 'chat' broadcast — this is only the bubble.
  chat: string | null = null;
  chatRemaining = 0;
  // Counts down to zero, blocking further messages until it does (see
  // CHAT_COOLDOWN) — one player can't flood everyone else's log.
  chatCooldown = 0;

  constructor(id: string, name: string, maxHealth: number = MAX_HEALTH) {
    this.id = id;
    this.name = name;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    // Spawn in the safe middle band of the map
    this.x = MAP_SIZE * (0.3 + Math.random() * 0.4);
    this.y = MAP_SIZE * (0.3 + Math.random() * 0.4);
  }

  get canHarvest(): boolean {
    return this.harvestCooldown <= 0;
  }

  startHarvestCooldown(): void {
    this.harvestCooldown = HARVEST_COOLDOWN;
  }

  respawn(): void {
    this.health = this.maxHealth;
    this.hunger = MAX_HUNGER;
    this.temperature = 100;
    this.score = 0;
    this.crafting = null;
    this.fishing = null;
    this.chat = null;
    this.x = MAP_SIZE * (0.3 + Math.random() * 0.4);
    this.y = MAP_SIZE * (0.3 + Math.random() * 0.4);
  }

  update(dt: number, isDay: boolean, speedMultiplier = 1, nearFire = false): void {
    // ── Movement ────────────────────────────────────────────────────────────
    let dx = 0;
    let dy = 0;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
      const R = PLAYER_RADIUS;
      const speed = PLAYER_SPEED * speedMultiplier;
      this.x = Math.max(R, Math.min(MAP_SIZE - R, this.x + dx * speed * dt));
      this.y = Math.max(R, Math.min(MAP_SIZE - R, this.y + dy * speed * dt));
    }

    this.angle = this.input.angle;

    // ── Survival stats ───────────────────────────────────────────────────────
    this.hunger = Math.max(0, this.hunger - HUNGER_DECAY_RATE * dt);

    // A campfire warms you faster than the night cools you, so sitting by one
    // overrides the day/night swing entirely.
    if (nearFire) {
      this.temperature = Math.min(100, this.temperature + CAMPFIRE_WARMTH_RATE * dt);
    } else if (!isDay) {
      this.temperature = Math.max(0, this.temperature - TEMP_DECAY_RATE * dt);
    } else {
      this.temperature = Math.min(100, this.temperature + TEMP_REGEN_RATE * dt);
    }

    // Health regen when comfortable — but only for the living. Damage lands
    // after the death check each tick (mobs and PvP both resolve later in the
    // frame), so without this guard a player brought to exactly 0 would tick
    // straight back up to a fraction of a hit point here on the next frame and
    // never be seen as dead at all.
    if (this.health > 0 && this.hunger > HEALTH_REGEN_MIN_HUNGER && this.temperature > HEALTH_REGEN_MIN_TEMPERATURE) {
      const rate = nearFire ? CAMPFIRE_HEALTH_REGEN_RATE : HEALTH_REGEN_RATE;
      this.health = Math.min(this.maxHealth, this.health + rate * dt);
    }

    // Damage from starvation / cold
    if (this.hunger <= 0) this.health = Math.max(0, this.health - STARVATION_DAMAGE * dt);
    if (this.temperature <= 0) this.health = Math.max(0, this.health - COLD_DAMAGE * dt);

    // ── Cooldowns ────────────────────────────────────────────────────────────
    if (this.harvestCooldown > 0) {
      this.harvestCooldown = Math.max(0, this.harvestCooldown - dt);
    }

    if (this.chatCooldown > 0) this.chatCooldown = Math.max(0, this.chatCooldown - dt);

    if (this.chat !== null) {
      this.chatRemaining -= dt;
      if (this.chatRemaining <= 0) this.chat = null;
    }

    // Score for surviving
    this.score += dt * 10;
  }

  /**
   * `held` is passed in rather than read off `input` here: the inventory is
   * the authority on what a player is actually carrying, and this entity
   * doesn't own it. See Game.heldItemOf.
   */
  toState(isMe = false, held: string | null = null): PlayerState {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      angle: this.angle,
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      temperature: this.temperature,
      score: Math.floor(this.score),
      harvestCooldown: this.harvestCooldown,
      craftingId: this.crafting?.recipe.id ?? null,
      craftingProgress: this.crafting
        ? 1 - this.crafting.remaining / this.crafting.recipe.craftTime
        : 0,
      fishing: this.fishing ? { x: this.fishing.x, y: this.fishing.y, bite: this.fishing.bite } : null,
      held,
      chat: this.chat,
      isMe,
    };
  }
}
