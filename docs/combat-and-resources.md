# Combat & Resource Reference

Numbers pulled directly from `shared/src/constants.ts`, `shared/src/crafting.ts`, and
`server/src/entities/Resource.ts`. If those change, this file will drift — it's a
snapshot, not a source of truth.

Two mechanics underpin every table below:

- **Every swing deals a flat 30 damage** (`HARVEST_DAMAGE`), no matter what's held.
  Axes and pickaxes never change how many hits something takes to kill or clear —
  they only change how much a resource *pays out* per point of damage. Only a
  sword changes hit count, and only against spiders/foxes/players, not resources.
- Damage/yield only apply if the tool is both **selected** and **actually owned**
  (a claimed-but-not-owned item is ignored server-side).

## 1. Enemy health & hits to kill

| Enemy  | Max HP | Fist / Axe / Pickaxe (30 dmg) | Wooden Sword (60 dmg) | Stone Sword (90 dmg) | Gold Sword (120 dmg) |
|--------|-------:|:------------------------------:|:----------------------:|:---------------------:|:----------------------:|
| Spider |    360 |            12 hits             |         6 hits          |         4 hits         |          3 hits          |
| Fox    |    420 |            14 hits             |         7 hits          |         5 hits         |          4 hits          |

Hit counts are rounded up (`⌈Max HP ÷ damage⌉`) — a killing blow only needs to
*reach* 0 HP, not land exactly on it.

## 2. Damage per hit, by weapon/item

| Weapon / Item                              | Damage per hit | Multiplier |
|---------------------------------------------|:--------------:|:----------:|
| Fist (bare hands)                            |       30        |     ×1     |
| Wooden Axe / Stone Axe / Gold Axe            |       30        |     ×1     |
| Wooden Pickaxe / Stone Pickaxe / Gold Pickaxe|       30        |     ×1     |
| Fishing Rod                                  |       30        |     ×1     |
| Wooden Sword                                 |       60        |     ×2     |
| Stone Sword                                  |       90        |     ×3     |
| Gold Sword                                   |      120        |     ×4     |

Axes and pickaxes carry **no combat bonus** — holding one to fight is identical
to fighting bare-handed. Swords carry **no harvest bonus** — they never speed up
gathering. The same numbers apply to PvP (hitting another player uses this same
table).

## 3. Resource yield, by tool

Each resource has its own HP pool (also depleted at 30/hit) and a fixed total
yield once fully harvested. Axes only boost **wood**, pickaxes only boost
**stone** and **gold** — nothing boosts berries, mushrooms, wheat, or purple
berries, and a tree's bonus berry drop is unaffected by axe tier.

| Resource            | HP  | Hits to clear | Base yield (any tool / fist) | Wooden tier | Stone tier | Gold tier |
|----------------------|----:|:--------------:|-------------------------------|:-----------:|:----------:|:---------:|
| Tree                 |  90 |     3 hits      | 3 wood + 1 berry               |  5 wood †    |  6 wood     |  8 wood †  |
| Rock                 | 150 |     5 hits      | 3 stone                        |  5 stone †   |  6 stone    |  8 stone † |
| Gold Deposit         | 260 |     9 hits      | **0** — wrong tool bounces off ‡ |     —      |  2 gold ⁂   |  4 gold    |
| Berry Bush           |  30 |     1 hit       | 1 berry                        |      —      |     —      |     —     |
| Mushroom             |  20 |     1 hit       | 1 mushroom                     |      —      |     —      |     —     |
| Wheat                |  15 |     1 hit       | 2 wheat                        |      —      |     —      |     —     |
| Purple Berry (forest)|  30 |     1 hit       | 1 purple berry                 |      —      |     —      |     —     |

*"Wooden/Stone/Gold tier" means axe for wood, pickaxe for stone/gold.*

- **†** ×1.5 (wooden) and ×2.5 (gold) tiers land on a half-item — 4.5 and 7.5 —
  which round out to whole items across however many swings it actually takes;
  shown here rounded to the nearest whole number.
- **‡** Gold has a hard tool requirement rather than the usual "bare hands
  still work, a tool just yields more" rule — bare hands *and* a wooden
  pickaxe both do 0 against it. Stone pickaxe or better is mandatory just to
  dent it.
- **⁂** Stone Pickaxe can mine gold (it clears the requirement above) but
  gets no yield bonus for it — only Gold Pickaxe doubles the gold payout.

Dark forest trees/rocks spawn oversized (1.32× and 1.5× respectively) and
scale both their HP and yield up accordingly — the rows above are the
plains-sized baseline.
