import { ServerPlayer } from './Player';

let nextId = 0;

/**
 * What a bot is currently trying to do. Chosen fresh by the AI each decision
 * tick (see Game.ts's botChooseGoal) rather than being a sticky state
 * machine, so a bot reacts to a fox wandering up mid-chop without needing
 * explicit transitions out of every other state.
 */
export type BotGoal = 'gather' | 'hunt' | 'flee' | 'fish' | 'heal' | 'idle';

/**
 * A server-simulated player. The `player` field is a perfectly ordinary
 * ServerPlayer living in Game's players map alongside the human ones — it
 * collides, starves, harvests, crafts, dies and shows up on the leaderboard
 * through exactly the same code. Everything here is just the scratch state
 * the AI needs to decide what PlayerInput to write into it each tick.
 */
export class ServerBot {
  readonly player: ServerPlayer;

  goal: BotGoal = 'idle';

  /** Resource id / mob id the current goal is pointed at, when it has one. */
  targetId: string | null = null;
  /** World position the bot is walking to (a resource, a mob, a shoreline). */
  targetX = 0;
  targetY = 0;

  /** Open water a fishing trip is aiming its cast at (target* is the dry spot to stand on). */
  castX = 0;
  castY = 0;

  /** Remaining waypoints around obstacles (see World.findPath). */
  path: { x: number; y: number }[] = [];
  repathTimer = 0;

  decisionTimer = 0;
  craftTimer = 0;
  fishTimer = Math.random() * 30; // stagger, so a group of bots doesn't all fish at once

  /** Where the bot was when the stuck check last sampled, and how long it's been trying. */
  lastX = 0;
  lastY = 0;
  stuckTimer = 0;

  /**
   * Open ground the bot is currently walking back out to, after ending up
   * wedged inside solid geometry. While `escapeTimer` is running this
   * overrides the goal entirely — a path search starting inside an obstacle
   * has nowhere to go, so digging out has to happen first.
   */
  escapeX = 0;
  escapeY = 0;
  escapeTimer = 0;

  /**
   * Targets recently given up on as unreachable, mapped to the seconds left
   * before the bot is willing to reconsider them. Without this a bot that
   * abandons a target instantly re-picks the same nearest one and wedges
   * itself against it again.
   */
  readonly unreachable = new Map<string, number>();

  /**
   * Whether this bot is the sort to take up fishing. Only anglers will spend
   * string on a rod, and the fishing goal requires owning one — so this is
   * what splits the population into some who head for the water once they've
   * banked enough string and some who just keep working the tree line.
   */
  readonly likesFishing: boolean;

  constructor(name: string, likesFishing: boolean) {
    // Prefixed so a bot id can never collide with a socket id.
    this.player = new ServerPlayer(`bot${nextId++}`, name);
    this.likesFishing = likesFishing;
    this.lastX = this.player.x;
    this.lastY = this.player.y;
  }

  get id(): string {
    return this.player.id;
  }

  /**
   * Wipes the AI's scratch state. Called when the bot respawns, since it
   * comes back somewhere else entirely — every waypoint, target and
   * unreachable note it was holding refers to where it died, and following
   * any of it would send the bot marching back across the map.
   */
  resetAfterDeath(): void {
    this.goal = 'idle';
    this.targetId = null;
    this.path = [];
    this.repathTimer = 0;
    this.decisionTimer = 0;
    this.escapeTimer = 0;
    this.stuckTimer = 0;
    this.unreachable.clear();
    this.lastX = this.player.x;
    this.lastY = this.player.y;
  }
}

/**
 * This one is always an angler, wherever it lands in the spawn order and
 * however many bots there are — unlike the rest, whose interest in fishing
 * just alternates to keep a mix (see Game.addBots).
 */
export const ALWAYS_ANGLER_NAME = 'Tomas';

/** Names bots join under. Deliberately ordinary-looking — they play as players. */
export const BOT_NAMES = [
  ALWAYS_ANGLER_NAME, 'Pebble', 'Juniper', 'Copper', 'Wren',
  'Ash', 'Mossy', 'Flint', 'Bramble', 'Tamsin',
  'Sorrel', 'Birch', 'Hazel', 'Ember', 'Fern',
];
