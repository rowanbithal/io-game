// ── Primitives ────────────────────────────────────────────────────────────────
export interface Vec2 {
  x: number;
  y: number;
}

// ── Resources ────────────────────────────────────────────────────────────────
export type ResourceType = 'tree' | 'rock' | 'berry' | 'mushroom' | 'wheat' | 'purple_berry' | 'gold';

export interface ResourceState {
  id: string;
  type: ResourceType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

// ── Lakes ─────────────────────────────────────────────────────────────────────
// Static terrain features — generated once at world startup and sent to the
// client a single time (in JoinedPayload), unlike resources which change and
// are re-sent every tick.
export interface LakeState {
  id: string;
  x: number;
  y: number;
  radius: number; // Water radius
  shoreWidth: number; // Sand/pebble ring thickness beyond the water's edge
  seed: number; // Deterministic seed for the client's procedural shoreline shape
}

// ── Structures ────────────────────────────────────────────────────────────────
// Player-built objects placed into the world at runtime (unlike resources,
// which the world generates, and lakes, which never change).
export type StructureType = 'campfire' | 'crafting_bench';

export interface StructureState {
  id: string;
  type: StructureType;
  x: number;
  y: number;
  /**
   * Seconds until this burns out, or null if it never does. Sent so the
   * client can gutter a campfire's light as its last seconds run down (see
   * CAMPFIRE_BURNOUT_FADE) — the countdown itself stays server-authoritative,
   * the client only decides how to draw it.
   */
  life: number | null;
}

// ── Spiders ───────────────────────────────────────────────────────────────────
// A night-only hostile mob: spawns after dark, chases the nearest player, and
// vanishes at dawn (see SPIDER_* constants). Purely server-driven, like
// resources — no client-side simulation.
export interface SpiderState {
  id: string;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
}

// ── Foxes ─────────────────────────────────────────────────────────────────────
// The dark forest's resident predator. Unlike spiders (night-only, map-wide)
// foxes are tied to the biome instead of the clock — they spawn inside the
// dark forest and hunt around it through both day and night. Same
// server-driven, no-client-simulation deal as spiders.
export interface FoxState {
  id: string;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
}

// ── Fishing ───────────────────────────────────────────────────────────────────
// A player's active cast, if any — the bobber's world position plus whether
// it's in its final "bite" flourish just before the fish is reeled in.
export interface FishingState {
  x: number;
  y: number;
  bite: boolean;
}

// ── Player ────────────────────────────────────────────────────────────────────
export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number; // direction player is facing (radians)
  health: number; // 0-maxHealth
  maxHealth: number; // Usually MAX_HEALTH (100) — bots run higher, see BOT_MAX_HEALTH_MULTIPLIER
  hunger: number; // 0-100
  temperature: number; // 0-100
  score: number;
  harvestCooldown: number; // Seconds until the next harvest swing is allowed; used client-side to animate the swing
  craftingId: string | null; // Recipe currently being crafted, if any
  craftingProgress: number; // 0..1 through the current craft
  fishing: FishingState | null; // Active cast, if any
  // Item this player has out, so everyone can see the axe/sword/pickaxe in
  // their hands — not just the player holding it. Already filtered against
  // their inventory server-side, so it reflects something they genuinely own
  // rather than the raw claim from PlayerInput.
  held: string | null;
  // What this player last said, or null. Lives on the snapshot rather than
  // being tracked client-side off the chat event so that a player who walks
  // into view mid-message still shows their bubble, and so the server owns
  // when it expires (see CHAT_BUBBLE_SECONDS).
  chat: string | null;
  isMe?: boolean; // Set client-side
}

// ── Network messages ──────────────────────────────────────────────────────────

/** Sent client → server every tick */
export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  angle: number; // mouse angle relative to player
  harvest: boolean; // one-shot pulse (E key / click)
  // Hotbar item the player currently has out. The server re-checks that the
  // player actually owns it before granting any tool bonus — this field is
  // a client claim, not proof of possession.
  held: string | null;
}

/** Sent client → server to begin crafting a recipe */
export interface CraftRequest {
  recipeId: string;
}

/** Sent client → server to place a crafted structure at a world position */
export interface PlaceRequest {
  itemId: string;
  x: number;
  y: number;
}

/** Sent client → server to cast a fishing line at a world position */
export interface CastRequest {
  x: number;
  y: number;
}

/**
 * Sent client → server to eat a food item straight from the hotbar. Unlike
 * PlaceRequest/CastRequest, this isn't derived from PlayerInput.held — food
 * is never held at all (eating it doesn't equip it), so the item has to be
 * named explicitly. The server re-verifies ownership regardless.
 */
export interface EatRequest {
  itemId: string;
}

/** Sent client → server when a player sends a chat message */
export interface ChatRequest {
  text: string;
}

/**
 * Sent server → every client when anyone chats — this is what fills the chat
 * log on the side of the screen. The bubble over the sender's head comes from
 * PlayerState.chat instead, since that has to expire on its own.
 */
export interface ChatMessage {
  id: string; // Sender's player id, so a client can spot its own messages
  name: string;
  text: string;
}

/** Authoritative snapshot sent server → client every tick */
export interface GameState {
  tick: number;
  dayTime: number; // 0 = noon, 0.5 = midnight, wraps 0..1
  isDay: boolean;
  players: PlayerState[];
  resources: ResourceState[]; // Only nearby resources are included
  structures: StructureState[]; // Only nearby structures are included
  spiders: SpiderState[]; // Only nearby spiders are included
  foxes: FoxState[]; // Only nearby foxes are included
  /**
   * True when this socket is watching another player via "/spectate <name>"
   * instead of playing their own. When set, `isMe` in `players` marks the
   * spectated player rather than this socket's own entity — everything
   * anchored on isMe (camera, stat bars, hotbar, reach grid) follows them
   * for free. See Game.ts's broadcast and handleSlashCommand.
   */
  spectating?: boolean;
}

/**
 * Sent server → client, on a loop, to any socket that hasn't joined yet —
 * the live world behind the main menu, so a first-time visitor sees the game
 * being played before they've entered a name. Everything is filtered the
 * same way a real player's GameState is (see Game.ts's buildPreviewState),
 * just anchored on a featured bot instead of a specific viewer. `focus` is
 * that bot's id — a stand-in for the `isMe` flag a real GameState uses,
 * since nothing here is genuinely "you" and marking one player isMe would
 * also switch on player-only UI (the reach grid, placement ghosts) that a
 * menu backdrop shouldn't show.
 *
 * Deliberately an id into `players` rather than a raw {x, y}: the client
 * interpolates entries in `players` between ticks for smooth motion (see
 * StateManager), but a bare coordinate pair sent alongside it would still
 * jump once per tick — exactly the mismatch that made the camera look
 * jittery relative to the smoothly-moving bot before this was an id.
 */
export interface PreviewState extends GameState {
  focus: string;
  lakes: LakeState[];
}

/** Sent once when client successfully joins */
export interface JoinedPayload {
  id: string;
  mapSize: number;
  lakes: LakeState[];
}

/** Sent when a harvest action yields drops */
export interface HarvestPayload {
  drops: { type: string; count: number }[];
  inventory: Record<string, number>;
}

/**
 * Sent whenever the inventory changes outside of harvesting (crafting
 * consuming ingredients, a finished craft arriving, placing a structure).
 * `message` is an optional toast for the client to surface.
 */
export interface InventoryPayload {
  inventory: Record<string, number>;
  message?: string;
}

/** Leaderboard entry */
export interface LeaderEntry {
  name: string;
  score: number;
}
