import { Server, Socket } from 'socket.io';
import {
  GameState,
  PreviewState,
  PlayerInput,
  HarvestPayload,
  InventoryPayload,
  JoinedPayload,
  CraftRequest,
  PlaceRequest,
  CastRequest,
  EatRequest,
  ChatRequest,
  ChatMessage,
  CHAT_MAX_LENGTH,
  CHAT_BUBBLE_SECONDS,
  CHAT_COOLDOWN,
  TICK_RATE,
  VIEW_DISTANCE,
  DAY_DURATION,
  MAP_SIZE,
  HARVEST_RANGE,
  HARVEST_ANGLE,
  HARVEST_DAMAGE,
  PLAYER_RADIUS,
  MAX_HEALTH,
  MAX_HUNGER,
  FOOD_ITEMS,
  FOOD_HUNGER_RESTORE,
  RAW_MEAT_ID,
  COOKED_MEAT_ID,
  RESOURCE_RADIUS,
  SOLID_COLLISION_RADIUS,
  MAX_SOLID_COLLISION_RADIUS,
  PLACEMENT_CLEARANCE,
  MAX_PLACEMENT_CLEARANCE,
  STRUCTURE_SPAN,
  TREE_SPAN,
  ROCK_SPAN,
  WHEAT_SPAN,
  GOLD_SPAN,
  PLACE_RANGE,
  STRUCTURE_COLLISION_RADIUS,
  CAMPFIRE_WARMTH_RADIUS,
  ResourceType,
  LakeState,
  Recipe,
  RECIPES_BY_ID,
  canAfford,
  isDaytime,
  WOODEN_AXE_ID,
  AXE_WOOD_MULTIPLIER,
  WOODEN_PICKAXE_ID,
  PICKAXE_STONE_MULTIPLIER,
  WOODEN_SWORD_ID,
  SWORD_DAMAGE_MULTIPLIER,
  STONE_AXE_ID,
  STONE_AXE_WOOD_MULTIPLIER,
  STONE_PICKAXE_ID,
  STONE_PICKAXE_STONE_MULTIPLIER,
  STONE_SWORD_ID,
  STONE_SWORD_DAMAGE_MULTIPLIER,
  GOLD_AXE_ID,
  GOLD_AXE_WOOD_MULTIPLIER,
  GOLD_PICKAXE_ID,
  GOLD_PICKAXE_STONE_MULTIPLIER,
  GOLD_PICKAXE_GOLD_MULTIPLIER,
  GOLD_SWORD_ID,
  GOLD_SWORD_DAMAGE_MULTIPLIER,
  CRAFTING_BENCH_ID,
  BENCH_USE_RADIUS,
  SPIDER_RADIUS,
  SPIDER_SPEED,
  SPIDER_DAMAGE,
  SPIDER_ATTACK_RANGE,
  SPIDER_ATTACK_COOLDOWN,
  SPIDER_AGGRO_RANGE,
  SPIDER_MAX_COUNT,
  SPIDER_SPAWN_INTERVAL,
  SPIDER_SPAWN_INTERVAL_DARK_FOREST,
  SPIDER_MIN_PLAYER_SPAWN_DIST,
  SPIDER_STRING_DROP,
  FOX_RADIUS,
  FOX_SPEED,
  FOX_DAMAGE,
  FOX_ATTACK_RANGE,
  FOX_ATTACK_COOLDOWN,
  FOX_AGGRO_RANGE,
  FOX_LOSE_INTEREST_RANGE,
  FOX_MAX_COUNT,
  FOX_SPAWN_INTERVAL,
  FOX_SPAWN_INTERVAL_NIGHT,
  FOX_MIN_PLAYER_SPAWN_DIST,
  FOX_FOOD_DROP,
  FOX_FOREST_LEEWAY,
  FOX_IDLE_DESPAWN_TIME,
  FOX_REPATH_INTERVAL,
  FOX_WAYPOINT_REACHED_DIST,
  BOT_SEARCH_RADIUS,
  BOT_ENGAGE_RANGE,
  BOT_STRING_HUNT_RANGE,
  BOT_STRING_HUNT_MIN_HEALTH,
  BOT_WOUNDED_PREY_BIAS,
  BOT_HUNT_ABANDON_RANGE,
  BOT_FLEE_HEALTH,
  BOT_HUNGER_SEEK_FOOD,
  BOT_CAMPFIRE_TEMP,
  BOT_HEAL_SEEK_HEALTH,
  BOT_HEAL_DONE_HEALTH,
  BOT_FIRE_REUSE_RANGE,
  BOT_DECISION_INTERVAL,
  BOT_CRAFT_INTERVAL,
  BOT_REPATH_INTERVAL,
  BOT_WAYPOINT_REACHED_DIST,
  BOT_FISH_INTERVAL,
  BOT_STUCK_TIME,
  BOT_STUCK_DIST,
  BOT_UNREACHABLE_MEMORY,
  BOT_ESCAPE_TIME,
  BOT_UNSTICK_WALK,
  BOT_UNSTICK_MIN_DIST,
  BOT_FLEE_DIST,
  BOT_EDGE_MARGIN,
  GOLD_TOP_BAND,
  HEALTH_REGEN_MIN_HUNGER,
  darkForestBandAt,
  FISHING_ROD_ID,
  CAST_RANGE,
  FISH_WAIT_MIN,
  FISH_WAIT_MAX,
  FISH_BITE_WINDOW,
  pickRandomFish,
} from '@io-game/shared';

import { ServerPlayer } from './entities/Player';
import { ServerResource } from './entities/Resource';
import { ServerStructure } from './entities/Structure';
import { ServerSpider } from './entities/Spider';
import { ServerFox } from './entities/Fox';
import { ServerBot, BOT_NAMES, ALWAYS_ANGLER_NAME } from './entities/Bot';
import { World } from './World';

// Trees, rocks, and gold are solid; berries and mushrooms are walkable but
// slow the player down instead (see SLOW_TYPES / SLOW_MULTIPLIER below).
// Wheat is walkable and doesn't slow the player at all — it's just left out
// of both.
const COLLISION_RADIUS = SOLID_COLLISION_RADIUS;
const MAX_COLLISION_RADIUS = MAX_SOLID_COLLISION_RADIUS;

const SLOW_TYPES = new Set<ResourceType>(['berry', 'mushroom', 'purple_berry']);
const SLOW_RADIUS = RESOURCE_RADIUS;
const SLOW_MULTIPLIER = 0.5;
const LAKE_SLOW_MULTIPLIER = 0.4; // Wading through lake water

// Held tools that boost yield while equipped, as drop type → multiplier. A
// tool can boost more than one type: the gold pickaxe is better at both the
// stone a rock gives and the gold a deposit gives, and those are separate
// drops that scale by different amounts. Anything absent from a tool's table
// is left at 1x.
const TOOL_BONUS: Record<string, Record<string, number>> = {
  [WOODEN_AXE_ID]: { wood: AXE_WOOD_MULTIPLIER },
  [STONE_AXE_ID]: { wood: STONE_AXE_WOOD_MULTIPLIER },
  [GOLD_AXE_ID]: { wood: GOLD_AXE_WOOD_MULTIPLIER },
  [WOODEN_PICKAXE_ID]: { stone: PICKAXE_STONE_MULTIPLIER },
  [STONE_PICKAXE_ID]: { stone: STONE_PICKAXE_STONE_MULTIPLIER },
  [GOLD_PICKAXE_ID]: {
    stone: GOLD_PICKAXE_STONE_MULTIPLIER,
    gold: GOLD_PICKAXE_GOLD_MULTIPLIER,
  },
};

// Gold is the one resource with a hard tool requirement rather than the
// axe/pickaxe's usual "bare hands still work, a tool just yields more" bonus
// (see TOOL_BONUS above) — bare hands and a wooden pickaxe both bounce off
// it. The bar is the stone pickaxe, and everything above that bar clears it
// too: a set rather than one exact id, so upgrading to the gold pickaxe can
// never lock a player out of a resource their strictly better tool obviously
// ought to handle. See canMineGold in processHarvest.
const GOLD_CAPABLE_TOOLS = new Set<string>([STONE_PICKAXE_ID, GOLD_PICKAXE_ID]);

/** Gold-capable pickaxes, weakest first — the tier list bots pick their best from. */
const BOT_GOLD_PICKAXE_TIERS = [STONE_PICKAXE_ID, GOLD_PICKAXE_ID];

// Held weapons that multiply damage dealt to spiders and other players.
const WEAPON_DAMAGE: Record<string, number> = {
  [WOODEN_SWORD_ID]: SWORD_DAMAGE_MULTIPLIER,
  [STONE_SWORD_ID]: STONE_SWORD_DAMAGE_MULTIPLIER,
  [GOLD_SWORD_ID]: GOLD_SWORD_DAMAGE_MULTIPLIER,
};

// How far a resource's own footprint reaches for harvest purposes — a
// player can hit any part of it, not just its exact center point.
const INTERACT_RADIUS: Record<ResourceType, number> = {
  tree: TREE_SPAN / 2,
  rock: ROCK_SPAN / 2,
  berry: RESOURCE_RADIUS,
  mushroom: RESOURCE_RADIUS,
  wheat: WHEAT_SPAN / 2,
  purple_berry: RESOURCE_RADIUS,
  gold: GOLD_SPAN / 2,
};
const MAX_INTERACT_RADIUS = Math.max(...Object.values(INTERACT_RADIUS));

// ── Bot decision tables ───────────────────────────────────────────────────────

const CAMPFIRE_ID = 'campfire';

/** Tool tiers, weakest first — used both to pick the best one owned and to skip recrafting outclassed ones. */
const BOT_AXE_TIERS = [WOODEN_AXE_ID, STONE_AXE_ID, GOLD_AXE_ID];
const BOT_PICKAXE_TIERS = [WOODEN_PICKAXE_ID, STONE_PICKAXE_ID, GOLD_PICKAXE_ID];
const BOT_SWORD_TIERS = [WOODEN_SWORD_ID, STONE_SWORD_ID, GOLD_SWORD_ID];
const BOT_TOOL_TIERS = [BOT_AXE_TIERS, BOT_PICKAXE_TIERS, BOT_SWORD_TIERS];

/**
 * What a bot tries to build, in order. It crafts the first entry it can
 * afford and doesn't already own, so the sequence is the progression: the
 * full wooden set first (nothing else is reachable without it — every stone
 * recipe consumes its wooden counterpart), then a bench to unlock the higher
 * tiers, then stone, then gold.
 *
 * The rod sits between the wooden and stone tiers, and only anglers ever
 * reach it (see ServerBot.likesFishing). It's ahead of stone deliberately:
 * string only drops from spider kills, so a bot that has finally banked
 * enough should go and use it rather than sitting on it through an entire
 * tier of upgrades.
 */
const BOT_CRAFT_ORDER = [
  // Ahead of everything else: raw meat (a fox kill drop) is dead weight
  // until it's cooked — see FOOD_ITEMS, which deliberately excludes it — and
  // letting it sit in inventory while the bot goes off and starts a wooden
  // pickaxe instead just wastes a kill it already has in hand. Special-cased
  // past the "already own one" skip below since it's a stackable consumable,
  // not a tool slot: one cooked portion banked shouldn't stop it cooking the
  // next raw kill.
  COOKED_MEAT_ID,
  WOODEN_PICKAXE_ID,
  WOODEN_AXE_ID,
  WOODEN_SWORD_ID,
  // Straight after the wooden set, and ahead of the campfire in particular.
  // Only one craft starts per cycle, so anything that gets re-made over and
  // over starves everything below it — and a campfire is consumed when it's
  // placed. String only drops from spiders, which only come out at night,
  // which is exactly when a bot is cold enough to be rebuilding campfires. A
  // rod is cheap and permanent, so it converts that hard-won string the
  // moment it has enough rather than carrying it around until something
  // kills it.
  FISHING_ROD_ID,
  CRAFTING_BENCH_ID,
  CAMPFIRE_ID,
  STONE_AXE_ID,
  STONE_PICKAXE_ID,
  STONE_SWORD_ID,
  GOLD_AXE_ID,
  GOLD_PICKAXE_ID,
  GOLD_SWORD_ID,
];

/** The wooden set, which everything later upgrades from. */
const BOT_STARTER_TOOLS = [WOODEN_PICKAXE_ID, WOODEN_AXE_ID, WOODEN_SWORD_ID];

/**
 * The full stone set — see botHasStoneTier, which gates gold on all three of
 * these rather than just the pickaxe canMineGold needs. Without it, a bot
 * that had only just crafted a stone pickaxe (the second of the three, per
 * BOT_CRAFT_ORDER) was already mechanically able to mine gold and would
 * start beeline-ing for the gold band (see botWantsGold), abandoning the
 * stone axe/sword it hadn't gotten to yet right as it stopped gathering the
 * wood/stone they still needed.
 */
const BOT_STONE_TOOLS = [STONE_AXE_ID, STONE_PICKAXE_ID, STONE_SWORD_ID];

/**
 * How much a bot wants each resource, normally and when hungry. Higher wins
 * outright; distance only breaks ties between equal priorities. Trees score
 * above zero even on the food pass because they drop a berry alongside wood.
 */
const BOT_MATERIAL_PRIORITY: Record<ResourceType, number> = {
  gold: 4, tree: 3, rock: 3, wheat: 1, berry: 1, purple_berry: 1, mushroom: 1,
};
const BOT_FOOD_PRIORITY: Record<ResourceType, number> = {
  berry: 4, purple_berry: 4, mushroom: 3, tree: 2, wheat: 1, rock: 0, gold: 0,
};

/** A hostile the bot AI is considering, flattened so spiders and foxes look alike. */
interface BotThreat {
  id: string;
  x: number;
  y: number;
  radius: number;
  kind: 'spider' | 'fox';
}

/**
 * Socket.IO room every freshly-connected socket starts in and leaves the
 * moment it joins a real game (see index.ts). Sockets still sitting in it
 * are the menu-screen audience for broadcastPreview below.
 */
export const LOBBY_ROOM = 'lobby';

export class Game {
  private readonly players = new Map<string, ServerPlayer>();
  private readonly inventories = new Map<string, Map<string, number>>();
  // Spectator socket id -> the id of the player they're watching (see
  // handleSlashCommand). A stale entry (target disconnected) is cleaned up
  // lazily the next time broadcast() looks it up, so removePlayer only needs
  // to clear the watcher's own side of this.
  private readonly spectators = new Map<string, string>();
  private readonly structures: ServerStructure[] = [];
  private readonly spiders = new Map<string, ServerSpider>();
  private readonly foxes = new Map<string, ServerFox>();
  /**
   * Server-simulated players. Each one's `player` also lives in `players`
   * above, so from every other system's point of view — collision, mobs,
   * broadcast, the leaderboard — a bot simply is a player.
   */
  private readonly bots: ServerBot[] = [];
  // The very first bot ever added — Tomas, per BOT_NAMES's fixed order (see
  // addBots). Featured in the pre-join menu backdrop (see buildPreviewState)
  // so a first-time visitor sees something alive happening before they've
  // even entered a name. Null when the server is run with BOT_COUNT=0.
  private previewBot: ServerBot | null = null;
  private readonly world: World;

