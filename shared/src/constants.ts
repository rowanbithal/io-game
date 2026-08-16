import { ResourceType } from './types';

// ── Server simulation ────────────────────────────────────────────────────────
export const TICK_RATE = 20; // Server ticks per second
export const MAP_SIZE = 4000; // World is MAP_SIZE x MAP_SIZE units

// ── Player stats ─────────────────────────────────────────────────────────────
export const PLAYER_SPEED = 150; // Units per second
export const PLAYER_RADIUS = 16;
export const MAX_HUNGER = 150;
export const HUNGER_DECAY_RATE = 0.85; // Per second
export const TEMP_DECAY_RATE = 1.5; // Per second at night
export const TEMP_REGEN_RATE = 0.25; // Per second during day
export const HEALTH_REGEN_RATE = 0.5; // Per second when hunger > 45
// Healing rate while sitting inside a campfire's warmth radius. Several times
// the open-ground rate, so a fire is somewhere to actually recover after a
// fight rather than only a way to stay warm.
export const CAMPFIRE_HEALTH_REGEN_RATE = 3;
export const STARVATION_DAMAGE = 2; // HP/s when hunger = 0
export const COLD_DAMAGE = 1.5; // HP/s when temp = 0

// Item types that restore hunger when eaten (see Game.handleEat). Kept as
// distinct types rather than a single unified "food" — each has its own
// hotbar icon (see HUD.ts's RESOURCE_SPRITE_ICONS). Shared so the client can
// tell whether a hotbar slot is food — deciding whether clicking/selecting
// it eats it instead of holding it (see HUD.selectSlot) — without
// duplicating the list. Raw meat is deliberately absent: it has to be cooked
// into cooked_meat (see shared/crafting.ts) before it's edible.
export const FOOD_ITEMS = new Set(['berry', 'mushroom', 'purple_berry', 'cooked_meat']);

// How much hunger each food item restores when eaten (see Game.handleEat) —
// per item rather than a flat amount, so cooking meat is worth more than a
// berry. Every key here should also be in FOOD_ITEMS, and vice versa.
export const FOOD_HUNGER_RESTORE: Record<string, number> = {
  berry: 1,
  mushroom: 1,
  purple_berry: 1,
  cooked_meat: 25,
};

// ── World ─────────────────────────────────────────────────────────────────────
export const DAY_DURATION = 240; // Seconds for a full day/night cycle
export const DAY_FRACTION = 0.55; // Fraction of the cycle the sun is above the horizon (see daycycle.ts)
export const VIEW_DISTANCE = 950; // Units the client can see around the player

// ── Resources ────────────────────────────────────────────────────────────────
export const HARVEST_RANGE = 65; // Max distance to harvest a resource
export const HARVEST_ANGLE = (75 * Math.PI) / 180; // Aim cone width a resource must fall within to be harvestable
export const HARVEST_DAMAGE = 30; // HP removed from resource per strike
export const HARVEST_COOLDOWN = 0.75; // Seconds between harvest strikes
export const RESOURCE_RADIUS = 22;

// Fine placement/alignment grid (world units per cell) that trees and rocks
// snap to — this is also the grid drawn on the ground. Each tree/rock spans
// several of these cells (see TREE_SPAN/ROCK_SPAN below), so it's much finer
// than either resource's own footprint.
export const GRID_CELL = 10;

// World-unit footprint of a single tree / rock / wheat clump (must be a
// multiple of GRID_CELL). Two orthogonally-adjacent cluster members sit
// exactly one SPAN apart, which is what lets their procedurally-drawn
// footprints touch — for wheat that's what makes a "field" read as one
// continuous patch instead of separate gapped clumps.
export const TREE_SPAN = 80;
export const ROCK_SPAN = 60;
export const WHEAT_SPAN = 20;
// A gold deposit — same boulder shape as a rock, just gold-coloured and
// noticeably bigger (see World.ts's GOLD_CLUSTER / Renderer.ts's GOLD_PALETTE).
export const GOLD_SPAN = 90;

// Collision radii scaled to the larger footprints above (berries/mushrooms
// keep using RESOURCE_RADIUS).
export const TREE_COLLISION_RADIUS = 30;
export const ROCK_COLLISION_RADIUS = 24;
export const GOLD_COLLISION_RADIUS = 36;

