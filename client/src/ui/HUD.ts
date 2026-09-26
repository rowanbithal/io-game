import {
  PlayerState,
  GameState,
  MAP_SIZE,
  MAX_HUNGER,
  MAX_THIRST,
  MAX_AIR,
  RECIPES,
  RECIPES_BY_ID,
  Recipe,
  canAfford,
  CRAFTING_BENCH_ID,
  WALL_ID,
  BENCH_USE_RADIUS,
  CAMPFIRE_WARMTH_RADIUS,
  WOODEN_AXE_ID,
  WOODEN_PICKAXE_ID,
  WOODEN_SWORD_ID,
  STONE_AXE_ID,
  STONE_PICKAXE_ID,
  STONE_SWORD_ID,
  GOLD_AXE_ID,
  GOLD_PICKAXE_ID,
  GOLD_SWORD_ID,
  WOODEN_ARMOR_ID,
  STONE_ARMOR_ID,
  GOLD_ARMOR_ID,
  TORCH_ID,
  FISHING_ROD_ID,
  FISH_SPECIES_BY_ID,
  FOOD_ITEMS,
  RAW_MEAT_ID,
  COOKED_MEAT_ID,
  LEATHER_ID,
  BACKPACK_ID,
  WOODEN_HOE_ID,
  WATERING_CAN_ID,
  BERRY_SEED_ID,
  WHEAT_SEED_ID,
  BREAD_ID,
  TRADE_OFFERS,
  TradeOffer,
  canAffordTrade,
  MAX_TRADE_QUANTITY,
  LakeState,
  IslandState,
  DARK_FOREST_TRANSITION,
  darkForestBandAt,
  SEA_SAND_WIDTH,
  seaCoastAt,
  isInDesert,
  forestBorderIsDesert,
  hashCell,
  lakeHarmonics,
  lobeRadius,
  LakeHarmonic,
} from '@io-game/shared';
import {
  drawCampfireSprite,
  CAMPFIRE_SPRITE_HALF_BLOCKS,
  drawCraftingBenchSprite,
  BENCH_SPRITE_HALF_BLOCKS,
  drawWallSprite,
  WALL_SPRITE_HALF_BLOCKS,
  drawToolIcon,
  toolIconHalfBlocks,
  drawArmorIcon,
  ARMOR_ICON_HALF_BLOCKS,
  drawTorchIcon,
  TORCH_ICON_HALF_BLOCKS,
  drawWoodIcon,
  WOOD_ICON_HALF_BLOCKS,
  drawStoneIcon,
  STONE_ICON_HALF_BLOCKS,
  drawGoldIcon,
  GOLD_ICON_HALF_BLOCKS,
  drawDiamondIcon,
  DIAMOND_ICON_HALF_BLOCKS,
  drawWheatIcon,
  WHEAT_ICON_HALF_BLOCKS,
  drawStringIcon,
  STRING_ICON_HALF_BLOCKS,
  drawMeatIcon,
  drawCookedMeatIcon,
  MEAT_ICON_HALF_BLOCKS,
  drawLeatherIcon,
  LEATHER_ICON_HALF_BLOCKS,
  drawBreadIcon,
  BREAD_ICON_HALF_BLOCKS,
  drawBerrySeedIcon,
  drawWheatSeedIcon,
  SEED_ICON_HALF_BLOCKS,
  drawBackpackIcon,
  drawFishIcon,
  FISH_ICON_HALF_BLOCKS,
  drawBerryIcon,
  drawMushroomIcon,
  MAP_COLORS,
  drawFoxPortrait,
  FOX_PORTRAIT_HALF_BLOCKS,
  drawSpiderPortrait,
  SPIDER_PORTRAIT_HALF_BLOCKS,
  drawBeetlePortrait,
  BEETLE_PORTRAIT_HALF_BLOCKS,
  drawFireflyShape,
  FIREFLY_PORTRAIT_HALF_BLOCKS,
} from '../Renderer';
import {
  WOOD,
  woodTile,
  woodPanel,
  woodSlot,
  pixelRoundRect,
  drawCarvedBook,
  drawCarvedPaw,
  drawCarvedStand,
  LEATHER,
  drawLeatherCover,
  drawPageSheet,
  drawLeatherTab,
} from './wood';
import { ANIMALS } from './animals';
import { RECIPE_BOOK_CATEGORIES, itemDisplayName, noteFor } from './recipeBook';

/** Armor items — worn via a toggle (see EquipRequest) rather than held like a tool. */
const ARMOR_ITEM_IDS = new Set([WOODEN_ARMOR_ID, STONE_ARMOR_ID, GOLD_ARMOR_ID]);

/** The torch — same worn-via-toggle shape as armor, just a separate equip slot (see PlayerState.torch). */
const TORCH_ITEM_IDS = new Set([TORCH_ID]);

/** The backpack — same worn-via-toggle shape as armor/the torch, a separate equip slot (see PlayerState.backpack). */
const BACKPACK_ITEM_IDS = new Set([BACKPACK_ID]);

/** Every item that's worn/toggled rather than held — armor, the torch, and the backpack alike (see selectSlot and friends below). */
const EQUIP_ITEM_IDS = new Set([...ARMOR_ITEM_IDS, ...TORCH_ITEM_IDS, ...BACKPACK_ITEM_IDS]);

/** What clicking/selecting a hotbar slot should do, when it isn't a plain tool selection. */
interface HotbarSlotAction {
  action: 'eat' | 'equip';
  itemId: string;
}

