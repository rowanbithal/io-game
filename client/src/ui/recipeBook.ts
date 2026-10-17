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
  DIAMOND_AXE_ID,
  DIAMOND_PICKAXE_ID,
  DIAMOND_SWORD_ID,
  DIAMOND_ARMOR_ID,
  CHEST_ID,
  FOOD_HUNGER_RESTORE,
  AXE_WOOD_MULTIPLIER,
  STONE_AXE_WOOD_MULTIPLIER,
  GOLD_AXE_WOOD_MULTIPLIER,
  DIAMOND_AXE_WOOD_MULTIPLIER,
  PICKAXE_STONE_MULTIPLIER,
  STONE_PICKAXE_STONE_MULTIPLIER,
  GOLD_PICKAXE_STONE_MULTIPLIER,
  DIAMOND_PICKAXE_STONE_MULTIPLIER,
  SWORD_DAMAGE_MULTIPLIER,
  STONE_SWORD_DAMAGE_MULTIPLIER,
  GOLD_SWORD_DAMAGE_MULTIPLIER,
  DIAMOND_SWORD_DAMAGE_MULTIPLIER,
  WOODEN_ARMOR_DAMAGE_REDUCTION,
  STONE_ARMOR_DAMAGE_REDUCTION,
  GOLD_ARMOR_DAMAGE_REDUCTION,
  DIAMOND_ARMOR_DAMAGE_REDUCTION,
  CHEST_SLOTS,
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
  WOODEN_HOE_ID,
  WATERING_CAN_ID,
  BERRY_SEED_ID,
  WHEAT_SEED_ID,
  BREAD_ID,
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
      DIAMOND_AXE_ID,
      WOODEN_PICKAXE_ID,
      STONE_PICKAXE_ID,
      GOLD_PICKAXE_ID,
      DIAMOND_PICKAXE_ID,
      WOODEN_SWORD_ID,
      STONE_SWORD_ID,
      GOLD_SWORD_ID,
      DIAMOND_SWORD_ID,
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
    items: ['berry', 'mushroom', COOKED_MEAT_ID, BREAD_ID],
  },
  {
    id: 'farming',
    name: 'Farming',
    tagline: 'Till, plant, water, and harvest your own supply instead of foraging for it',
    items: [WOODEN_HOE_ID, WATERING_CAN_ID, BERRY_SEED_ID, WHEAT_SEED_ID],
  },
  {
    id: 'placeable',
    name: 'Placeable Items',
    tagline: 'Built once, then left standing in the world',
    items: ['campfire', CRAFTING_BENCH_ID, WALL_ID, CHEST_ID],
  },
  {
    id: 'clothing',
    name: 'Clothing',
    tagline: 'Worn rather than held — armor and the backpack alike',
    items: [WOODEN_ARMOR_ID, STONE_ARMOR_ID, GOLD_ARMOR_ID, DIAMOND_ARMOR_ID, BACKPACK_ID],
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
  berry: 'Foraged growing wild — plains bushes and dark-forest ones alike. A quick bite, not a real meal.',
  mushroom: 'Foraged growing wild in the shade.',
};

/** Same idea as ITEM_NOTES, for the item's book entry when it isn't a Recipe. */
export function noteFor(itemId: string): string {
  const fish = FISH_SPECIES_BY_ID[itemId];
  if (fish) return `Reeled in with a fishing rod — a ${fish.rarity} catch, from any lake or the southern sea.`;
  return ITEM_NOTES[itemId] ?? '';
}

// ── Tooltips ─────────────────────────────────────────────────────────────────
// What an item *does*, for the hover tooltips on the hotbar, crafting panel
// and chests (see HUD.drawTooltip). Craftable items describe their use;
// everything else falls back to noteFor's "where it comes from".

const pct = (n: number): string => `${Math.round(n * 100)}%`;