  private tick = 0;
  private dayTime = 0; // 0 = noon, wraps 0..1
  private lastTime = Date.now();
  private interval: ReturnType<typeof setInterval> | null = null;

  // Spiders are a night-only threat: they stop spawning and vanish outright
  // the moment day breaks (see updateSpiders), so `wasDay` just needs to
  // catch the night→day edge, not track the cycle in any richer way.
  private wasDay = true; // dayTime starts at 0 (noon), so this matches
  private spiderSpawnTimer = 0;
  // Second, faster timer that only rolls for a spot inside the dark forest
  // (see trySpawnSpiderInForest) — runs alongside spiderSpawnTimer, not
  // instead of it, so the forest gets denser at night on top of the usual
  // map-wide spawning rather than stealing from it.
  private spiderForestSpawnTimer = 0;

  // Foxes, unlike spiders, are tied to the dark forest rather than to the
  // clock — they spawn and hunt through both day and night, so there's no
  // day-edge clearing for them and this timer just runs continuously.
  private foxSpawnTimer = 0;

  constructor(private readonly io: Server) {
    this.world = new World();
    this.world.generate();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Multiplies every step's dt before anything reads it — movement, hunger,
   * crafting, the day/night cycle, resource respawns, bot decision/craft
   * timers, all of it — since every one of those is driven off the same dt
   * passed down from step() below. A dev-only knob (see index.ts's
   * GAME_SPEED) for watching a bot's whole tool progression play out in a
   * fraction of the real time rather than actually changing any game
   * balance; 1 (real time) unless start() is told otherwise.
   */
  private speedMultiplier = 1;

  start(speedMultiplier = 1): void {
    this.speedMultiplier = speedMultiplier;
    this.interval = setInterval(() => this.step(), 1000 / TICK_RATE);
    console.log(`[Game] Running at ${TICK_RATE} ticks/s`);
    if (speedMultiplier !== 1) console.log(`[Game] Time is running at ${speedMultiplier}x`);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  // ── Socket API ─────────────────────────────────────────────────────────────

  addPlayer(socket: Socket, name: string): void {
    const sanitised = (name || '').trim().slice(0, 16) || 'Anonymous';
    const player = new ServerPlayer(socket.id, sanitised);
    this.players.set(socket.id, player);
    this.inventories.set(socket.id, new Map());

    const payload: JoinedPayload = { id: socket.id, mapSize: MAP_SIZE, lakes: this.world.lakes };
    socket.emit('joined', payload);
    console.log(`[Game] + ${sanitised} (${socket.id})`);
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    this.players.delete(id);
    this.inventories.delete(id);
    this.spectators.delete(id);
    // Leaving clears what they built, same as dying. Nothing survives a
    // disconnect to be reclaimed — ids are per-socket, so a returning player
    // is a new player and could never own these again. Without this a
    // crafting bench (which has no lifetime of its own) would sit on the map
    // for the rest of the server's uptime, one more every time anyone quits.
    this.removeStructuresOwnedBy(id);
    if (player) console.log(`[Game] - ${player.name} (${id})`);
  }

  handleInput(id: string, input: PlayerInput): void {
    if (this.spectators.has(id)) return; // Spectating freezes your own body — see broadcast
    const player = this.players.get(id);
    if (player) player.input = input;
  }

  /**
   * Starts a craft. Ingredients are deducted immediately so they can't be
   * spent twice while the timer runs; the result lands in the inventory when
   * the timer finishes (see tickCrafting).
   */
  handleCraft(id: string, { recipeId }: CraftRequest): void {
    if (this.spectators.has(id)) return;
    const player = this.players.get(id);
    const inv = this.inventories.get(id);
    if (!player || !inv) return;
    if (player.crafting) return; // Already busy

    const recipe = RECIPES_BY_ID[recipeId];
    if (!recipe) return;
    if (recipe.requiresBench && !this.isNearBench(player)) {
      this.sendInventory(player, 'Need a crafting bench');
      return;
    }
    if (recipe.requiresCampfire && !this.isNearFire(player)) {
      this.sendInventory(player, 'Need a campfire');
      return;
    }
    if (!canAfford(recipe, Object.fromEntries(inv))) return;

    for (const [item, need] of Object.entries(recipe.cost)) {
      const left = (inv.get(item) ?? 0) - need;
      if (left > 0) inv.set(item, left);
      else inv.delete(item);
    }

    player.crafting = { recipe, remaining: recipe.craftTime };
    this.sendInventory(player, `Crafting ${recipe.name}…`);
  }

  /** Places a crafted structure from the inventory into the world. */
  handlePlace(id: string, { itemId, x, y }: PlaceRequest): void {
    if (this.spectators.has(id)) return;
    const player = this.players.get(id);
    const inv = this.inventories.get(id);
    if (!player || !inv) return;

    const recipe = RECIPES_BY_ID[itemId];
    if (!recipe?.placeAs) return; // Not a placeable item
    if ((inv.get(itemId) ?? 0) < 1) return;

    if (Math.hypot(x - player.x, y - player.y) > PLACE_RANGE || x < 0 || y < 0 || x > MAP_SIZE || y > MAP_SIZE) {
      this.sendInventory(player, 'Too far away');
      return;
    }
    if (!this.isPlaceable(x, y)) {
      this.sendInventory(player, "Can't build there");
      return;
    }

    const left = (inv.get(itemId) ?? 0) - 1;
    if (left > 0) inv.set(itemId, left);
    else inv.delete(itemId);

    this.structures.push(new ServerStructure(recipe.placeAs, x, y, id));
    this.sendInventory(player, `${recipe.name} placed`);
  }

  /**
   * Ages every structure, dropping the ones that burn out this tick (see
   * ServerStructure.update). Structures need no teardown beyond leaving the
   * array — unlike resources they're never stamped into the fox nav grid, and
   * everything else that cares about them (warmth, collision, bench range)
   * reads the live array each tick rather than caching membership.
   */
  private updateStructures(dt: number): void {
    for (let i = this.structures.length - 1; i >= 0; i--) {
      if (this.structures[i].update(dt)) this.structures.splice(i, 1);
    }
  }

  /** Removes everything a given player built — see checkDeath. */
  private removeStructuresOwnedBy(ownerId: string): void {
    for (let i = this.structures.length - 1; i >= 0; i--) {
      if (this.structures[i].ownerId === ownerId) this.structures.splice(i, 1);
    }
  }

  /** Casts a fishing line at a world position — must be lake water, in range, rod in hand. */
  handleCast(id: string, { x, y }: CastRequest): void {
    if (this.spectators.has(id)) return;
    const player = this.players.get(id);
    const inv = this.inventories.get(id);
    if (!player || !inv) return;
    if (player.fishing) return; // Already got a line out
    if (player.input.held !== FISHING_ROD_ID || (inv.get(FISHING_ROD_ID) ?? 0) < 1) return;

    if (Math.hypot(x - player.x, y - player.y) > CAST_RANGE) {
      this.sendInventory(player, 'Too far to cast');
      return;
    }
    if (!this.world.isInLakeWater(x, y)) {
      this.sendInventory(player, 'Cast it in the water');
      return;
    }

    player.fishing = { x, y, bite: false, remaining: FISH_WAIT_MIN + Math.random() * (FISH_WAIT_MAX - FISH_WAIT_MIN) };
    // Reuses the harvest-swing cooldown/animation for the cast fling itself
    // — same forward-lunge motion already driven by harvestCooldown client-side.
    player.startHarvestCooldown();
  }

  /**
   * Eats a food item straight from the hotbar. Unlike place/cast, this isn't
   * gated on player.input.held — food is never held at all (see HUD's
   * selectSlot client-side), so the item comes from the request instead.
   * The inventory is still the authority on whether the player actually
   * owns it, same as everywhere else — the request is just a claim.
   */
  handleEat(id: string, { itemId }: EatRequest): void {
    if (this.spectators.has(id)) return;
    const player = this.players.get(id);
    const inv = this.inventories.get(id);
    if (!player || !inv) return;
    if (!FOOD_ITEMS.has(itemId) || (inv.get(itemId) ?? 0) < 1) return;

    const left = (inv.get(itemId) ?? 0) - 1;
    if (left > 0) inv.set(itemId, left);
    else inv.delete(itemId);

    const restore = FOOD_HUNGER_RESTORE[itemId];
    player.hunger = Math.min(MAX_HUNGER, player.hunger + restore);
    this.sendInventory(player, `+${restore} hunger`);
  }

  /**
   * Broadcasts a chat message and puts it above the sender's head. The text is
   * re-sanitised here rather than trusted from the client: control characters
   * (newlines included, which would break the log's line layout) are stripped
   * and the length is capped, since nothing stops a modified client from
   * ignoring its own input's maxlength.
   */
  handleChat(id: string, { text }: ChatRequest): void {
    const player = this.players.get(id);
    if (!player || player.chatCooldown > 0) return;

    const clean = String(text ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, CHAT_MAX_LENGTH);
    if (!clean) return;

    player.chatCooldown = CHAT_COOLDOWN;

    // Slash commands are parsed here rather than broadcast — see
    // handleSlashCommand. Currently just spectate.
    if (clean.startsWith('/')) {
      this.handleSlashCommand(player, clean.slice(1));
      return;
    }

    player.chat = clean;
    player.chatRemaining = CHAT_BUBBLE_SECONDS;

    const message: ChatMessage = { id: player.id, name: player.name, text: clean };
    this.io.emit('chat', message);
  }

  /**
   * "/spectate <name>" watches another player through their own camera, stat
   * bars and hotbar instead of your own (see broadcast's anchor swap and
   * sendInventory's relay) — your own body freezes in place meanwhile (see
   * the spectator guards in handleInput/handleCraft/handlePlace/handleCast/
   * handleEat). "/spectate" with no name, or "/unspectate", stops. Feedback
   * goes back over 'system' to just this socket rather than the public chat
   * log, since nobody else needs to see it.
   */
  private handleSlashCommand(player: ServerPlayer, command: string): void {
    const [rawCmd, ...rest] = command.trim().split(/\s+/);
    const cmd = (rawCmd ?? '').toLowerCase();
    const arg = rest.join(' ').trim();

    if (cmd === 'unspectate' || (cmd === 'spectate' && !arg)) {
      const wasSpectating = this.stopSpectating(player);
      this.sendSystem(player, wasSpectating ? 'Stopped spectating' : 'Not spectating anyone');
      return;
    }

    if (cmd === 'spectate') {
      const target = this.findPlayerByName(arg);
      if (!target) {
        this.sendSystem(player, `No player named "${arg}"`);
        return;
      }
      if (target.id === player.id) {
        this.sendSystem(player, "You can't spectate yourself");
        return;
      }
      this.spectators.set(player.id, target.id);
      this.sendSystem(player, `Now spectating ${target.name}`);
      // Hands over their current hotbar right away rather than waiting for
      // it to next change (see sendInventory's spectator relay).
      this.sendInventory(target);
      return;
    }

    this.sendSystem(player, `Unknown command: /${cmd}`);
  }

  /** Returns whether they actually were spectating, so callers can tailor the feedback. */
  private stopSpectating(player: ServerPlayer): boolean {
    if (!this.spectators.delete(player.id)) return false;
    this.sendInventory(player); // restores their own hotbar over the target's
    return true;
  }

  /**
   * Case-insensitive exact match first, then prefix, so "/spectate tom" finds
   * "Tomas" without typing the whole name. Names aren't unique (see
   * addPlayer), so a collision just resolves to whichever matches first.
   */
  private findPlayerByName(name: string): ServerPlayer | null {
    const needle = name.toLowerCase();
    const all = Array.from(this.players.values());
    return (
      all.find(p => p.name.toLowerCase() === needle) ??
      all.find(p => p.name.toLowerCase().startsWith(needle)) ??
      null
    );
  }

  /** A private toast for one socket — command feedback that shouldn't hit the public chat log. */
  private sendSystem(player: ServerPlayer, text: string): void {
    this.io.sockets.sockets.get(player.id)?.emit('system', text);
  }

  /**
   * Rejects spots that overlap a solid resource, water, or another structure.
   *
   * Clearances are measured against what's *drawn* (PLACEMENT_CLEARANCE and
   * STRUCTURE_SPAN) rather than what blocks movement. Collision radii are much
   * tighter than the sprites they belong to, so checking those instead leaves
   * a band — roughly 44 to 73 units from a tree's centre — where a structure
   * is legally placed and still looks buried in the trunk. Players rarely hit
   * it because they aim by eye; bots pick a spot by rolling an offset and land
   * in it constantly.
   */
  private isPlaceable(x: number, y: number): boolean {
    const half = STRUCTURE_SPAN / 2;
    if (this.world.isBlockedByLake(x, y, half)) return false;

    // Dead resources count here: they respawn in place, so building on a
    // freshly-chopped stump just means the tree grows back through the
    // campfire a minute later.
    for (const r of this.world.getNearby(x, y, half + MAX_PLACEMENT_CLEARANCE, true)) {
      const clearance = PLACEMENT_CLEARANCE[r.type];
      if (clearance === undefined) continue; // walkable resource, fine to build over
      if (Math.hypot(x - r.x, y - r.y) < clearance + half) return false;
    }

    // Structures shouldn't overlap each other either — centres a full span
    // apart leaves two sprites just touching.
    for (const s of this.structures) {
      if (Math.hypot(x - s.x, y - s.y) < STRUCTURE_SPAN) return false;
    }

    return true;
  }

  // ── Main simulation step ───────────────────────────────────────────────────

  private step(): void {
    const now = Date.now();
    // Cap delta time against real elapsed time first — a lag spike should
    // still only ever simulate 0.1 real seconds' worth in one jump — then
    // apply speedMultiplier, so a dev speed-up scales *that* capped amount
    // rather than swallowing the cap entirely.
    const dt = Math.min((now - this.lastTime) / 1000, 0.1) * this.speedMultiplier;
    this.lastTime = now;
    this.tick++;

    // Day/night cycle
    this.dayTime = (this.dayTime + dt / DAY_DURATION) % 1;
    const isDay = isDaytime(this.dayTime);

    // Update world (resource respawning)
    this.world.update(dt);
    this.updateStructures(dt);

    // Bots decide first, writing the same PlayerInput a client would have
    // sent this tick — then fall through the ordinary player loop below.
    this.updateBots(dt);

    // Update each player
    for (const player of this.players.values()) {
      const speedMultiplier = this.getSpeedMultiplier(player);
      player.update(dt, isDay, speedMultiplier, this.isNearFire(player));
      const pushed = this.pushOutOfResources(player.x, player.y, PLAYER_RADIUS);
      player.x = pushed.x;
      player.y = pushed.y;
      this.resolveStructureCollision(player);
      this.processHarvest(player);
      this.tickCrafting(player, dt);
      this.tickFishing(player, dt);
      this.checkDeath(player);
    }
    this.resolvePlayerCollisions();

    this.updateSpiders(dt, isDay);
    this.updateFoxes(dt, isDay);

    // Broadcast state to each player
    this.broadcast(isDay);
    this.broadcastPreview(isDay);
  }

  // ── Collision ──────────────────────────────────────────────────────────────

  /** Berries/mushrooms/lake water don't block movement, they just slow the player while standing in them. */
  private getSpeedMultiplier(player: ServerPlayer): number {
    if (this.world.isInLakeWater(player.x, player.y)) return LAKE_SLOW_MULTIPLIER;

    for (const r of this.world.getNearby(player.x, player.y, SLOW_RADIUS)) {
      if (!SLOW_TYPES.has(r.type)) continue;
      const dx = player.x - r.x;
      const dy = player.y - r.y;
      if (dx * dx + dy * dy <= SLOW_RADIUS * SLOW_RADIUS) return SLOW_MULTIPLIER;
    }
    return 1;
  }

  /**
   * Pushes a point back out of any solid resource (tree, rock) it's
   * overlapping — shared by players and spiders, so both bounce off the
   * same obstacles the same way.
   */
  private pushOutOfResources(x: number, y: number, radius: number): { x: number; y: number } {
    const queryDist = radius + MAX_COLLISION_RADIUS;
    for (const r of this.world.getNearby(x, y, queryDist)) {
      const rRadius = COLLISION_RADIUS[r.type];
      if (rRadius === undefined) continue; // not solid (berry/mushroom)

      // Let players (and spiders) walk through the branch bridging two
      // connected trees instead of being walled off between them.
      if (r.type === 'tree' && this.world.isInTreeCorridor(x, y, r.x, r.y)) continue;

      const minDist = radius + rRadius;
      const dx = x - r.x;
      const dy = y - r.y;
      const dist = Math.hypot(dx, dy) || 0.001; // avoid div-by-zero on exact overlap
      if (dist >= minDist) continue;

      const push = minDist - dist;
      x = clamp(x + (dx / dist) * push, radius, MAP_SIZE - radius);
      y = clamp(y + (dy / dist) * push, radius, MAP_SIZE - radius);
    }
    return { x, y };
  }

  /** Campfires are solid — push a player back out of one they walked into. */
  private resolveStructureCollision(player: ServerPlayer): void {
    const minDist = PLAYER_RADIUS + STRUCTURE_COLLISION_RADIUS;

    for (const s of this.structures) {
      const dx = player.x - s.x;
      const dy = player.y - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minDist) continue;

      // A fire can legally be placed right on top of the player, so the
      // exact-overlap case is reachable here — pick an arbitrary direction
      // rather than dividing by zero and never pushing them free.
      const [nx, ny] = dist > 0.001 ? [dx / dist, dy / dist] : [1, 0];
      const push = minDist - dist;
      player.x = clamp(player.x + nx * push, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
      player.y = clamp(player.y + ny * push, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
    }
  }

  /** Keeps players from overlapping each other — splits the separation between both. */
  private resolvePlayerCollisions(): void {
    const list = Array.from(this.players.values());
    const minDist = PLAYER_RADIUS * 2;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist >= minDist) continue;

        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x = clamp(a.x - nx * overlap, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
        a.y = clamp(a.y - ny * overlap, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
        b.x = clamp(b.x + nx * overlap, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
        b.y = clamp(b.y + ny * overlap, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS);
      }
    }
  }

  // ── Per-player logic ───────────────────────────────────────────────────────

  /**
   * True if a point `radius` units across falls within a player's swing —
   * HARVEST_RANGE plus the HARVEST_ANGLE aim cone, treating the target as a
   * circle rather than a point so any part of it counts, not just its exact
   * center. Shared by resource, spider, and player targeting so all three
   * use identical reach.
   */
  private inSwingRange(player: ServerPlayer, x: number, y: number, radius: number): boolean {
    const dx = x - player.x;
    const dy = y - player.y;
    const centerDist = Math.hypot(dx, dy);
    if (centerDist - radius > HARVEST_RANGE) return false; // nearest point is still out of range

    if (centerDist > radius) {
      // Angular half-width the target's own circle subtends from the
      // player's position — lets an off-center edge still poke into the cone.
      const angularRadius = Math.asin(Math.min(1, radius / centerDist));
      const angleTo = Math.atan2(dy, dx);
      const angleDiff = Math.atan2(Math.sin(angleTo - player.angle), Math.cos(angleTo - player.angle));
      if (Math.abs(angleDiff) > HARVEST_ANGLE / 2 + angularRadius) return false;
    } // else: player is inside the target's own radius — always in range/angle

    return true;
  }

  /** Every resource within swing range — a single swing can connect with several at once. */
  private findHarvestTargets(player: ServerPlayer): ServerResource[] {
    const targets: ServerResource[] = [];
    for (const r of this.world.getNearby(player.x, player.y, HARVEST_RANGE + MAX_INTERACT_RADIUS)) {
      if (this.inSwingRange(player, r.x, r.y, INTERACT_RADIUS[r.type])) targets.push(r);
    }
    return targets;
  }

  /** Every spider within swing range. */
  private findSpiderTargets(player: ServerPlayer): ServerSpider[] {
    const targets: ServerSpider[] = [];
    for (const spider of this.spiders.values()) {
      if (this.inSwingRange(player, spider.x, spider.y, SPIDER_RADIUS)) targets.push(spider);
    }
    return targets;
  }

  /** Every fox within swing range. */
  private findFoxTargets(player: ServerPlayer): ServerFox[] {
    const targets: ServerFox[] = [];
    for (const fox of this.foxes.values()) {
      if (this.inSwingRange(player, fox.x, fox.y, FOX_RADIUS)) targets.push(fox);
    }
    return targets;
  }

  /** Every other player within swing range — PvP uses the same swing as everything else. */
  private findPlayerTargets(attacker: ServerPlayer): ServerPlayer[] {
    const targets: ServerPlayer[] = [];
    for (const other of this.players.values()) {
      if (other.id === attacker.id) continue;
      if (this.inSwingRange(attacker, other.x, other.y, PLAYER_RADIUS)) targets.push(other);
    }
    return targets;
  }

  /**
   * The yield bonuses in effect (drop type → multiplier), if the player has a
   * bonus-granting tool selected *and* actually owns one. `input.held` is just
   * what the client says it has out, so the inventory is the authority on
   * whether it applies.
   */
  private activeToolBonus(
    player: ServerPlayer,
    inv: Map<string, number>,
  ): Record<string, number> | null {
    const held = player.input.held;
    if (!held) return null;
    const bonus = TOOL_BONUS[held];
    if (!bonus || (inv.get(held) ?? 0) < 1) return null;
    return bonus;
  }

  /**
   * Damage a swing deals to a spider or another player (not resources — the
   * axe/pickaxe own that). Multiplied while a sword is both selected and
   * actually owned; the inventory is the authority, same as tool bonuses.
   */
  private combatDamage(player: ServerPlayer, inv: Map<string, number>): number {
    const held = player.input.held;
    if (!held) return HARVEST_DAMAGE;
    const multiplier = WEAPON_DAMAGE[held];
    if (!multiplier || (inv.get(held) ?? 0) < 1) return HARVEST_DAMAGE;
    return HARVEST_DAMAGE * multiplier;
  }

  private processHarvest(player: ServerPlayer): void {
    if (!player.input.harvest || !player.canHarvest) return;

    // The swing itself happens whether or not anything is in range — a
    // whiff still costs the cooldown and drives the client's strike
    // animation (harvestCooldown is what Renderer.harvestStrike reads), it
    // just has nothing left to do once nothing is found below.
    player.startHarvestCooldown();

    const targets = this.findHarvestTargets(player);
    const spiderTargets = this.findSpiderTargets(player);
    const foxTargets = this.findFoxTargets(player);
    const playerTargets = this.findPlayerTargets(player);
    if (
      targets.length === 0 &&
      spiderTargets.length === 0 &&
      foxTargets.length === 0 &&
      playerTargets.length === 0
    ) {
      return;
    }

    const inv = this.inventories.get(player.id)!;
    const allDrops: { type: string; count: number }[] = [];

    // Resolved once per swing, before anything is collected — otherwise
    // gathering mid-swing could change whether the bonus applies.
    const toolBonus = this.activeToolBonus(player, inv);
    const combatDamage = this.combatDamage(player, inv);
    // Same held-item authority rule as everywhere else: the inventory
    // decides, not just the client's claimed `held`.
    const held = player.input.held;
    const canMineGold = held !== null && GOLD_CAPABLE_TOOLS.has(held) && (inv.get(held) ?? 0) >= 1;

    for (const spider of spiderTargets) {
      spider.hp = Math.max(0, spider.hp - combatDamage);
      if (spider.hp === 0) {
        this.spiders.delete(spider.id);
        inv.set('string', (inv.get('string') ?? 0) + SPIDER_STRING_DROP);
        allDrops.push({ type: 'string', count: SPIDER_STRING_DROP });
      }
    }

    for (const fox of foxTargets) {
      fox.hp = Math.max(0, fox.hp - combatDamage);
      if (fox.hp === 0) {
        this.foxes.delete(fox.id);
        // Raw, same as any other harvest drop — has to be cooked at a
        // campfire (see the cooked_meat recipe, requiresCampfire, and
        // handleCraft) before FOOD_ITEMS/handleEat will let it be eaten.
        inv.set(RAW_MEAT_ID, (inv.get(RAW_MEAT_ID) ?? 0) + FOX_FOOD_DROP);
        allDrops.push({ type: RAW_MEAT_ID, count: FOX_FOOD_DROP });
      }
    }

    for (const victim of playerTargets) {
      victim.health = Math.max(0, victim.health - combatDamage);
    }

    // The held tool's effect on yield, as ServerResource.damage wants it —
    // it applies the multiplier itself, since a strike only earns a share of
    // the resource's total and the two have to be scaled together.
    const yieldMultiplier = (dropType: string): number => toolBonus?.[dropType] ?? 1;

    for (const resource of targets) {
      if (resource.type === 'gold' && !canMineGold) continue; // wrong (or no) tool — the swing lands but does nothing
      const { drops, destroyed } = resource.damage(HARVEST_DAMAGE, yieldMultiplier);
      // Just died this swing — open up the ground it was occupying so fox
      // pathfinding (and bot player steering) can route through it instead
      // of detouring around a stump until it respawns (see
      // setResourceNavBlocking). Keyed off `destroyed` rather than whether
      // anything dropped: a strike can now pay out nothing (its share
      // rounded down) and still be the one that felled the tree.
      if (destroyed) this.world.setResourceNavBlocking(resource.id, false);
      for (const drop of drops) {
        // Food items go to the inventory like anything else now — eating is
        // a deliberate action (see handleEat), not automatic on pickup.
        inv.set(drop.type, (inv.get(drop.type) ?? 0) + drop.count);
        allDrops.push(drop);
      }
    }

    if (allDrops.length === 0) return; // No resource drops this swing, no payload to report

    const socket = this.io.sockets.sockets.get(player.id);
    if (socket) {
      const payload: HarvestPayload = {
        drops: allDrops,
        inventory: Object.fromEntries(inv),
      };
      socket.emit('harvest', payload);
    }
  }

  /** True while the player stands inside any campfire's warmth radius. */
  private isNearFire(player: ServerPlayer): boolean {
    return this.structures.some(
      (s) =>
        s.type === 'campfire' &&
        Math.hypot(player.x - s.x, player.y - s.y) <= CAMPFIRE_WARMTH_RADIUS,
    );
  }

  /**
   * True when there's already a campfire close enough to be worth walking to
   * rather than building another. Deliberately a much wider test than
   * isNearFire: that one asks "is this player being warmed right now", which
   * is the wrong question when deciding whether to spend 20 wood — a fire
   * three hundred units away heals just as well once you've walked to it, and
   * the 'heal' goal will do exactly that.
   */
  private botFireWithinReach(player: ServerPlayer): boolean {
    return this.botNearestCampfire(player.x, player.y, BOT_FIRE_REUSE_RANGE) !== null;
  }

  /** Nearest campfire within `range`, for a bot heading somewhere to heal. */
  private botNearestCampfire(x: number, y: number, range: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = range;
    for (const s of this.structures) {
      if (s.type !== 'campfire') continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: s.x, y: s.y };
      }
    }
    return best;
  }

  /**
   * Nearest live tree within BOT_SEARCH_RADIUS — specifically for a bot
   * gathering wood to build itself a campfire (see botAct's 'heal' case),
   * which cares about wood alone and not the usual food/material priority
   * botPickResource weighs everything else by.
   */
  private botNearestTreeResource(bot: ServerBot): ServerResource | null {
    const { x, y } = bot.player;
    const avoidForest = this.botAvoidsForest(bot);
    let best: ServerResource | null = null;
    let bestDist = BOT_SEARCH_RADIUS;
    for (const r of this.world.getNearby(x, y, BOT_SEARCH_RADIUS)) {
      if (r.type !== 'tree') continue;
      if (avoidForest && this.botInDarkForest(r.x, r.y)) continue; // unarmed — not worth the risk
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = r;
      }
    }
    return best;
  }

