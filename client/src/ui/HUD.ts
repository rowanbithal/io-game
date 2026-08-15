import {
  PlayerState,
  GameState,
  MAP_SIZE,
  RECIPES,
  canAfford,
  CRAFTING_BENCH_ID,
  BENCH_USE_RADIUS,
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
  drawFishIcon,
  FISH_ICON_HALF_BLOCKS,
} from '../Renderer';

interface Notification {
  text: string;
  color: string;
  born: number;
  ttl: number; // ms
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

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'position:fixed;top:0;left:0;pointer-events:none;z-index:20;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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

  /** Selects a hotbar slot by index (0-based). No-op if that slot doesn't exist yet. */
  selectSlot(index: number): void {
    if (index >= 0 && index < this.hotbarOrder.length) this.selectedIndex = index;
  }

  /** Cycles the selected slot by +1/-1, wrapping around. */
  scrollSlot(direction: number): void {
    const n = this.hotbarOrder.length;
    if (n === 0) return;
    this.selectedIndex = ((this.selectedIndex + Math.sign(direction)) % n + n) % n;
  }

  /** Starts dragging a hotbar slot to reorder it — also selects it. */
  beginHotbarDrag(index: number): void {
    if (index < 0 || index >= this.hotbarOrder.length) return;
    this.draggingIndex = index;
    this.selectedIndex = index;
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

  /** The item type currently held, or null if nothing has been collected yet. */
  getSelectedItem(): string | null {
    return this.hotbarOrder[this.selectedIndex] ?? null;
  }

  getItemCount(item: string): number {
    return this.inventory[item] ?? 0;
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

    this.drawStatBars(me, W, H);
    this.drawHotbar();
    this.drawCrafting(H);
    this.drawLeaderboard(state, me, W);
    this.drawDayNight(state, W);
    this.drawClock(state, W, H);
    this.drawMinimap(state, me, W, H);
    this.drawNotifications(me, W, H);
    this.drawControls(W, H);

    // Prune expired notifications
    const now = Date.now();
    this.notifications = this.notifications.filter((n) => now - n.born < n.ttl);
  }

  // ── Stat bars ──────────────────────────────────────────────────────────────

  private drawStatBars(me: PlayerState | undefined, W: number, H: number): void {
    if (!me) return;
    const bars = [
      { label: '♥ HP', value: me.health, fill: '#2ecc71', low: '#e74c3c', threshold: 30 },
      { label: '🍖 Food', value: me.hunger, fill: '#f39c12', low: '#e74c3c', threshold: 20 },
      { label: '❄ Temp', value: me.temperature, fill: '#56c9ff', low: '#8e44ad', threshold: 25 },
    ];

    const bW = 150;
    const bH = 18;
    const gap = 12;
    const totalW = bars.length * bW + (bars.length - 1) * gap;
    let x = (W - totalW) / 2;
    const y = H - 52;

    for (const bar of bars) {
      const pct = Math.max(0, Math.min(1, bar.value / 100));
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
      const isSelected = i === this.selectedIndex;
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
   * Screen rect of each recipe row, bottom-left of the screen. Shared by the
   * renderer and the click hit-test so they can never drift apart.
   */
  private craftRows(H: number): { recipe: (typeof RECIPES)[number]; x: number; y: number; w: number; h: number }[] {
    const rowH = 38;
    const rowW = 172;
    const x = 12;
    const bottom = H - 72;
    return RECIPES.map((recipe, i) => ({
      recipe,
      x,
      y: bottom - (RECIPES.length - i) * (rowH + 4),
      w: rowW,
      h: rowH,
    }));
  }

  private drawCrafting(H: number): void {
    const { ctx } = this;
    const rows = this.craftRows(H);
    if (rows.length === 0) return;

    const header = rows[0];
    ctx.font = 'bold 10px "Courier New"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('⚒ CRAFTING', header.x, header.y - 6);

    for (const { recipe, x, y, w, h } of rows) {
      const benchLocked = !!recipe.requiresBench && !this.nearBench;
      const affordable = canAfford(recipe, this.inventory) && !benchLocked;
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
        ctx.fillRect(x, y, w * Math.max(0, Math.min(1, this.craftingProgress)), h);
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

      // Padlock on bench recipes you're not standing near a bench for, so
      // it's clear they're gated by location rather than by materials.
      if (benchLocked) {
        ctx.font = '11px "Courier New"';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText('🔒', x + w - 8, y + h / 2 - 11);
      }

      ctx.globalAlpha = 1;
    }
  }

  /**
   * Called with a canvas click. Returns the recipe id to craft if the click
   * landed on an available recipe row, or null to let the click fall through
   * to the game (harvesting).
   */
  hitTestCraft(x: number, y: number): string | null {
    if (this.craftingId !== null) return null; // One craft at a time

    for (const row of this.craftRows(this.canvas.height)) {
      const inside = x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h;
      if (!inside) continue;
      if (row.recipe.requiresBench && !this.nearBench) return null;
      return canAfford(row.recipe, this.inventory) ? row.recipe.id : null;
    }
    return null;
  }

  /** True if the click landed anywhere on the crafting panel (used to swallow it). */
  isOverCrafting(x: number, y: number): boolean {
    return this.craftRows(this.canvas.height).some(
      (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
    );
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

  private drawMinimap(state: GameState, me: PlayerState | undefined, W: number, H: number): void {
    const size = 120;
    const pad = 12;
    const mx = pad;
    const my = pad;
    const { ctx } = this;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.pill(mx, my, size, size, 6);
    ctx.fill();

    // Map border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    this.pill(mx, my, size, size, 6);
    ctx.stroke();

    // Resources (green dots)
    ctx.fillStyle = 'rgba(80,200,80,0.4)';
    for (const r of state.resources) {
      const rx = mx + (r.x / MAP_SIZE) * size;
      const ry = my + (r.y / MAP_SIZE) * size;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Other players
    for (const p of state.players) {
      if (p.isMe) continue;
      const px2 = mx + (p.x / MAP_SIZE) * size;
      const py2 = my + (p.y / MAP_SIZE) * size;
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(px2, py2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Self
    if (me) {
      const px2 = mx + (me.x / MAP_SIZE) * size;
      const py2 = my + (me.y / MAP_SIZE) * size;
      ctx.fillStyle = '#56c9ff';
      ctx.beginPath();
      ctx.arc(px2, py2, 3.5, 0, Math.PI * 2);
      ctx.fill();
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

  // ── Controls hint ──────────────────────────────────────────────────────────

  private drawControls(W: number, H: number): void {
    const { ctx } = this;
    ctx.font = '10px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText(
      'WASD: Move  |  E / Click: Harvest  |  1-9 / Scroll / Click / Drag: Hotbar  |  Right-click / F: Place / Cast  |  Survive the night!',
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

    if (TOOL_ITEM_IDS.has(item)) {
      drawSprite(toolIconHalfBlocks(item), (block) => drawToolIcon(ctx, item, block));
      return;
    }

    const fishSpecies = FISH_SPECIES_BY_ID[item];
    if (fishSpecies) {
      drawSprite(FISH_ICON_HALF_BLOCKS, (block) => drawFishIcon(ctx, fishSpecies.color, block));
      return;
    }

    ctx.font = `${Math.round(size * 0.9)}px "Courier New"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(ITEM_ICONS[item] ?? fallback ?? '▪', cx, cy);
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

// Emoji fallbacks only — wood/stone/wheat/string, all seven tools (incl. the
// fishing rod), campfire, and the crafting bench all have real pixel-art
// icons (see drawItemIcon) and never reach this table. It only still
// matters for food/berry, which currently never appear in inventory
// (auto-consumed for hunger on pickup) but are kept here in case that ever
// changes.
const ITEM_ICONS: Record<string, string> = {
  food: '🍖',
  berry: '🫐',
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
