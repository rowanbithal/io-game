/**
 * The trading post: a fixed set of one-way exchanges (see Game.handleTrade)
 * that turn farmable food — berries and wheat — into the hard materials
 * everything else is built from. Each offer moves one *batch* at a time
 * (give `give.amount` of `give.type`, get `get.amount` of `get.type`), the
 * same "pay the full cost, get the full result" shape a Recipe already has,
 * just without a craft timer — a trade is instant. The trading post's own
 * quantity stepper (see HUD.tradeQty) scales a batch up before it's sent,
 * so a single click can execute several batches of the same offer at once.
 */
export interface TradeOffer {
  id: string;
  give: { type: string; amount: number };
  get: { type: string; amount: number };
}

/** Upper bound on the quantity stepper / a single TradeRequest — a sanity clamp, not a balance decision. */
export const MAX_TRADE_QUANTITY = 9999;

/**
 * How many berries one unit of each material costs — the value anchor
 * every wheat rate below is derived from. Deliberately not a flat rate
 * scaled off the game's own RESOURCE_SCORE (wood 1 : stone 2 : gold 10 :
 * diamond 50, server-side only) — stone stays cheap and close to that same
 * ratio, but gold and diamond curve up far harder than 10:50 would
 * suggest. Trading should be a real alternative route to wood/stone, only
 * a slow supplementary trickle for gold, and never a substitute for
 * actually finding and mining a diamond — 300 berries is deliberately a
 * serious farming project, not a shortcut.
 *
 * Wheat is worth a flat quarter of a berry (4 wheat : 1 berry) rather than
 * getting its own independent rates — every wheat offer below just charges
 * 4x its berry counterpart's `give` for the same `get`, so the two stay in
 * lockstep if the berry rates above ever change.
 */
const WHEAT_PER_BERRY = 4;

export const TRADE_OFFERS: TradeOffer[] = [
  { id: 'berry_wood', give: { type: 'berry', amount: 1 }, get: { type: 'wood', amount: 2 } },
  { id: 'berry_stone', give: { type: 'berry', amount: 1 }, get: { type: 'stone', amount: 1 } },
  { id: 'berry_gold', give: { type: 'berry', amount: 20 }, get: { type: 'gold', amount: 1 } },
  { id: 'berry_diamond', give: { type: 'berry', amount: 300 }, get: { type: 'diamond', amount: 1 } },
  { id: 'wheat_wood', give: { type: 'wheat', amount: 1 * WHEAT_PER_BERRY }, get: { type: 'wood', amount: 2 } },
  { id: 'wheat_stone', give: { type: 'wheat', amount: 1 * WHEAT_PER_BERRY }, get: { type: 'stone', amount: 1 } },
  { id: 'wheat_gold', give: { type: 'wheat', amount: 20 * WHEAT_PER_BERRY }, get: { type: 'gold', amount: 1 } },
  { id: 'wheat_diamond', give: { type: 'wheat', amount: 300 * WHEAT_PER_BERRY }, get: { type: 'diamond', amount: 1 } },
];

export const TRADE_OFFERS_BY_ID: Record<string, TradeOffer> = Object.fromEntries(
  TRADE_OFFERS.map((o) => [o.id, o]),
);

/** True if `inventory` holds enough of the offer's `give` item for `quantity` batches of it (default 1). */
export function canAffordTrade(offer: TradeOffer, inventory: Record<string, number>, quantity = 1): boolean {
  return (inventory[offer.give.type] ?? 0) >= offer.give.amount * quantity;
}
