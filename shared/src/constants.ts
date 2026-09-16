import { ResourceType, StructureType } from './types';

// ── Server simulation ────────────────────────────────────────────────────────
export const TICK_RATE = 20; // Server ticks per second
export const MAP_SIZE = 4000; // World is MAP_SIZE x MAP_SIZE units

// ── Player stats ─────────────────────────────────────────────────────────────
export const PLAYER_SPEED = 150; // Units per second
export const PLAYER_RADIUS = 16;
// The health pool a human player spawns with. Also the scale the BOT_*
// health thresholds below (BOT_FLEE_HEALTH and friends) are tuned against —
// see Game.ts's botHealthThreshold, which rescales them for a bot's actual
// maxHealth rather than assuming every player tops out at 100.
export const MAX_HEALTH = 100;
export const MAX_HUNGER = 100;
export const HUNGER_DECAY_RATE = 0.65; // Per second
export const TEMP_DECAY_RATE = 1.5; // Per second at night
export const TEMP_REGEN_RATE = 0.25; // Per second during day
// A worn, lit torch blunts the night's cooling rather than beating it the
// way a campfire does (see CAMPFIRE_WARMTH_RATE) — this is subtracted from
// TEMP_DECAY_RATE rather than added on top of it, and stays smaller than
// TEMP_DECAY_RATE on purpose, so temperature still drifts down at night with
// a torch out, just slower. A torch is something to see by, not a
// substitute for building a fire.
export const TORCH_WARMTH_RATE = 1.0;
export const HEALTH_REGEN_RATE = 0.5; // Per second when hunger/temperature are above the thresholds below
// Health regen (both the open-ground rate above and CAMPFIRE_HEALTH_REGEN_RATE
// below) is gated behind these — a starving or freezing player doesn't heal at
// all, campfire or not. Named rather than left as magic numbers in
// ServerPlayer.update because the bot AI needs the same threshold: it's
// pointless (see botChooseGoal's heal branch) to send a bot to sit by a fire
// while it's hungry enough that the fire wouldn't actually heal it.
export const HEALTH_REGEN_MIN_HUNGER = 45;
export const HEALTH_REGEN_MIN_TEMPERATURE = 20;
export const HEALTH_REGEN_MIN_THIRST = 20;
// Healing rate while sitting inside a campfire's warmth radius. Several times
// the open-ground rate, so a fire is somewhere to actually recover after a
// fight rather than only a way to stay warm.
export const CAMPFIRE_HEALTH_REGEN_RATE = 3;
export const STARVATION_DAMAGE = 2; // HP/s when hunger = 0
export const COLD_DAMAGE = 1.5; // HP/s when temp = 0
export const MAX_THIRST = 100;
export const THIRST_DECAY_RATE = 0.8; // Per second
// Refilling by wading is much faster than the decay rate — a lake is meant to
// be a quick top-up, not somewhere to camp.
export const THIRST_REGEN_RATE_IN_WATER = 20; // Per second while in lake water
export const DEHYDRATION_DAMAGE = 2; // HP/s when thirst = 0

// Item types that restore hunger when eaten (see Game.handleEat). Kept as
// distinct types rather than a single unified "food" — each has its own
// hotbar icon (see HUD.ts's RESOURCE_SPRITE_ICONS). Shared so the client can
// tell whether a hotbar slot is food — deciding whether clicking/selecting
// it eats it instead of holding it (see HUD.selectSlot) — without
// duplicating the list. Raw meat is deliberately absent: it has to be cooked
// into cooked_meat (see shared/crafting.ts) before it's edible.
export const FOOD_ITEMS = new Set(['berry', 'mushroom', 'cooked_meat']);

// How much hunger each food item restores when eaten (see Game.handleEat) —
// per item rather than a flat amount, so cooking meat is worth more than a
// berry. Every key here should also be in FOOD_ITEMS, and vice versa.
export const FOOD_HUNGER_RESTORE: Record<string, number> = {
  berry: 2,
  mushroom: 2,
  cooked_meat: 15,
};

// ── World ─────────────────────────────────────────────────────────────────────
export const DAY_DURATION = 240; // Seconds for a full day/night cycle
export const DAY_FRACTION = 0.55; // Fraction of the cycle the sun is above the horizon (see daycycle.ts)
export const VIEW_DISTANCE = 950; // Units the client can see around the player