  /**
   * Nearest live gold deposit within BOT_SEARCH_RADIUS — for a bot that
   * specifically wants gold (see botWantsGold), the same way
   * botNearestTreeResource is for one that specifically wants wood.
   */
  private botNearestGoldResource(bot: ServerBot): ServerResource | null {
    const { x, y } = bot.player;
    let best: ServerResource | null = null;
    let bestDist = BOT_SEARCH_RADIUS;
    for (const r of this.world.getNearby(x, y, BOT_SEARCH_RADIUS)) {
      if (r.type !== 'gold') continue;
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = r;
      }
    }
    return best;
  }

  /** True while the player is close enough to a crafting bench to use it. */
  private isNearBench(player: ServerPlayer): boolean {
    return this.structures.some(
      (s) =>
        s.type === CRAFTING_BENCH_ID &&
        Math.hypot(player.x - s.x, player.y - s.y) <= BENCH_USE_RADIUS,
    );
  }

  /** Advances an in-progress craft and hands over the result when it finishes. */
  private tickCrafting(player: ServerPlayer, dt: number): void {
    const craft = player.crafting;
    if (!craft) return;

    craft.remaining -= dt;
    if (craft.remaining > 0) return;

    player.crafting = null;
    const inv = this.inventories.get(player.id)!;
    inv.set(craft.recipe.id, (inv.get(craft.recipe.id) ?? 0) + 1);
    this.sendInventory(player, `+1 ${craft.recipe.name}`);
  }

  /**
   * Advances an active cast: cancels it if the player wandered off or put
   * the rod away, flips on the "bite" flourish for the last stretch of the
   * wait, and hands over a randomly-picked fish species (added to the
   * inventory/hotbar, not auto-eaten) once it's up.
   */
  private tickFishing(player: ServerPlayer, dt: number): void {
    const f = player.fishing;
    if (!f) return;

    const inv = this.inventories.get(player.id)!;
    const stillRodded = player.input.held === FISHING_ROD_ID && (inv.get(FISHING_ROD_ID) ?? 0) >= 1;
    if (!stillRodded || Math.hypot(player.x - f.x, player.y - f.y) > CAST_RANGE * 1.5) {
      player.fishing = null;
      return;
    }

    f.remaining -= dt;
    f.bite = f.remaining <= FISH_BITE_WINDOW;
    if (f.remaining > 0) return;

    player.fishing = null;
    const caught = pickRandomFish();
    inv.set(caught.id, (inv.get(caught.id) ?? 0) + 1);
    const rarityTag = caught.rarity === 'common' ? '' : ` (${caught.rarity})`;
    this.sendInventory(player, `Caught a ${caught.name}${rarityTag}!`);
  }

  /**
   * Also relayed to anyone spectating this player (see handleSlashCommand),
   * so a spectator's hotbar tracks the target's in real time instead of
   * showing whatever their own inventory happened to hold.
   */
  private sendInventory(player: ServerPlayer, message?: string): void {
    const inv = this.inventories.get(player.id)!;
    const payload: InventoryPayload = { inventory: Object.fromEntries(inv), message };
    this.io.sockets.sockets.get(player.id)?.emit('inventory', payload);
    for (const [spectatorId, targetId] of this.spectators) {
      if (targetId === player.id) this.io.sockets.sockets.get(spectatorId)?.emit('inventory', payload);
    }
  }

  /**
   * Anything that reaches 0 health dies here: it loses everything it was
   * carrying and starts over from a fresh spawn point with its score reset
   * (see ServerPlayer.respawn).
   *
   * The two kinds of player differ only in what happens next. A human is told
   * about it so the client can show its death screen, and then comes back —
   * the client's own copy is written around respawning ("You died!
   * Respawning…"), and it offers no way to rejoin, so leaving them out of the
   * world would strand them staring at a game they can't touch. A bot has
   * nobody to notify, so it just gets put straight back in — but its AI state
   * has to be wiped too, since every waypoint and target it was holding
   * points at wherever it died rather than where it just respawned.
   *
   * A human who's off spectating someone else is a third case: their own body
   * is frozen but still very much in the world (see handleSlashCommand), so
   * it can still starve, freeze, or get bitten while they're not looking. It
   * still respawns the same as any death, but there's no 'died' emit for
   * it — surfacing "You died!" over the person they're actually watching
   * would be confusing, and there's nothing for them to do about it anyway
   * with their own input frozen.
   */
  private checkDeath(player: ServerPlayer): void {
    if (player.health > 0) return;

    player.respawn();
    this.inventories.set(player.id, new Map());
    // Dying costs you what you built, not just what you carried — otherwise a
    // player could seed the map with fires and benches and keep the benefit
    // of every one of them across any number of deaths. Applies to bots too,
    // which is why it sits above the bot branch below.
    this.removeStructuresOwnedBy(player.id);

    const bot = this.bots.find((b) => b.id === player.id);
    if (bot) {
      bot.resetAfterDeath();
      return;
    }

    if (this.spectators.has(player.id)) return; // see doc comment above

    const socket = this.io.sockets.sockets.get(player.id);
    if (socket) socket.emit('died', {});
  }

  // ── Spiders ────────────────────────────────────────────────────────────────

  /**
   * Handles the whole spider lifecycle for this tick: clearing them out at
   * dawn, spawning new ones through the night, and running each one's AI.
   */
  private updateSpiders(dt: number, isDay: boolean): void {
    if (isDay && !this.wasDay) {
      this.spiders.clear(); // dawn — night threats vanish outright
    }
    this.wasDay = isDay;

    if (isDay) {
      // So the first spawn after dusk isn't delayed by whatever was left
      // over from the night before.
      this.spiderSpawnTimer = 0;
      this.spiderForestSpawnTimer = 0;
    } else {
      this.spiderSpawnTimer -= dt;
      if (this.spiderSpawnTimer <= 0) {
        this.spiderSpawnTimer = SPIDER_SPAWN_INTERVAL;
        this.trySpawnSpider();
      }

      this.spiderForestSpawnTimer -= dt;
      if (this.spiderForestSpawnTimer <= 0) {
        this.spiderForestSpawnTimer = SPIDER_SPAWN_INTERVAL_DARK_FOREST;
        this.trySpawnSpiderInForest();
      }
    }

    for (const spider of this.spiders.values()) {
      this.updateSpider(spider, dt);
    }
  }

  /** Picks a spot clear of players and water; skips this cycle if nothing turns up. */
  private trySpawnSpider(): void {
    if (this.spiders.size >= SPIDER_MAX_COUNT) return;

    const margin = TREE_SPAN;
    const players = Array.from(this.players.values());

    for (let attempt = 0; attempt < 20; attempt++) {
      const x = margin + Math.random() * (MAP_SIZE - margin * 2);
      const y = margin + Math.random() * (MAP_SIZE - margin * 2);
      if (this.world.isBlockedByLake(x, y)) continue;
      if (players.some((p) => Math.hypot(p.x - x, p.y - y) < SPIDER_MIN_PLAYER_SPAWN_DIST)) continue;

      const spider = new ServerSpider(x, y);
      this.spiders.set(spider.id, spider);
      return;
    }
  }

  /**
   * Same idea as trySpawnSpider, but the candidate y is confined to inside
   * the dark forest band (reusing trySpawnFox's approach to the same band)
   * instead of anywhere on the map. Feeds the same this.spiders collection
   * and the same SPIDER_MAX_COUNT cap — this only biases *where* an extra
   * spider lands, not a separate population.
   */
  private trySpawnSpiderInForest(): void {
    if (this.spiders.size >= SPIDER_MAX_COUNT) return;

    const margin = TREE_SPAN;
    const players = Array.from(this.players.values());

    for (let attempt = 0; attempt < 20; attempt++) {
      const x = margin + Math.random() * (MAP_SIZE - margin * 2);
      const bandY = darkForestBandAt(x);
      if (bandY <= margin) continue; // no forest to speak of at this x
      const y = margin + Math.random() * (bandY - margin);
      if (this.world.isBlockedByLake(x, y)) continue;
      if (players.some((p) => Math.hypot(p.x - x, p.y - y) < SPIDER_MIN_PLAYER_SPAWN_DIST)) continue;

      const spider = new ServerSpider(x, y);
      this.spiders.set(spider.id, spider);
      return;
    }
  }

  /** Spiders wade through lake water slower, same as players — but unlike players, berries/mushrooms don't slow them. */
  private spiderSpeedMultiplier(spider: ServerSpider): number {
    return this.world.isInLakeWater(spider.x, spider.y) ? LAKE_SLOW_MULTIPLIER : 1;
  }

  /**
   * Simple seek-and-bite AI: chase the nearest player within aggro range,
   * and bite on cooldown once close enough. There's still no pathfinding —
   * a spider steers straight at its target and relies on pushOutOfResources
   * to bounce it off anything solid in the way, the same as a player
   * walking into a tree, rather than routing around it.
   */
  private updateSpider(spider: ServerSpider, dt: number): void {
    if (spider.attackCooldown > 0) spider.attackCooldown -= dt;

    let nearest: ServerPlayer | null = null;
    let nearestDist = SPIDER_AGGRO_RANGE;
    for (const player of this.players.values()) {
      const d = Math.hypot(player.x - spider.x, player.y - spider.y);
      if (d < nearestDist) {
        nearest = player;
        nearestDist = d;
      }
    }

    if (nearest) {
      const dx = nearest.x - spider.x;
      const dy = nearest.y - spider.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      spider.angle = Math.atan2(dy, dx);

      if (dist > SPIDER_ATTACK_RANGE) {
        const speed = SPIDER_SPEED * this.spiderSpeedMultiplier(spider);
        const nx = dx / dist;
        const ny = dy / dist;
        spider.x = clamp(spider.x + nx * speed * dt, SPIDER_RADIUS, MAP_SIZE - SPIDER_RADIUS);
        spider.y = clamp(spider.y + ny * speed * dt, SPIDER_RADIUS, MAP_SIZE - SPIDER_RADIUS);
      } else if (spider.attackCooldown <= 0) {
        nearest.health = Math.max(0, nearest.health - SPIDER_DAMAGE);
        spider.attackCooldown = SPIDER_ATTACK_COOLDOWN;
      }
    }

    const pushed = this.pushOutOfResources(spider.x, spider.y, SPIDER_RADIUS);
    spider.x = pushed.x;
    spider.y = pushed.y;
  }

  // ── Foxes ──────────────────────────────────────────────────────────────────

  /**
   * Fox lifecycle for this tick. Deliberately simpler than updateSpiders:
   * foxes are a biome threat rather than a nocturnal one, so nothing here
   * keys off the day/night cycle — they spawn and hunt around the clock, and
   * are never cleared out en masse.
   */
  private updateFoxes(dt: number, isDay: boolean): void {
    this.foxSpawnTimer -= dt;
    if (this.foxSpawnTimer <= 0) {
      // Same forest, same odds per attempt — the only thing night changes is
      // how often the timer fires (see FOX_SPAWN_INTERVAL_NIGHT).
      this.foxSpawnTimer = isDay ? FOX_SPAWN_INTERVAL : FOX_SPAWN_INTERVAL_NIGHT;
      this.trySpawnFox();
    }

    for (const fox of this.foxes.values()) {
      this.updateFox(fox, dt);
    }
  }

  /**
   * Picks a spot inside the dark forest, clear of players and water; skips
   * this cycle if nothing turns up. The band's y varies with x (the border
   * meanders — see darkForestBandAt), so the cutoff is recomputed per
   * candidate x rather than being one flat line.
   */
  private trySpawnFox(): void {
    if (this.foxes.size >= FOX_MAX_COUNT) return;

    const margin = TREE_SPAN;
    const players = Array.from(this.players.values());

    for (let attempt = 0; attempt < 20; attempt++) {
      const x = margin + Math.random() * (MAP_SIZE - margin * 2);
      const bandY = darkForestBandAt(x);
      if (bandY <= margin) continue; // no forest to speak of at this x
      const y = margin + Math.random() * (bandY - margin);
      if (this.world.isBlockedByLake(x, y)) continue;
      // Start on ground a fox can actually stand on, rather than inside a
      // trunk it would spend its first ticks being shoved back out of.
      if (this.world.isNavBlocked(x, y)) continue;
      if (players.some((p) => Math.hypot(p.x - x, p.y - y) < FOX_MIN_PLAYER_SPAWN_DIST)) continue;

      const fox = new ServerFox(x, y);
      this.foxes.set(fox.id, fox);
      return;
    }
  }

  /** Foxes wade through lake water slower, same as spiders and players. */
  private foxSpeedMultiplier(fox: ServerFox): number {
    return this.world.isInLakeWater(fox.x, fox.y) ? LAKE_SLOW_MULTIPLIER : 1;
  }

  /**
   * Seek-and-bite AI that actually routes around obstacles, unlike the
   * spider's steer-straight-and-bounce approach (which would simply wedge a
   * fox against the first trunk in the dark forest).
   *
   * Two modes, picked per tick by a line-of-sight test:
   *  - clear run at the target → steer straight at it, no search at all,
   *    which is the common case out in the open;
   *  - something solid in between → follow an A* path around it
   *    (World.findPath), refreshed every FOX_REPATH_INTERVAL so a moving
   *    player doesn't trigger a fresh search every single tick.
   *
   * Either way the fox is finally pushed back out of anything solid it has
   * ended up overlapping, exactly like a player or spider — the pathing is
   * what keeps it from needing that, not a replacement for it.
   */
  private updateFox(fox: ServerFox, dt: number): void {
    if (fox.attackCooldown > 0) fox.attackCooldown -= dt;
    if (fox.repathTimer > 0) fox.repathTimer -= dt;

    const nearest = this.foxTarget(fox);
    const nearestDist = nearest ? Math.hypot(nearest.x - fox.x, nearest.y - fox.y) : Infinity;

    if (nearest) {
      fox.idleTimer = 0; // aggro'd — the despawn clock only runs while idle
    } else {
      fox.path = [];
      fox.idleTimer += dt;
      // Lost the scent. If that happened well outside its own biome — it
      // chased someone out onto the plains and they got away — the fox
      // gives up and disappears immediately rather than trudging back.
      // Otherwise, idle long enough with nobody to chase (FOX_IDLE_DESPAWN_TIME)
      // despawns it too, so one that never finds anyone — or loses its
      // target without ever leaving the forest — doesn't just sit there
      // holding one of FOX_MAX_COUNT's slots forever.
      const strandedOutsideForest = fox.y > darkForestBandAt(fox.x) + FOX_FOREST_LEEWAY;
      if (strandedOutsideForest || fox.idleTimer >= FOX_IDLE_DESPAWN_TIME) this.foxes.delete(fox.id);
      return;
    }

    // Close enough to bite: stop closing and just work the cooldown.
    if (nearestDist <= FOX_ATTACK_RANGE) {
      fox.angle = Math.atan2(nearest.y - fox.y, nearest.x - fox.x);
      fox.path = [];
      if (fox.attackCooldown <= 0) {
        nearest.health = Math.max(0, nearest.health - FOX_DAMAGE);
        fox.attackCooldown = FOX_ATTACK_COOLDOWN;
      }
      return;
    }

    const target = this.foxSteerTarget(fox, nearest);
    if (!target) return; // boxed in with no route — hold position this tick

    const dx = target.x - fox.x;
    const dy = target.y - fox.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    fox.angle = Math.atan2(dy, dx);

    const speed = FOX_SPEED * this.foxSpeedMultiplier(fox);
    fox.x = clamp(fox.x + (dx / dist) * speed * dt, FOX_RADIUS, MAP_SIZE - FOX_RADIUS);
    fox.y = clamp(fox.y + (dy / dist) * speed * dt, FOX_RADIUS, MAP_SIZE - FOX_RADIUS);

    const pushed = this.pushOutOfResources(fox.x, fox.y, FOX_RADIUS);
    fox.x = pushed.x;
    fox.y = pushed.y;
  }

  /**
   * The player a fox is hunting this tick, or null if nothing has its
   * attention.
   *
   * Aggro is sticky: once a fox has locked onto someone it stays on them
   * until they break FOX_LOSE_INTEREST_RANGE, at which point it forgets them
   * outright and only re-acquires when somebody comes back inside the
   * (narrower) FOX_AGGRO_RANGE. Keeping those two thresholds apart is what
   * gives a chase a definite end without the fox twitching in and out of
   * pursuit while a player hovers at the edge of its senses.
   *
   * Sticky isn't blind, though: every tick still checks whether someone else
   * has wandered within FOX_AGGRO_RANGE and is now nearer than the current
   * quarry, and switches to them if so — the closer target is always the
   * more tempting one, current chase or not.
   *
   * That stickiness is capped at the forest's edge, though: foxes belong to
   * the dark forest (see trySpawnFox), and a fox that would chase a target
   * clean across the plains defeats the point of confining them there in the
   * first place. FOX_FOREST_LEEWAY gives it a little room to dash after
   * someone right at the treeline without instantly balking, but past that
   * it drops the chase outright — same leash distance updateFox already uses
   * to clean up a fox that wandered out and lost interest, just checked here
   * too so it also applies mid-chase, not only once idle.
   */
  private foxTarget(fox: ServerFox): ServerPlayer | null {
    const withinForestLeash = fox.y <= darkForestBandAt(fox.x) + FOX_FOREST_LEEWAY;
    if (!withinForestLeash) {
      // Too far out to be chasing anyone, current quarry or a new one alike.
      fox.targetId = null;
      fox.path = [];
      return null;
    }

    // Current quarry, if it's still around and hasn't broken
    // FOX_LOSE_INTEREST_RANGE — kept as the baseline the acquisition scan
    // below has to beat, rather than returned outright, so a closer player
    // can still steal aggro (see that scan's comment).
    let current: ServerPlayer | null = null;
    let currentDist = Infinity;
    if (fox.targetId) {
      const quarry = this.players.get(fox.targetId);
      const d = quarry ? Math.hypot(quarry.x - fox.x, quarry.y - fox.y) : Infinity;
      if (quarry && d <= FOX_LOSE_INTEREST_RANGE) {
        current = quarry;
        currentDist = d;
      } else {
        // Got away, or disconnected/died and respawned elsewhere — give up.
        fox.targetId = null;
        fox.path = [];
      }
    }

    // Switch to anyone closer who's wandered within acquisition range —
    // sticky aggro (see this method's doc comment) means a fox doesn't drop
    // its current quarry just because someone else is nearby, but it isn't
    // blind to them either: the nearer of the two is always the more
    // tempting target, current chase or not.
    let nearest = current;
    let nearestDist = Math.min(currentDist, FOX_AGGRO_RANGE);
    for (const player of this.players.values()) {
      if (player === current) continue;
      const d = Math.hypot(player.x - fox.x, player.y - fox.y);
      if (d < nearestDist) {
        nearest = player;
        nearestDist = d;
      }
    }

    if (nearest !== current) fox.path = []; // switching targets — the old path is for the wrong person now
    fox.targetId = nearest?.id ?? null;
    return nearest;
  }

  /**
   * The point a chasing fox should head for right now: the player directly if
   * nothing solid is in the way, otherwise the next waypoint of an A* path
   * around whatever is. Returns null only when the fox is genuinely boxed in
   * and no route exists.
   */
  private foxSteerTarget(fox: ServerFox, prey: ServerPlayer): { x: number; y: number } | null {
    if (this.world.hasClearPath(fox.x, fox.y, prey.x, prey.y)) {
      fox.path = [];
      return { x: prey.x, y: prey.y };
    }

    // Drop waypoints already reached, so the fox is always aiming at the next
    // corner rather than one it's standing on.
    while (
      fox.path.length > 0 &&
      Math.hypot(fox.path[0].x - fox.x, fox.path[0].y - fox.y) <= FOX_WAYPOINT_REACHED_DIST
    ) {
      fox.path.shift();
    }

    if (fox.path.length === 0 || fox.repathTimer <= 0) {
      const path = this.world.findPath(fox.x, fox.y, prey.x, prey.y);
      fox.repathTimer = FOX_REPATH_INTERVAL;
      if (path && path.length > 0) fox.path = path;
    }

    return fox.path.length > 0 ? fox.path[0] : null;
  }

  // ── Bots ───────────────────────────────────────────────────────────────────

  /**
   * Adds `count` server-simulated players. Each gets a real ServerPlayer in
   * the players map and an inventory, exactly like a joining client — the
   * only difference is that no socket is ever associated with its id, which
   * every emit path already tolerates (they all check for a socket first).
   */
  addBots(count: number): void {
    for (let i = 0; i < count; i++) {
      const n = this.bots.length;
      const baseName = BOT_NAMES[n % BOT_NAMES.length];
      const suffix = n >= BOT_NAMES.length ? ` ${Math.floor(n / BOT_NAMES.length) + 1}` : '';
      // Tomas always fishes, wherever he lands in the order. Everyone else
      // alternates, so there's a mix of anglers and bots that stick to
      // gathering — and a lone bot still fishes.
      const likesFishing = baseName === ALWAYS_ANGLER_NAME || n % 2 === 0;
      const bot = new ServerBot(baseName + suffix, likesFishing);
      if (this.bots.length === 0) this.previewBot = bot; // the first bot ever, always Tomas

      this.bots.push(bot);
      this.players.set(bot.id, bot.player);
      this.inventories.set(bot.id, new Map());
      console.log(`[Game] + ${bot.player.name} (bot ${bot.id})`);
    }
  }

  private updateBots(dt: number): void {
    for (const bot of this.bots) this.updateBot(bot, dt);
  }

  /**
   * Decides what one bot is doing this tick and writes it into its
   * PlayerInput. Nothing here moves the bot or harvests anything directly —
   * it only presses keys. The ordinary player loop then runs on it, so a bot
   * is bound by every rule a human is: the same speed, the same collisions,
   * the same swing cooldown and aim cone, the same hunger and cold.
   */
  private updateBot(bot: ServerBot, dt: number): void {
    const p = bot.player;
    bot.decisionTimer -= dt;
    bot.craftTimer -= dt;
    bot.repathTimer -= dt;
    bot.fishTimer -= dt;

    // Let unreachable targets become interesting again — the world changes
    // (resources respawn, structures come and go), so nothing is written off
    // permanently.
    for (const [id, remaining] of bot.unreachable) {
      if (remaining <= dt) bot.unreachable.delete(id);
      else bot.unreachable.set(id, remaining - dt);
    }

    // Fresh input each tick — behaviours press only the keys they want,
    // rather than inheriting last tick's.
    const input: PlayerInput = {
      up: false,
      down: false,
      left: false,
      right: false,
      angle: p.angle,
      harvest: false,
      held: p.input.held,
    };

    // Mid-cast: stand still and keep the rod out, unlike crafting below —
    // wandering off cancels the cast (see tickFishing), so there's a real
    // cost to moving here that crafting doesn't share.
    if (p.fishing) {
      input.held = FISHING_ROD_ID;
      p.input = input;
      return;
    }

    // Crafting doesn't freeze anything server-side — ingredients are spent
    // up front (see handleCraft) and the result lands whenever the timer
    // finishes regardless of what the player's doing in the meantime, the
    // same as a human crafting mid-walk. A bot used to hold still for the
    // recipe's full craft time here too, which is what actually created the
    // danger the old comment was guarding against: starting one mid-chase
    // planted it in front of whatever it was fleeing, or stood still
    // mid-swing against whatever it was fighting — a bot that keeps moving
    // and fighting through a craft never has that problem in the first
    // place. What still matters is not *starting* a fresh multi-second
    // craft while actively threatened, which busyWithThreat below covers.
    const busyWithThreat = bot.goal === 'flee' || bot.goal === 'hunt';
    if (bot.craftTimer <= 0 && !busyWithThreat) {
      bot.craftTimer = BOT_CRAFT_INTERVAL;
      this.botManageGear(bot);
    }

    if (bot.decisionTimer <= 0) {
      bot.decisionTimer = BOT_DECISION_INTERVAL;
      this.botChooseGoal(bot);
    }

    this.botAct(bot, input, dt);
    p.input = input;

    // Eat on the go if hungry and already carrying food — unlike a player,
    // a bot doesn't need to hold it first (see handleEat), so this doesn't
    // interrupt whatever movement/goal the tick above already decided on.
    if (p.hunger < BOT_HUNGER_SEEK_FOOD) {
      const food = this.botFoodItem(bot);
      if (food) this.handleEat(bot.id, { itemId: food });
    }
  }

  /**
   * Picks what to do next. Re-run on a timer rather than only on completion,
   * so a bot mid-way to a tree still notices a fox padding up behind it.
   */
  private botChooseGoal(bot: ServerBot): void {
    const p = bot.player;

    // Threats first — nothing else matters with a spider on you.
    const threat = this.botNearestThreat(bot, BOT_ENGAGE_RANGE);
    if (threat) {
      // A fox hits harder and actually pathfinds around obstacles to keep
      // chasing (unlike a spider, which just steers straight and bounces
      // off them) — trading hits bare-handed is a losing fight. A bot
      // without even a wooden sword runs instead, same as it would at low
      // health, rather than wading in unarmed. Spiders are left alone here:
      // an angler already has reason to fight one unarmed for its string
      // (see botWantsString below), and they're the easier fight regardless.
      const outmatched = threat.kind === 'fox' && this.botBestTool(bot, BOT_SWORD_TIERS) === null;
      bot.goal = p.health <= this.botHealthThreshold(bot, BOT_FLEE_HEALTH) || outmatched ? 'flee' : 'hunt';
      bot.targetId = threat.id;
      bot.targetX = threat.x;
      bot.targetY = threat.y;
      return;
    }

    // Hurt and nothing chasing it: go recover by a fire rather than pressing
    // on into more danger at low health. botManageGear (see updateBot) is
    // what actually builds/places the campfire when the bot doesn't have one
    // yet — this just decides to go stand by it, existing or not.
    // Hysteresis, same idea as the fox's leash: it takes a fairly low health
    // to send a bot looking for a fire, but once it's committed it stays
    // until properly patched up. With a single threshold the slow passive
    // regen nudges it back over the line within seconds and it wanders off
    // again — often before it has even reached the fire, which made
    // BOT_HEAL_DONE_HEALTH dead code.
    // Regen — open-ground or campfire alike — is hard-gated behind hunger
    // (see HEALTH_REGEN_MIN_HUNGER in ServerPlayer.update). Without this
    // check a bot that's both hurt and out of food would camp at a fire
    // that's healing it precisely nothing, burning its hunger down to zero
    // with no food-gathering behaviour to interrupt it — exactly the state
    // that starves a bot to death standing in a lit campfire. If it's
    // already carrying food this doesn't matter: the automatic eat-on-the-go
    // check in updateBot fixes the hunger up within a tick or two regardless
    // of goal, so 'heal' is still worth entering.
    const canRegen = p.hunger > HEALTH_REGEN_MIN_HUNGER || this.botFoodItem(bot) !== null;
    const healUntil = this.botHealthThreshold(
      bot,
      bot.goal === 'heal' ? BOT_HEAL_DONE_HEALTH : BOT_HEAL_SEEK_HEALTH,
    );
    // Raw meat is dead weight until it's cooked at a campfire (see
    // FOOD_ITEMS and BOT_CRAFT_ORDER's cooked_meat entry), so a bot with none
    // ready to eat goes and stands by a fire the same way a hurt one does —
    // this reuses the 'heal' goal wholesale rather than adding a separate
    // one, since "find/build a fire and walk to it" is exactly the same
    // errand either way. botAct's 'heal' case only leaves once both jobs are
    // done (see its exit check below, and botWantsToCook for why this isn't
    // simply "has raw meat").
    if ((p.health <= healUntil && canRegen) || this.botWantsToCook(bot)) {
      bot.goal = 'heal';
      bot.targetId = null;
      return;
    }

    // An angler short of string goes out looking for spiders. They're the
    // only thing that drops it, so without this a rod comes down entirely to
    // whether one happens to wander into BOT_ENGAGE_RANGE on its own — which
    // is why bots so rarely got round to fishing.
    if (this.botWantsString(bot)) {
      const spider = this.botNearestSpider(bot, BOT_STRING_HUNT_RANGE);
      if (spider) {
        bot.goal = 'hunt';
        bot.targetId = spider.id;
        bot.targetX = spider.x;
        bot.targetY = spider.y;
        return;
      }
    }

    // An occasional fishing trip, once it owns a rod.
    if (bot.fishTimer <= 0 && this.botHasItem(bot, FISHING_ROD_ID)) {
      const spot = this.botFishingSpot(bot);
      if (spot) {
        bot.goal = 'fish';
        bot.targetId = null;
        bot.targetX = spot.standX;
        bot.targetY = spot.standY;
        bot.castX = spot.castX;
        bot.castY = spot.castY;
        return;
      }
      bot.fishTimer = BOT_FISH_INTERVAL; // no lake within reach — try again later
    }

    // A stone-pickaxe-or-better bot with the gold set still unfinished makes
    // a beeline for gold rather than going through the usual nearest-anything
    // botPickResource pass below. That pass is priority-weighted, not
    // need-driven — gold outscores wood/stone when it's in range, but the
    // plains keep a tree or a rock within BOT_SEARCH_RADIUS of a bot almost
    // everywhere, so left to that alone a bot would happily spend forever
    // chopping the nearest tree and never once notice gold only seeds near
    // the top of the dark forest (see GOLD_TOP_BAND), routinely well outside
    // that same radius. Skipped while hungry, same reasoning as
    // needsStarterTools in botPickResource: a starving bot chasing gold
    // instead of the berries actually in range is a worse trade, not a
    // better one.
    if (this.botWantsGold(bot) && p.hunger >= BOT_HUNGER_SEEK_FOOD) {
      const gold = this.botNearestGoldResource(bot);
      if (gold) {
        bot.goal = 'gather';
        bot.targetId = gold.id;
        bot.targetX = gold.x;
        bot.targetY = gold.y;
        return;
      }
      // None in range yet — head for the band on purpose rather than wander
      // at random until a nugget happens to drift into range. The gather
      // branch above will take over (and grab anything else worth grabbing
      // en route) the moment a deposit actually enters BOT_SEARCH_RADIUS.
      bot.goal = 'idle';
      bot.targetId = null;
      bot.path = [];
      const dest = this.botGoldBandDestination(p.x);
      bot.targetX = dest.x;
      bot.targetY = dest.y;
      return;
    }

    const resource = this.botPickResource(bot);
    if (resource) {
      bot.goal = 'gather';
      bot.targetId = resource.id;
      bot.targetX = resource.x;
      bot.targetY = resource.y;
      return;
    }

    // Picked the area clean — wander off and look somewhere else.
    bot.goal = 'idle';
    bot.targetId = null;
    bot.path = [];
    const wander = this.botPickOpenDirection(p.x, p.y, 300 + Math.random() * 500, this.botAvoidsForest(bot));
    bot.targetX = wander.x;
    bot.targetY = wander.y;
  }

  /** Carries out the current goal, pressing keys into `input`. */
  private botAct(bot: ServerBot, input: PlayerInput, dt: number): void {
    const p = bot.player;

    switch (bot.goal) {
      case 'hunt': {
        const mob = this.botThreatById(bot.targetId);
        // Generous give-up distance: a bot crossing the map for a spider it
        // wants string from starts out further away than it would ever chase
        // something that merely wandered up to it.
        if (!mob || Math.hypot(mob.x - p.x, mob.y - p.y) > BOT_HUNT_ABANDON_RANGE) {
          bot.decisionTimer = 0; // dead, or we respawned far away — rethink
          return;
        }
        input.held = this.botBestTool(bot, BOT_SWORD_TIERS) ?? input.held;
        input.angle = Math.atan2(mob.y - p.y, mob.x - p.x);
        if (this.botWithinSwing(p, mob.x, mob.y, mob.radius)) {
          input.harvest = true;
          // Kite rather than trade hits standing still: aim and movement are
          // independent (see botPressToward's callers elsewhere), so the bot
          // can keep facing and swinging at the mob while backpedaling away
          // from it. Works because HARVEST_RANGE reaches well past either
          // mob's own attack range (SPIDER_ATTACK_RANGE/FOX_ATTACK_RANGE),
          // and the player outruns both (PLAYER_SPEED > SPIDER_SPEED/
          // FOX_SPEED) — so backing off costs it nothing offensively but
          // steadily pulls it out of biting range. Once that opens up enough
          // ground to fall out of swing range, the branch below takes back
          // over and closes the distance again, so this settles into a
          // steady hit-and-step-back rhythm instead of a one-way retreat.
          this.botPressToward(input, p.x - mob.x, p.y - mob.y);
        } else {
          this.botSteer(bot, input, mob.x, mob.y, dt);
        }
        return;
      }

      case 'flee': {
        const mob = this.botThreatById(bot.targetId);
        if (!mob) {
          bot.decisionTimer = 0;
          return;
        }
        // Run somewhere real rather than simply pressing "away". Straight away
        // from a mob that has you backed against the map edge just holds you
        // there against the boundary clamp — and going through botSteer also
        // means fleeing is covered by the stuck detector.
        const escape = this.botFleeDestination(p, mob, this.botAvoidsForest(bot));
        input.angle = Math.atan2(p.y - mob.y, p.x - mob.x);
        if (!escape || !this.botSteer(bot, input, escape.x, escape.y, dt)) {
          this.botUnstick(bot);
        }
        return;
      }

      case 'fish': {
        input.held = FISHING_ROD_ID;
        if (Math.hypot(bot.castX - p.x, bot.castY - p.y) <= CAST_RANGE * 0.85) {
          input.angle = Math.atan2(bot.castY - p.y, bot.castX - p.x);
          // handleCast reads input.held off the player, so commit first.
          p.input = input;
          this.handleCast(bot.id, { x: bot.castX, y: bot.castY });
          bot.fishTimer = BOT_FISH_INTERVAL;
          if (!p.fishing) bot.decisionTimer = 0; // cast refused — go do something else
          return;
        }
        // Couldn't get to the water — stop trying to fish for a while, or
        // botChooseGoal would just send it back to the same unreachable lake.
        if (!this.botSteer(bot, input, bot.targetX, bot.targetY, dt)) {
          bot.fishTimer = BOT_FISH_INTERVAL;
        }
        return;
      }

      case 'heal': {
        // Healed up with nothing urgent left to cook — or nothing actually
        // happened this run (no wood on hand, say) and it's been at this a
        // while; either way stop camping and get back to work. Still wanting
        // to cook (see botWantsToCook) keeps it here even at full health,
        // but only until the first portion lands: see botChooseGoal, which
        // sends a bot here to cook the same way it does to heal.
        if (p.health >= this.botHealthThreshold(bot, BOT_HEAL_DONE_HEALTH) && !this.botWantsToCook(bot)) {
          bot.decisionTimer = 0;
          return;
        }

        // Same range botManageGear uses to decide whether building another is
        // worth it, so the two can't disagree — a bot must never skip
        // building because a fire is "in reach" and then refuse to walk to it.
        const fire = this.botNearestCampfire(p.x, p.y, BOT_FIRE_REUSE_RANGE);
        if (fire) {
          bot.targetId = null; // done gathering, if it was — head for the fire instead
          if (Math.hypot(fire.x - p.x, fire.y - p.y) <= CAMPFIRE_WARMTH_RADIUS * 0.6) {
            return; // in range — let the passive campfire heal rate do its work
          }
          this.botSteer(bot, input, fire.x, fire.y, dt);
          return;
        }

        // No fire to walk to. If there's already enough wood for one (or
        // it's literally carrying one), just wait — botManageGear (see
        // updateBot) is what actually builds and places it, and wandering
        // off to chop more in the meantime would only strand the bot away
        // from the fire the instant it goes up.
        const inv = this.inventories.get(bot.id)!;
        if (
          (inv.get(CAMPFIRE_ID) ?? 0) >= 1 ||
          canAfford(RECIPES_BY_ID[CAMPFIRE_ID], Object.fromEntries(inv))
        ) {
          return;
        }

        // Not enough wood yet: go get some, the same way any other gather
        // goal would, rather than parking here waiting on regen alone —
        // which for a bot with nothing on hand could otherwise take well
        // over a minute of standing completely still.
        const held = bot.targetId ? this.world.resources.get(bot.targetId) : undefined;
        const tree = held && !held.isDead ? held : this.botNearestTreeResource(bot);
        if (!tree) return; // none in reach — nothing to do but wait
        bot.targetId = tree.id;
        input.held = this.botToolFor(bot, 'tree') ?? input.held;
        input.angle = Math.atan2(tree.y - p.y, tree.x - p.x);
        if (this.botWithinSwing(p, tree.x, tree.y, INTERACT_RADIUS.tree)) {
          input.harvest = true;
        } else {
          this.botSteer(bot, input, tree.x, tree.y, dt);
        }
        return;
      }

      case 'gather': {
        const resource = bot.targetId ? this.world.resources.get(bot.targetId) : undefined;
        if (!resource || resource.isDead || Math.hypot(resource.x - p.x, resource.y - p.y) > BOT_SEARCH_RADIUS) {
          bot.decisionTimer = 0; // harvested, respawning, or out of reach now
          return;
        }
        input.held = this.botToolFor(bot, resource.type) ?? input.held;
        input.angle = Math.atan2(resource.y - p.y, resource.x - p.x);
        if (this.botWithinSwing(p, resource.x, resource.y, INTERACT_RADIUS[resource.type])) {
          input.harvest = true;
        } else {
          this.botSteer(bot, input, resource.x, resource.y, dt);
        }
        return;
      }

      default: {
        this.botSteer(bot, input, bot.targetX, bot.targetY, dt);
        if (Math.hypot(bot.targetX - p.x, bot.targetY - p.y) < 40) bot.decisionTimer = 0;
      }
    }
  }

  /**
   * Distance half of inSwingRange, with a little margin. The angle half is
   * skipped deliberately: the caller has just aimed straight at the target,
   * but `player.angle` only catches up when update() runs later this tick, so
   * testing the cone here would spuriously fail for one tick after a turn.
   */
  private botWithinSwing(p: ServerPlayer, x: number, y: number, radius: number): boolean {
    return Math.hypot(x - p.x, y - p.y) - radius <= HARVEST_RANGE * 0.9;
  }

  /**
   * Walks toward (tx, ty), routing around anything solid via the same nav
   * grid the foxes use. Returns false when it has given up on getting there,
   * so the caller stops pressing the point and picks something else.
   */
  private botSteer(bot: ServerBot, input: PlayerInput, tx: number, ty: number, dt: number): boolean {
    const p = bot.player;

    // Digging out comes before any goal: a path search that starts inside an
    // obstacle has nowhere to go, so a wedged bot has to reach open ground
    // before it can route anywhere at all.
    if (bot.escapeTimer > 0) {
      bot.escapeTimer -= dt;
      if (Math.hypot(bot.escapeX - p.x, bot.escapeY - p.y) > BOT_WAYPOINT_REACHED_DIST) {
        this.botPressToward(input, bot.escapeX - p.x, bot.escapeY - p.y);
        input.angle = Math.atan2(bot.escapeY - p.y, bot.escapeX - p.x);
        return true;
      }
      bot.escapeTimer = 0; // arrived, or out of time — carry on normally
    }

    // Stuck check — pressing keys without covering ground.
    bot.stuckTimer += dt;
    if (bot.stuckTimer >= BOT_STUCK_TIME) {
      const covered = Math.hypot(p.x - bot.lastX, p.y - bot.lastY);
      bot.stuckTimer = 0;
      bot.lastX = p.x;
      bot.lastY = p.y;

      if (covered < BOT_STUCK_DIST) {
        this.botAbandonTarget(bot);
        this.botUnstick(bot);
        return false;
      }
    }

    let aimX = tx;
    let aimY = ty;

    if (this.world.hasClearPath(p.x, p.y, tx, ty)) {
      bot.path = []; // straight shot — no need for waypoints
    } else {
      while (
        bot.path.length > 0 &&
        Math.hypot(bot.path[0].x - p.x, bot.path[0].y - p.y) <= BOT_WAYPOINT_REACHED_DIST
      ) {
        bot.path.shift();
      }

      if (bot.path.length === 0 || bot.repathTimer <= 0) {
        const path = this.world.findPath(p.x, p.y, tx, ty);
        bot.repathTimer = BOT_REPATH_INTERVAL;
        if (path && path.length > 0) {
          bot.path = path;
        } else if (bot.path.length === 0) {
          // No route exists. Crucially, don't fall through to aiming at the
          // target itself — that walks the bot into whatever is in the way and
          // holds it there, grinding against the obstacle indefinitely.
          this.botAbandonTarget(bot);
          this.botUnstick(bot);
          return false;
        }
      }

      if (bot.path.length > 0) {
        aimX = bot.path[0].x;
        aimY = bot.path[0].y;
      }
    }

    const dx = aimX - p.x;
    const dy = aimY - p.y;
    if (Math.hypot(dx, dy) < 2) return true;

    this.botPressToward(input, dx, dy);
    // Face where it's going, unless a behaviour already aimed at something.
    if (bot.goal === 'idle' || bot.goal === 'fish') input.angle = Math.atan2(dy, dx);
    return true;
  }

  /**
   * Gives up on the current target and remembers it as unreachable for a
   * while, so the next goal decision picks something genuinely different
   * rather than the same nearest thing it just failed to reach.
   */
  /**
   * Commits the bot to walking blind for a moment, ignoring pathfinding
   * entirely: toward open ground if it's wedged inside geometry, otherwise in
   * some arbitrary direction.
   *
   * This is the backstop for the nav grid being an approximation of the real
   * collision rules rather than a perfect model of them — most notably it
   * can't represent the tree corridors agents squeeze through. A bot that ends
   * up somewhere the grid believes is sealed has no route to anywhere, and
   * without this it would stand still re-picking goals forever. Shoving it in
   * a direction lets it physically stumble back out to somewhere routable.
   */
  private botUnstick(bot: ServerBot): void {
    const p = bot.player;
    const open = this.world.nearestOpenPoint(p.x, p.y);

    // Only worth heading for if it's meaningfully somewhere else. Open ground
    // right under the bot's feet is useless as a destination: the escape would
    // register as already arrived, fall straight through, and re-trigger — a
    // loop that never presses a key and leaves the bot rooted to the spot.
    if (open && Math.hypot(open.x - p.x, open.y - p.y) > BOT_UNSTICK_MIN_DIST) {
      bot.escapeX = open.x;
      bot.escapeY = open.y;
      bot.escapeTimer = BOT_ESCAPE_TIME;
      return;
    }

    // Otherwise strike out blind, rejecting directions that would just pin the
    // bot against the map edge.
    const dest = this.botPickOpenDirection(p.x, p.y, BOT_UNSTICK_WALK, this.botAvoidsForest(bot));
    bot.escapeX = dest.x;
    bot.escapeY = dest.y;
    bot.escapeTimer = BOT_ESCAPE_TIME;
  }

  /**
   * A point `reach` away in some direction that stays well inside the map and
   * is far enough to actually be walked to. Falls back to heading for the
   * middle of the map, which is always a real direction to move in.
   *
   * `avoidForest` rejects candidates north of darkForestBandAt, the same as
   * botPickResource does for gathering targets — an unarmed bot picking a
   * blind wander/unstick direction shouldn't be able to stumble into the
   * dark forest any more than it can deliberately head there. The map centre
   * fallback is always south of the (top-third) forest band already, so it
   * doesn't need the check.
   */
  private botPickOpenDirection(
    x: number,
    y: number,
    reach: number,
    avoidForest = false,
  ): { x: number; y: number } {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dx = clamp(x + Math.cos(angle) * reach, BOT_EDGE_MARGIN, MAP_SIZE - BOT_EDGE_MARGIN);
      const dy = clamp(y + Math.sin(angle) * reach, BOT_EDGE_MARGIN, MAP_SIZE - BOT_EDGE_MARGIN);
      if (avoidForest && this.botInDarkForest(dx, dy)) continue;
      if (Math.hypot(dx - x, dy - y) > BOT_UNSTICK_MIN_DIST) return { x: dx, y: dy };
    }

    const toCentre = Math.atan2(MAP_SIZE / 2 - y, MAP_SIZE / 2 - x);
    return {
      x: clamp(x + Math.cos(toCentre) * reach, BOT_EDGE_MARGIN, MAP_SIZE - BOT_EDGE_MARGIN),
      y: clamp(y + Math.sin(toCentre) * reach, BOT_EDGE_MARGIN, MAP_SIZE - BOT_EDGE_MARGIN),
    };
  }

  /**
   * Somewhere to run from `threat`. Prefers straight away, but rotates around
   * until it finds a heading that doesn't lead off the map — otherwise a bot
   * cornered against the boundary would flee into it and stop dead.
   *
   * `avoidForest` makes a first pass that also rejects headings into the
   * dark forest — fleeing an unarmed bot into thicker mob pressure would
   * defeat the point of running in the first place — then falls back to
   * whatever's available (forest included) rather than leave it standing
   * still, on the logic that a live bot in the forest beats a dead one
   * anywhere.
   */
  private botFleeDestination(
    p: ServerPlayer,
    threat: BotThreat,
    avoidForest = false,
  ): { x: number; y: number } | null {
    const away = Math.atan2(p.y - threat.y, p.x - threat.x);
    const offsets = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4];

    for (const rejectForest of avoidForest ? [true, false] : [false]) {
      for (const offset of offsets) {
        const angle = away + offset;
        const x = p.x + Math.cos(angle) * BOT_FLEE_DIST;
        const y = p.y + Math.sin(angle) * BOT_FLEE_DIST;
        if (x < BOT_EDGE_MARGIN || y < BOT_EDGE_MARGIN) continue;
        if (x > MAP_SIZE - BOT_EDGE_MARGIN || y > MAP_SIZE - BOT_EDGE_MARGIN) continue;
        if (rejectForest && this.botInDarkForest(x, y)) continue;
        return { x, y };
      }
    }

    return null;
  }

  private botAbandonTarget(bot: ServerBot): void {
    // Only resources are worth remembering. Mobs move — one that's briefly
    // unreachable will have wandered elsewhere a second later, and
    // blacklisting it would leave the bot ignoring something actively biting
    // it. 'heal' counts too now: an unreachable tree it's chopping for
    // campfire wood (see botAct's 'heal' case) is a resource target the same
    // as 'gather's, and without this it would just re-pick the same
    // unreachable tree on the very next decision tick.
    if (bot.targetId && (bot.goal === 'gather' || bot.goal === 'heal')) {
      bot.unreachable.set(bot.targetId, BOT_UNREACHABLE_MEMORY);
    }
    bot.targetId = null;
    bot.path = [];
    bot.decisionTimer = 0; // rethink on the next tick
  }

  /**
   * Turns a heading into the four movement keys. Any axis within ~40% of the
   * dominant one counts as held, which reproduces the eight-way movement a
   * human gets off a keyboard rather than steering on a continuous angle.
   */
  private botPressToward(input: PlayerInput, dx: number, dy: number): void {
    const threshold = Math.max(Math.abs(dx), Math.abs(dy)) * 0.4;
    if (dx > threshold) input.right = true;
    if (dx < -threshold) input.left = true;
    if (dy > threshold) input.down = true;
    if (dy < -threshold) input.up = true;
  }

  /**
   * True when `y` at `x` is inside the dark forest (see darkForestBandAt) —
   * shorthand shared by everywhere the bot AI needs to keep an unarmed bot
   * out of it.
   */
  private botInDarkForest(x: number, y: number): boolean {
    return y < darkForestBandAt(x);
  }

  /**
   * True for a bot with no sword of any tier — the point at which the dark
   * forest's heavier spider/fox pressure (see SPIDER_SPAWN_INTERVAL_DARK_FOREST)
   * stops being a fair fight. Everywhere a bot picks its own destination
   * (gathering, wandering, fleeing) checks this before letting it head north
   * of darkForestBandAt.
   */
  private botAvoidsForest(bot: ServerBot): boolean {
    return this.botBestTool(bot, BOT_SWORD_TIERS) === null;
  }

  /** Best resource in reach, weighted by what the bot currently needs. */
  private botPickResource(bot: ServerBot): ServerResource | null {
    const p = bot.player;
    const inv = this.inventories.get(bot.id)!;
    const hungry = p.hunger < BOT_HUNGER_SEEK_FOOD;
    const avoidForest = this.botAvoidsForest(bot);
    // Wood and stone share the same BOT_MATERIAL_PRIORITY weight (see below),
    // so ordinarily whichever's closer wins — fine when the bot genuinely
    // wants both, but a bot standing in a patch of rock with plenty of wood
    // already banked would keep tiebreaking toward trees it doesn't need
    // over the stone its next tool is actually waiting on. Weighed against
    // what the very next thing in BOT_CRAFT_ORDER still costs, not the
    // recipe after that — a stone pickaxe sitting one rock away is what
    // should pull it, not a gold axe two tiers out.
    const nextCraft = hungry ? null : this.botNextCraftGoal(bot);
    const woodShort = !!nextCraft && (nextCraft.cost.wood ?? 0) > (inv.get('wood') ?? 0);
    const stoneShort = !!nextCraft && (nextCraft.cost.stone ?? 0) > (inv.get('stone') ?? 0);
    // Mechanically able to mine it (right pickaxe) isn't the same question
    // as whether the AI should actually be going after it yet — see
    // botWantsGold and botHasStoneTier: a bot with a fresh stone pickaxe but
    // no stone axe/sword yet shouldn't get pulled off toward a gold nugget
    // that happens to be nearby, any more than botWantsGold would send it on
    // a deliberate trip for one.
    const readyForGold = this.botBestTool(bot, BOT_GOLD_PICKAXE_TIERS) !== null && this.botHasStoneTier(bot);
    // Every wooden tool costs only wood (see BOT_CRAFT_ORDER) — a bot with no
    // pickaxe yet hasn't reached that first tool set, so there's nothing to
    // do with stone yet. Left alone, a distance tiebreak against a nearby
    // tree could just as easily send it to mine bare-handed (no multiplier —
    // see PICKAXE_STONE_MULTIPLIER) before it's gathered enough wood to arm
    // itself at all. Skipped outright rather than merely deprioritised, the
    // same as the gold gate right below.
    const hasPickaxe = this.botBestTool(bot, BOT_PICKAXE_TIERS) !== null;
    // The pickaxe/axe/sword are the actual first thing a bot should be
    // doing — everything past them (bench, rod, stone tier) already waits
    // on them via BOT_CRAFT_ORDER, and an unarmed bot is a bad trade against
    // even a spider (see botChooseGoal's threat handling). That's only
    // guaranteed on the crafting side, though — left to the priority scoring
    // below, a fresh bot with no tree nearby would happily wander off after
    // wheat or a berry patch instead, neither of which the wooden set costs
    // a single unit of. While the set isn't complete, wood is the only thing
    // worth gathering — this doesn't apply while hungry, since a starving
    // bot chasing a sword instead of food is a worse trade, not a better one.
    const needsStarterTools = !hungry && !this.botHasStarterTools(bot);

    let best: ServerResource | null = null;
    let bestScore = -Infinity;

    for (const r of this.world.getNearby(p.x, p.y, BOT_SEARCH_RADIUS)) {
      if (r.type === 'gold' && !readyForGold) continue; // wrong tool, or stone tier unfinished
      if (r.type === 'rock' && !hasPickaxe) continue; // wood first — see above
      if (needsStarterTools && r.type !== 'tree') continue; // wood first — see above
      if (avoidForest && this.botInDarkForest(r.x, r.y)) continue; // unarmed — not worth the risk
      if (bot.unreachable.has(r.id)) continue; // couldn't get to it recently
      let priority = hungry ? BOT_FOOD_PRIORITY[r.type] : BOT_MATERIAL_PRIORITY[r.type];
      // Only break the tie when exactly one of the two is still short — if
      // both are (the common case early in a tier), nearest-first is still
      // the right call, since it'll need the other one too.
      if (r.type === 'tree' && woodShort && !stoneShort) priority += 1;
      if (r.type === 'rock' && stoneShort && !woodShort) priority += 1;
      if (priority <= 0) continue;

      const score = priority * 1000 - Math.hypot(r.x - p.x, r.y - p.y);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    return best;
  }

  /** Nearest spider or fox within `range`, flattened to a common shape. */
  private botNearestThreat(bot: ServerBot, range: number): BotThreat | null {
    const p = bot.player;
    let best: BotThreat | null = null;
    let bestDist = range;

    for (const s of this.spiders.values()) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = { id: s.id, x: s.x, y: s.y, radius: SPIDER_RADIUS, kind: 'spider' };
      }
    }
    for (const f of this.foxes.values()) {
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = { id: f.id, x: f.x, y: f.y, radius: FOX_RADIUS, kind: 'fox' };
      }
    }

    return best;
  }

  /**
   * True once a bot owns a gold-capable pickaxe *and* has finished the whole
   * stone set (see botHasStoneTier) but hasn't finished the gold set yet —
   * the point at which gold, specifically, is what's standing between it and
   * its next tool upgrade. Drives the deliberate trip to GOLD_TOP_BAND in
   * botChooseGoal, below. No botOwnsBetterTool check is needed here the way
   * BOT_CRAFT_ORDER's other gates use one — gold is the top tier, so there's
   * never a better tool to already be holding.
   */
  private botWantsGold(bot: ServerBot): boolean {
    if (this.botBestTool(bot, BOT_GOLD_PICKAXE_TIERS) === null) return false; // can't mine it yet
    if (!this.botHasStoneTier(bot)) return false; // stone axe/sword come first
    const inv = this.inventories.get(bot.id)!;
    return [GOLD_AXE_ID, GOLD_PICKAXE_ID, GOLD_SWORD_ID].some((id) => (inv.get(id) ?? 0) < 1);
  }

  /**
   * A point near the top of the dark forest, straight north of the bot's
   * current position, for botWantsGold to march it toward when no gold
   * deposit is already within BOT_SEARCH_RADIUS. Gold veins are scattered
   * across the full width of the band (see GOLD_CLUSTER in World.ts) rather
   * than clustered at one spot, so heading due north is enough to bring one
   * into range without needing to know where any specific deposit is.
   */
  private botGoldBandDestination(x: number): { x: number; y: number } {
    return {
      x: clamp(x, BOT_EDGE_MARGIN, MAP_SIZE - BOT_EDGE_MARGIN),
      y: clamp(GOLD_TOP_BAND * 0.6, BOT_EDGE_MARGIN, GOLD_TOP_BAND),
    };
  }

  /**
   * True when this bot is an angler that still needs string for a rod, and is
   * in good enough shape to go and take it off a spider.
   */
  private botWantsString(bot: ServerBot): boolean {
    if (!bot.likesFishing) return false;
    if (bot.player.health < this.botHealthThreshold(bot, BOT_STRING_HUNT_MIN_HEALTH)) return false;
    if (!this.botHasStarterTools(bot)) return false; // wooden set comes first

    const inv = this.inventories.get(bot.id)!;
    if ((inv.get(FISHING_ROD_ID) ?? 0) >= 1) return false; // already got one

    const needed = RECIPES_BY_ID[FISHING_ROD_ID]?.cost.string ?? 0;
    return (inv.get('string') ?? 0) < needed;
  }

  /**
   * The best spider within `range` to go after for its string — specifically
   * spiders, since foxes drop food instead. Returns null during the day, when
   * there are none alive to find.
   *
   * Wounded ones are strongly preferred over merely close ones. A spider takes
   * several swings to bring down and bites back the whole time, so a bot
   * usually has to break off at BOT_FLEE_HEALTH and heal before finishing the
   * job. Going back to whatever happened to be nearest would throw away all
   * that damage and start again on a full-health spider — which is most of the
   * reason anglers so rarely banked the three kills a rod's worth of string
   * takes.
   */
  private botNearestSpider(bot: ServerBot, range: number): BotThreat | null {
    const p = bot.player;
    let best: BotThreat | null = null;
    let bestScore = Infinity;

    for (const s of this.spiders.values()) {
      const dist = Math.hypot(s.x - p.x, s.y - p.y);
      if (dist > range) continue;

      // Distance in world units, plus a penalty for how much fight is left in
      // it — so a half-dead spider is worth crossing a fair bit of ground for.
      const score = dist + (s.hp / s.maxHp) * BOT_WOUNDED_PREY_BIAS;
      if (score < bestScore) {
        bestScore = score;
        best = { id: s.id, x: s.x, y: s.y, radius: SPIDER_RADIUS, kind: 'spider' };
      }
    }

    return best;
  }

  /** Re-resolves a threat by id, or null once it's dead/despawned. */
  private botThreatById(id: string | null): BotThreat | null {
    if (!id) return null;
    const spider = this.spiders.get(id);
    if (spider) return { id, x: spider.x, y: spider.y, radius: SPIDER_RADIUS, kind: 'spider' };
    const fox = this.foxes.get(id);
    if (fox) return { id, x: fox.x, y: fox.y, radius: FOX_RADIUS, kind: 'fox' };
    return null;
  }

  private botHasItem(bot: ServerBot, itemId: string): boolean {
    return (this.inventories.get(bot.id)?.get(itemId) ?? 0) >= 1;
  }

  /**
   * Rescales a BOT_FLEE_HEALTH-style constant (all written against
   * MAX_HEALTH — see its doc comment) to this bot's actual maxHealth, so
   * "flee at 35%" means the same thing for a bot running
   * BOT_MAX_HEALTH_MULTIPLIER as it does for a human player at MAX_HEALTH.
   */
  private botHealthThreshold(bot: ServerBot, base: number): number {
    return (base / MAX_HEALTH) * bot.player.maxHealth;
  }

  /** A food item the bot currently owns, if any — for eating when hungry. */
  private botFoodItem(bot: ServerBot): string | null {
    const inv = this.inventories.get(bot.id);
    if (!inv) return null;
    for (const type of FOOD_ITEMS) {
      if ((inv.get(type) ?? 0) >= 1) return type;
    }
    return null;
  }

  /**
   * True when there's an actual reason to make a special trip to a fire and
   * cook: raw meat on hand and nothing already edible to fall back on. Once
   * it's got so much as one berry banked, cooking the rest of a big kill
   * haul stops being urgent — see botChooseGoal and botAct's 'heal' case,
   * which both used to key off raw-meat-present alone. A bot that came back
   * from a hunting spree with, say, six raw meat would park itself at a
   * fire and grind through all six one at a time — several seconds apiece,
   * since each cook needs its own trip through handleCraft's "already
   * crafting" gate — reading as frozen solid even at full health, warmth
   * and hunger the whole time. Gating on "nothing edible yet" instead bounds
   * that to roughly one cook: as soon as the first portion lands, this goes
   * false and the bot moves on, leaving any leftover raw meat to get cooked
   * opportunistically next time it's near a fire for some other reason.
   */
  private botWantsToCook(bot: ServerBot): boolean {
    return this.botHasItem(bot, RAW_MEAT_ID) && this.botFoodItem(bot) === null;
  }

  /** Highest tier in `tiers` the bot actually owns. */
  private botBestTool(bot: ServerBot, tiers: string[]): string | null {
    const inv = this.inventories.get(bot.id)!;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if ((inv.get(tiers[i]) ?? 0) >= 1) return tiers[i];
    }
    return null;
  }

  /** Which tool to have out for a given resource, so the yield bonus applies. */
  private botToolFor(bot: ServerBot, type: ResourceType): string | null {
    if (type === 'tree') return this.botBestTool(bot, BOT_AXE_TIERS);
    if (type === 'rock') return this.botBestTool(bot, BOT_PICKAXE_TIERS);
    // Gold needs a stone pickaxe at minimum, so pick the best one at or above
    // that bar rather than the best pickaxe outright — a wooden one would
    // just bounce off.
    if (type === 'gold') return this.botBestTool(bot, BOT_GOLD_PICKAXE_TIERS);
    return null;
  }

  /** Places benches/fires when useful, then starts the first craft it can afford. */
  private botManageGear(bot: ServerBot): void {
    const p = bot.player;
    const inv = this.inventories.get(bot.id)!;

    // Checked directly here rather than via `bot.goal === 'flee' / 'hunt'`
    // — goal is only refreshed on its own BOT_DECISION_INTERVAL timer, which
    // runs independently of this method's BOT_CRAFT_INTERVAL one and can land
    // up to 1.5s apart. Relying on the (possibly stale) goal let a bot start
    // an unrelated craft — a sword, a bench, whatever was next in
    // BOT_CRAFT_ORDER — in the window right after it took a hit but before
    // its goal caught up to 'flee'/'hunt'. Once started, a craft freezes the
    // bot's input for its full craft time (see updateBot's mid-craft check),
    // which looked like the bot simply seizing up mid-fight. Mirrors
    // botChooseGoal's own ordering: never stop to craft into a fight you'd
    // otherwise be fleeing.
    const threatNearby = this.botNearestThreat(bot, BOT_ENGAGE_RANGE);

    // A carried bench is useless — stone and gold tiers need one standing
    // nearby, and a bot has no other way to find itself next to one.
    if ((inv.get(CRAFTING_BENCH_ID) ?? 0) >= 1 && !this.isNearBench(p) && this.botPlaceNearby(bot, CRAFTING_BENCH_ID)) {
      return;
    }
    // Put a carried campfire down when it's about to be useful. Cold is
    // judged on isNearFire alone — warmth only reaches CAMPFIRE_WARMTH_RADIUS
    // and there's no "walk somewhere to warm up" behaviour, so a freezing bot
    // needs one right here. Being hurt is different: the 'heal' goal will
    // happily walk to an existing fire, so only put a fresh one down when
    // there's genuinely none in reach.
    const hurtWithNoFireInReach =
      p.health <= this.botHealthThreshold(bot, BOT_HEAL_SEEK_HEALTH) && !this.botFireWithinReach(p);
    // Wanting to cook (see botWantsToCook) is just as good a reason as being
    // hurt to want a fire badly enough to build one on the spot — see
    // botChooseGoal, which sends such a bot to the 'heal' goal the same way
    // it does a hurt one. Without this, a warm, healthy bot with nothing
    // edible on hand would walk to the 'heal' goal's target, find no
    // campfire in range, and then just wait there forever: the
    // campfire-building gates below only fired for cold or hurt, so nothing
    // would ever actually get built.
    const wantsToCookWithNoFireInReach = this.botWantsToCook(bot) && !this.botFireWithinReach(p);
    if (
      (inv.get(CAMPFIRE_ID) ?? 0) >= 1 &&
      (p.temperature < 45 || hurtWithNoFireInReach || wantsToCookWithNoFireInReach) &&
      !this.isNearFire(p) &&
      this.botPlaceNearby(bot, CAMPFIRE_ID)
    ) {
      return;
    }

    // Urgently hurt and no fire to place: get one before anything else in the
    // usual priority order below, which would otherwise happily spend the
    // same wood on a workbench or a sword (both come first in
    // BOT_CRAFT_ORDER) and leave nothing for the fire.
    if (
      (hurtWithNoFireInReach || wantsToCookWithNoFireInReach) &&
      !threatNearby &&
      (inv.get(CAMPFIRE_ID) ?? 0) < 1 &&
      canAfford(RECIPES_BY_ID[CAMPFIRE_ID], Object.fromEntries(inv))
    ) {
      this.handleCraft(bot.id, { recipeId: CAMPFIRE_ID });
      return;
    }

    // Same reasoning as the campfire branch above: don't commit to any craft
    // — which locks the bot's input for the full craft time — while
    // something is actually on top of it.
    if (threatNearby) return;

    for (const recipeId of BOT_CRAFT_ORDER) {
      // Every other entry here is a single tool/structure slot — craft one
      // and stop rebuilding. Cooked meat is a stackable consumable instead
      // (see BOT_CRAFT_ORDER's comment on it), so "already carrying one"
      // isn't a reason to leave the rest of a kill raw.
      if (recipeId !== COOKED_MEAT_ID && (inv.get(recipeId) ?? 0) >= 1) continue; // already carrying one
      if (this.botOwnsBetterTool(bot, recipeId)) continue; // outclassed — don't waste the wood
      // Only build a bench when there's actually something bench-gated ready
      // to make. Otherwise a bot builds one, wanders off to gather, finds
      // itself away from a bench and builds another — pouring most of its wood
      // into a trail of workbenches it never uses.
      if (recipeId === CRAFTING_BENCH_ID && (this.isNearBench(p) || !this.botNeedsBench(bot))) continue;
      // Same rule as the bench: only make one when it's actually going to get
      // used. A campfire is spent on being placed, so an unconditional craft
      // here is the one entry a bot returns to indefinitely. "Going to get
      // used" now covers two cases: genuinely cold, or hurt enough to want
      // the faster healing near one (see CAMPFIRE_HEALTH_REGEN_RATE).
      if (
        recipeId === CAMPFIRE_ID &&
        (this.isNearFire(p) ||
          (p.temperature > BOT_CAMPFIRE_TEMP && !hurtWithNoFireInReach && !wantsToCookWithNoFireInReach))
      ) {
        continue;
      }
      // Only anglers take up fishing, and never before they can hold their own
      // — a rod is no use to a bot that hasn't got its wooden set together yet.
      if (recipeId === FISHING_ROD_ID && (!bot.likesFishing || !this.botHasStarterTools(bot))) continue;

      const recipe = RECIPES_BY_ID[recipeId];
      if (!recipe) continue;
      if (recipe.requiresBench && !this.isNearBench(p)) continue;
      if (recipe.requiresCampfire && !this.isNearFire(p)) continue;
      if (!canAfford(recipe, Object.fromEntries(inv))) continue;

      this.handleCraft(bot.id, { recipeId });
      return;
    }
  }

  /**
   * True once the bot holds the whole wooden set (or something better in each
   * slot) — the point at which it has finished starting out and can afford to
   * branch into anything else.
   */
  private botHasStarterTools(bot: ServerBot): boolean {
    const inv = this.inventories.get(bot.id)!;
    return BOT_STARTER_TOOLS.every(
      (id) => (inv.get(id) ?? 0) >= 1 || this.botOwnsBetterTool(bot, id),
    );
  }

  /**
   * True once the bot holds the whole stone set (or something better in each
   * slot) — see BOT_STONE_TOOLS. The gold-tier equivalent of
   * botHasStarterTools: mining gold only needs the pickaxe (see
   * BOT_GOLD_PICKAXE_TIERS), but the AI shouldn't chase it before it's also
   * finished the stone axe and sword.
   */
  private botHasStoneTier(bot: ServerBot): boolean {
    const inv = this.inventories.get(bot.id)!;
    return BOT_STONE_TOOLS.every(
      (id) => (inv.get(id) ?? 0) >= 1 || this.botOwnsBetterTool(bot, id),
    );
  }

  /**
   * True if some bench-gated recipe is affordable right now — the only reason
   * a bot has to spend wood on a workbench.
   */
  private botNeedsBench(bot: ServerBot): boolean {
    const inv = this.inventories.get(bot.id)!;
    const owned = Object.fromEntries(inv);

    return BOT_CRAFT_ORDER.some((id) => {
      const recipe = RECIPES_BY_ID[id];
      if (!recipe?.requiresBench) return false;
      if ((inv.get(id) ?? 0) >= 1) return false;
      if (this.botOwnsBetterTool(bot, id)) return false;
      return canAfford(recipe, owned);
    });
  }

  /**
   * True if the bot already holds a higher tier of the same tool. Upgrading
   * consumes the lower tier, so without this a bot would endlessly rebuild the
   * wooden axe it just spent on a stone one.
   */
  private botOwnsBetterTool(bot: ServerBot, recipeId: string): boolean {
    const inv = this.inventories.get(bot.id)!;
    for (const tiers of BOT_TOOL_TIERS) {
      const rank = tiers.indexOf(recipeId);
      if (rank === -1) continue;
      return tiers.slice(rank + 1).some((better) => (inv.get(better) ?? 0) >= 1);
    }
    return false;
  }

  /**
   * The first *tool/structure* entry in BOT_CRAFT_ORDER this bot hasn't
   * finished yet — what it's actually working toward next, for
   * botPickResource to weigh wood vs stone by (see its woodShort/stoneShort).
   * Cooked meat is skipped: it's a stackable food consumable, not a tool
   * upgrade, and cooking it isn't what should decide whether a bot goes for
   * wood or stone (see BOT_CRAFT_ORDER's comment on it). Doesn't reapply
   * BOT_CRAFT_ORDER's situational gates (bench/campfire worth building right
   * now, angler-only rod) either — those decide *whether* to spend a craft
   * slot on an entry this instant, which isn't the question here. A bot two
   * rocks short of a stone pickaxe still wants those rocks even in a tick
   * where, say, it's not currently near a bench to spend them.
   */
  private botNextCraftGoal(bot: ServerBot): Recipe | null {
    const inv = this.inventories.get(bot.id)!;
    for (const recipeId of BOT_CRAFT_ORDER) {
      if (recipeId === COOKED_MEAT_ID) continue;
      if ((inv.get(recipeId) ?? 0) >= 1) continue;
      if (this.botOwnsBetterTool(bot, recipeId)) continue;
      return RECIPES_BY_ID[recipeId] ?? null;
    }
    return null;
  }

  /** Tries a few spots around the bot for somewhere a structure will actually go. */
  private botPlaceNearby(bot: ServerBot, itemId: string): boolean {
    const p = bot.player;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = 45 + Math.random() * (PLACE_RANGE - 60);
      const x = p.x + Math.cos(angle) * reach;
      const y = p.y + Math.sin(angle) * reach;
      if (!this.isPlaceable(x, y)) continue;

      const before = this.structures.length;
      this.handlePlace(bot.id, { itemId, x, y });
      if (this.structures.length > before) return true;
    }
    return false;
  }

  /**
   * Where to stand and where to cast for the nearest lake — approached from
   * whichever side the bot is already on, so it doesn't walk around the water.
   */
  private botFishingSpot(
    bot: ServerBot,
  ): { standX: number; standY: number; castX: number; castY: number } | null {
    const p = bot.player;
    let nearest: LakeState | null = null;
    let nearestDist = Infinity;

    for (const lake of this.world.lakes) {
      const d = Math.hypot(lake.x - p.x, lake.y - p.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = lake;
      }
    }
    if (!nearest || nearestDist > BOT_SEARCH_RADIUS * 1.5) return null;

    const angle = Math.atan2(p.y - nearest.y, p.x - nearest.x);
    return {
      // Comfortably open water, well inside the wobbly coastline.
      castX: nearest.x + Math.cos(angle) * nearest.radius * 0.55,
      castY: nearest.y + Math.sin(angle) * nearest.radius * 0.55,
      // Dry land just past the shore ring.
      standX: nearest.x + Math.cos(angle) * (nearest.radius + nearest.shoreWidth + 30),
      standY: nearest.y + Math.sin(angle) * (nearest.radius + nearest.shoreWidth + 30),
    };
  }

  // ── State broadcast ────────────────────────────────────────────────────────

  /**
   * What a player is genuinely holding, for everyone else to render. Filtered
   * against the inventory for the same reason tool bonuses and gold mining
   * are: `input.held` is a client claim rather than proof of possession (see
   * PlayerInput), so without this check a doctored packet could put a gold
   * sword in someone's hands on every other player's screen.
   */
  private heldItemOf(player: ServerPlayer): string | null {
    const held = player.input.held;
    if (!held) return null;
    return (this.inventories.get(player.id)?.get(held) ?? 0) >= 1 ? held : null;
  }

  private broadcast(isDay: boolean): void {
    const allPlayers = Array.from(this.players.values());

    for (const player of allPlayers) {
      const socket = this.io.sockets.sockets.get(player.id);
      if (!socket) continue;

      // Spectating swaps the view's anchor from this socket's own player to
      // whoever they're watching (see handleSlashCommand) — everything below
      // that's centred on a position, plus isMe (and everything client-side
      // keyed off it: camera-follow, stat bars, hotbar, reach grid), follows
      // the target instead of the viewer for free. A target that vanished
      // (disconnected) self-heals back to the viewer's own position here
      // rather than needing removePlayer to hunt down every watcher.
      const spectateTargetId = this.spectators.get(player.id);
      let anchor = player;
      if (spectateTargetId) {
        const target = this.players.get(spectateTargetId);
        if (target) anchor = target;
        else this.spectators.delete(player.id);
      }

      const nearbyResources = this.world.getNearby(anchor.x, anchor.y, VIEW_DISTANCE);

      const state: GameState = {
        tick: this.tick,
        dayTime: this.dayTime,
        isDay,
        // All players visible regardless of distance (small player counts)
        players: allPlayers.map(p => p.toState(p.id === anchor.id, this.heldItemOf(p))),
        // Only send resources within the client's view frustum
        resources: nearbyResources.map(r => r.toState()),
        structures: this.structures
          .filter(s => Math.hypot(s.x - anchor.x, s.y - anchor.y) <= VIEW_DISTANCE)
          .map(s => s.toState()),
        spiders: Array.from(this.spiders.values())
          .filter(s => Math.hypot(s.x - anchor.x, s.y - anchor.y) <= VIEW_DISTANCE)
          .map(s => s.toState()),
        foxes: Array.from(this.foxes.values())
          .filter(f => Math.hypot(f.x - anchor.x, f.y - anchor.y) <= VIEW_DISTANCE)
          .map(f => f.toState()),
        spectating: anchor.id !== player.id,
      };

      socket.emit('state', state);
    }
  }

  /**
   * The world behind the main menu — same shape as a real player's GameState
   * (see broadcast above), just anchored on the featured bot's position
   * instead of a specific socket's player, and with every player's isMe left
   * false since nobody watching is actually "them" (see PreviewState's own
   * doc comment for why that matters). Returns null once there's no preview
   * bot to anchor on, which callers treat as "nothing to send" rather than
   * falling back to some other anchor — a preview with no bot in it isn't
   * the point of this at all.
   */
  private buildPreviewState(isDay: boolean): PreviewState | null {
    if (!this.previewBot) return null;
    const { x, y } = this.previewBot.player;

    const allPlayers = Array.from(this.players.values());
    const nearbyResources = this.world.getNearby(x, y, VIEW_DISTANCE);

    return {
      tick: this.tick,
      dayTime: this.dayTime,
      isDay,
      players: allPlayers.map(p => p.toState(false, this.heldItemOf(p))),
      resources: nearbyResources.map(r => r.toState()),
      structures: this.structures
        .filter(s => Math.hypot(s.x - x, s.y - y) <= VIEW_DISTANCE)
        .map(s => s.toState()),
      spiders: Array.from(this.spiders.values())
        .filter(s => Math.hypot(s.x - x, s.y - y) <= VIEW_DISTANCE)
        .map(s => s.toState()),
      foxes: Array.from(this.foxes.values())
        .filter(f => Math.hypot(f.x - x, f.y - y) <= VIEW_DISTANCE)
        .map(f => f.toState()),
      focus: this.previewBot.id,
      lakes: this.world.lakes,
    };
  }

  /**
   * Sends the menu backdrop to every socket that hasn't joined yet (see
   * index.ts's 'lobby' room). Skips the work entirely when the room is
   * empty — nobody sitting on the menu screen is the common case once a
   * server's been up a while, not the exception.
   */
  private broadcastPreview(isDay: boolean): void {
    if ((this.io.sockets.adapter.rooms.get(LOBBY_ROOM)?.size ?? 0) === 0) return;
    const preview = this.buildPreviewState(isDay);
    if (preview) this.io.to(LOBBY_ROOM).emit('preview', preview);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
