/**
 * Flavor text for the animal compendium — pure data, no drawing. Portraits
 * are dispatched by `id` in HUD.drawAnimalPortrait, which picks the matching
 * sprite out of Renderer.ts (or, for fish, draws a representative species).
 *
 * The wording here is meant to describe actual behavior (see Game.ts's
 * updateFoxes/updateSpiders and Renderer.ts's firefly/fish simulations)
 * rather than invent lore that doesn't match what the game does.
 */
export interface AnimalEntry {
  id: string;
  name: string;
  tagline: string;
  paragraphs: string[];
}

export const ANIMALS: AnimalEntry[] = [
  {
    id: 'fox',
    name: 'Fox',
    tagline: 'Dark forest hunter',
    paragraphs: [
      'Foxes belong to the dark forest — that’s where they spawn, and they know every trunk in it. Given a clear run they’ll sprint straight at you, but the moment something solid is in the way they path around it, so weaving between trees rarely shakes one off the way it does simpler threats.',
      'Their nose goes cold fast outside their own woods, though: chase or be chased too far past the treeline and a fox breaks off outright rather than following you onto the open plains. Stay lost long enough with nobody to hunt and it gives up and disappears entirely.',
      'Once locked onto a scent it stays locked on until you put real distance between you — a closer target can still steal its attention, but a fox won’t drop a chase just because you’re momentarily out of sight. They hunt day and night, just far more of them prowl after dark.',
      'A dead fox drops meat, not string — worth cooking over a campfire before it’s eaten — plus a hide of leather, already tanned and ready to sew into a backpack alongside a spider’s string.',
    ],
  },
  {
    id: 'spider',
    name: 'Spider',
    tagline: 'Night-only threat',
    paragraphs: [
      'Spiders are creatures of the dark, full stop — the instant day breaks, every spider on the map vanishes outright. There’s no such thing as a daytime spider; wait out the night in one spot and the threat clears itself.',
      'They spawn map-wide once the sun goes down, but the dark forest breeds them fastest of all — a second, quicker timer rolls just for spots inside the treeline, so the woods get thick with them well before the open plains do.',
      'Eight legs, a wide low body, and a nasty bite. Slower than a player on foot, so a straight sprint always outruns one in the open — but tougher and harder-hitting than a fox if it catches you standing still.',
      'Killing one drops string — useful for a fishing rod, and for a backpack alongside a fox’s leather.',
    ],
  },
  {
    id: 'beetle',
    name: 'Beetle',
    tagline: 'Desert hunter',
    paragraphs: [
      'Beetles belong to the desert the way foxes belong to the dark forest — that quarter of the map, east of the plains, is where they spawn and where they stay. There’s nothing dense enough out there to route around, so a beetle doesn’t pathfind like a fox does — it just scuttles straight at you.',
      'Once locked onto a scent it stays locked on until you put real distance between you, same sticky aggro a fox shows — but stray far enough past the desert’s edge and it breaks off and gives up rather than following you back into the plains.',
      'The heat is the real threat, not just the bite: thirst drains faster out there, and the ground itself is a mild, constant drag on how fast you can move. A beetle catching you already slowed and dehydrating is a worse fight than the same beetle anywhere else.',
      'A dead beetle drops meat, same as a fox — worth cooking over a campfire before it’s eaten.',
    ],
  },
  {
    id: 'fish',
    name: 'Fish',
    tagline: 'Lake & sea catch',
    paragraphs: [
      'Cast a fishing rod into any lake, or the sea along the map’s southern coast, and something will eventually bite — what you land is down to chance, not skill or location.',
      'Most catches are common stuff: Silverfin and Olive Perch turn up constantly. Bluegill is scarcer, Crimson Snapper and Koi rarer still, and right at the bottom of the odds sit two legendary catches — the gold-scaled Golden Carp and the near-mythical Amethyst Eel.',
      'Whatever’s landed goes straight into the inventory like any other item — nothing is auto-eaten, so a prize catch can be kept, cooked, or handed off same as anything else.',
    ],
  },
  {
    id: 'firefly',
    name: 'Firefly',
    tagline: 'Forest ambience',
    paragraphs: [
      'The one creature in the dark forest that will never so much as notice you. Fireflies don’t fight, don’t flee, and can’t be caught or harvested — they’re pure atmosphere, drifting light with nothing behind it but the glow.',
      'Each one loops around a fixed spot in the forest rather than roaming free, which is why the swarm stays spread evenly through the trees instead of slowly drifting together into one clump.',
      'Near invisible by day, they only really come alive at dusk and through the night — and even then, each one blinks on its own private rhythm rather than in unison with the rest of the swarm.',
    ],
  },
];