const ITEM_DESCRIPTIONS: Record<string, string> = {
  campfire: 'Warms you, heals you faster and lights the night. Burns for a minute — faster in the rain.',
  [CRAFTING_BENCH_ID]: 'Stand near it to craft stone, gold and diamond gear.',
  [WALL_ID]: 'A solid log barricade. Blocks players and animals alike.',
  [CHEST_ID]: `Stores up to ${CHEST_SLOTS} item types. Survives your death — but anyone can open it. Press C beside it.`,
  [WOODEN_AXE_ID]: `Chops ${AXE_WOOD_MULTIPLIER}× wood.`,
  [STONE_AXE_ID]: `Chops ${STONE_AXE_WOOD_MULTIPLIER}× wood.`,
  [GOLD_AXE_ID]: `Chops ${GOLD_AXE_WOOD_MULTIPLIER}× wood.`,
  [DIAMOND_AXE_ID]: `Chops ${DIAMOND_AXE_WOOD_MULTIPLIER}× wood — the best axe there is.`,
  [WOODEN_PICKAXE_ID]: `Mines ${PICKAXE_STONE_MULTIPLIER}× stone. Too soft for gold.`,
  [STONE_PICKAXE_ID]: `Mines ${STONE_PICKAXE_STONE_MULTIPLIER}× stone, and can break gold.`,
  [GOLD_PICKAXE_ID]: `Mines ${GOLD_PICKAXE_STONE_MULTIPLIER}× stone and 2× gold, and can break diamond.`,
  [DIAMOND_PICKAXE_ID]: `Mines ${DIAMOND_PICKAXE_STONE_MULTIPLIER}× stone, 3× gold and 2× diamond.`,
  [WOODEN_SWORD_ID]: `${SWORD_DAMAGE_MULTIPLIER}× damage to animals and players.`,
  [STONE_SWORD_ID]: `${STONE_SWORD_DAMAGE_MULTIPLIER}× damage to animals and players.`,
  [GOLD_SWORD_ID]: `${GOLD_SWORD_DAMAGE_MULTIPLIER}× damage to animals and players.`,
  [DIAMOND_SWORD_ID]: `${DIAMOND_SWORD_DAMAGE_MULTIPLIER}× damage to animals and players.`,
  [WOODEN_ARMOR_ID]: `Blocks ${pct(WOODEN_ARMOR_DAMAGE_REDUCTION)} of incoming damage. Select it to wear it.`,
  [STONE_ARMOR_ID]: `Blocks ${pct(STONE_ARMOR_DAMAGE_REDUCTION)} of incoming damage. Select it to wear it.`,
  [GOLD_ARMOR_ID]: `Blocks ${pct(GOLD_ARMOR_DAMAGE_REDUCTION)} of incoming damage. Select it to wear it.`,
  [DIAMOND_ARMOR_ID]: `Blocks ${pct(DIAMOND_ARMOR_DAMAGE_REDUCTION)} of incoming damage. Select it to wear it.`,
  [FISHING_ROD_ID]: 'Hold it and right-click (or F) on water to cast. Wait for a bite.',
  [TORCH_ID]: 'Worn in your off hand: a small light, and slows the night chill. Burns out.',
  [BACKPACK_ID]: 'Worn on your back: more hotbar slots while it’s on.',
  [WOODEN_HOE_ID]: 'Hold it and right-click (or F) on grass to till a farm plot.',
  [WATERING_CAN_ID]: 'Right-click (or F) to water nearby plots — wet crops grow faster. Refill in water. Rain waters crops for free.',
  [BERRY_SEED_ID]: 'Plant in a tilled plot. Grows into a bush that keeps fruiting.',
  [WHEAT_SEED_ID]: 'Plant in a tilled plot. Grows into wheat to harvest.',
  [COOKED_MEAT_ID]: 'A proper meal.',
  [BREAD_ID]: 'The most filling food in the game.',
};

/** One-paragraph "what is this / what does it do" for an item's tooltip. */
export function describeItem(itemId: string): string {
  let text = ITEM_DESCRIPTIONS[itemId] ?? noteFor(itemId);
  const food = FOOD_HUNGER_RESTORE[itemId];
  if (food) text = `${text ? text + ' ' : ''}Restores ${food} hunger. Click its slot to eat.`;
  return text;
}