// ── Beetles (desert predator) ───────────────────────────────────────────────
// Tied to the desert biome the same way a fox is tied to the dark forest —
// spawns and hunts inside it around the clock, sticky-aggro with a leash back
// to its own biome (see Game.ts's updateBeetle/beetleTarget). Unlike a fox it
// doesn't pathfind: the desert has nothing dense enough to route around, so a
// beetle just steers straight at its target and bounces off anything solid,
// the same simple approach a spider uses.
export const BEETLE_RADIUS = 18; // Between a player (16) and a fox (20)
export const BEETLE_SPEED = 130; // Faster than a fox (105) — the desert's own slowdown (see DESERT_SPEED_MULTIPLIER) is what makes this a real threat, not raw speed alone
export const BEETLE_MAX_HP = 150; // 5 unarmed swings — squishier than a fox, but there are more of them at once
export const BEETLE_DAMAGE = 9;
export const BEETLE_ATTACK_RANGE = 32;
export const BEETLE_ATTACK_COOLDOWN = 0.7;
export const BEETLE_AGGRO_RANGE = 380;
// Same hysteresis role as FOX_LOSE_INTEREST_RANGE — wider than the acquisition
// range so a beetle doesn't flicker in and out of a chase at the edge of its senses.
export const BEETLE_LOSE_INTEREST_RANGE = 420;
export const BEETLE_MAX_COUNT = 16;
export const BEETLE_SPAWN_INTERVAL = 4; // Seconds between map-wide (desert-confined) spawn attempts, day or night
export const BEETLE_MIN_PLAYER_SPAWN_DIST = 280;
export const BEETLE_FOOD_DROP = 1; // Raw meat yielded when a beetle is killed — cook it like a fox kill
// How far past the desert's edge a beetle will chase before giving up — the
// beetle's answer to FOX_FOREST_LEEWAY.
export const BEETLE_DESERT_LEEWAY = 300;
// Seconds a beetle can go with nobody to chase before it despawns outright —
// the beetle's answer to FOX_IDLE_DESPAWN_TIME.
export const BEETLE_IDLE_DESPAWN_TIME = 30;

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
// A diamond deposit — same boulder shape again, confined to the far side of
// the desert (see World.ts's DIAMOND_CLUSTER / Renderer.ts's DIAMOND_PALETTE).
// Only a gold pickaxe can mine it (see Game.ts's DIAMOND_CAPABLE_TOOLS) — the
// stone pickaxe unlocks gold, but diamond stays the gold pickaxe's own reward.
export const DIAMOND_SPAN = 90;

// Collision radii scaled to the larger footprints above (berries/mushrooms
// keep using RESOURCE_RADIUS).
export const TREE_COLLISION_RADIUS = 30;
export const ROCK_COLLISION_RADIUS = 24;
export const GOLD_COLLISION_RADIUS = 36;
export const DIAMOND_COLLISION_RADIUS = 36;

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
  diamond: DIAMOND_COLLISION_RADIUS,
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
 * How far a structure's centre must sit from a resource's centre to be
 * placeable — measured against what's *drawn*, not what blocks movement.
 * Covers every resource type, walkable ones included: a berry bush or wheat
 * clump doesn't block a placement the way a tree does, but it still
 * shouldn't end up buried under (or grow back through) whatever gets built
 * on top of it — see Game.isPlaceable and World's respawn-blocking check.
 *
 * The solid types (tree/rock/gold) differ from their own collision radius by
 * a lot, and the gap is a real one: a tree blocks movement within 30 units
 * but its canopy is drawn out to 40 (or ~53 in the dark forest, where trees
 * render enlarged). Clearing only the collision circle leaves a band where a
 * campfire is legally placed and still looks buried in the trunk. Whether
 * any given tree is the enlarged kind is decided by a per-tree coin flip the
 * server doesn't model, so this assumes the larger of the two — better a
 * slightly roomier gap than a structure inside a tree.
 */
export const PLACEMENT_CLEARANCE: Record<ResourceType, number> = {
  tree: (TREE_SPAN / 2) * FOREST_TREE_SCALE,
  rock: (ROCK_SPAN / 2) * FOREST_ROCK_SCALE,
  gold: GOLD_SPAN / 2,
  diamond: DIAMOND_SPAN / 2,
  berry: RESOURCE_RADIUS,
  mushroom: RESOURCE_RADIUS,
  purple_berry: RESOURCE_RADIUS,
  wheat: WHEAT_SPAN / 2,
};