/**
 * Which resource types are solid, and how far their collision reaches. The
 * single source of truth for "what blocks movement" — read both by Game.ts
 * (pushing players/mobs back out of them) and by World.ts (baking the fox
 * navigation grid). Types absent here are walkable: berries/mushrooms slow
 * you instead, wheat does nothing at all.
 */
export const SOLID_COLLISION_RADIUS: Partial<Record<ResourceType, number>> = {
  tree: TREE_COLLISION_RADIUS,
  rock: ROCK_COLLISION_RADIUS,
  gold: GOLD_COLLISION_RADIUS,
};

export const MAX_SOLID_COLLISION_RADIUS = Math.max(
  ...(Object.values(SOLID_COLLISION_RADIUS) as number[]),
);

// Dark forest trees and rocks are drawn larger than their plains equivalents
// (see Renderer.ts's FOREST_VARIANT). Shared rather than renderer-local
// because placement clearance below has to know how big these things
// actually appear, not just how big they are to walk into.
export const FOREST_TREE_SCALE = 1.32;
export const FOREST_ROCK_SCALE = 1.5;

/**
 * How far a structure's centre must sit from a solid resource's centre to be
 * placeable — measured against what's *drawn*, not what blocks movement.
 *
 * These differ by a lot, and the gap is a real one: a tree blocks movement
 * within 30 units but its canopy is drawn out to 40 (or ~53 in the dark
 * forest, where trees render enlarged). Clearing only the collision circle
 * leaves a band where a campfire is legally placed and still looks buried in
 * the trunk. Whether any given tree is the enlarged kind is decided by a
 * per-tree coin flip the server doesn't model, so this assumes the larger of
 * the two — better a slightly roomier gap than a structure inside a tree.
 */
export const PLACEMENT_CLEARANCE: Partial<Record<ResourceType, number>> = {
  tree: (TREE_SPAN / 2) * FOREST_TREE_SCALE,
  rock: (ROCK_SPAN / 2) * FOREST_ROCK_SCALE,
  gold: GOLD_SPAN / 2,
};

export const MAX_PLACEMENT_CLEARANCE = Math.max(
  ...(Object.values(PLACEMENT_CLEARANCE) as number[]),
);

// ── Structures ───────────────────────────────────────────────────────────────
export const STRUCTURE_SPAN = 40; // World-unit footprint of a campfire
export const STRUCTURE_COLLISION_RADIUS = 14;
export const PLACE_RANGE = 110; // How far from the player a structure can be placed
export const CAMPFIRE_WARMTH_RADIUS = 190; // Distance the fire keeps you warm within
export const CAMPFIRE_WARMTH_RATE = 6; // Temperature regained per second beside a fire
// How long a campfire burns before going out, and how long it spends visibly
// guttering on the way there. Staying warm is an ongoing cost rather than
// something you solve once, and the fade is the warning: a fire about to die
// has to look like one, or players only find out when the light is already
// gone and the cold has started. See Renderer.burnFade.
export const CAMPFIRE_LIFETIME = 60;
export const CAMPFIRE_BURNOUT_FADE = 10;
// Visual glow reach (client-side only) — noticeably tighter than the warmth
// radius, so the fire reads as a small pool of light you huddle around.
export const CAMPFIRE_LIGHT_RADIUS = 155;

// ── Spiders (night threat) ──────────────────────────────────────────────────
export const SPIDER_RADIUS = 26; // "Large" — noticeably bigger than a player (16)
export const SPIDER_SPEED = 95; // Slower than the player (150), so it's outrunnable
export const SPIDER_MAX_HP = 360; // 12 unarmed swings (HARVEST_DAMAGE each) to kill
export const SPIDER_DAMAGE = 14; // HP dealt to a player per bite
export const SPIDER_ATTACK_RANGE = 40; // Must be this close to bite
export const SPIDER_ATTACK_COOLDOWN = 1; // Seconds between bites
export const SPIDER_AGGRO_RANGE = 420; // Distance within which a spider notices and chases a player
export const SPIDER_MAX_COUNT = 14; // Cap on spiders alive at once
export const SPIDER_SPAWN_INTERVAL = 3; // Seconds between spawn attempts while it's night
export const SPIDER_MIN_PLAYER_SPAWN_DIST = 350; // Don't spawn right on top of someone
export const SPIDER_STRING_DROP = 2; // String dropped when a spider is killed