interface Notification {
  text: string;
  color: string;
  born: number;
  ttl: number; // ms
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ChatEntry {
  name: string;
  text: string;
  isMe: boolean;
  born: number;
}

// Global chat log, down the right-hand side under the leaderboard. Messages
// stay listed for CHAT_ENTRY_TTL and then fade out, so the log clears itself
// during a quiet stretch instead of sitting there permanently.
const CHAT_LOG_W = 260;
const CHAT_LOG_MAX = 8;
const CHAT_ENTRY_TTL = 25000; // ms
const CHAT_FADE = 2500; // ms of fade at the end of the TTL
const CHAT_LINE_H = 14;
// Clears the leaderboard panel above it (12 top margin + 30 header + 10 rows).
const CHAT_LOG_TOP = 274;

// Minimap. One terrain cell per MINIMAP_CELL screen pixels — chunky on
// purpose, so the map reads as pixel art like the world it depicts.
const MINIMAP_SIZE = 144;
const MINIMAP_CELL = 2;
// How far below the tree line the grass is still visibly in the forest's
// shadow, matching the renderer's own long approach ramp (FOREST_GRASS_REACH).
const FOREST_SHADE_REACH = 340;

/**
 * Ground colour at a world position, for one minimap cell. Mirrors how the
 * world itself is laid out (see the renderer's forest floor and lake shores):
 * lakes sit on top of everything, the dark forest's dirt floor takes over
 * above its wandering border, the grass darkens on the approach to it, and
 * plains grass varies between a few tones. `noise` is the cell's stable 0..1
 * hash — it picks the tone and dithers every boundary, which is what keeps
 * the seams speckled instead of drawn with a ruler.
 */
function terrainColor(
  wx: number,
  wy: number,
  noise: number,
  lakes: { lake: LakeState; harmonics: LakeHarmonic[] }[],
  islands: { island: IslandState; harmonics: LakeHarmonic[] }[],
): string {
  for (const { lake, harmonics } of lakes) {
    const dx = wx - lake.x;
    const dy = wy - lake.y;
    const d = Math.hypot(dx, dy);
    // Cheap reject before the trig: nothing this far out can be lake.
    if (d > lake.radius * 1.6 + lake.shoreWidth * 1.5) continue;

    const coast = lobeRadius(Math.atan2(dy, dx), lake.radius, harmonics);
    if (d <= coast) {
      // Deep water in the middle, shallows at the coastline.
      const depth = d / coast;
      return pick(MAP_COLORS.water, depth < 0.5 ? 0 : depth < 0.85 ? 1 : 2);
    }
    // Sand ring, dithering out into the grass over its last stretch — mud
    // instead, for the desert's one oasis (see Renderer.ts's drawLakes,
    // which tells it apart from an ordinary lake the same way: purely by
    // position).
    const shoreTones = isInDesert(lake.x, lake.y) ? MAP_COLORS.mud : MAP_COLORS.sand;
    const fromWater = d - coast;
    if (fromWater <= lake.shoreWidth) return pick(shoreTones, noise < 0.5 ? 1 : 2);
    if (fromWater <= lake.shoreWidth * 1.5 && noise < 0.45) return pick(shoreTones, 0);
  }

  // A sea island — same lobe-coastline treatment as a lake's above, just
  // inverted (grass in the middle, sand at the edge, sea beyond) — checked
  // before the sea's own coast/sand-ring logic below since an island's
  // whole footprint would otherwise just read as open water.
  for (const { island, harmonics } of islands) {
    const dx = wx - island.x;
    const dy = wy - island.y;
    const d = Math.hypot(dx, dy);
    if (d > island.radius * 1.6 + island.shoreWidth * 1.5) continue;

    const land = lobeRadius(Math.atan2(dy, dx), island.radius, harmonics);
    if (d <= land) return pick(MAP_COLORS.grass, noise < 0.45 ? 0 : noise < 0.85 ? 1 : 2);

    const fromLand = d - land;
    if (fromLand <= island.shoreWidth) return pick(MAP_COLORS.sand, noise < 0.5 ? 1 : 2);
    if (fromLand <= island.shoreWidth * 1.5 && noise < 0.45) return pick(MAP_COLORS.sand, 0);
  }

  // The sea, across the bottom of the map — same coast/sand-ring treatment
  // as a lake's above, just following seaCoastAt's wandering band instead of
  // a circular blob.
  const coast = seaCoastAt(wx);
  if (wy >= coast) {
    const depth = wy - coast;
    return pick(MAP_COLORS.water, depth < 90 ? 2 : depth < 200 ? 1 : 0);
  }
  const fromCoast = coast - wy;
  if (fromCoast <= SEA_SAND_WIDTH) return pick(MAP_COLORS.sand, noise < 0.5 ? 1 : 2);
  if (fromCoast <= SEA_SAND_WIDTH * 1.2 && noise < 0.45) return pick(MAP_COLORS.sand, 0);

  // The desert — the dark forest's own top-right corner (see isInDesert,
  // which checks both of its borders at once) — takes over from the forest
  // there, so this has to preempt the forest/grass logic below rather than
  // fall through to it.
  if (isInDesert(wx, wy)) {
    return pick(MAP_COLORS.desertSand, noise < 0.35 ? 0 : noise < 0.75 ? 2 : 1);
  }

  const band = darkForestBandAt(wx);
  if (wy < band) return pick(MAP_COLORS.forest, noise < 0.4 ? 0 : noise < 0.8 ? 1 : 2);

  // The seam: dirt speckled into grass just below the border, thinning out
  // with distance from it — but only where there's real dark forest north of
  // here to be the seam of. Along the desert's own stretch of this same
  // band(wx) line, there isn't (see forestBorderIsDesert) — that "band" is
  // the desert's south border instead, and it draws its own transition (see
  // isInDesert above), so bleeding a dirt seam south of it too would show
  // dark forest ground the desert doesn't actually border there.
  const belowBand = wy - band;
  if (!forestBorderIsDesert(wx)) {
    if (belowBand < DARK_FOREST_TRANSITION && noise > belowBand / DARK_FOREST_TRANSITION) {
      return pick(MAP_COLORS.forest, 1);
    }
    // Grass in the forest's shadow, thinning out over a much longer approach.
    if (belowBand < FOREST_SHADE_REACH && noise > belowBand / FOREST_SHADE_REACH) {
      return pick(MAP_COLORS.grassShade, noise < 0.6 ? 0 : 1);
    }
  }

  return pick(MAP_COLORS.grass, noise < 0.45 ? 0 : noise < 0.85 ? 1 : 2);
}

function pick(tones: readonly string[], index: number): string {
  return tones[Math.min(index, tones.length - 1)];
}

/**
 * Greedy word wrap to `maxW`, measured in the context's current font. A word
 * too long to fit on a line of its own is broken mid-word rather than left to
 * run off the panel — nothing stops someone typing 80 characters without a
 * space in them.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';

  const pushBroken = (word: string): void => {
    let chunk = '';
    for (const ch of word) {
      if (chunk && ctx.measureText(chunk + ch).width > maxW) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  };

  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxW) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width > maxW) pushBroken(word);
    else line = word;
  }

  if (line) lines.push(line);
  return lines;
}

// Corner crafting panel, bottom-left. CRAFT_PANEL_BOTTOM clears the controls
// hint line along the bottom of the screen.
const CRAFT_PANEL_X = 12;
const CRAFT_PANEL_W = 172;
const CRAFT_PANEL_BOTTOM = 72;
// Highest the stack of rows is allowed to reach — leaves room for the header
// and clears the minimap in the top-left corner (12 margin + MINIMAP_SIZE).
const CRAFT_PANEL_TOP = 176;
const CRAFT_ROW_H = 38;
const CRAFT_ROW_GAP = 4;

// Item art is built from whole blocks (see Renderer's block engine), so an
// icon drawn much under the hotbar's size collapses its blocks to 2px and
// stops looking like the same object. Every icon the crafting UI shows is
// sized off these, not off whatever space happened to be left over.
const ICON_RESULT = 38; // matches the hotbar slot icon
const ICON_INGREDIENT = 26; // book ingredient lists
const ICON_STATION = 22; // the bench/campfire requirement mark

// The carved book tile, top-right of the screen. LEADERBOARD_W mirrors
// drawLeaderboard's own panel width — the tile sits just left of it.
const LEADERBOARD_W = 180;
const BOOK_TILE = 42;

function rectHas(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class HUD {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  // The trading post's quantity field — see the constructor for setup.
  private readonly qtyInput: HTMLInputElement;
  private inventory: Record<string, number> = {};
  private notifications: Notification[] = [];

  // Hotbar: slots are assigned in the order item types are first collected,
  // and dropped as soon as their count hits 0 — so a used-up campfire or
  // depleted stack doesn't linger as a dead "0" slot. That does mean slots
  // (and what a number key selects) can shift when something empties out.
  private hotbarOrder: string[] = [];
  private selectedIndex = 0;
  // Index currently being drag-reordered, or null when not dragging.
  private draggingIndex: number | null = null;

  // Crafting panel state, refreshed from the local player each frame.
  private craftingId: string | null = null;
  private craftingProgress = 0;
  // Whether the local player is standing close enough to a bench to use
  // bench-gated recipes. Mirrors the server's own check — the server still
  // re-validates, this only drives what the panel offers.
  private nearBench = false;
  // Same idea for campfire-gated recipes (currently just cooked_meat) —
  // mirrors Game.isNearFire.
  private nearFire = false;

  // Global chat log, newest last (see pushChat / drawChatLog).
  private chatLog: ChatEntry[] = [];

  // The world's lakes (sent once on join) and the terrain they're painted
  // into — see setLakes / buildTerrain. Null until the first frame after the
  // lakes land, then reused for the rest of the session.
  private lakes: LakeState[] = [];
  private islands: IslandState[] = [];
  private terrain: HTMLCanvasElement | null = null;

  // Whether the full recipe catalogue is open over the game, and which of
  // RECIPE_BOOK_CATEGORIES its current spread shows.
  private bookOpen = false;
  private recipeCategoryIndex = 0;
  // Whether the animal compendium is open over the game, and which of
  // ANIMALS its current page shows.
  private bestiaryOpen = false;
  private bestiaryPage = 0;
  // Whether the trading post is open over the game — no pagination of its
  // own, every offer fits on its one fixed spread (see tradeLayout).
  private tradeOpen = false;
  // How many batches of an offer a click executes — the stepper's value
  // (see qtyInput/adjustTradeQty), applied uniformly to whichever row is
  // clicked rather than tracked per-row.
  private tradeQty = 1;
  // Last known cursor position, fed in each frame by the game loop — the HUD
  // draws hover states for its wooden buttons, which a click-only interface
  // can't tell it about.
  private pointerX = -1;
  private pointerY = -1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'position:fixed;top:0;left:0;pointer-events:none;z-index:20;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    // Off by default; the berry/mushroom/purple-berry icons draw a real
    // sprite image (see drawItemIcon) that needs this to stay crisp at
    // hotbar-icon scale instead of blurring like a photo thumbnail.
    this.ctx.imageSmoothingEnabled = false;

    // The trading post's quantity field: a real <input> laid over the
    // canvas, same reasoning as ChatBox's composer — a caret and selection
    // that behave correctly for free, rather than reimplementing text entry
    // in canvas. Repositioned every frame the panel is open (see
    // drawTradePanel) to stay glued to the stepper's box; hidden otherwise.
    this.qtyInput = document.createElement('input');
    this.qtyInput.type = 'text';
    this.qtyInput.inputMode = 'numeric';
    this.qtyInput.maxLength = String(MAX_TRADE_QUANTITY).length;
    this.qtyInput.autocomplete = 'off';
    this.qtyInput.spellcheck = false;
    this.qtyInput.value = '1';
    this.qtyInput.style.cssText = [
      'position:fixed',
      'display:none',
      'z-index:25',
      'box-sizing:border-box',
      'text-align:center',
      'font:bold 13px "Courier New", monospace',
      'color:#f4e4c1',
      'background:#20140a',
      'border:2px solid #3a2513',
      'border-radius:3px',
      'outline:none',
      'padding:0',
    ].join(';');
    document.body.appendChild(this.qtyInput);

    // Digits only, live — invalid characters are stripped as they're typed
    // rather than rejected key-by-key, so paste works too. An empty field
    // reads as 1 for gameplay purposes without forcing "1" back into the box
    // mid-edit; blur is what actually normalizes what's shown (see below).
    this.qtyInput.addEventListener('input', () => {
      const digits = this.qtyInput.value.replace(/[^0-9]/g, '');
      if (digits !== this.qtyInput.value) this.qtyInput.value = digits;
      const n = digits ? parseInt(digits, 10) : 0;
      this.tradeQty = Math.max(1, Math.min(MAX_TRADE_QUANTITY, n || 1));
    });
    this.qtyInput.addEventListener('blur', () => {
      this.qtyInput.value = String(this.tradeQty);
    });
    // Keys typed here shouldn't also reach the game's window-level listeners
    // (same reasoning as ChatBox) — Escape would otherwise close the panel
    // out from under a field that's still focused.
    this.qtyInput.addEventListener('keydown', (e) => e.stopPropagation());
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    // Resizing a canvas resets its 2D context state, smoothing included.
    this.ctx.imageSmoothingEnabled = false;
  }

  updateInventory(inv: Record<string, number>): void {
    this.inventory = inv;
    const selected = this.hotbarOrder[this.selectedIndex];

    for (const type of Object.keys(inv)) {
      if ((inv[type] ?? 0) > 0 && !this.hotbarOrder.includes(type)) this.hotbarOrder.push(type);
    }
    this.hotbarOrder = this.hotbarOrder.filter((type) => (inv[type] ?? 0) > 0);

    // Keep the same item selected if it's still around; otherwise fall back
    // to whatever slot now occupies roughly the same spot.
    const stillThere = selected ? this.hotbarOrder.indexOf(selected) : -1;
    this.selectedIndex = stillThere >= 0 ? stillThere : Math.min(this.selectedIndex, Math.max(0, this.hotbarOrder.length - 1));
  }

  /**
   * Selects a hotbar slot by index (0-based) — unless it holds food (eaten
   * immediately instead) or something worn (armor or a torch, worn/unworn
   * instead via a toggle — see EquipRequest), neither of which can be
   * "held" the way a tool/weapon is. Either way the current selection is
   * left untouched, and the action to take is returned instead of a plain
   * selection.
   */
  selectSlot(index: number): HotbarSlotAction | null {
    if (index < 0 || index >= this.hotbarOrder.length) return null;
    const item = this.hotbarOrder[index];
    if (FOOD_ITEMS.has(item)) return { action: 'eat', itemId: item };
    if (EQUIP_ITEM_IDS.has(item)) return { action: 'equip', itemId: item };
    this.selectedIndex = index;
    return null;
  }

  /** Cycles the selected slot by +1/-1, wrapping around — skips food/worn-equip slots, neither of which can be held (see selectSlot). */
  scrollSlot(direction: number): void {
    const n = this.hotbarOrder.length;
    if (n === 0) return;
    const step = Math.sign(direction);
    let next = this.selectedIndex;
    for (let i = 0; i < n; i++) {
      next = ((next + step) % n + n) % n;
      const item = this.hotbarOrder[next];
      if (!FOOD_ITEMS.has(item) && !EQUIP_ITEM_IDS.has(item)) {
        this.selectedIndex = next;
        return;
      }
    }
    // Every slot is food/worn-equip — nothing else to cycle to.
  }

  /**
   * Starts dragging a hotbar slot to reorder it (also selects it) — unless
   * it holds food or something worn (armor/torch), same exception as
   * selectSlot: acted on immediately instead, no drag started, current
   * selection untouched.
   */
  beginHotbarDrag(index: number): HotbarSlotAction | null {
    if (index < 0 || index >= this.hotbarOrder.length) return null;
    const item = this.hotbarOrder[index];
    if (FOOD_ITEMS.has(item)) return { action: 'eat', itemId: item };
    if (EQUIP_ITEM_IDS.has(item)) return { action: 'equip', itemId: item };
    this.draggingIndex = index;
    this.selectedIndex = index;
    return null;
  }

  /**
   * Called continuously (each frame) while a drag is active. Live-swaps the
   * dragged item into whichever slot the cursor is currently over, so the
   * bar visibly reorders as you drag rather than only on release.
   */
  updateHotbarDrag(x: number, y: number): void {
    if (this.draggingIndex === null) return;
    // The array can shrink mid-drag (the dragged item's count could hit 0
    // from a server update while the mouse is still down) — bail cleanly
    // rather than swapping with a now out-of-range index.
    if (this.draggingIndex >= this.hotbarOrder.length) {
      this.draggingIndex = null;
      return;
    }
    const target = this.hitTestHotbar(x, y);
    if (target === null || target === this.draggingIndex) return;

    const order = this.hotbarOrder;
    [order[this.draggingIndex], order[target]] = [order[target], order[this.draggingIndex]];
    this.draggingIndex = target;
    this.selectedIndex = target;
  }

  /** Ends a hotbar drag (on mouseup, wherever the cursor ends up). */
  endHotbarDrag(): void {
    this.draggingIndex = null;
  }

  /**
   * The item type currently held, or null if nothing has been collected yet
   * — or if selectedIndex happens to be sitting on food or something worn
   * (armor/torch), none of which is ever actually "held" (see selectSlot).
   * That's a defensive filter here rather than something
   * selectSlot/scrollSlot/etc. all have to guarantee never happens on their
   * own.
   */
  getSelectedItem(): string | null {
    const item = this.hotbarOrder[this.selectedIndex] ?? null;
    return item && (FOOD_ITEMS.has(item) || EQUIP_ITEM_IDS.has(item)) ? null : item;
  }

  getItemCount(item: string): number {
    return this.inventory[item] ?? 0;
  }

  /** Cursor position in canvas pixels, for hover states on the wooden buttons. */
  setPointer(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  private pointerInside(x: number, y: number, w: number, h: number): boolean {
    return rectHas({ x, y, w, h }, this.pointerX, this.pointerY);
  }

  notify(text: string, color = '#f1c40f', ttl = 3000): void {
    this.notifications.push({ text, color, born: Date.now(), ttl });
    if (this.notifications.length > 5) this.notifications.shift();
  }

  render(state: GameState | null): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!state) return;