export const MAX_PLACEMENT_CLEARANCE = Math.max(
  ...(Object.values(PLACEMENT_CLEARANCE) as number[]),
);

// ── Structures ───────────────────────────────────────────────────────────────
// World-unit footprint of each placed structure — how much room it takes up
// for rendering and for keeping structures from overlapping each other or
// nearby resources (see Game.isPlaceable). A wall is deliberately sized to
// match a plains tree (TREE_SPAN/TREE_COLLISION_RADIUS) rather than getting
// its own number: it's meant to read as "about as big an obstacle as a
// tree," the thing players already know blocks a path.
export const STRUCTURE_SPAN: Record<StructureType, number> = {
  campfire: 40,
  crafting_bench: 40,
  wall: TREE_SPAN,
};
export const STRUCTURE_COLLISION_RADIUS: Record<StructureType, number> = {
  campfire: 14,
  crafting_bench: 14,
  wall: TREE_COLLISION_RADIUS,
};
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
// A held torch is a personal, portable light — dimmer and shorter-reaching
// than a campfire so it doesn't trivialize building/keeping one lit.
export const TORCH_LIGHT_RADIUS = 90;
// Seconds a torch stays lit once equipped before it burns out and is
// consumed (see Game.tickTorch) — much shorter than a campfire's
// CAMPFIRE_LIFETIME, since it's meant to be a cheap, disposable light
// rather than something to settle in by.
export const TORCH_LIFETIME = 30;

// ── Spiders (night threat) ──────────────────────────────────────────────────
export const SPIDER_RADIUS = 26; // "Large" — noticeably bigger than a player (16)
export const SPIDER_SPEED = 95; // Slower than the player (150), so it's outrunnable
export const SPIDER_MAX_HP = 360; // 12 unarmed swings (HARVEST_DAMAGE each) to kill
export const SPIDER_DAMAGE = 14; // HP dealt to a player per bite
export const SPIDER_ATTACK_RANGE = 40; // Must be this close to bite
export const SPIDER_ATTACK_COOLDOWN = 1; // Seconds between bites
export const SPIDER_AGGRO_RANGE = 420; // Distance within which a spider notices and chases a player
// Raised alongside SPIDER_SPAWN_INTERVAL_DARK_FOREST below — the extra
// forest-biased spawns need somewhere to go, or they'd just reshuffle where
// the same old cap of spiders lands instead of adding any.
export const SPIDER_MAX_COUNT = 18; // Cap on spiders alive at once
export const SPIDER_SPAWN_INTERVAL = 3; // Seconds between map-wide spawn attempts while it's night
// A second, faster timer that only tries to land inside the dark forest (see
// Game.ts's updateSpiders) — on top of the map-wide roll above, not instead
// of it, so the forest gets denser at night without thinning out the plains.
export const SPIDER_SPAWN_INTERVAL_DARK_FOREST = 1.5;
export const SPIDER_MIN_PLAYER_SPAWN_DIST = 350; // Don't spawn right on top of someone
export const SPIDER_STRING_DROP = 2; // String dropped when a spider is killed