// ── Foxes (dark forest predator) ────────────────────────────────────────────
// Tuned as the spider's opposite number: where a spider is a slow, tanky
// night-wide threat, a fox is fast, fragile, and tied to the dark forest but
// active around the clock. Its real edge is that it ignores solid resources
// entirely (see Game.ts's updateFox) — inside the dense forest it closes on a
// player who has to run around every trunk, while out on the open plains a
// player is genuinely faster and can break away.
export const FOX_RADIUS = 20; // Between a player (16) and a spider (26)
export const FOX_SPEED = 115; // Slower than the player (150), so it's outrunnable in the open
export const FOX_MAX_HP = 120; // 4 unarmed swings (HARVEST_DAMAGE each) — far squishier than a spider's 12
export const FOX_DAMAGE = 9; // Less per bite than a spider (14), but it bites more often
export const FOX_ATTACK_RANGE = 34;
export const FOX_ATTACK_COOLDOWN = 0.8; // Seconds between bites
export const FOX_AGGRO_RANGE = 480; // How close a player must get before a fox notices them
// Once locked on, a fox keeps chasing until its quarry gets this far away,
// then loses interest and gives up. Deliberately wider than the acquisition
// range above: with a single threshold a player sitting right at the edge of
// a fox's senses would make it flicker between chasing and idling every few
// ticks. The gap between the two is the hysteresis that stops that.
export const FOX_LOSE_INTEREST_RANGE = 780;
export const FOX_MAX_COUNT = 8; // Cap on foxes alive at once
export const FOX_SPAWN_INTERVAL = 6; // Seconds between spawn attempts
export const FOX_MIN_PLAYER_SPAWN_DIST = 300; // Don't spawn right on top of someone
export const FOX_FOOD_DROP = 2; // Food yielded when a fox is killed
// How far past the forest's edge a fox will linger once it has lost its
// target before giving up and despawning (see Game.ts's updateFox). Without
// this, foxes lured out onto the plains would sit there forever, permanently
// occupying FOX_MAX_COUNT slots and starving the forest of new spawns.
export const FOX_FOREST_LEEWAY = 300;

// Pathfinding (see World.ts's findPath and Game.ts's updateFox). A fox only
// runs a search when something solid actually stands between it and its
// target — in the open it just steers straight — and it reuses that path for
// FOX_REPATH_INTERVAL before recomputing, so a moving player doesn't trigger
// a fresh search every tick.
export const FOX_REPATH_INTERVAL = 0.5; // Seconds a computed path is reused before refreshing
export const FOX_WAYPOINT_REACHED_DIST = 18; // How close counts as having arrived at a waypoint

