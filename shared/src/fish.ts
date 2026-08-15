/**
 * Species caught while fishing. Each has its own body/tail color (drawn as
 * a pixel-art icon client-side, see `drawFishIcon` in Renderer.ts) and a
 * catch `weight` — higher weight means more common. Caught fish land in the
 * inventory/hotbar like any other item rather than being auto-eaten.
 */
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface FishColor {
  body: string;
  tail: string;
}

export interface FishSpecies {
  id: string; // Also the inventory item type
  name: string;
  rarity: FishRarity;
  weight: number; // Relative catch odds
  color: FishColor;
}

export const FISH_SPECIES: FishSpecies[] = [
  {
    id: 'fish_silverfin',
    name: 'Silverfin',
    rarity: 'common',
    weight: 40,
    color: { body: '#dff0e8', tail: '#a9cfc4' },
  },
  {
    id: 'fish_olive_perch',
    name: 'Olive Perch',
    rarity: 'common',
    weight: 35,
    color: { body: '#8a9b5e', tail: '#647142' },
  },
  {
    id: 'fish_bluegill',
    name: 'Bluegill',
    rarity: 'uncommon',
    weight: 16,
    color: { body: '#7b93a8', tail: '#54707f' },
  },
  {
    id: 'fish_crimson_snapper',
    name: 'Crimson Snapper',
    rarity: 'rare',
    weight: 6,
    color: { body: '#d9695c', tail: '#a13d33' },
  },
  {
    id: 'fish_koi',
    name: 'Koi',
    rarity: 'rare',
    weight: 5,
    color: { body: '#e8935a', tail: '#c06a35' },
  },
  {
    id: 'fish_golden_carp',
    name: 'Golden Carp',
    rarity: 'legendary',
    weight: 2,
    color: { body: '#e0c15a', tail: '#b89638' },
  },
  {
    id: 'fish_amethyst_eel',
    name: 'Amethyst Eel',
    rarity: 'legendary',
    weight: 1,
    color: { body: '#a879c9', tail: '#7a4f9c' },
  },
];

export const FISH_SPECIES_BY_ID: Record<string, FishSpecies> = Object.fromEntries(
  FISH_SPECIES.map((f) => [f.id, f]),
);

const FISH_WEIGHT_TOTAL = FISH_SPECIES.reduce((sum, f) => sum + f.weight, 0);

/** Picks a fish species, weighted by rarity — call once per catch. */
export function pickRandomFish(rng: () => number = Math.random): FishSpecies {
  let roll = rng() * FISH_WEIGHT_TOTAL;
  for (const species of FISH_SPECIES) {
    roll -= species.weight;
    if (roll <= 0) return species;
  }
  return FISH_SPECIES[FISH_SPECIES.length - 1];
}