// ── Foxes (dark forest predator) ────────────────────────────────────────────
// Tuned as the spider's opposite number: where a spider is a slow, tanky
// night-wide threat, a fox is faster, hits harder, and outlasts a spider in
// a straight fight, tied to the dark forest but active around the clock. Its
// real edge is that it ignores solid resources entirely (see Game.ts's
// updateFox) — inside the dense forest it closes on a player who has to run
// around every trunk, while out on the open plains a player is genuinely
// faster and can break away.
export const FOX_RADIUS = 20; // Between a player (16) and a spider (26) — used for combat (getting hit, bot targeting) and rendering
// A separate, smaller radius for the fox's own physical footprint — what it
// collides with (see Game.ts's pushOutOfResources/pushOutOfStructures calls)
// and what its nav grid corridors are sized around (see World.ts's
// buildNavGrid/addNavObstacle). Kept below FOX_RADIUS on purpose: a fox
// should be able to slip through gaps a bit tighter than the circle a
// player's sword actually has to land inside, rather than the two being tied
// to the same number.
//
// Floored at PLAYER_RADIUS rather than shrunk further: that nav grid is
// shared with bot player steering (see World.ts's navigation-grid comment),
// so anything narrower than a player's own collision radius would let the
// grid mark a gap "open" that a bot's actual body can't fit through, and
// send it into a wall it just has to be shoved back out of.
export const FOX_MOVE_RADIUS = 16;
export const FOX_SPEED = 98; // Slower than the player (150), so it's outrunnable in the open
export const FOX_MAX_HP = 420; // 14 unarmed swings (HARVEST_DAMAGE each) — tougher than a spider's 12
export const FOX_DAMAGE = 11; // Still less per bite than a spider (14), but it bites more often
export const FOX_ATTACK_RANGE = 34;
export const FOX_ATTACK_COOLDOWN = 0.8; // Seconds between bites
export const FOX_AGGRO_RANGE = 230; // How close a player must get before a fox notices them
// Once locked on, a fox's leash stretches to this — FOX_AGGRO_RANGE grown by
// FOX_AGGRO_BOOST_MULTIPLIER — and it keeps chasing until its quarry gets
// this far away, then loses interest, gives up, and reverts to the normal
// (unboosted) FOX_AGGRO_RANGE for re-acquisition. Deliberately wider than
// the acquisition range above: with a single threshold a player sitting
// right at the edge of a fox's senses would make it flicker between chasing
// and idling every few ticks. The gap between the two is the hysteresis
// that stops that, on top of just reading as a fox digging in once it's
// actually caught your scent.
//
// Note this (not FOX_AGGRO_RANGE) is the real "how far will it chase you"
// distance — a fox that drops its quarry immediately re-acquires them if
// they're still within FOX_AGGRO_RANGE, so keeping this comfortably below
// the old screen-edge distance (~450-700 units, see client Camera.ts's 1.6x
// zoom) is what actually lets a player still on-screen shake off a chase.
export const FOX_AGGRO_BOOST_MULTIPLIER = 1.2; // Locked-on leash = aggro range + 20%
export const FOX_LOSE_INTEREST_RANGE = Math.round(FOX_AGGRO_RANGE * FOX_AGGRO_BOOST_MULTIPLIER);
// Raised alongside FOX_SPAWN_INTERVAL_NIGHT below, for the same reason as
// SPIDER_MAX_COUNT — a faster night timer only shows up as more foxes if
// there's cap room left for them to fill.
export const FOX_MAX_COUNT = 15; // Cap on foxes alive at once
export const FOX_SPAWN_INTERVAL = 6; // Seconds between spawn attempts by day
// Foxes are already confined to the dark forest at every hour (see
// trySpawnFox) — night doesn't change *where* they can spawn, only densifies
// it, so this is the fox side of "more threats in the forest after dark"
// rather than a second spawner like the spider's.
export const FOX_SPAWN_INTERVAL_NIGHT = 2.5;
export const FOX_MIN_PLAYER_SPAWN_DIST = 300; // Don't spawn right on top of someone
export const FOX_FOOD_DROP = 2; // Food yielded when a fox is killed
// Leather yielded when a fox is killed, alongside the raw meat above — the
// backpack's other ingredient (see shared/crafting.ts's backpack recipe),
// spiders providing the string for it the same way they already do for a
// fishing rod.
export const FOX_LEATHER_DROP = 2;
// How far past the forest's edge a fox will linger once it has lost its
// target before giving up and despawning (see Game.ts's updateFox). Without
// this, foxes lured out onto the plains would sit there forever, permanently
// occupying FOX_MAX_COUNT slots and starving the forest of new spawns.
export const FOX_FOREST_LEEWAY = 300;
// Seconds a fox can go with nobody to chase before it despawns outright —
// covers the case FOX_FOREST_LEEWAY doesn't: one that never found anyone (or
// lost them) without ever leaving the forest, which would otherwise just sit
// there idle forever holding one of FOX_MAX_COUNT's slots. Resets to zero the
// instant it (re)acquires a target (see Game.ts's updateFox / ServerFox's
// idleTimer), so an actively-hunting fox is never at risk of this.
export const FOX_IDLE_DESPAWN_TIME = 30;

