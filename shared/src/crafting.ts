import { StructureType } from './types';

/**
 * A craftable item. `cost` is keyed by the inventory item types the player
 * gathers (wood/stone/wheat) — or, for stone tools, the wooden tool they're
 * upgraded from. `placeAs` marks the result as a structure that gets placed
 * into the world rather than kept as a plain inventory item, `requiresBench`
 * gates the recipe behind standing near a crafting bench, and
 * `requiresCampfire` gates it behind standing near a campfire instead (see
 * Game.isNearFire) — used for cooking, not construction, so it's a separate
 * flag rather than reusing requiresBench.
 */
export interface Recipe {
  id: string; // Also the inventory item type the craft yields
  name: string;
  icon: string;
  cost: Record<string, number>;
  craftTime: number; // Seconds to craft
  placeAs?: StructureType;
  requiresBench?: boolean;
  requiresCampfire?: boolean;
}

export const CRAFTING_BENCH_ID = 'crafting_bench';

export const WOODEN_AXE_ID = 'wooden_axe';
export const WOODEN_PICKAXE_ID = 'wooden_pickaxe';
export const WOODEN_SWORD_ID = 'wooden_sword';

export const STONE_AXE_ID = 'stone_axe';
export const STONE_PICKAXE_ID = 'stone_pickaxe';
export const STONE_SWORD_ID = 'stone_sword';

// Gold tools: a third tier upgraded from the stone one, same as stone is
// upgraded from wood (see the recipes below) — gold is the rarer material
// (see shared/constants.ts's GOLD_SPAN and World.ts's DARK_FOREST_ROCK_CONFIG
// neighbor, DARK_FOREST gold veins), so this tier costs more and hits harder.
export const GOLD_AXE_ID = 'gold_axe';
export const GOLD_PICKAXE_ID = 'gold_pickaxe';
export const GOLD_SWORD_ID = 'gold_sword';

export const FISHING_ROD_ID = 'fishing_rod';

export const WALL_ID = 'wall';

// Armor: worn rather than held (see PlayerState.armor / EquipRequest), so a
// player can be wearing one of these while still holding a sword/tool in
// hand — a separate equip slot from the hotbar's single "held" item. Same
// three-tier progression as the tools above, upgraded the same way (see the
// recipes below).
export const WOODEN_ARMOR_ID = 'wooden_armor';
export const STONE_ARMOR_ID = 'stone_armor';
export const GOLD_ARMOR_ID = 'gold_armor';

// The torch is the same kind of equip slot as armor — worn (in the off
// hand) rather than held, so it doesn't compete with the hotbar's held
// tool/weapon (see PlayerState.torch / EquipRequest). Unlike armor it burns
// out: once lit it only lasts TORCH_LIFETIME seconds before being consumed
// (see Game.tickTorch), so it's a cheap, disposable personal light rather
// than a permanent upgrade.
export const TORCH_ID = 'torch';

// Raw meat (a fox kill drop, see Game.processHarvest) has to be cooked at a
// campfire before it's edible — see the cooked_meat recipe below and
// shared/constants.ts's FOOD_ITEMS (raw meat is deliberately absent from it).
export const RAW_MEAT_ID = 'meat';
export const COOKED_MEAT_ID = 'cooked_meat';

/** Wood yield multiplier while an axe is the held item. */
export const AXE_WOOD_MULTIPLIER = 1.5;
export const STONE_AXE_WOOD_MULTIPLIER = 2;
export const GOLD_AXE_WOOD_MULTIPLIER = 2.5;

/** Stone yield multiplier while a pickaxe is the held item. */
export const PICKAXE_STONE_MULTIPLIER = 1.5;
export const STONE_PICKAXE_STONE_MULTIPLIER = 2;
export const GOLD_PICKAXE_STONE_MULTIPLIER = 2.5;

/**
 * Gold yield multiplier for the gold pickaxe. The stone pickaxe deliberately
 * has no entry: it's the tool that *unlocks* gold (see GOLD_CAPABLE_TOOLS),
 * and leaving it at a flat 1x is what gives the gold pickaxe something to be
 * better at. Otherwise the two mine the deposit identically and the upgrade
 * buys nothing at the only resource that requires a pickaxe in the first
 * place.
 */
export const GOLD_PICKAXE_GOLD_MULTIPLIER = 2;

/**
 * Combat damage multiplier vs spiders and other players while a sword is
 * held — swords do nothing for resources, that's what the axe/pickaxe are
 * for.
 */
export const SWORD_DAMAGE_MULTIPLIER = 2;
export const STONE_SWORD_DAMAGE_MULTIPLIER = 3;
export const GOLD_SWORD_DAMAGE_MULTIPLIER = 4;

/**
 * Fraction of incoming damage a worn suit blocks — applies to fox bites,
 * spider bites, and PvP alike (see Game.ts's armorReduction), not just one
 * of them, so armor is a general "get hit less hard" upgrade rather than
 * something narrowly aimed at a single threat.
 */
export const WOODEN_ARMOR_DAMAGE_REDUCTION = 0.15;
export const STONE_ARMOR_DAMAGE_REDUCTION = 0.3;
export const GOLD_ARMOR_DAMAGE_REDUCTION = 0.45;