    const me = state.players.find((p) => p.isMe);
    this.craftingId = me?.craftingId ?? null;
    this.craftingProgress = me?.craftingProgress ?? 0;
    this.nearBench =
      !!me &&
      state.structures.some(
        (s) =>
          s.type === CRAFTING_BENCH_ID &&
          Math.hypot(me.x - s.x, me.y - s.y) <= BENCH_USE_RADIUS,
      );
    this.nearFire =
      !!me &&
      state.structures.some(
        (s) =>
          s.type === 'campfire' &&
          Math.hypot(me.x - s.x, me.y - s.y) <= CAMPFIRE_WARMTH_RADIUS,
      );

    if (state.spectating) this.drawSpectateBanner(me, W);

    this.drawAirBar(me, W, H);
    this.drawStatBars(me, W, H);
    this.drawHotbar(state.spectating ? me?.held ?? null : undefined, me?.armor ?? null, me?.torch ?? null, me?.backpack ?? null);
    this.drawCrafting(H);
    this.drawBookTile(W);
    this.drawBestiaryTile(W);
    this.drawTradeTile(W);
    this.drawLeaderboard(state, me, W);
    this.drawChatLog(W);
    this.drawClock(state, W, H);
    this.drawMinimap(state, me, W, H);
    this.drawNotifications(me, W, H);
    // Last, so their dimmed backdrops sit over the rest of the HUD. Only one
    // of the three is ever open at once (see toggleRecipeBook/toggleBestiary/
    // toggleTrade), so which one is drawn last here doesn't actually matter.
    this.drawRecipeBook(W, H);
    this.drawBestiary(W, H);
    this.drawTradePanel(W, H);

