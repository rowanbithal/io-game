// ── Player appearance ────────────────────────────────────────────────────────
// What a player picks on the main menu to tell themselves apart: a hair
// color, a skin tone and a hat. Sent once with the join request (see
// JoinRequest) and broadcast on every PlayerState as `look`, as indices into
// the lists below — so the server only ever has to validate small integers,
// and the palettes themselves live in exactly one place.

/** A three-tone pixel palette, same shape as the renderer's own Palette3. */
export interface LookPalette {
  light: string;
  base: string;
  dark: string;
}

/** Hair colors, as seen from above (the whole head is hair). Index 0 is the original default. */
export const HAIR_COLORS: { name: string; palette: LookPalette }[] = [
  { name: 'Sandy', palette: { light: '#e3b68e', base: '#e0a978', dark: '#b0845d' } },
  { name: 'Black', palette: { light: '#4a4040', base: '#2e2828', dark: '#1a1515' } },
  { name: 'Brown', palette: { light: '#8a5a3a', base: '#6b4226', dark: '#4a2c18' } },
  { name: 'Blonde', palette: { light: '#fbe7a1', base: '#f0d06a', dark: '#c9a640' } },
  { name: 'Ginger', palette: { light: '#e8894a', base: '#c96a2c', dark: '#94461a' } },
  { name: 'Silver', palette: { light: '#e8e8ec', base: '#c4c4cc', dark: '#8e8e98' } },
  { name: 'Blue', palette: { light: '#7ec8ff', base: '#4a9be0', dark: '#2a6aa8' } },
  { name: 'Pink', palette: { light: '#ffb0d8', base: '#f07ab4', dark: '#b84a84' } },
];

/** Skin tones, for hands (and the face when a helmet is worn). Index 0 is the original default. */
export const SKIN_COLORS: { name: string; color: string }[] = [
  { name: 'Peach', color: '#e0a978' },
  { name: 'Light', color: '#f3cfa8' },
  { name: 'Tan', color: '#c68b5a' },
  { name: 'Brown', color: '#8d5a36' },
  { name: 'Deep', color: '#5c3a22' },
];

/** Hats. 'none' at index 0 is the default. The renderer draws each by `id`. */
export const HATS: { id: 'none' | 'cap' | 'beanie' | 'crown' | 'flower'; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'cap', name: 'Cap' },
  { id: 'beanie', name: 'Beanie' },
  { id: 'crown', name: 'Crown' },
  { id: 'flower', name: 'Flower' },
];

/** A player's chosen look, as indices into HAIR_COLORS / SKIN_COLORS / HATS. */
export interface PlayerLook {
  hair: number;
  skin: number;
  hat: number;
}

export const DEFAULT_LOOK: PlayerLook = { hair: 0, skin: 0, hat: 0 };

/** Clamps an untrusted look (from a join request) to valid indices, falling back to the defaults. */
export function sanitizeLook(look: Partial<PlayerLook> | null | undefined): PlayerLook {
  const pick = (v: unknown, len: number, fallback: number): number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < len ? v : fallback;
  return {
    hair: pick(look?.hair, HAIR_COLORS.length, DEFAULT_LOOK.hair),
    skin: pick(look?.skin, SKIN_COLORS.length, DEFAULT_LOOK.skin),
    hat: pick(look?.hat, HATS.length, DEFAULT_LOOK.hat),
  };
}

/** Sent client → server to join the game. */
export interface JoinRequest {
  name: string;
  look?: PlayerLook;
}