// Pathfinding (see World.ts's findPath and Game.ts's updateFox). A fox only
// runs a search when something solid actually stands between it and its
// target — in the open it just steers straight — and it reuses that path for
// FOX_REPATH_INTERVAL before recomputing, so a moving player doesn't trigger
// a fresh search every tick.
export const FOX_REPATH_INTERVAL = 0.5; // Seconds a computed path is reused before refreshing
export const FOX_WAYPOINT_REACHED_DIST = 18; // How close counts as having arrived at a waypoint

// ── Idle wander (foxes & spiders) ───────────────────────────────────────────
// When neither has anyone to chase, it ambles around instead of standing
// frozen in place — see Game.ts's wanderFox/wanderSpider. Shared knobs since
// the two behave identically here; only their top speed (and so how briskly
// they amble) differs, via WANDER_SPEED_MULTIPLIER against each mob's own
// *_SPEED.
export const WANDER_RADIUS = 220; // How far from its current spot a new wander destination can land
export const WANDER_INTERVAL = 5; // Seconds before picking a fresh destination, even if the last one hasn't been reached
export const WANDER_ARRIVED_DIST = 18; // How close counts as having reached a wander destination
export const WANDER_SPEED_MULTIPLIER = 0.35; // Wander speed as a fraction of the mob's full chase speed — an unhurried amble, not a chase

// ── Bots ─────────────────────────────────────────────────────────────────────
// Server-simulated players (see server/src/Bot.ts). They're real ServerPlayer
// entities driven by an AI that writes the same PlayerInput a browser would
// send, so every rule below them — movement, collision, harvest cones, hunger,
// crafting, death — is the exact code path a human plays through.
//
// One deliberate difference: a bot's ServerPlayer is constructed with
// maxHealth scaled by this multiplier (see ServerBot's constructor), so it
// can outlast a fox/spider scrap or a PvP skirmish long enough for its AI's
// once-a-decision-interval reflexes to actually matter, rather than trading
// hits at a human's reaction speed on the same 100-point pool. The
// BOT_FLEE_HEALTH/BOT_HEAL_* thresholds below stay written against
// MAX_HEALTH regardless — see Game.ts's botHealthThreshold, which rescales
// them to whatever the bot's actual maxHealth is, so "flee at 35%" means the
// same thing whether maxHealth is 100 or 200.
export const BOT_MAX_HEALTH_MULTIPLIER = 2;
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
// Thirst has no inventory item to top up on the go the way hunger does (see
// updateBot's eat-on-the-go check) — a bot has to physically walk into a
// lake, so this needs its own goal (see botChooseGoal/botAct's 'drink' case)
// rather than an opportunistic check like BOT_HUNGER_SEEK_FOOD's.
export const BOT_THIRST_SEEK_WATER = 30;
export const BOT_THIRST_DONE = 90; // Wade until back up to here before returning to work
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

// ── Sea (south coast) ────────────────────────────────────────────────────────
// A fixed, deterministic band across the bottom of the map — the ocean's
// mirror of the dark forest band above (see seaCoastAt in biome.ts for the
// actual wandering coastline this is just the average of).
export const SEA_BAND = (MAP_SIZE * 4) / 5;
// World units the sandy beach spans immediately north of the coastline,
// blending into the plains — the sea's answer to a lake's shoreWidth.
export const SEA_SAND_WIDTH = 220;

// ── Desert (top-right corner) ───────────────────────────────────────────────
// A fixed, deterministic corner of the map — the east third of the dark
// forest's own band, carved out of it rather than a biome of its own full
// width or height. Two borders bound it: a vertical one to its west (the
// same "wandering band" deal DARK_FOREST_BAND/SEA_BAND have, see
// desertBandAt in biome.ts) and, to its south, the *same* darkForestBandAt
// line the dark forest's own southern edge already uses — so the desert
// simply stops exactly where the dark forest would otherwise give way to the
// plains, sharing that seam pixel-for-pixel rather than defining a second,
// independently-wandering one that could disagree with it. See isInDesert.
//
// Average world x the desert begins at — set two-thirds of the way across,
// so the desert claims the eastern third of the dark forest's width.
export const DESERT_BAND = (MAP_SIZE * 2) / 3;
// World units the sand fringe spans past either of the desert's two borders
// (west and south alike — see Renderer.ts's drawDesertGround) — the desert's
// answer to DARK_FOREST_TRANSITION. A speckled fringe rather than a hard
// line, same as that one, but kept fairly tight now that the desert itself
// is a small corner rather than a quarter of the map — too wide a blend
// here reads as the desert spreading into its neighbors rather than a crisp
// corner with a soft edge.
export const DESERT_TRANSITION = 150;
// Player movement is scaled by this while standing in the desert (see
// Game.ts's getSpeedMultiplier) — a mild, constant tax on crossing it, not a
// hazard-tile slowdown like wading through water.
export const DESERT_SPEED_MULTIPLIER = 0.8;
// Thirst drains at THIRST_DECAY_RATE times this while in the desert (see
// Game.ts's getThirstMultiplier and ServerPlayer.update) — the heat is what
// makes the oasis worth the detour instead of just scenery.
export const DESERT_THIRST_MULTIPLIER = 1.8;