/** How close a player must be to a crafting bench to use bench-gated recipes. */
export const BENCH_USE_RADIUS = 160;

export const RECIPES: Recipe[] = [
  {
    id: 'campfire',
    name: 'Campfire',
    icon: '🔥',
    cost: { wood: 20 },
    craftTime: 5,
    placeAs: 'campfire',
  },
  {
    id: CRAFTING_BENCH_ID,
    name: 'Crafting Bench',
    icon: '🛠️',
    cost: { wood: 40 },
    craftTime: 6,
    placeAs: CRAFTING_BENCH_ID,
  },
  // A solid, tree-sized barricade (see shared/constants.ts's STRUCTURE_SPAN
  // and STRUCTURE_COLLISION_RADIUS) — unlike the campfire/bench it blocks
  // movement outright, for players and mobs alike (see Game.pushOutOfStructures).
  {
    id: WALL_ID,
    name: 'Wooden Wall',
    icon: '🧱',
    cost: { wood: 25 },
    craftTime: 5,
    placeAs: WALL_ID,
  },
  {
    id: WOODEN_AXE_ID,
    name: 'Wooden Axe',
    icon: '🪓',
    cost: { wood: 15 },
    craftTime: 5,
  },
  {
    id: WOODEN_PICKAXE_ID,
    name: 'Wooden Pickaxe',
    icon: '⛏️',
    cost: { wood: 20 },
    craftTime: 5,
  },
  {
    id: WOODEN_SWORD_ID,
    name: 'Wooden Sword',
    icon: '🗡️',
    cost: { wood: 25 },
    craftTime: 5,
  },
  // Stone tools: bench-gated, slower to make, and consume the wooden tool
  // they upgrade from alongside the stone.
  {
    id: STONE_AXE_ID,
    name: 'Stone Axe',
    icon: '🪓',
    cost: { [WOODEN_AXE_ID]: 1, stone: 15, wood: 15 },
    craftTime: 9,
    requiresBench: true,
  },
  {
    id: STONE_PICKAXE_ID,
    name: 'Stone Pickaxe',
    icon: '⛏️',
    cost: { [WOODEN_PICKAXE_ID]: 1, stone: 20, wood: 20 },
    craftTime: 9,
    requiresBench: true,
  },
  {
    id: STONE_SWORD_ID,
    name: 'Stone Sword',
    icon: '⚔️',
    cost: { [WOODEN_SWORD_ID]: 1, stone: 25, wood: 25 },
    craftTime: 9,
    requiresBench: true,
  },
  // Gold tools: upgraded from the stone tier the same way stone is upgraded
  // from wood — consume the stone tool alongside gold (and wood, to bind the
  // head to a haft). Slower to make than stone, gold being the rarer material.
  {
    id: GOLD_AXE_ID,
    name: 'Gold Axe',
    icon: '🪓',
    cost: { [STONE_AXE_ID]: 1, gold: 15, wood: 15 },
    craftTime: 12,
    requiresBench: true,
  },
  {
    id: GOLD_PICKAXE_ID,
    name: 'Gold Pickaxe',
    icon: '⛏️',
    cost: { [STONE_PICKAXE_ID]: 1, gold: 20, wood: 20 },
    craftTime: 12,
    requiresBench: true,
  },
  {
    id: GOLD_SWORD_ID,
    name: 'Gold Sword',
    icon: '⚔️',
    cost: { [STONE_SWORD_ID]: 1, gold: 25, wood: 25 },
    craftTime: 12,
    requiresBench: true,
  },
  // Armor: same three-tier shape as the tools above — wooden is unbenched,
  // stone/gold are bench-gated and consume the tier below them — but priced
  // higher, since a suit is worn continuously rather than swung once per hit.
  {
    id: WOODEN_ARMOR_ID,
    name: 'Wooden Armor',
    icon: '🥋',
    cost: { wood: 40 },
    craftTime: 8,
  },
  {
    id: STONE_ARMOR_ID,
    name: 'Stone Armor',
    icon: '🥋',
    cost: { [WOODEN_ARMOR_ID]: 1, stone: 35, wood: 20 },
    craftTime: 12,
    requiresBench: true,
  },
  {
    id: GOLD_ARMOR_ID,
    name: 'Gold Armor',
    icon: '🥋',
    cost: { [STONE_ARMOR_ID]: 1, gold: 35, wood: 20 },
    craftTime: 16,
    requiresBench: true,
  },
  {
    id: FISHING_ROD_ID,
    name: 'Fishing Rod',
    icon: '🎣',
    cost: { wood: 15, string: 2 },
    craftTime: 5,
  },
  {
    id: TORCH_ID,
    name: 'Torch',
    icon: '🔦',
    cost: { wood: 15 },
    craftTime: 3,
  },
  {
    id: COOKED_MEAT_ID,
    name: 'Cooked Meat',
    icon: '🍖',
    cost: { [RAW_MEAT_ID]: 1 },
    craftTime: 3,
    requiresCampfire: true,
  },
];

export const RECIPES_BY_ID: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);

/** True if `inventory` holds enough of every ingredient for `recipe`. */
export function canAfford(recipe: Recipe, inventory: Record<string, number>): boolean {
  return Object.entries(recipe.cost).every(([item, need]) => (inventory[item] ?? 0) >= need);
}
