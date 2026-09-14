/**
 * Page-per-category structure for the recipe book — pure data, no drawing
 * (mirrors animals.ts's role for the bestiary). Every item worth showing
 * lives here, craftable or not, grouped the way a player thinks about them
 * rather than in RECIPES' declaration order. Items without a recipe (raw
 * resources, animal drops, foraged food) still get a page entry — see
 * itemDisplayName/noteFor below for what stands in for a name/cost strip
 * when there's no Recipe to read one off of.
 */
import {
  RECIPES_BY_ID,
  FISH_SPECIES,
  FISH_SPECIES_BY_ID,
  WOODEN_AXE_ID,
  STONE_AXE_ID,
  GOLD_AXE_ID,
  WOODEN_PICKAXE_ID,
  STONE_PICKAXE_ID,
  GOLD_PICKAXE_ID,
  WOODEN_SWORD_ID,
  STONE_SWORD_ID,
  GOLD_SWORD_ID,
  FISHING_ROD_ID,
  TORCH_ID,
  CRAFTING_BENCH_ID,
  WALL_ID,
  WOODEN_ARMOR_ID,
  STONE_ARMOR_ID,
  GOLD_ARMOR_ID,
  BACKPACK_ID,
  RAW_MEAT_ID,
  COOKED_MEAT_ID,
  LEATHER_ID,
} from '@io-game/shared';

export interface RecipeBookCategory {
  id: string;
  name: string;
  tagline: string;
  items: string[];
}

export const RECIPE_BOOK_CATEGORIES: RecipeBookCategory[] = [
  {
    id: 'tools',
    name: 'Tools',
    tagline: 'Axes, pickaxes and blades, plus the rod and torch alongside them',
    items: [
      WOODEN_AXE_ID,
      STONE_AXE_ID,
      GOLD_AXE_ID,
      WOODEN_PICKAXE_ID,
      STONE_PICKAXE_ID,
      GOLD_PICKAXE_ID,
      WOODEN_SWORD_ID,
      STONE_SWORD_ID,
      GOLD_SWORD_ID,
      FISHING_ROD_ID,
      TORCH_ID,
    ],
  },
  {
    id: 'resources',
    name: 'Resources',
    tagline: 'Raw materials gathered from the world itself',
    items: ['wood', 'stone', 'gold', 'diamond', 'wheat'],
  },
  {
    id: 'animal_drops',
    name: 'Animal Drops',
    tagline: 'What a kill or a catch leaves behind',
    items: [RAW_MEAT_ID, LEATHER_ID, 'string', ...FISH_SPECIES.map((f) => f.id)],
  },
  {
    id: 'food',
    name: 'Food',
    tagline: 'What keeps the hunger bar up',
    items: ['berry', 'mushroom', 'purple_berry', COOKED_MEAT_ID],
  },
  {
    id: 'placeable',
    name: 'Placeable Items',
    tagline: 'Built once, then left standing in the world',
    items: ['campfire', CRAFTING_BENCH_ID, WALL_ID],
  },
  {
    id: 'clothing',
    name: 'Clothing',
    tagline: 'Worn rather than held — armor and the backpack alike',
    items: [WOODEN_ARMOR_ID, STONE_ARMOR_ID, GOLD_ARMOR_ID, BACKPACK_ID],
  },
];

/** Display names for the items above that have no Recipe (see itemDisplayName). */
const ITEM_NAMES: Record<string, string> = {
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold',
  diamond: 'Diamond',
  wheat: 'Wheat',
  [RAW_MEAT_ID]: 'Raw Meat',
  [LEATHER_ID]: 'Leather',
  string: 'String',
  berry: 'Berry',
  mushroom: 'Mushroom',
  purple_berry: 'Purple Berry',
};

/** The name to print on an item's book entry, recipe or not. */
export function itemDisplayName(itemId: string): string {
  const recipe = RECIPES_BY_ID[itemId];
  if (recipe) return recipe.name;
  const fish = FISH_SPECIES_BY_ID[itemId];
  if (fish) return fish.name;
  return ITEM_NAMES[itemId] ?? itemId;
}

/**
 * How to get an item that has no recipe of its own — printed on its book
 * entry in place of a cost strip. Every non-recipe item in the categories
 * above should resolve to something here.
 */
const ITEM_NOTES: Record<string, string> = {
  wood: 'Chopped from trees — an axe multiplies the yield.',
  stone: 'Mined from rocks — a pickaxe multiplies the yield.',
  gold: 'Mined from gold deposits. Needs at least a stone pickaxe to break.',
  diamond: 'Mined from desert diamond deposits. Needs a gold pickaxe to break.',
  wheat: 'Gathered from wheat clumps growing wild across the plains.',
  [RAW_MEAT_ID]: 'Dropped by a slain fox or beetle — cook it at a campfire before eating.',
  [LEATHER_ID]: "A fox's hide, already tanned when it drops.",
  string: 'Spun from a slain spider.',
  berry: 'Foraged growing wild. A quick bite, not a real meal.',
  mushroom: 'Foraged growing wild in the shade.',
  purple_berry: 'Foraged growing wild — the least filling of the three.',
};

/** Same idea as ITEM_NOTES, for the item's book entry when it isn't a Recipe. */
export function noteFor(itemId: string): string {
  const fish = FISH_SPECIES_BY_ID[itemId];
  if (fish) return `Reeled in with a fishing rod — a ${fish.rarity} catch, from any lake or the southern sea.`;
  return ITEM_NOTES[itemId] ?? '';
}