// ── Bots ─────────────────────────────────────────────────────────────────────
// Server-simulated players (see server/src/Bot.ts). They're real ServerPlayer
// entities driven by an AI that writes the same PlayerInput a browser would
// send, so every rule below them — movement, collision, harvest cones, hunger,
// crafting, death — is the exact code path a human plays through.
export const BOT_SEARCH_RADIUS = 900; // How far a bot looks for something to harvest
export const BOT_ENGAGE_RANGE = 300; // Hostile within this and healthy → fight it
// How far an angler will travel to pick a fight with a spider when it still
// needs string for a rod. Much wider than BOT_ENGAGE_RANGE, which is only
// about defending itself from whatever wandered up: this is the bot going
// looking, because spiders are the only source of string in the game.
export const BOT_STRING_HUNT_RANGE = 1000;
export const BOT_STRING_HUNT_MIN_HEALTH = 60; // Don't go picking fights while hurt
// How far out of its way a bot will go for an already-wounded spider rather
// than a nearer healthy one, in world units at full health. A spider takes
// several swings and bites back throughout, so bots routinely have to retreat
// and heal mid-fight; without this they'd come back to whichever was closest
// and waste everything they'd already landed.
export const BOT_WOUNDED_PREY_BIAS = 1200;
// Distance at which a bot gives up on a mob it was chasing.
export const BOT_HUNT_ABANDON_RANGE = 1300;
export const BOT_FLEE_HEALTH = 35; // Below this, run from hostiles instead of fighting
export const BOT_HUNGER_SEEK_FOOD = 83; // Below this, prioritise berries/mushrooms over wood/stone (55% of MAX_HUNGER)
export const BOT_CAMPFIRE_TEMP = 65; // Only bother making a campfire once this cold
export const BOT_HEAL_SEEK_HEALTH = 50; // At or below this (and nothing chasing it), go sit by a fire
export const BOT_HEAL_DONE_HEALTH = 85; // Healed up enough to get back to work
// How far a hurt bot will walk to an existing campfire rather than building
// its own. Far wider than CAMPFIRE_WARMTH_RADIUS, which only asks "am I being
// warmed right now" — the question here is "is there one worth the walk",
// and walking costs time where a new fire costs 20 wood every time.
export const BOT_FIRE_REUSE_RANGE = 700;
export const BOT_DECISION_INTERVAL = 1.5; // Seconds before reconsidering the current goal
export const BOT_CRAFT_INTERVAL = 2; // Seconds between attempts to start a craft
export const BOT_REPATH_INTERVAL = 0.6; // Seconds a computed path is reused
export const BOT_WAYPOINT_REACHED_DIST = 16;
export const BOT_FISH_INTERVAL = 45; // Seconds between fishing trips, when a bot owns a rod
export const BOT_STUCK_TIME = 1.5; // Seconds of trying-but-not-moving before giving up on a target
export const BOT_STUCK_DIST = 8; // Distance that counts as "actually moved" over BOT_STUCK_TIME
// How long a bot remembers that it couldn't reach something, so after giving
// up it goes and does something else instead of immediately re-picking the
// same unreachable target (which is what made a wedged bot stay wedged).
export const BOT_UNREACHABLE_MEMORY = 25;
// Cap on how long a bot spends walking itself back out to open ground after
// ending up inside solid geometry.
export const BOT_ESCAPE_TIME = 3;
// How far a blind unstick walk aims for. Has to comfortably exceed
// BOT_WAYPOINT_REACHED_DIST or the bot "arrives" the instant it sets off and
// stands still instead.
export const BOT_UNSTICK_WALK = 140;
export const BOT_UNSTICK_MIN_DIST = 40;
// How far a fleeing bot tries to put between itself and whatever is chasing it.
export const BOT_FLEE_DIST = 260;
// Keep-out margin from the map edge for any AI-chosen destination, so a bot
// never picks a spot that just pins it against the boundary.
export const BOT_EDGE_MARGIN = 80;

// ── Fishing ──────────────────────────────────────────────────────────────────
export const CAST_RANGE = 220; // Max distance a line can be cast from the player
export const FISH_WAIT_MIN = 2.5; // Seconds before a bite, minimum
export const FISH_WAIT_MAX = 5; // Seconds before a bite, maximum
export const FISH_BITE_WINDOW = 0.6; // Final stretch of the wait shown as a "bite" flourish

// ── Dark forest biome ────────────────────────────────────────────────────────
// A fixed, deterministic zone rather than a random per-session one (unlike
// lakes) — both server and client derive it from MAP_SIZE alone, so no extra
// data needs to travel over the network for either the density boost (server)
// or the ground/tree visuals (client).
// Average world y the biome begins at (top third of the map) — the actual
// border wanders above/below this per world x, see darkForestBandAt in
// biome.ts. Kept here rather than there since biome.ts needs it to define
// that function.
export const DARK_FOREST_BAND = MAP_SIZE / 3;
// World units the grass→dirt seam spans below the band edge. A speckled seam
// like the sand ring around a lake, not a long fade — dirt should read as a
// tight border right at the tree line, not something the plains gradually
// turn into from a long way off (the grass darkening ramp, a separate and
// much wider effect, handles the long-range approach — see
// FOREST_GRASS_REACH in Renderer.ts).
export const DARK_FOREST_TRANSITION = 130;

// World y below which gold seeds are allowed to land — "near the top of the
// dark forest" (small y = the far/north edge of the map, deepest into the
// biome). Kept well under the dark forest band's lowest possible edge
// (DARK_FOREST_BAND - DARK_FOREST_EDGE_AMPLITUDE, ~1170) so every gold
// deposit lands solidly inside the forest regardless of how the border
// meanders at that x.
//
// Shared rather than server-local because the client keys its fog off the
// same line: the mist is thickest exactly where the gold is, so "it gets hard
// to see up here" and "this is where the gold lives" stay the same depth as
// each other even if this number moves.
export const GOLD_TOP_BAND = 420;