// The desert's single oasis: a lake placed dead center in the biome rather
// than seeded by the ordinary lake grid (see World.ts's generateLakes, which
// rejects any grid-placed lake landing inside the desert so this is the only
// water out here). Fixed rather than randomized — "a single oasis in the
// middle" is a deliberate landmark, not a scattered one. Centered on the
// desert's own (much shorter, now that it's a corner rather than a
// full-height column) north-south reach — see DARK_FOREST_BAND, the desert's
// southern border — rather than the map's own vertical center.
export const OASIS_X = DESERT_BAND + (MAP_SIZE - DESERT_BAND) / 2;
export const OASIS_Y = DARK_FOREST_BAND / 2;
export const OASIS_RADIUS = 150;
// Wider than an ordinary lake's shore (LAKE_MAX_SHORE tops out at 50) — an
// oasis's ring of mud and green growth is the whole point of it, not a thin
// seam around the water.
export const OASIS_SHORE_WIDTH = 75;
// The oasis reads better as a longer pool than a perfect circle — this
// scales its north-south reach relative to its east-west one. Shared (not
// Renderer-local) because World.ts's water/shore gameplay checks apply the
// exact same stretch to the oasis specifically, so what looks like water is
// what actually behaves like water — see World.ts's isBlockedByLake/
// isInLakeWater and Renderer.ts's drawLakes.
export const OASIS_VERTICAL_STRETCH = 1.6;

// World x a diamond deposit must land east of, and world y it must land
// north of — together pinning deposits to the desert's own top-right
// corner (deepest away from both the grass/sand seam and the plains
// border), mirroring GOLD_TOP_BAND's "near the top of the dark forest" role
// for gold. Diamonds require the top pickaxe tier to mine at all (see
// Game.ts's DIAMOND_CAPABLE_TOOLS) on top of being the harder deposit to
// reach.
export const DIAMOND_FAR_X = DESERT_BAND + (MAP_SIZE - DESERT_BAND) * 0.65;
// Kept north of OASIS_Y so deposits read as "past the oasis" rather than
// scattered alongside it.
export const DIAMOND_MAX_Y = DARK_FOREST_BAND * 0.4;

// ── Hotbar / inventory capacity ─────────────────────────────────────────────
// How many distinct item types a player's inventory can hold at once — every
// distinct type gets its own hotbar slot (see client HUD's hotbarOrder), so
// this is the hotbar's size. A backpack (see shared/crafting.ts's
// BACKPACK_ID) raises the cap to HOTBAR_BACKPACK_SLOTS while worn — same
// toggled equip slot as armor (see PlayerState.backpack), so crafting one
// alone isn't enough; it has to actually be on. Bots are exempt (see
// Game.ts's isBot) — they aren't shown a hotbar, and their gathering AI
// routinely tracks more distinct materials/tools at once than this cap
// would allow.
export const HOTBAR_BASE_SLOTS = 10;
export const HOTBAR_BACKPACK_SLOTS = 14;

// ── Chat ─────────────────────────────────────────────────────────────────────
/** Longest message accepted. Enforced server-side too — the client's input
 * maxlength is a courtesy, not a guarantee. */
export const CHAT_MAX_LENGTH = 80;
/** Seconds a message floats above its sender's head before the server clears it. */
export const CHAT_BUBBLE_SECONDS = 6;
/** Minimum seconds between one player's messages, so chat can't be flooded. */
export const CHAT_COOLDOWN = 0.6;
