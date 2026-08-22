import {
  PlayerState,
  GameState,
  MAP_SIZE,
  MAX_HUNGER,
  RECIPES,
  Recipe,
  canAfford,
  CRAFTING_BENCH_ID,
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
  FISHING_ROD_ID,
  FISH_SPECIES_BY_ID,
  FOOD_ITEMS,
  RAW_MEAT_ID,
  COOKED_MEAT_ID,
  LakeState,
  DARK_FOREST_TRANSITION,
  darkForestBandAt,
  hashCell,
} from '@io-game/shared';
import {
  drawCampfireSprite,
  CAMPFIRE_SPRITE_HALF_BLOCKS,
  drawCraftingBenchSprite,
  BENCH_SPRITE_HALF_BLOCKS,
  drawToolIcon,
  toolIconHalfBlocks,
  drawWoodIcon,
  WOOD_ICON_HALF_BLOCKS,
  drawStoneIcon,
  STONE_ICON_HALF_BLOCKS,
  drawGoldIcon,
  GOLD_ICON_HALF_BLOCKS,
  drawWheatIcon,
  WHEAT_ICON_HALF_BLOCKS,
  drawStringIcon,
  STRING_ICON_HALF_BLOCKS,
  drawMeatIcon,
  drawCookedMeatIcon,
  MEAT_ICON_HALF_BLOCKS,
  drawFishIcon,
  FISH_ICON_HALF_BLOCKS,
  drawBerryIcon,
  drawMushroomIcon,
  drawPurpleBerryIcon,
  MAP_COLORS,
  lakeHarmonics,
  lobeRadius,
  LakeHarmonic,
} from '../Renderer';
import { WOOD, woodPanel, woodDivider, woodSlot, woodTile, drawCarvedBook } from './wood';

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
// Clears the leaderboard panel above it (12 top margin + 30 header + 5 rows).
const CHAT_LOG_TOP = 164;

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
    // Sand ring, dithering out into the grass over its last stretch.
    const fromWater = d - coast;
    if (fromWater <= lake.shoreWidth) return pick(MAP_COLORS.sand, noise < 0.5 ? 1 : 2);
    if (fromWater <= lake.shoreWidth * 1.5 && noise < 0.45) return pick(MAP_COLORS.sand, 0);
  }

  const band = darkForestBandAt(wx);
  if (wy < band) return pick(MAP_COLORS.forest, noise < 0.4 ? 0 : noise < 0.8 ? 1 : 2);

  // The seam: dirt speckled into grass just below the border, thinning out
  // with distance from it.
  const belowBand = wy - band;
  if (belowBand < DARK_FOREST_TRANSITION && noise > belowBand / DARK_FOREST_TRANSITION) {
    return pick(MAP_COLORS.forest, 1);
  }
  // Grass in the forest's shadow, thinning out over a much longer approach.
  if (belowBand < FOREST_SHADE_REACH && noise > belowBand / FOREST_SHADE_REACH) {
    return pick(MAP_COLORS.grassShade, noise < 0.6 ? 0 : 1);
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

// Recipe book panel.
const BOOK_PAD = 18;
const BOOK_GAP = 10;
const BOOK_TITLE_H = 40;

function rectHas(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class HUD {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
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
  private terrain: HTMLCanvasElement | null = null;

  // Whether the full recipe catalogue is open over the game.
  private bookOpen = false;
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
   * Selects a hotbar slot by index (0-based) — unless it holds food, which
   * can't be held/equipped at all: it's eaten immediately instead, and the
   * current selection is left untouched. Returns the item id to eat, or
   * null if this was a normal selection (or the slot doesn't exist yet).
   */
  selectSlot(index: number): string | null {
    if (index < 0 || index >= this.hotbarOrder.length) return null;
    const item = this.hotbarOrder[index];
    if (FOOD_ITEMS.has(item)) return item;
    this.selectedIndex = index;
    return null;
  }

  /** Cycles the selected slot by +1/-1, wrapping around — skips food slots, which can't be held (see selectSlot). */
  scrollSlot(direction: number): void {
    const n = this.hotbarOrder.length;
    if (n === 0) return;
    const step = Math.sign(direction);
    let next = this.selectedIndex;
    for (let i = 0; i < n; i++) {
      next = ((next + step) % n + n) % n;
      if (!FOOD_ITEMS.has(this.hotbarOrder[next])) {
        this.selectedIndex = next;
        return;
      }
    }
    // Every slot is food — nothing else to cycle to.
  }

  /**
   * Starts dragging a hotbar slot to reorder it (also selects it) — unless
   * it holds food, same exception as selectSlot: eaten immediately instead,
   * no drag started, current selection untouched. Returns the item id to
   * eat, or null otherwise.
   */
  beginHotbarDrag(index: number): string | null {
    if (index < 0 || index >= this.hotbarOrder.length) return null;
    const item = this.hotbarOrder[index];
    if (FOOD_ITEMS.has(item)) return item;
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
   * — or if selectedIndex happens to be sitting on food, which is never
   * actually "held" (see selectSlot). That's a defensive filter here rather
   * than something selectSlot/scrollSlot/etc. all have to guarantee never
   * happens on their own.
   */
  getSelectedItem(): string | null {
    const item = this.hotbarOrder[this.selectedIndex] ?? null;
    return item && FOOD_ITEMS.has(item) ? null : item;
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

    this.drawStatBars(me, W, H);
    this.drawHotbar();
    this.drawCrafting(H);
    this.drawBookTile(W);
    this.drawLeaderboard(state, me, W);
    this.drawChatLog(W);
    this.drawDayNight(state, W);
    this.drawClock(state, W, H);
    this.drawMinimap(state, me, W, H);
    this.drawNotifications(me, W, H);
    this.drawControls(W, H);
    // Last, so its dimmed backdrop sits over the rest of the HUD.
    this.drawRecipeBook(W, H);

    // Prune expired notifications
    const now = Date.now();
    this.notifications = this.notifications.filter((n) => now - n.born < n.ttl);
  }

  // ── Stat bars ──────────────────────────────────────────────────────────────

  private drawStatBars(me: PlayerState | undefined, W: number, H: number): void {
    if (!me) return;
    const bars = [
      { label: '♥ HP', value: me.health, max: 100, fill: '#2ecc71', low: '#e74c3c', threshold: 30 },
      { label: '🍖 Food', value: me.hunger, max: MAX_HUNGER, fill: '#f39c12', low: '#e74c3c', threshold: 30 },
      { label: '❄ Temp', value: me.temperature, max: 100, fill: '#56c9ff', low: '#8e44ad', threshold: 25 },
    ];

    const bW = 150;
    const bH = 18;
    const gap = 12;
    const totalW = bars.length * bW + (bars.length - 1) * gap;
    let x = (W - totalW) / 2;
    const y = H - 52;

    for (const bar of bars) {
      const pct = Math.max(0, Math.min(1, bar.value / bar.max));
      const color = bar.value < bar.threshold ? bar.low : bar.fill;

      // Shadow panel
      this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
      this.pill(x - 1, y - 1, bW + 2, bH + 2, 6);
      this.ctx.fill();

      // Empty track
      this.ctx.fillStyle = 'rgba(30,30,30,0.7)';
      this.pill(x, y, bW, bH, 5);
      this.ctx.fill();

      // Fill
      if (pct > 0.01) {
        this.ctx.fillStyle = color;
        this.pill(x, y, bW * pct, bH, 5);
        this.ctx.fill();
      }

      // Label
      this.ctx.font = 'bold 10px "Courier New"';
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
    const y = this.canvas.height - 128;
    return this.hotbarOrder.map(() => {
      const rect = { x, y, w: slotSize, h: slotSize };
      x += slotSize + gap;
      return rect;
    });
  }

  private drawHotbar(): void {
    const slots = this.hotbarOrder;
    if (slots.length === 0) return;

    const { ctx } = this;
    const rects = this.hotbarSlotRects();

    slots.forEach((item, i) => {
      const { x, y, w: slotSize } = rects[i];
      // Food is never "held" (see selectSlot) — even if selectedIndex
      // transiently points at one (e.g. the first item ever collected
      // happened to be a berry), it shouldn't render as selected.
      const isSelected = i === this.selectedIndex && !FOOD_ITEMS.has(item);
      const isDragging = i === this.draggingIndex;
      const count = this.inventory[item] ?? 0;

      ctx.fillStyle = isDragging ? 'rgba(255,255,255,0.4)' : isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.45)';
      this.pill(x, y, slotSize, slotSize, 7);
      ctx.fill();

      if (isSelected || isDragging) {
        ctx.strokeStyle = isDragging ? '#ffffff' : '#f1c40f';
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
   * book cut into its face, and the shortcut key stamped in the bottom corner.
   */
  private drawBookTile(W: number): void {
    const { ctx } = this;
    const t = this.bookButtonRect(W);
    const hovered = this.pointerInside(t.x, t.y, t.w, t.h);

    woodTile(ctx, t.x, t.y, t.w, t.h, { radius: 6, seed: 23, hover: hovered, active: this.bookOpen });
    drawCarvedBook(ctx, t.x + t.w / 2, t.y + t.h / 2 - 2, t.w - 12);

    ctx.font = 'bold 8px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hovered || this.bookOpen ? WOOD.ink : WOOD.inkDim;
    ctx.fillText('R', t.x + t.w / 2, t.y + t.h - 7);
  }

  /** True when a recipe needs a bench/campfire the player isn't standing by. */
  private isLocationLocked(recipe: Recipe): boolean {
    return (!!recipe.requiresBench && !this.nearBench) || (!!recipe.requiresCampfire && !this.nearFire);
  }

  /**
   * Draws a recipe's ingredients across the book entry as item icons with
   * `have/need` counts, coloured by whether the player is short. `y` is the
   * vertical centre of the strip. Icons are drawn at ICON_INGREDIENT rather
   * than squeezed to fit: item art is built from whole blocks, and much
   * smaller than this they stop resembling the same objects.
   */
  private drawCostStrip(recipe: Recipe, x: number, y: number): void {
    const { ctx } = this;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px "Courier New"';

    let cx = x;
    for (const [item, need] of Object.entries(recipe.cost)) {
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

  /** Opens/closes the full recipe catalogue. */
  toggleRecipeBook(): void {
    this.bookOpen = !this.bookOpen;
  }

  closeRecipeBook(): void {
    this.bookOpen = false;
  }

  isRecipeBookOpen(): boolean {
    return this.bookOpen;
  }

  /**
   * The book's outer panel plus the derived grid metrics, all in one place so
   * the renderer and the hit-tests agree. Two columns normally, three on a
   * wide window; entry height shrinks to fit a short one.
   */
  private bookLayout(W: number, H: number): {
    panel: Rect;
    close: Rect;
    entries: (Rect & { recipe: Recipe })[];
  } {
    const cols = W >= 1180 ? 3 : 2;
    const entryW = Math.min(320, Math.floor((W - BOOK_PAD * 2 - 40 - (cols - 1) * BOOK_GAP) / cols));
    const gridRows = Math.ceil(RECIPES.length / cols);
    const panelW = BOOK_PAD * 2 + cols * entryW + (cols - 1) * BOOK_GAP;

    const maxGridH = H - 40 - BOOK_TITLE_H - BOOK_PAD * 2;
    const entryH = Math.max(
      52,
      Math.min(68, Math.floor((maxGridH - (gridRows - 1) * BOOK_GAP) / gridRows)),
    );
    const panelH = BOOK_TITLE_H + BOOK_PAD * 2 + gridRows * entryH + (gridRows - 1) * BOOK_GAP;

    const px = Math.round((W - panelW) / 2);
    const py = Math.round((H - panelH) / 2);

    const gridX = px + BOOK_PAD;
    const gridY = py + BOOK_TITLE_H + BOOK_PAD;

    return {
      panel: { x: px, y: py, w: panelW, h: panelH },
      close: { x: px + panelW - BOOK_PAD - 22, y: py + Math.round((BOOK_TITLE_H - 22) / 2), w: 22, h: 22 },
      entries: RECIPES.map((recipe, i) => ({
        recipe,
        x: gridX + (i % cols) * (entryW + BOOK_GAP),
        y: gridY + Math.floor(i / cols) * (entryH + BOOK_GAP),
        w: entryW,
        h: entryH,
      })),
    };
  }

  private drawRecipeBook(W: number, H: number): void {
    if (!this.bookOpen) return;
    const { ctx } = this;
    const { panel, close, entries } = this.bookLayout(W, H);

    // Dim the world behind the book so the boards read as the front layer.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);

    woodPanel(ctx, panel.x, panel.y, panel.w, panel.h, { plankH: 16, border: 4, seed: 5, nails: true });

    // Title on a dark recessed plaque — parchment lettering on bare boards is
    // brown-on-brown and reads as barely there.
    const plaqueH = BOOK_TITLE_H - 16;
    const plaqueY = panel.y + 8;
    woodSlot(ctx, panel.x + BOOK_PAD, plaqueY, panel.w - BOOK_PAD * 2 - 30, plaqueH);

    const titleY = plaqueY + plaqueH / 2 + 1;
    ctx.font = 'bold 14px "Courier New"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = WOOD.ink;
    ctx.fillText('RECIPE BOOK', panel.x + BOOK_PAD + 10, titleY);

    woodDivider(ctx, panel.x + BOOK_PAD, panel.y + BOOK_TITLE_H - 4, panel.w - BOOK_PAD * 2);

    const hoverClose = this.pointerInside(close.x, close.y, close.w, close.h);
    woodTile(ctx, close.x, close.y, close.w, close.h, { radius: 4, plankH: 8, seed: 31, hover: hoverClose });
    ctx.font = 'bold 11px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillStyle = hoverClose ? WOOD.ember : WOOD.ink;
    ctx.fillText('✕', close.x + close.w / 2, close.y + close.h / 2 + 1);

    for (const { recipe, x, y, w, h } of entries) {
      const affordable = canAfford(recipe, this.inventory);
      const locked = this.isLocationLocked(recipe);
      const craftable = affordable && !locked && this.craftingId === null;
      const hovered = this.pointerInside(x, y, w, h);

      // Each entry is a dark recess cut into the boards. Item sprites are
      // browns and greys, so on bare timber they all but disappear — against
      // near-black they read cleanly, and so does the lettering.
      woodSlot(ctx, x, y, w, h);

      // Craftable entries get a warm face and an ember edge, so the book
      // shows at a glance which of these you could start right now.
      if (craftable) {
        ctx.globalAlpha = hovered ? 0.2 : 0.1;
        ctx.fillStyle = WOOD.ember;
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.globalAlpha = hovered ? 0.9 : 0.5;
        ctx.fillStyle = WOOD.ember;
        ctx.fillRect(x + 1, y + 1, w - 2, 1);
        ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
        ctx.fillRect(x + 1, y + 1, 1, h - 2);
        ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
        ctx.globalAlpha = 1;
      }

      // Result icon at exactly the hotbar's size, so an item looks the same
      // here as it does in the slot you'll find it in afterwards.
      this.drawItemIcon(recipe.id, x + 10 + ICON_RESULT / 2, y + h / 2, ICON_RESULT, recipe.icon);

      const textX = x + ICON_RESULT + 22;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px "Courier New"';
      ctx.fillStyle = affordable ? WOOD.ink : WOOD.inkDim;
      ctx.fillText(recipe.name, textX, y + 17);

      // Craft time trails the name, leaving the whole bottom line for the
      // ingredient icons.
      const nameW = ctx.measureText(recipe.name).width;
      ctx.font = '10px "Courier New"';
      ctx.fillStyle = WOOD.inkDim;
      ctx.fillText(`${recipe.craftTime}s`, textX + nameW + 8, y + 18);

      this.drawCostStrip(recipe, textX, y + h - 20);

      // Station requirement: the actual bench/campfire sprite plus a label,
      // rather than an emoji that renders in whatever the OS feels like.
      const station = recipe.requiresBench
        ? { item: CRAFTING_BENCH_ID, label: 'BENCH' }
        : recipe.requiresCampfire
          ? { item: 'campfire', label: 'FIRE' }
          : null;
      if (station) {
        ctx.textAlign = 'right';
        ctx.font = 'bold 12px "Courier New"';
        ctx.fillStyle = locked ? WOOD.short : WOOD.have;
        ctx.fillText(station.label, x + w - 10, y + 17);
        const labelW = ctx.measureText(station.label).width;
        this.drawItemIcon(
          station.item,
          x + w - 10 - labelW - 6 - ICON_STATION / 2,
          y + 17,
          ICON_STATION,
        );
      }
    }

    ctx.font = '9px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillStyle = WOOD.inkDim;
    ctx.fillText(
      'click a lit recipe to craft it  ·  R or Esc to close',
      panel.x + panel.w / 2,
      panel.y + panel.h - BOOK_PAD / 2 - 2,
    );
  }

  /**
   * Click handling for the book chrome: the corner button toggles it, the ✕
   * and any click off the panel close it. Returns true when the click was
   * spent on chrome; clicks *inside* the open book return false so they can
   * still be tested against recipe entries (see hitTestCraft).
   */
  handleRecipeBookClick(x: number, y: number): boolean {
    const button = this.bookButtonRect(this.canvas.width);
    if (rectHas(button, x, y)) {
      this.bookOpen = !this.bookOpen;
      return true;
    }
    if (!this.bookOpen) return false;

    const { panel, close } = this.bookLayout(this.canvas.width, this.canvas.height);
    if (rectHas(close, x, y) || !rectHas(panel, x, y)) {
      this.bookOpen = false;
      return true;
    }
    return false;
  }

  /**
   * Called with a canvas click. Returns the recipe id to craft if the click
   * landed on a startable recipe — either a corner row or an entry in the
   * open book — or null to let the click fall through to the game.
   */
  hitTestCraft(x: number, y: number): string | null {
    if (this.craftingId !== null) return null; // One craft at a time

    const targets: (Rect & { recipe: Recipe })[] = this.bookOpen
      ? this.bookLayout(this.canvas.width, this.canvas.height).entries
      : this.craftRows(this.canvas.height);

    for (const target of targets) {
      if (!rectHas(target, x, y)) continue;
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
    const top5 = [...state.players]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const { ctx } = this;
    const panelW = 180;
    const lineH = 22;
    const px = W - panelW - 12;
    const py = 12;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.pill(px, py, panelW, 30 + top5.length * lineH, 6);
    ctx.fill();

    ctx.font = 'bold 11px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#aaa';
    ctx.fillText('⚔ LEADERBOARD', px + panelW / 2, py + 14);

    top5.forEach((p, i) => {
      const isMe = p.id === me?.id;
      ctx.font = `${isMe ? 'bold' : ''} 11px "Courier New"`;
      ctx.fillStyle = isMe ? '#56c9ff' : '#ccc';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${p.name}`, px + 10, py + 36 + i * lineH);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.score}`, px + panelW - 10, py + 36 + i * lineH);
    });
  }

  // ── Day/Night indicator ────────────────────────────────────────────────────

  private drawDayNight(state: GameState, W: number): void {
    const { ctx } = this;
    const isDay = state.isDay;
    const label = isDay ? '☀ Day' : '🌙 Night';

    ctx.font = 'bold 13px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isDay ? '#f1c40f' : '#a29bfe';
    ctx.fillText(label, W / 2, 20);
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
    ctx.fillText(`🕐 ${formatGameTime(state.dayTime)}`, px + panelW / 2, py + panelH / 2 + 1);
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

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const wx = ((cx + 0.5) / cells) * MAP_SIZE;
        const wy = ((cy + 0.5) / cells) * MAP_SIZE;
        // 0..1 per cell, stable across rebuilds — picks tone variation.
        const noise = hashCell(cx, cy, 7) / 4294967295;

        g.fillStyle = terrainColor(wx, wy, noise, lakes);
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

  // ── Controls hint ──────────────────────────────────────────────────────────

  private drawControls(W: number, H: number): void {
    const { ctx } = this;
    ctx.font = '10px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText(
      'WASD: Move  |  E / Click: Harvest  |  1-9 / Click Food: Eat  |  Scroll / Drag: Hotbar  |  Right-click / F: Place / Cast  |  R: Recipes  |  Enter / T: Chat',
      W / 2,
      H - 8,
    );
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

    if (TOOL_ITEM_IDS.has(item)) {
      drawSprite(toolIconHalfBlocks(item), (block) => drawToolIcon(ctx, item, block));
      return;
    }

    const fishSpecies = FISH_SPECIES_BY_ID[item];
    if (fishSpecies) {
      drawSprite(FISH_ICON_HALF_BLOCKS, (block) => drawFishIcon(ctx, fishSpecies.color, block));
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

// The three food types' hotbar icons, each reusing the real in-world sprite
// (see drawItemIcon above and Renderer.ts's drawBerryIcon/etc.) rather than
// a unified "food" icon or an emoji placeholder.
const RESOURCE_SPRITE_ICONS: Record<string, (ctx: CanvasRenderingContext2D, size: number) => void> = {
  berry: drawBerryIcon,
  mushroom: drawMushroomIcon,
  purple_berry: drawPurpleBerryIcon,
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
