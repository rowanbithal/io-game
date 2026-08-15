import { StructureType } from './types';

/**
 * A craftable item. `cost` is keyed by the inventory item types the player
 * gathers (wood/stone/wheat) — or, for stone tools, the wooden tool they're
 * upgraded from. `placeAs` marks the result as a structure that gets placed
 * into the world rather than kept as a plain inventory item, and
 * `requiresBench` gates the recipe behind standing near a crafting bench.
 */
export interface Recipe {
  id: string; // Also the inventory item type the craft yields
  name: string;
  icon: string;
  cost: Record<string, number>;
  craftTime: number; // Seconds to craft
  placeAs?: StructureType;
  requiresBench?: boolean;
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

/** Wood yield multiplier while an axe is the held item. */
export const AXE_WOOD_MULTIPLIER = 1.5;
export const STONE_AXE_WOOD_MULTIPLIER = 2;
export const GOLD_AXE_WOOD_MULTIPLIER = 2.5;

/** Stone yield multiplier while a pickaxe is the held item. */
export const PICKAXE_STONE_MULTIPLIER = 1.5;
export const STONE_PICKAXE_STONE_MULTIPLIER = 2;
export const GOLD_PICKAXE_STONE_MULTIPLIER = 2.5;

/**
 * Combat damage multiplier vs spiders and other players while a sword is
 * held — swords do nothing for resources, that's what the axe/pickaxe are
 * for.
 */
export const SWORD_DAMAGE_MULTIPLIER = 2;
export const STONE_SWORD_DAMAGE_MULTIPLIER = 3;
export const GOLD_SWORD_DAMAGE_MULTIPLIER = 4;

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
  {
    id: FISHING_ROD_ID,
    name: 'Fishing Rod',
    icon: '🎣',
    cost: { wood: 15, string: 2 },
    craftTime: 5,
  },
];

export const RECIPES_BY_ID: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);

/** True if `inventory` holds enough of every ingredient for `recipe`. */
export function canAfford(recipe: Recipe, inventory: Record<string, number>): boolean {
  return Object.entries(recipe.cost).every(([item, need]) => (inventory[item] ?? 0) >= need);
}