    // Prune expired notifications
    const now = Date.now();
    this.notifications = this.notifications.filter((n) => now - n.born < n.ttl);
  }

  // ── Air ────────────────────────────────────────────────────────────────────

  /**
   * A thin breath meter that only appears while it isn't full — draining
   * while wading (see ServerPlayer.update's AIR_DECAY_RATE) and refilling
   * again on dry land, rather than sitting on screen at full length the
   * whole game the way the stat bars below always do. Deliberately just a
   * bare fill with no label or numeric readout — the countdown itself isn't
   * the point, running out is.
   */
  private drawAirBar(me: PlayerState | undefined, W: number, H: number): void {
    if (!me || me.air >= MAX_AIR) return;

    // Matches drawStatBars' own bW/gap/count below it lines up with that row.
    const bW = 170;
    const gap = 13;
    const totalW = 4 * bW + 3 * gap;
    const barH = 22;
    const thin = 5;
    const x = (W - totalW) / 2;
    const y = H - 78 - 16 - barH - 8 - thin;

    const pct = Math.max(0, Math.min(1, me.air / MAX_AIR));
    const color = pct <= 0.3 ? '#e74c3c' : '#5ec8f0';

    this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.pill(x - 1, y - 1, totalW + 2, thin + 2, thin / 2 + 1);
    this.ctx.fill();

    this.ctx.fillStyle = 'rgba(30,30,30,0.7)';
    this.pill(x, y, totalW, thin, thin / 2);
    this.ctx.fill();

    if (pct > 0.01) {
      this.ctx.fillStyle = color;
      this.pill(x, y, totalW * pct, thin, thin / 2);
      this.ctx.fill();
    }
  }

  // ── Stat bars ──────────────────────────────────────────────────────────────

  private drawStatBars(me: PlayerState | undefined, W: number, H: number): void {
    if (!me) return;
    const bars = [
      // threshold is an absolute value (see bar.value < bar.threshold below),
      // not a fraction of max — scaled off maxHealth here so a bot's bigger
      // pool (see BOT_MAX_HEALTH_MULTIPLIER) still flashes low at the same
      // 30% mark a human player's does, same as HP's own fill above already
      // reads a fraction of maxHealth rather than a flat /100.
      { label: '♥ HP', value: me.health, max: me.maxHealth, fill: '#2ecc71', low: '#e74c3c', threshold: me.maxHealth * 0.3 },
      { label: '🍖 Food', value: me.hunger, max: MAX_HUNGER, fill: '#f39c12', low: '#e74c3c', threshold: 30 },
      { label: '❄ Temp', value: me.temperature, max: 100, fill: '#56c9ff', low: '#8e44ad', threshold: 25 },
      { label: '💧 Thirst', value: me.thirst, max: MAX_THIRST, fill: '#2980b9', low: '#e74c3c', threshold: 30 },
    ];

    const bW = 170;
    const bH = 22;
    const gap = 13;
    const totalW = bars.length * bW + (bars.length - 1) * gap;
    let x = (W - totalW) / 2;
    // Sits just above the hotbar (see hotbarSlotRects, whose slots start at
    // canvas.height - 78) with a small gap between the two.
    const y = H - 78 - 16 - bH;

    for (const bar of bars) {
      const pct = Math.max(0, Math.min(1, bar.value / bar.max));
      const color = bar.value < bar.threshold ? bar.low : bar.fill;

      // Shadow panel
      this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
      this.pill(x - 1, y - 1, bW + 2, bH + 2, 7);
      this.ctx.fill();

      // Empty track
      this.ctx.fillStyle = 'rgba(30,30,30,0.7)';
      this.pill(x, y, bW, bH, 6);
      this.ctx.fill();

      // Fill
      if (pct > 0.01) {
        this.ctx.fillStyle = color;
        this.pill(x, y, bW * pct, bH, 6);
        this.ctx.fill();
      }

      // Label
      this.ctx.font = 'bold 12px "Courier New"';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = '#fff';
      this.ctx.fillText(bar.label, x + bW / 2, y + bH / 2);

      x += bW + gap;
    }
  }

  // ── Hotbar ─────────────────────────────────────────────────────────────────

  /**
   * Screen rect of each hotbar slot, centred at the bottom of the screen.
   * Shared by the renderer and the click hit-test so they can never drift
   * apart (same pattern as craftRows).
   */
  private hotbarSlotRects(): { x: number; y: number; w: number; h: number }[] {
    const slotSize = 56;
    const gap = 8;
    const totalW = this.hotbarOrder.length * slotSize + (this.hotbarOrder.length - 1) * gap;
    let x = (this.canvas.width - totalW) / 2;
    const y = this.canvas.height - 78;
    return this.hotbarOrder.map(() => {
      const rect = { x, y, w: slotSize, h: slotSize };
      x += slotSize + gap;
      return rect;
    });
  }

  /**
   * `spectatingHeld` overrides which slot reads as selected with whatever
   * the spectated player actually has out (PlayerState.held, already
   * resolved server-side against their real inventory — see heldItemOf) —
   * this socket's own selectedIndex belongs to its own frozen body (see
   * handleSlashCommand) and has nothing to do with what's on screen while
   * spectating. `undefined` means "not spectating, use selectedIndex as
   * normal" — deliberately distinct from `null`, which means "spectating,
   * and they're holding nothing" (still an override, just to no slot).
   */
  private drawHotbar(spectatingHeld?: string | null, equippedArmor: string | null = null, equippedTorch: string | null = null, equippedBackpack: string | null = null): void {
    const slots = this.hotbarOrder;
    if (slots.length === 0) return;

    const { ctx } = this;
    const rects = this.hotbarSlotRects();

    slots.forEach((item, i) => {
      const { x, y, w: slotSize } = rects[i];
      // Food/worn-equip are never "held" (see selectSlot) — even if
      // selectedIndex transiently points at one (e.g. the first item ever
      // collected happened to be a berry), it shouldn't render as selected.
      const isSelected =
        spectatingHeld !== undefined
          ? item === spectatingHeld
          : i === this.selectedIndex && !FOOD_ITEMS.has(item) && !EQUIP_ITEM_IDS.has(item);
      const isDragging = i === this.draggingIndex;
      const isWorn = item === equippedArmor || item === equippedTorch || item === equippedBackpack;
      const count = this.inventory[item] ?? 0;

      ctx.fillStyle = isDragging ? 'rgba(255,255,255,0.4)' : isSelected || isWorn ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.45)';
      this.pill(x, y, slotSize, slotSize, 7);
      ctx.fill();

      if (isSelected || isDragging || isWorn) {
        ctx.strokeStyle = isDragging ? '#ffffff' : isWorn ? '#2ecc71' : '#f1c40f';
        ctx.lineWidth = 2;
        this.pill(x + 1, y + 1, slotSize - 2, slotSize - 2, 6);
        ctx.stroke();
      }

      this.drawItemIcon(item, x + slotSize / 2, y + slotSize / 2 - 6, 38);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px "Courier New"';
      ctx.fillStyle = '#e0e0e0';
      ctx.fillText(`${count}`, x + slotSize / 2, y + slotSize - 11);

      ctx.font = '10px "Courier New"';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`${i + 1}`, x + 4, y + 11);
    });
  }

  /** Returns the hotbar slot index clicked, or null if the click missed it. */
  hitTestHotbar(x: number, y: number): number | null {
    const rects = this.hotbarSlotRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return null;
  }

  // ── Crafting ───────────────────────────────────────────────────────────────

  /**
   * What the corner panel lists: only recipes the player can pay for right
   * now, so the panel is a short "you could make this" shelf rather than a
   * wall of mostly-unaffordable rows. The full catalogue, with everything
   * each recipe needs, lives in the recipe book (see drawRecipeBook).
   *
   * Station gating (bench/campfire) deliberately doesn't hide a row: the
   * ingredients are the thing you have to go and gather, and a recipe
   * blinking in and out as you walk past your own bench reads as a bug. Those
   * rows stay listed with a padlock instead.
   *
   * An in-progress craft is always listed too — the server deducts its
   * ingredients the moment it starts (Game.handleCraft), so otherwise the row
   * would vanish exactly when its progress bar became interesting.
   */
  private visibleRecipes(): Recipe[] {
    return RECIPES.filter((r) => r.id === this.craftingId || canAfford(r, this.inventory));
  }

  /**
   * Screen rect of the carved book tile — top-right, tucked just left of the
   * leaderboard panel (see drawLeaderboard for the matching numbers).
   */
  private bookButtonRect(W: number): Rect {
    return {
      x: W - LEADERBOARD_W - 12 - 8 - BOOK_TILE,
      y: 12,
      w: BOOK_TILE,
      h: BOOK_TILE,
    };
  }

  /**
   * Screen rect of each craftable row, stacked upward from the bottom-left
   * corner. Shared by the renderer and the click hit-test so they can never
   * drift apart.
   */
  private craftRows(H: number): (Rect & { recipe: Recipe })[] {
    const bottom = H - CRAFT_PANEL_BOTTOM;

    // Only as many rows as fit above the header sign — on a short window the
    // rest stay in the book rather than running off the top of the screen.
    // An in-progress craft always keeps its slot, whatever gets cut.
    const all = this.visibleRecipes();
    const max = Math.max(1, Math.floor((bottom - CRAFT_PANEL_TOP) / (CRAFT_ROW_H + CRAFT_ROW_GAP)));
    let recipes = all.slice(0, max);
    const active = all.find((r) => r.id === this.craftingId);
    if (active && !recipes.includes(active)) recipes = [...recipes.slice(0, max - 1), active];

    return recipes.map((recipe, i) => ({
      recipe,
      x: CRAFT_PANEL_X,
      y: bottom - (recipes.length - i) * (CRAFT_ROW_H + CRAFT_ROW_GAP),
      w: CRAFT_PANEL_W,
      h: CRAFT_ROW_H,
    }));
  }

  private drawCrafting(H: number): void {
    const { ctx } = this;
    const rows = this.craftRows(H);

    // Header above the stack — or where the bottom row would have been, when
    // nothing is affordable and there's no stack to sit on.
    const headerY = (rows.length > 0 ? rows[0].y : H - CRAFT_PANEL_BOTTOM) - 6;
    ctx.font = 'bold 10px "Courier New"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('⚒ CRAFTING', CRAFT_PANEL_X, headerY);

    // The panel only lists what you can pay for (see visibleRecipes), so on a
    // short window there can be more craftable than fits on screen.
    const hidden = this.visibleRecipes().length - rows.length;
    if (hidden > 0) {
      ctx.textAlign = 'right';
      ctx.font = '9px "Courier New"';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(`+${hidden} more`, CRAFT_PANEL_X + CRAFT_PANEL_W, headerY);
    }

    for (const { recipe, x, y, w, h } of rows) {
      const locationLocked = this.isLocationLocked(recipe);
      const affordable = canAfford(recipe, this.inventory) && !locationLocked;
      const isCrafting = this.craftingId === recipe.id;
      const busy = this.craftingId !== null;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this.pill(x, y, w, h, 6);
      ctx.fill();

      // Progress fills the row left-to-right while this recipe is crafting.
      if (isCrafting) {
        ctx.save();
        this.pill(x, y, w, h, 6);
        ctx.clip();
        ctx.fillStyle = 'rgba(241,196,15,0.35)';
        ctx.fillRect(x, y, w * clamp01(this.craftingProgress), h);
        ctx.restore();
      }

      ctx.strokeStyle = isCrafting
        ? '#f1c40f'
        : affordable && !busy
          ? 'rgba(46,204,113,0.7)'
          : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      this.pill(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 5);
      ctx.stroke();

      const dim = !affordable && !isCrafting;

      ctx.globalAlpha = dim ? 0.45 : 1;
      this.drawItemIcon(recipe.id, x + 20, y + h / 2, 26, recipe.icon);

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = 'bold 11px "Courier New"';
      ctx.fillStyle = dim ? '#999' : '#fff';
      ctx.fillText(recipe.name, x + 36, y + h / 2 - 6);

      // Ingredient list, red where the player is short.
      let cx = x + 36;
      ctx.font = '10px "Courier New"';
      for (const [item, need] of Object.entries(recipe.cost)) {
        const have = this.inventory[item] ?? 0;
        ctx.fillStyle = have >= need ? '#8ed99a' : '#e06b6b';
        const text = `${have}/${need} ${item}`;
        ctx.fillText(text, cx, y + h / 2 + 8);
        cx += ctx.measureText(text).width + 8;
      }

      ctx.textAlign = 'right';
      ctx.font = '9px "Courier New"';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(
        isCrafting ? `${Math.ceil(recipe.craftTime * (1 - this.craftingProgress))}s` : `${recipe.craftTime}s`,
        x + w - 8,
        y + h / 2,
      );

      // Padlock on bench/campfire recipes you're not standing near the
      // right structure for, so it's clear they're gated by location rather
      // than by materials.
      if (locationLocked) {
        ctx.font = '11px "Courier New"';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText('🔒', x + w - 8, y + h / 2 - 11);
      }

      ctx.globalAlpha = 1;
    }
  }

  /**
   * The book tile in the top-right corner: a rounded block of timber with the
   * book cut into its face, labelled underneath with its shortcut.
   */
  private drawBookTile(W: number): void {
    const { ctx } = this;
    const t = this.bookButtonRect(W);
    const hovered = this.pointerInside(t.x, t.y, t.w, t.h);

    woodTile(ctx, t.x, t.y, t.w, t.h, { radius: 6, seed: 23, hover: hovered, active: this.bookOpen });
    drawCarvedBook(ctx, t.x + t.w / 2, t.y + t.h / 2 - 2, t.w - 12);

    ctx.font = 'bold 9px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Press R', t.x + t.w / 2, t.y + t.h + 4);
  }

  /** True when a recipe needs a bench/campfire the player isn't standing by. */
  private isLocationLocked(recipe: Recipe): boolean {
    return (!!recipe.requiresBench && !this.nearBench) || (!!recipe.requiresCampfire && !this.nearFire);
  }

  /**
   * Draws a cost (a recipe's ingredients, or a trade offer's single `give`
   * item — see drawTradePanel) across the book entry as item icons with
   * `have/need` counts, coloured by whether the player is short. `y` is the
   * vertical centre of the strip. Icons are drawn at ICON_INGREDIENT rather
   * than squeezed to fit: item art is built from whole blocks, and much
   * smaller than this they stop resembling the same objects.
   */
  private drawCostStrip(cost: Record<string, number>, x: number, y: number): void {
    const { ctx } = this;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px "Courier New"';

    let cx = x;
    for (const [item, need] of Object.entries(cost)) {
      const have = this.inventory[item] ?? 0;
      this.drawItemIcon(item, cx + ICON_INGREDIENT / 2, y, ICON_INGREDIENT, '▪');
      cx += ICON_INGREDIENT + 2;

      const text = `${have}/${need}`;
      ctx.fillStyle = have >= need ? WOOD.have : WOOD.short;
      ctx.fillText(text, cx, y + 1);
      cx += ctx.measureText(text).width + 8;
    }
  }

  // ── Recipe book ────────────────────────────────────────────────────────────

  /** Opens/closes the full recipe catalogue. Opening it closes the bestiary/trading post — only one full-screen panel at a time. */
  toggleRecipeBook(): void {
    this.bookOpen = !this.bookOpen;
    if (this.bookOpen) {
      this.bestiaryOpen = false;
      this.tradeOpen = false;
    }
  }

  closeRecipeBook(): void {
    this.bookOpen = false;
  }

  isRecipeBookOpen(): boolean {
    return this.bookOpen;
  }

  /**
   * The book's outer panel plus its two-page spread and nav tabs, all in one
   * place so the renderer and the click hit-tests agree (same reasoning as
   * bestiaryLayout, whose leather chrome this mirrors). One category from
   * RECIPE_BOOK_CATEGORIES is shown per spread: its items are listed top-to-
   * bottom on the left page, then continuing onto the right — a recipe's
   * cost strip if it has one, a field note (see noteFor) if it doesn't.
   */
  private recipeBookLayout(W: number, H: number): {
    panel: Rect;
    close: Rect;
    prev: Rect;
    next: Rect;
    left: Rect;
    right: Rect;
    entries: (Rect & { itemId: string; recipe: Recipe | null })[];
  } {
    const panelW = Math.min(860, W - 80);
    const panelH = Math.min(600, H - 80);
    const px = Math.round((W - panelW) / 2);
    const py = Math.round((H - panelH) / 2);

    const pad = 22;
    const gutter = 14;
    const titleH = 26;
    const categoryH = 34;
    const navH = 30;
    const pageW = (panelW - pad * 2 - gutter) / 2;
    const pageH = panelH - pad * 2 - titleH - categoryH - navH;

    const left: Rect = { x: px + pad, y: py + pad + titleH + categoryH, w: pageW, h: pageH };
    const right: Rect = { x: left.x + pageW + gutter, y: left.y, w: pageW, h: pageH };
    const navY = py + panelH - pad - 22;

    const category = RECIPE_BOOK_CATEGORIES[this.recipeCategoryIndex];
    const leftCount = Math.ceil(category.items.length / 2);
    const rowGap = 6;
    const entryH = Math.max(
      46,
      Math.min(78, Math.floor((pageH - (leftCount - 1) * rowGap) / Math.max(1, leftCount))),
    );

    const entries = category.items.map((itemId, i) => {
      const inLeft = i < leftCount;
      const page = inLeft ? left : right;
      const row = inLeft ? i : i - leftCount;
      return {
        itemId,
        recipe: RECIPES_BY_ID[itemId] ?? null,
        x: page.x,
        y: page.y + row * (entryH + rowGap),
        w: page.w,
        h: entryH,
      };
    });

    return {
      panel: { x: px, y: py, w: panelW, h: panelH },
      close: { x: px + panelW - pad - 22, y: py + 10, w: 22, h: 22 },
      prev: { x: px + panelW / 2 - 66, y: navY, w: 34, h: 22 },
      next: { x: px + panelW / 2 + 32, y: navY, w: 34, h: 22 },
      left,
      right,
      entries,
    };
  }

  private drawRecipeBook(W: number, H: number): void {
    if (!this.bookOpen) return;
    const { ctx } = this;
    const { panel, close, prev, next, left, right, entries } = this.recipeBookLayout(W, H);
    const category = RECIPE_BOOK_CATEGORIES[this.recipeCategoryIndex];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    drawLeatherCover(ctx, panel.x, panel.y, panel.w, panel.h, { seed: 71 });

    // Outer title, plus the current category as a plaque underneath it — both
    // sit on the bare cover, so they use the leather's light stitch-thread
    // tones rather than the page tones the entries below read in.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px "Courier New"';
    ctx.fillStyle = LEATHER.stitchDark;
    ctx.fillText('RECIPE BOOK', panel.x + panel.w / 2, panel.y + 16);

    ctx.font = 'bold 17px "Courier New"';
    ctx.fillStyle = LEATHER.stitch;
    ctx.fillText(category.name.toUpperCase(), panel.x + panel.w / 2, panel.y + 38);

    ctx.font = 'italic 11px "Courier New"';
    ctx.fillStyle = LEATHER.stitchDark;
    ctx.fillText(category.tagline, panel.x + panel.w / 2, panel.y + 56);

    drawPageSheet(ctx, left.x, left.y, left.w, left.h, 3 + this.recipeCategoryIndex);
    drawPageSheet(ctx, right.x, right.y, right.w, right.h, 4 + this.recipeCategoryIndex);

    // Shadow pooling into both pages at the fold between them.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = LEATHER.spine;
    ctx.fillRect(left.x + left.w - 5, left.y, 5, left.h);
    ctx.fillRect(right.x, right.y, 5, right.h);
    ctx.globalAlpha = 1;

    for (const { itemId, recipe, x, y, w, h } of entries) {
      const affordable = !!recipe && canAfford(recipe, this.inventory);
      const locked = !!recipe && this.isLocationLocked(recipe);
      const craftable = !!recipe && affordable && !locked && this.craftingId === null;
      const isCrafting = !!recipe && this.craftingId === recipe.id;
      const hovered = this.pointerInside(x, y, w, h);

      // A faint card of shade under each entry so it reads as separate from
      // the page underneath it, brighter under the pointer.
      ctx.globalAlpha = hovered && recipe ? 0.22 : 0.1;
      ctx.fillStyle = LEATHER.pageShade;
      ctx.fillRect(x + 2, y + 1, w - 4, h - 3);
      ctx.globalAlpha = 1;

      // Progress fills the row left-to-right while this recipe is crafting.
      if (isCrafting) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 2, y + 1, w - 4, h - 3);
        ctx.clip();
        ctx.fillStyle = 'rgba(241,196,15,0.35)';
        ctx.fillRect(x, y, w * clamp01(this.craftingProgress), h);
        ctx.restore();
      }

      // A stitch-colored edge on entries you could craft right now, so the
      // book shows at a glance which of these are lit — same role the wooden
      // book's ember edge used to play.
      if (craftable || isCrafting) {
        ctx.strokeStyle = isCrafting ? '#f1c40f' : LEATHER.stitch;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 2.5, y + 1.5, w - 5, h - 4);
      }

      const iconSize = Math.min(ICON_RESULT, h - 14);
      const dim = !!recipe && !affordable && !isCrafting;
      ctx.globalAlpha = dim ? 0.5 : 1;
      this.drawItemIcon(itemId, x + 12 + iconSize / 2, y + h / 2, iconSize, recipe?.icon);
      ctx.globalAlpha = 1;

      const textX = x + 12 + iconSize + 14;
      const name = itemDisplayName(itemId);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px "Courier New"';
      ctx.fillStyle = recipe && !affordable ? LEATHER.inkDim : LEATHER.ink;
      ctx.fillText(name, textX, y + 16);

      if (recipe) {
        // Craft time trails the name, leaving the whole bottom line for the
        // ingredient icons.
        const nameW = ctx.measureText(name).width;
        ctx.font = '10px "Courier New"';
        ctx.fillStyle = LEATHER.inkDim;
        ctx.fillText(`${recipe.craftTime}s`, textX + nameW + 8, y + 17);

        this.drawCostStrip(recipe.cost, textX, y + h - 18);

        // Station requirement: the actual bench/campfire sprite plus a
        // label, rather than an emoji that renders in whatever the OS feels
        // like.
        const station = recipe.requiresBench
          ? { item: CRAFTING_BENCH_ID, label: 'BENCH' }
          : recipe.requiresCampfire
            ? { item: 'campfire', label: 'FIRE' }
            : null;
        if (station) {
          ctx.textAlign = 'right';
          ctx.font = 'bold 11px "Courier New"';
          ctx.fillStyle = locked ? WOOD.short : WOOD.have;
          ctx.fillText(station.label, x + w - 10, y + 16);
          const labelW = ctx.measureText(station.label).width;
          this.drawItemIcon(station.item, x + w - 10 - labelW - 6 - ICON_STATION / 2, y + 16, ICON_STATION);
        }
      } else {
        // No recipe — a field note on how it's actually obtained, instead of
        // a cost strip.
        ctx.font = 'italic 10px "Courier New"';
        ctx.fillStyle = LEATHER.inkDim;
        const noteW = w - (textX - x) - 10;
        let ny = y + h / 2 + 4;
        for (const line of wrapText(ctx, noteFor(itemId), noteW).slice(0, 2)) {
          ctx.fillText(line, textX, ny);
          ny += 12;
        }
      }
    }

    // Prev/next/close tabs, plus a page counter sitting in the gap between
    // prev and next — same layout as the bestiary's.
    const hoverClose = this.pointerInside(close.x, close.y, close.w, close.h);
    drawLeatherTab(ctx, close.x, close.y, close.w, close.h, { hover: hoverClose });
    ctx.font = 'bold 11px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hoverClose ? LEATHER.page : LEATHER.stitch;
    ctx.fillText('✕', close.x + close.w / 2, close.y + close.h / 2 + 1);

    const hoverPrev = this.pointerInside(prev.x, prev.y, prev.w, prev.h);
    drawLeatherTab(ctx, prev.x, prev.y, prev.w, prev.h, { hover: hoverPrev });
    ctx.fillStyle = hoverPrev ? LEATHER.page : LEATHER.stitch;
    ctx.fillText('‹', prev.x + prev.w / 2, prev.y + prev.h / 2 + 1);

    const hoverNext = this.pointerInside(next.x, next.y, next.w, next.h);
    drawLeatherTab(ctx, next.x, next.y, next.w, next.h, { hover: hoverNext });
    ctx.fillStyle = hoverNext ? LEATHER.page : LEATHER.stitch;
    ctx.fillText('›', next.x + next.w / 2, next.y + next.h / 2 + 1);

    ctx.font = '10px "Courier New"';
    ctx.fillStyle = LEATHER.stitch;
    ctx.fillText(
      `${this.recipeCategoryIndex + 1} / ${RECIPE_BOOK_CATEGORIES.length}`,
      panel.x + panel.w / 2,
      prev.y + prev.h / 2 + 1,
    );

    ctx.font = '9px "Courier New"';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(
      'click a lit recipe to craft it  ·  tabs flip category  ·  R or Esc to close',
      panel.x + panel.w / 2,
      panel.y + panel.h - 6,
    );
  }

  /**
   * Click handling for the book chrome: the corner button toggles it, the ✕
   * and any click off the panel close it, and the tabs flip between
   * categories. Returns true when the click was spent on chrome; clicks
   * *inside* the open book return false so they can still be tested against
   * recipe entries (see hitTestCraft).
   */
  handleRecipeBookClick(x: number, y: number): boolean {
    const button = this.bookButtonRect(this.canvas.width);
    if (rectHas(button, x, y)) {
      this.bookOpen = !this.bookOpen;
      return true;
    }
    if (!this.bookOpen) return false;

    const { panel, close, prev, next } = this.recipeBookLayout(this.canvas.width, this.canvas.height);
    if (rectHas(close, x, y) || !rectHas(panel, x, y)) {
      this.bookOpen = false;
      return true;
    }
    if (rectHas(prev, x, y)) {
      this.recipeCategoryIndex =
        (this.recipeCategoryIndex - 1 + RECIPE_BOOK_CATEGORIES.length) % RECIPE_BOOK_CATEGORIES.length;
      return true;
    }
    if (rectHas(next, x, y)) {
      this.recipeCategoryIndex = (this.recipeCategoryIndex + 1) % RECIPE_BOOK_CATEGORIES.length;
      return true;
    }
    return false;
  }

  /**
   * Called with a canvas click. Returns the recipe id to craft if the click
   * landed on a startable recipe — either a corner row or an entry in the
   * open book — or null to let the click fall through to the game. Entries
   * with no recipe (see recipeBookLayout) are never craftable, so a click on
   * one just falls out the bottom of the loop.
   */
  hitTestCraft(x: number, y: number): string | null {
    if (this.craftingId !== null) return null; // One craft at a time

    const targets: (Rect & { recipe: Recipe | null })[] = this.bookOpen
      ? this.recipeBookLayout(this.canvas.width, this.canvas.height).entries
      : this.craftRows(this.canvas.height);

    for (const target of targets) {
      if (!rectHas(target, x, y)) continue;
      if (!target.recipe) return null;
      if (this.isLocationLocked(target.recipe)) return null;
      return canAfford(target.recipe, this.inventory) ? target.recipe.id : null;
    }
    return null;
  }

  /**
   * True if the click landed on crafting UI (used to swallow it so it doesn't
   * also swing at whatever is behind the panel). While the book is open that
   * includes its dimmed backdrop — the whole screen belongs to the book.
   */
  isOverCrafting(x: number, y: number): boolean {
    if (this.bookOpen) return true;
    return (
      rectHas(this.bookButtonRect(this.canvas.width), x, y) ||
      this.craftRows(this.canvas.height).some((r) => rectHas(r, x, y))
    );
  }

  // ── Animal compendium ──────────────────────────────────────────────────────
  // A field-journal-styled book (leather cover, cream pages — see wood.ts's
  // LEATHER chrome) describing the game's fauna, one animal per page-spread.
  // Deliberately a different material from the recipe book's wooden panel, so
  // the two read as distinct objects rather than the same UI reskinned.

  /** Opens/closes the compendium. Opening it closes the recipe book/trading post — only one full-screen panel at a time. */
  toggleBestiary(): void {
    this.bestiaryOpen = !this.bestiaryOpen;
    if (this.bestiaryOpen) {
      this.bookOpen = false;
      this.tradeOpen = false;
    }
  }

  closeBestiary(): void {
    this.bestiaryOpen = false;
  }

  isBestiaryOpen(): boolean {
    return this.bestiaryOpen;
  }

  /** Screen rect of the compendium's button — just left of the recipe book tile, same size. */
  private bestiaryButtonRect(W: number): Rect {
    const book = this.bookButtonRect(W);
    return { x: book.x - 8 - BOOK_TILE, y: book.y, w: BOOK_TILE, h: BOOK_TILE };
  }

  /** The paw-stamped wooden tile that opens the compendium, styled to match drawBookTile. */
  private drawBestiaryTile(W: number): void {
    const { ctx } = this;
    const t = this.bestiaryButtonRect(W);
    const hovered = this.pointerInside(t.x, t.y, t.w, t.h);

    woodTile(ctx, t.x, t.y, t.w, t.h, { radius: 6, seed: 41, hover: hovered, active: this.bestiaryOpen });
    drawCarvedPaw(ctx, t.x + t.w / 2, t.y + t.h / 2 - 1, t.w - 14);

    ctx.font = 'bold 9px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Press B', t.x + t.w / 2, t.y + t.h + 4);
  }

  /** Screen rect of the trading post's button — just left of the compendium tile, same size. */
  private tradeButtonRect(W: number): Rect {
    const bestiary = this.bestiaryButtonRect(W);
    return { x: bestiary.x - 8 - BOOK_TILE, y: bestiary.y, w: BOOK_TILE, h: BOOK_TILE };
  }

  /** The market-stand-stamped wooden tile that opens the trading post, styled to match drawBookTile/drawBestiaryTile. */
  private drawTradeTile(W: number): void {
    const { ctx } = this;
    const t = this.tradeButtonRect(W);
    const hovered = this.pointerInside(t.x, t.y, t.w, t.h);

    woodTile(ctx, t.x, t.y, t.w, t.h, { radius: 6, seed: 59, hover: hovered, active: this.tradeOpen });
    drawCarvedStand(ctx, t.x + t.w / 2, t.y + t.h / 2 - 1, t.w - 14);

    ctx.font = 'bold 9px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Press V', t.x + t.w / 2, t.y + t.h + 4);
  }

  /**
   * The book's outer panel plus its two-page spread and nav tabs, all in one
   * place so the renderer and the click hit-test agree (same reasoning as
   * bookLayout). One entry from ANIMALS is shown per spread: a portrait page
   * on the left, its write-up on the right.
   */
  private bestiaryLayout(W: number, H: number): {
    panel: Rect;
    close: Rect;
    prev: Rect;
    next: Rect;
    left: Rect;
    right: Rect;
  } {
    const panelW = Math.min(820, W - 80);
    const panelH = Math.min(560, H - 80);
    const px = Math.round((W - panelW) / 2);
    const py = Math.round((H - panelH) / 2);

    const pad = 22;
    const gutter = 14;
    const titleH = 26;
    const navH = 30;
    const pageW = (panelW - pad * 2 - gutter) / 2;
    const pageH = panelH - pad * 2 - titleH - navH;

    const left: Rect = { x: px + pad, y: py + pad + titleH, w: pageW, h: pageH };
    const right: Rect = { x: left.x + pageW + gutter, y: left.y, w: pageW, h: pageH };
    const navY = py + panelH - pad - 22;

    return {
      panel: { x: px, y: py, w: panelW, h: panelH },
      close: { x: px + panelW - pad - 22, y: py + 10, w: 22, h: 22 },
      prev: { x: px + panelW / 2 - 66, y: navY, w: 34, h: 22 },
      next: { x: px + panelW / 2 + 32, y: navY, w: 34, h: 22 },
      left,
      right,
    };
  }

  private drawBestiary(W: number, H: number): void {
    if (!this.bestiaryOpen) return;
    const { ctx } = this;
    const { panel, close, prev, next, left, right } = this.bestiaryLayout(W, H);
    const entry = ANIMALS[this.bestiaryPage];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    drawLeatherCover(ctx, panel.x, panel.y, panel.w, panel.h, { seed: 11 });

    ctx.font = 'bold 15px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = LEATHER.stitch;
    ctx.fillText('ANIMAL COMPENDIUM', panel.x + panel.w / 2, panel.y + 24);

    drawPageSheet(ctx, left.x, left.y, left.w, left.h, 3);
    drawPageSheet(ctx, right.x, right.y, right.w, right.h, 4);

    // Shadow pooling into both pages at the fold between them.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = LEATHER.spine;
    ctx.fillRect(left.x + left.w - 5, left.y, 5, left.h);
    ctx.fillRect(right.x, right.y, 5, right.h);
    ctx.globalAlpha = 1;

    // Left page: portrait, name, tagline, and a hand-ruled underline.
    const portraitCY = left.y + left.h * 0.36;
    this.drawAnimalPortrait(entry.id, left.x + left.w / 2, portraitCY, Math.min(left.w, left.h) * 0.5);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 19px "Courier New"';
    ctx.fillStyle = LEATHER.ink;
    const nameY = left.y + left.h * 0.68;
    ctx.fillText(entry.name.toUpperCase(), left.x + left.w / 2, nameY);

    ctx.font = 'italic 12px "Courier New"';
    ctx.fillStyle = LEATHER.inkDim;
    ctx.fillText(entry.tagline, left.x + left.w / 2, nameY + 20);

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = LEATHER.inkDim;
    ctx.fillRect(left.x + left.w * 0.2, nameY + 30, left.w * 0.6, 1);
    ctx.globalAlpha = 1;

    // Right page: the write-up, word-wrapped to the page width, plus a
    // rarity strip under the fish entry's text (see drawFishRarityStrip).
    // Clipped to the page rect as a backstop — the panel's sized to fit
    // every entry's text (checked when writing it), but a clip means a
    // future edit that runs long bleeds off the bottom of its own page
    // rather than into the nav strip below it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(right.x, right.y, right.w, right.h);
    ctx.clip();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '12px "Courier New"';
    const textPad = 16;
    let ty = right.y + 22;
    for (const para of entry.paragraphs) {
      for (const line of wrapText(ctx, para, right.w - textPad * 2)) {
        ctx.fillStyle = LEATHER.ink;
        ctx.fillText(line, right.x + textPad, ty);
        ty += 16;
      }
      ty += 9;
    }
    if (entry.id === 'fish') this.drawFishRarityStrip(right.x + textPad, ty, right.w - textPad * 2);
    ctx.restore();

    // Prev/next/close tabs, plus a page counter sitting in the gap between
    // prev and next.
    const hoverClose = this.pointerInside(close.x, close.y, close.w, close.h);
    drawLeatherTab(ctx, close.x, close.y, close.w, close.h, { hover: hoverClose });
    ctx.font = 'bold 11px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hoverClose ? LEATHER.page : LEATHER.stitch;
    ctx.fillText('✕', close.x + close.w / 2, close.y + close.h / 2 + 1);

    const hoverPrev = this.pointerInside(prev.x, prev.y, prev.w, prev.h);
    drawLeatherTab(ctx, prev.x, prev.y, prev.w, prev.h, { hover: hoverPrev });
    ctx.fillStyle = hoverPrev ? LEATHER.page : LEATHER.stitch;
    ctx.fillText('‹', prev.x + prev.w / 2, prev.y + prev.h / 2 + 1);

    const hoverNext = this.pointerInside(next.x, next.y, next.w, next.h);
    drawLeatherTab(ctx, next.x, next.y, next.w, next.h, { hover: hoverNext });
    ctx.fillStyle = hoverNext ? LEATHER.page : LEATHER.stitch;
    ctx.fillText('›', next.x + next.w / 2, next.y + next.h / 2 + 1);

    ctx.font = '10px "Courier New"';
    ctx.fillStyle = LEATHER.stitch;
    ctx.fillText(`${this.bestiaryPage + 1} / ${ANIMALS.length}`, panel.x + panel.w / 2, prev.y + prev.h / 2 + 1);

    ctx.font = '9px "Courier New"';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('click the tabs to flip pages  ·  B or Esc to close', panel.x + panel.w / 2, panel.y + panel.h - 6);
  }

  /**
   * Draws one animal's portrait centred on (cx, cy), roughly `size` px
   * across — dispatched by id onto the matching in-world sprite (see
   * Renderer's *Portrait exports), reused rather than redrawn so the
   * compendium shows the same art the creature actually appears as in play.
   */
  private drawAnimalPortrait(id: string, cx: number, cy: number, size: number): void {
    const { ctx } = this;
    const px = Math.round(cx);
    const py = Math.round(cy);

    if (id === 'fox') {
      const block = Math.max(1, size / (FOX_PORTRAIT_HALF_BLOCKS * 2));
      ctx.save();
      ctx.translate(px, py);
      drawFoxPortrait(ctx, block);
      ctx.restore();
      return;
    }

    if (id === 'spider') {
      const block = Math.max(1, size / (SPIDER_PORTRAIT_HALF_BLOCKS * 2));
      ctx.save();
      ctx.translate(px, py);
      drawSpiderPortrait(ctx, block);
      ctx.restore();
      return;
    }

    if (id === 'beetle') {
      const block = Math.max(1, size / (BEETLE_PORTRAIT_HALF_BLOCKS * 2));
      ctx.save();
      ctx.translate(px, py);
      drawBeetlePortrait(ctx, block);
      ctx.restore();
      return;
    }

    if (id === 'firefly') {
      // A patch of night behind the glow: on the page's cream background the
      // additive glow (see drawFireflyShape) needs something dark to shine
      // against, the way it does over the real dark forest at night.
      const inset = Math.round(size * 0.85);
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(px - inset / 2, py - inset / 2, inset, inset);

      // Scaled up from its actual in-world size — a single firefly is a tiny
      // point of light by design, which would read as an empty page — but
      // clipped to the inset patch so the additive glow can't wash out onto
      // the cream page around it.
      const block = inset / (FIREFLY_PORTRAIT_HALF_BLOCKS * 2);
      const blink = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.cos((performance.now() / 900) * Math.PI * 2), 1.4);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px - inset / 2, py - inset / 2, inset, inset);
      ctx.clip();
      ctx.translate(px, py);
      ctx.globalCompositeOperation = 'lighter';
      // drawFireflyShape paints in whatever fillStyle is already set (see
      // Renderer's own drawFireflies, which sets this once before its loop)
      // rather than picking a color itself — same glow-yellow it uses in-world.
      ctx.fillStyle = '#e8ff7a';
      drawFireflyShape(ctx, blink, block);
      ctx.restore();
      return;
    }

    if (id === 'fish') {
      const species = FISH_SPECIES_BY_ID['fish_silverfin'];
      if (!species) return;
      const block = Math.max(1, size / (FISH_ICON_HALF_BLOCKS * 2));
      ctx.save();
      ctx.translate(px, py);
      drawFishIcon(ctx, species.color, block);
      ctx.restore();
    }
  }

  /**
   * A row of small fish icons spanning the game's catch-rarity tiers, for
   * the fish page — the compendium's one entry that stands for a whole
   * family of species (see pickRandomFish) rather than a single creature.
   */
  private drawFishRarityStrip(x: number, y: number, w: number): void {
    const { ctx } = this;
    const ids = ['fish_silverfin', 'fish_bluegill', 'fish_koi', 'fish_golden_carp'];
    const species = ids.map((id) => FISH_SPECIES_BY_ID[id]).filter((s): s is NonNullable<typeof s> => !!s);
    if (species.length === 0) return;

    const cell = w / species.length;
    const iconSize = Math.min(26, cell - 10);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    species.forEach((fish, i) => {
      const cx = Math.round(x + cell * i + cell / 2);
      const cy = Math.round(y + iconSize / 2);
      const block = Math.max(1, iconSize / (FISH_ICON_HALF_BLOCKS * 2));
      ctx.save();
      ctx.translate(cx, cy);
      drawFishIcon(ctx, fish.color, block);
      ctx.restore();

      ctx.font = 'bold 9px "Courier New"';
      ctx.fillStyle = LEATHER.ink;
      ctx.fillText(fish.name, cx, y + iconSize + 4);
      ctx.font = '8px "Courier New"';
      ctx.fillStyle = LEATHER.inkDim;
      ctx.fillText(fish.rarity, cx, y + iconSize + 15);
    });
  }

  /**
   * Click handling for the compendium's chrome: the corner button toggles
   * it, the tabs flip pages or close it, and — since there's no interactive
   * content behind the pages themselves (unlike the recipe book's clickable
   * entries) — any other click while it's open is simply swallowed rather
   * than tested against anything further.
   */
  handleBestiaryClick(x: number, y: number): boolean {
    const button = this.bestiaryButtonRect(this.canvas.width);
    if (rectHas(button, x, y)) {
      this.toggleBestiary();
      return true;
    }
    if (!this.bestiaryOpen) return false;

    const { panel, close, prev, next } = this.bestiaryLayout(this.canvas.width, this.canvas.height);
    if (rectHas(close, x, y) || !rectHas(panel, x, y)) {
      this.bestiaryOpen = false;
      return true;
    }
    if (rectHas(prev, x, y)) {
      this.bestiaryPage = (this.bestiaryPage - 1 + ANIMALS.length) % ANIMALS.length;
      return true;
    }
    if (rectHas(next, x, y)) {
      this.bestiaryPage = (this.bestiaryPage + 1) % ANIMALS.length;
      return true;
    }
    return true;
  }

  // ── Trading post ─────────────────────────────────────────────────────────
  // A one-way vendor: sell berries or wheat for wood/stone/gold/diamond (see
  // shared TRADE_OFFERS). Wooden-plank chrome (woodPanel/woodSlot — the same
  // material the corner buttons are built from) rather than the recipe
  // book's leather-and-parchment look, so it reads as a functional shop GUI
  // sitting over the game rather than another book to page through. Every
  // offer fits on one fixed spread (berries on the left, wheat on the
  // right), so the only navigation is the quantity stepper (tradeQty),
  // which scales every offer's give/get before it's shown or sent (see
  // qtyInput/adjustTradeQty).

  closeTrade(): void {
    this.tradeOpen = false;
  }

  isTradeOpen(): boolean {
    return this.tradeOpen;
  }

  /** Opens/closes the trading post. Opening it closes the recipe book/bestiary — only one full-screen panel at a time. */
  toggleTrade(): void {
    this.tradeOpen = !this.tradeOpen;
    if (this.tradeOpen) {
      this.bookOpen = false;
      this.bestiaryOpen = false;
      this.qtyInput.value = String(this.tradeQty);
    }
  }

  /** The quantity a trade-row click currently executes — see the panel's stepper. */
  getTradeQuantity(): number {
    return this.tradeQty;
  }

  /** Nudges the quantity stepper by `delta`, clamped to [1, MAX_TRADE_QUANTITY] — see qtyMinus/qtyPlus below. */
  private adjustTradeQty(delta: number): void {
    this.tradeQty = Math.max(1, Math.min(MAX_TRADE_QUANTITY, this.tradeQty + delta));
    this.qtyInput.value = String(this.tradeQty);
  }

  /**
   * The panel plus its fixed two-column spread and quantity stepper — one
   * place so the renderer and the click hit-tests agree (same reasoning as
   * recipeBookLayout). Berries fill the left page top-to-bottom, wheat the
   * right, in the same wood/stone/gold/diamond order both use (see
   * TRADE_OFFERS).
   */
  private tradeLayout(W: number, H: number): {
    panel: Rect;
    close: Rect;
    qtyMinus: Rect;
    qtyBox: Rect;
    qtyPlus: Rect;
    left: Rect;
    right: Rect;
    entries: (Rect & { offer: TradeOffer })[];
  } {
    const panelW = Math.min(820, W - 80);
    const panelH = Math.min(540, H - 80);
    const px = Math.round((W - panelW) / 2);
    const py = Math.round((H - panelH) / 2);

    const pad = 22;
    const gutter = 14;
    const titleH = 42;
    const qtyRowH = 34;
    const columnHeaderH = 20;
    const pageW = (panelW - pad * 2 - gutter) / 2;
    const pageH = panelH - pad * 2 - titleH - qtyRowH - columnHeaderH;

    const left: Rect = { x: px + pad, y: py + pad + titleH + qtyRowH + columnHeaderH, w: pageW, h: pageH };
    const right: Rect = { x: left.x + pageW + gutter, y: left.y, w: pageW, h: pageH };

    const berryOffers = TRADE_OFFERS.filter((o) => o.give.type === 'berry');
    const wheatOffers = TRADE_OFFERS.filter((o) => o.give.type === 'wheat');
    const rowGap = 10;
    const rowH = Math.max(50, Math.min(90, (pageH - (berryOffers.length - 1) * rowGap) / berryOffers.length));

    const entries: (Rect & { offer: TradeOffer })[] = [
      ...berryOffers.map((offer, i) => ({ offer, x: left.x, y: left.y + i * (rowH + rowGap), w: left.w, h: rowH })),
      ...wheatOffers.map((offer, i) => ({ offer, x: right.x, y: right.y + i * (rowH + rowGap), w: right.w, h: rowH })),
    ];

    const qtyBtnW = 26;
    const qtyBtnH = 26;
    const qtyBoxW = 56;
    const qtyY = py + pad + titleH + (qtyRowH - qtyBtnH) / 2;
    const qtyCenterX = px + panelW / 2;

    return {
      panel: { x: px, y: py, w: panelW, h: panelH },
      close: { x: px + panelW - pad - 22, y: py + 10, w: 22, h: 22 },
      qtyMinus: { x: qtyCenterX - qtyBoxW / 2 - 6 - qtyBtnW, y: qtyY, w: qtyBtnW, h: qtyBtnH },
      qtyBox: { x: qtyCenterX - qtyBoxW / 2, y: qtyY, w: qtyBoxW, h: qtyBtnH },
      qtyPlus: { x: qtyCenterX + qtyBoxW / 2 + 6, y: qtyY, w: qtyBtnW, h: qtyBtnH },
      left,
      right,
      entries,
    };
  }

  /** A small square wooden button with a centered glyph — the quantity stepper's −/+ and the panel's own close button. */
  private drawWoodButton(r: Rect, label: string, hover: boolean): void {
    const { ctx } = this;
    ctx.fillStyle = WOOD.edge;
    ctx.fill(pixelRoundRect(r.x, r.y, r.w, r.h, 4));
    ctx.fillStyle = hover ? WOOD.ember : WOOD.frame;
    ctx.fill(pixelRoundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3));
    ctx.font = 'bold 13px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = WOOD.ink;
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }

  private drawTradePanel(W: number, H: number): void {
    // Keeps the real <input> glued to the stepper's box every frame this is
    // open — the panel can move (window resize), and canvas pixel
    // coordinates map 1:1 onto fixed-position CSS pixels the same way
    // ChatBox's own composer does. Hidden the instant the panel isn't.
    this.qtyInput.style.display = this.tradeOpen ? 'block' : 'none';
    if (!this.tradeOpen) return;
    const { ctx } = this;
    const { panel, close, qtyMinus, qtyBox, qtyPlus, left, right, entries } = this.tradeLayout(W, H);

    this.qtyInput.style.left = `${Math.round(qtyBox.x)}px`;
    this.qtyInput.style.top = `${Math.round(qtyBox.y)}px`;
    this.qtyInput.style.width = `${Math.round(qtyBox.w)}px`;
    this.qtyInput.style.height = `${Math.round(qtyBox.h)}px`;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    woodPanel(ctx, panel.x, panel.y, panel.w, panel.h, { plankH: 14, border: 4, seed: 53, nails: true });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px "Courier New"';
    ctx.fillStyle = WOOD.ink;
    ctx.fillText('TRADING POST', panel.x + panel.w / 2, panel.y + 20);

    ctx.font = 'italic 11px "Courier New"';
    ctx.fillStyle = WOOD.inkDim;
    ctx.fillText('Sell what you grow for what you’d otherwise have to mine', panel.x + panel.w / 2, panel.y + 38);

    // Quantity stepper, centered under the title — the real <input> (see
    // above) sits visually between these two buttons.
    this.drawWoodButton(qtyMinus, '−', this.pointerInside(qtyMinus.x, qtyMinus.y, qtyMinus.w, qtyMinus.h));
    this.drawWoodButton(qtyPlus, '+', this.pointerInside(qtyPlus.x, qtyPlus.y, qtyPlus.w, qtyPlus.h));
    ctx.font = '9px "Courier New"';
    ctx.fillStyle = WOOD.inkMuted;
    ctx.textAlign = 'center';
    ctx.fillText('QTY PER TRADE', qtyBox.x + qtyBox.w / 2, qtyBox.y - 7);

    ctx.textAlign = 'left';
    ctx.font = 'bold 11px "Courier New"';
    ctx.fillStyle = WOOD.ink;
    ctx.fillText('BERRIES', left.x + 2, left.y - 8);
    ctx.fillText('WHEAT', right.x + 2, right.y - 8);

    for (const { offer, x, y, w, h } of entries) {
      const affordable = canAffordTrade(offer, this.inventory, this.tradeQty);
      const hovered = this.pointerInside(x, y, w, h);

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      this.pill(x, y, w, h, 6);
      ctx.fill();

      if (hovered) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#ffffff';
        this.pill(x, y, w, h, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // A green edge on offers you can afford at the current quantity —
      // same "lit" convention the crafting panel's affordable rows use.
      ctx.strokeStyle = affordable ? 'rgba(46,204,113,0.7)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      this.pill(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 5);
      ctx.stroke();

      const slotSize = Math.min(ICON_RESULT, h - 14) + 8;
      woodSlot(ctx, x + 8, y + h / 2 - slotSize / 2, slotSize, slotSize);
      ctx.globalAlpha = affordable ? 1 : 0.5;
      this.drawItemIcon(offer.get.type, x + 8 + slotSize / 2, y + h / 2, slotSize - 8);
      ctx.globalAlpha = 1;

      const textX = x + 8 + slotSize + 12;
      const name = `${offer.get.amount * this.tradeQty} ${itemDisplayName(offer.get.type)}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px "Courier New"';
      ctx.fillStyle = affordable ? WOOD.ink : WOOD.inkDim;
      ctx.fillText(name, textX, y + 16);

      this.drawCostStrip({ [offer.give.type]: offer.give.amount * this.tradeQty }, textX, y + h - 18);
    }

    this.drawWoodButton(close, '✕', this.pointerInside(close.x, close.y, close.w, close.h));

    ctx.font = '9px "Courier New"';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.fillText('click a lit offer to trade  ·  V or Esc to close', panel.x + panel.w / 2, panel.y + panel.h - 6);
  }

  /**
   * Called with a canvas click. Returns the offer id to execute if the
   * click landed on a row affordable at the current quantity in the open
   * panel, or null to let the click fall through to the game.
   */
  hitTestTrade(x: number, y: number): string | null {
    if (!this.tradeOpen) return null;
    for (const { offer, x: ex, y: ey, w, h } of this.tradeLayout(this.canvas.width, this.canvas.height).entries) {
      if (!rectHas({ x: ex, y: ey, w, h }, x, y)) continue;
      return canAffordTrade(offer, this.inventory, this.tradeQty) ? offer.id : null;
    }
    return null;
  }

  /**
   * Click handling for the trading post's chrome: the corner button toggles
   * it, the quantity stepper's −/+ adjust tradeQty, and the ✕ or
   * any click off the panel closes it. Clicks *inside* the open panel
   * return false so they can still be tested against offer rows (see
   * hitTestTrade).
   */
  handleTradeClick(x: number, y: number): boolean {
    const button = this.tradeButtonRect(this.canvas.width);
    if (rectHas(button, x, y)) {
      this.toggleTrade();
      return true;
    }
    if (!this.tradeOpen) return false;

    const { panel, close, qtyMinus, qtyPlus } = this.tradeLayout(this.canvas.width, this.canvas.height);
    if (rectHas(close, x, y) || !rectHas(panel, x, y)) {
      this.tradeOpen = false;
      return true;
    }
    if (rectHas(qtyMinus, x, y)) {
      this.adjustTradeQty(-1);
      return true;
    }
    if (rectHas(qtyPlus, x, y)) {
      this.adjustTradeQty(1);
      return true;
    }
    return false;
  }

  /** True if the click landed on trading-post UI (used to swallow it so it doesn't also swing at whatever is behind the panel). */
  isOverTrade(x: number, y: number): boolean {
    if (this.tradeOpen) return true;
    return rectHas(this.tradeButtonRect(this.canvas.width), x, y);
  }

  // ── Chat log ───────────────────────────────────────────────────────────────

  /** Adds a message to the side log. `isMe` picks out your own lines. */
  pushChat(name: string, text: string, isMe: boolean): void {
    this.chatLog.push({ name, text, isMe, born: Date.now() });
    if (this.chatLog.length > CHAT_LOG_MAX) this.chatLog.shift();
  }

  /**
   * The global log, under the leaderboard on the right. Each message is
   * wrapped to the panel width and drawn as `name: text`, oldest at the top,
   * with the panel sized to whatever is currently showing — it takes up no
   * room at all when nobody has said anything.
   */
  private drawChatLog(W: number): void {
    const now = Date.now();
    this.chatLog = this.chatLog.filter((m) => now - m.born < CHAT_ENTRY_TTL);
    if (this.chatLog.length === 0) return;

    const { ctx } = this;
    const x = W - CHAT_LOG_W - 12;
    const y = CHAT_LOG_TOP;
    const pad = 8;

    // Wrap first, so the panel can be sized to the wrapped height.
    ctx.font = '11px "Courier New"';
    const wrapped = this.chatLog.map((m) => ({
      entry: m,
      lines: wrapText(ctx, `${m.name}: ${m.text}`, CHAT_LOG_W - pad * 2),
    }));
    const totalLines = wrapped.reduce((n, w) => n + w.lines.length, 0);
    const panelH = pad * 2 + totalLines * CHAT_LINE_H;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    this.pill(x, y, CHAT_LOG_W, panelH, 6);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let lineY = y + pad + CHAT_LINE_H / 2;
    for (const { entry, lines } of wrapped) {
      const age = now - entry.born;
      ctx.globalAlpha =
        age > CHAT_ENTRY_TTL - CHAT_FADE ? Math.max(0, (CHAT_ENTRY_TTL - age) / CHAT_FADE) : 1;

      lines.forEach((line, i) => {
        // The sender's name is coloured only on the first line, where it
        // actually appears; continuation lines are all message text.
        if (i === 0) {
          const label = `${entry.name}:`;
          ctx.fillStyle = entry.isMe ? '#56c9ff' : '#ffd479';
          ctx.fillText(label, x + pad, lineY);
          ctx.fillStyle = '#e8e8e8';
          ctx.fillText(line.slice(label.length), x + pad + ctx.measureText(label).width, lineY);
        } else {
          ctx.fillStyle = '#e8e8e8';
          ctx.fillText(line, x + pad, lineY);
        }
        lineY += CHAT_LINE_H;
      });

      ctx.globalAlpha = 1;
    }
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────

  private drawLeaderboard(state: GameState, me: PlayerState | undefined, W: number): void {
    const top10 = [...state.players]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const { ctx } = this;
    const panelW = 180;
    const lineH = 22;
    const px = W - panelW - 12;
    const py = 12;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.pill(px, py, panelW, 30 + top10.length * lineH, 6);
    ctx.fill();

    ctx.font = 'bold 11px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#aaa';
    ctx.fillText('⚔ LEADERBOARD', px + panelW / 2, py + 14);

    top10.forEach((p, i) => {
      const isMe = p.id === me?.id;
      ctx.font = `${isMe ? 'bold' : ''} 11px "Courier New"`;
      ctx.fillStyle = isMe ? '#56c9ff' : '#ccc';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${p.name}`, px + 10, py + 36 + i * lineH);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.score}`, px + panelW - 10, py + 36 + i * lineH);
    });
  }

  // ── Clock ──────────────────────────────────────────────────────────────────

  private drawClock(state: GameState, W: number, H: number): void {
    const { ctx } = this;
    const panelW = 96;
    const panelH = 30;
    const px = W - panelW - 12;
    const py = H - panelH - 12;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.pill(px, py, panelW, panelH, 6);
    ctx.fill();

    ctx.font = 'bold 13px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = state.isDay ? '#f1c40f' : '#a29bfe';
    ctx.fillText(formatGameTime(state.dayTime), px + panelW / 2, py + panelH / 2 + 1);
  }

  // ── Minimap ────────────────────────────────────────────────────────────────

  /**
   * Hands the minimap the lakes for this world (sent once on join). Everything
   * else about the terrain — the dark forest's wandering border, where grass
   * gives way to dirt — is a pure function of world coordinates, so this is
   * the only piece the map can't work out for itself.
   */
  setLakes(lakes: LakeState[]): void {
    this.lakes = lakes;
    this.terrain = null; // rebuilt on the next frame at map resolution
  }

  /** Same deal as setLakes, for the sea's three islands. */
  setIslands(islands: IslandState[]): void {
    this.islands = islands;
    this.terrain = null;
  }

  /**
   * Paints the whole world's terrain into an offscreen canvas once, at one
   * cell per MINIMAP_CELL screen pixels: grass and its shaded approach to the
   * tree line, the dark forest's dirt floor, and each lake's water and sand.
   * Chunky cells rather than per-pixel, so the map reads as pixel art like
   * everything else, and cached because none of it ever changes — only the
   * dots drawn over it do.
   */
  private buildTerrain(size: number): HTMLCanvasElement {
    const cells = Math.ceil(size / MINIMAP_CELL);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    // Each lake's coastline harmonics, so the map's shoreline is the same
    // irregular outline the world draws rather than a plain circle.
    const lakes = this.lakes.map((lake) => ({ lake, harmonics: lakeHarmonics(lake.seed) }));
    const islands = this.islands.map((island) => ({ island, harmonics: lakeHarmonics(island.seed) }));

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const wx = ((cx + 0.5) / cells) * MAP_SIZE;
        const wy = ((cy + 0.5) / cells) * MAP_SIZE;
        // 0..1 per cell, stable across rebuilds — picks tone variation.
        const noise = hashCell(cx, cy, 7) / 4294967295;

        g.fillStyle = terrainColor(wx, wy, noise, lakes, islands);
        g.fillRect(cx * MINIMAP_CELL, cy * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
      }
    }

    return canvas;
  }

  private drawMinimap(state: GameState, me: PlayerState | undefined, W: number, H: number): void {
    void W;
    void H;
    const size = MINIMAP_SIZE;
    const pad = 12;
    const mx = pad;
    const my = pad;
    const { ctx } = this;

    if (!this.terrain) this.terrain = this.buildTerrain(size);

    // Terrain, clipped to the panel's rounded corners.
    ctx.save();
    this.pill(mx, my, size, size, 6);
    ctx.clip();
    ctx.drawImage(this.terrain, mx, my);
    // Everything on the map is drawn in daylight tones; a wash over the whole
    // thing at night keeps it from glowing next to the darkened world.
    if (!state.isDay) {
      ctx.fillStyle = 'rgba(10,14,40,0.42)';
      ctx.fillRect(mx, my, size, size);
    }
    ctx.restore();

    // Map border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    this.pill(mx, my, size, size, 6);
    ctx.stroke();

    const toMapX = (wx: number): number => mx + (wx / MAP_SIZE) * size;
    const toMapY = (wy: number): number => my + (wy / MAP_SIZE) * size;

    // Resources (only the ones near you are sent, so this reads as "what's
    // around me" layered over the world map rather than a full survey). Kept
    // to single faint pixels — at map scale a whole forest's worth of dots
    // otherwise merges into a smudge that reads as terrain.
    ctx.fillStyle = 'rgba(16,40,16,0.45)';
    for (const r of state.resources) {
      ctx.fillRect(Math.round(toMapX(r.x)), Math.round(toMapY(r.y)), 1, 1);
    }

    // Campfires and benches you can see, in ember orange.
    ctx.fillStyle = '#ff9b2f';
    for (const s of state.structures) {
      ctx.fillRect(Math.round(toMapX(s.x)) - 1, Math.round(toMapY(s.y)) - 1, 3, 3);
    }

    // Other players
    for (const p of state.players) {
      if (p.isMe) continue;
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(toMapX(p.x), toMapY(p.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Self
    if (me) {
      ctx.fillStyle = '#56c9ff';
      ctx.beginPath();
      ctx.arc(toMapX(me.x), toMapY(me.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Points at the /camera full-map view (see main.ts's KeyM handler) —
    // this minimap only ever shows what's nearby, so it's the natural spot
    // to mention the key that opens the whole map instead.
    ctx.font = 'bold 9px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Press M for map', mx + size / 2, my + size + 6);
  }

  // ── Floating notifications ─────────────────────────────────────────────────

  private drawNotifications(_me: PlayerState | undefined, W: number, H: number): void {
    const { ctx } = this;
    const now = Date.now();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this.notifications.slice().reverse().forEach((n, i) => {
      const age = (now - n.born) / n.ttl;
      const alpha = age < 0.8 ? 1 : 1 - (age - 0.8) / 0.2;
      const floatY = H / 2 - 80 - i * 26 - age * 20;

      ctx.globalAlpha = alpha;
      ctx.font = 'bold 14px "Courier New"';
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, W / 2, floatY);
    });

    ctx.globalAlpha = 1;
  }

  /**
   * Persistent reminder while `state.spectating` is set (see GameState) —
   * without it there's nothing on screen to say the camera, stat bars and
   * hotbar all belong to someone else right now.
   */
  private drawSpectateBanner(me: PlayerState | undefined, W: number): void {
    const { ctx } = this;
    const text = `👁 Spectating ${me?.name ?? '…'} — Esc or /unspectate to stop`;

    ctx.font = 'bold 13px "Courier New"';
    const padX = 14;
    const textW = ctx.measureText(text).width;
    const boxW = textW + padX * 2;
    const boxH = 26;
    const x = (W - boxW) / 2;
    const y = 10;

    ctx.fillStyle = 'rgba(20,20,20,0.75)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = '#56c9ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#56c9ff';
    ctx.fillText(text, W / 2, y + boxH / 2 + 1);
  }

  // ── Util ───────────────────────────────────────────────────────────────────

  /**
   * Draws an item's icon centred on (cx, cy) at roughly `size` px across.
   * Items that have real in-world art use that sprite, so the HUD shows the
   * same pixel campfire the player sees on the ground; anything else falls
   * back to an emoji glyph.
   */
  private drawItemIcon(item: string, cx: number, cy: number, size: number, fallback?: string): void {
    const { ctx } = this;

    // Items with real in-world art draw that sprite. Snap to a whole-pixel
    // block size, and offset odd sizes by half a pixel so every block edge
    // lands on an integer — otherwise the icon picks up anti-aliased edges
    // and stops reading as pixel art.
    const drawSprite = (halfBlocks: number, draw: (block: number) => void): void => {
      const block = Math.max(2, Math.round(size / (halfBlocks * 2)));
      const half = block % 2 ? 0.5 : 0;
      ctx.save();
      ctx.translate(Math.round(cx) + half, Math.round(cy) + half);
      draw(block);
      ctx.restore();
    };

    if (item === 'campfire') {
      drawSprite(CAMPFIRE_SPRITE_HALF_BLOCKS, (block) => drawCampfireSprite(ctx, performance.now(), block));
      return;
    }

    if (item === CRAFTING_BENCH_ID) {
      drawSprite(BENCH_SPRITE_HALF_BLOCKS, (block) => drawCraftingBenchSprite(ctx, block));
      return;
    }

    if (item === WALL_ID) {
      drawSprite(WALL_SPRITE_HALF_BLOCKS, (block) => drawWallSprite(ctx, block));
      return;
    }

    if (item === 'wood') {
      drawSprite(WOOD_ICON_HALF_BLOCKS, (block) => drawWoodIcon(ctx, block));
      return;
    }

    if (item === 'stone') {
      drawSprite(STONE_ICON_HALF_BLOCKS, (block) => drawStoneIcon(ctx, block));
      return;
    }

    if (item === 'gold') {
      drawSprite(GOLD_ICON_HALF_BLOCKS, (block) => drawGoldIcon(ctx, block));
      return;
    }

    if (item === 'diamond') {
      drawSprite(DIAMOND_ICON_HALF_BLOCKS, (block) => drawDiamondIcon(ctx, block));
      return;
    }

    if (item === 'wheat') {
      drawSprite(WHEAT_ICON_HALF_BLOCKS, (block) => drawWheatIcon(ctx, block));
      return;
    }

    if (item === 'string') {
      drawSprite(STRING_ICON_HALF_BLOCKS, (block) => drawStringIcon(ctx, block));
      return;
    }

    if (item === RAW_MEAT_ID) {
      drawSprite(MEAT_ICON_HALF_BLOCKS, (block) => drawMeatIcon(ctx, block));
      return;
    }

    if (item === COOKED_MEAT_ID) {
      drawSprite(MEAT_ICON_HALF_BLOCKS, (block) => drawCookedMeatIcon(ctx, block));
      return;
    }

    if (item === LEATHER_ID) {
      drawSprite(LEATHER_ICON_HALF_BLOCKS, (block) => drawLeatherIcon(ctx, block));
      return;
    }

    if (item === BREAD_ID) {
      drawSprite(BREAD_ICON_HALF_BLOCKS, (block) => drawBreadIcon(ctx, block));
      return;
    }

    if (item === BERRY_SEED_ID) {
      drawSprite(SEED_ICON_HALF_BLOCKS, (block) => drawBerrySeedIcon(ctx, block));
      return;
    }

    if (item === WHEAT_SEED_ID) {
      drawSprite(SEED_ICON_HALF_BLOCKS, (block) => drawWheatSeedIcon(ctx, block));
      return;
    }

    if (TOOL_ITEM_IDS.has(item)) {
      drawSprite(toolIconHalfBlocks(item), (block) => drawToolIcon(ctx, item, block));
      return;
    }

    if (TORCH_ITEM_IDS.has(item)) {
      drawSprite(TORCH_ICON_HALF_BLOCKS, (block) => drawTorchIcon(ctx, block));
      return;
    }

    if (ARMOR_ITEM_IDS.has(item)) {
      drawSprite(ARMOR_ICON_HALF_BLOCKS, (block) => drawArmorIcon(ctx, item, block));
      return;
    }

    const fishSpecies = FISH_SPECIES_BY_ID[item];
    if (fishSpecies) {
      drawSprite(FISH_ICON_HALF_BLOCKS, (block) => drawFishIcon(ctx, fishSpecies.color, block));
      return;
    }

    if (item === BACKPACK_ID) {
      ctx.save();
      ctx.translate(Math.round(cx), Math.round(cy));
      drawBackpackIcon(ctx, size);
      ctx.restore();
      return;
    }

    // Sprite-based rather than cell-based (see drawBerryIcon/etc. in
    // Renderer.ts) — takes a raw pixel size, so it doesn't go through the
    // drawSprite(halfBlocks, ...) wrapper above like the cell-drawn icons do.
    const resourceIcon = RESOURCE_SPRITE_ICONS[item];
    if (resourceIcon) {
      ctx.save();
      ctx.translate(Math.round(cx), Math.round(cy));
      resourceIcon(ctx, size);
      ctx.restore();
      return;
    }

    ctx.font = `${Math.round(size * 0.9)}px "Courier New"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(fallback ?? '▪', cx, cy);
  }

  private pill(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

// The two food types' hotbar icons, each reusing the real in-world sprite
// (see drawItemIcon above and Renderer.ts's drawBerryIcon/etc.) rather than
// a unified "food" icon or an emoji placeholder.
const RESOURCE_SPRITE_ICONS: Record<string, (ctx: CanvasRenderingContext2D, size: number) => void> = {
  berry: drawBerryIcon,
  mushroom: drawMushroomIcon,
};

const TOOL_ITEM_IDS = new Set([
  WOODEN_AXE_ID,
  WOODEN_PICKAXE_ID,
  WOODEN_SWORD_ID,
  STONE_AXE_ID,
  STONE_PICKAXE_ID,
  STONE_SWORD_ID,
  GOLD_AXE_ID,
  GOLD_PICKAXE_ID,
  GOLD_SWORD_ID,
  FISHING_ROD_ID,
  WOODEN_HOE_ID,
  WATERING_CAN_ID,
]);

/** dayTime: 0 = noon, 0.5 = midnight, wraps 0..1 → a 12-hour clock string. */
function formatGameTime(dayTime: number): string {
  const totalMinutes = (((dayTime * 24 + 12) % 24) * 60) % 1440;
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = Math.floor(totalMinutes % 60);
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}
