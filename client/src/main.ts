import { TICK_RATE, DAY_DURATION, seaCoastAt, isInDesert, forestFactor, DiedPayload, RECIPES_BY_ID, FISHING_ROD_ID, WOODEN_HOE_ID, WATERING_CAN_ID, BERRY_SEED_ID, WHEAT_SEED_ID, PreviewState, ResourceState } from '@io-game/shared';
import { Network } from './Network';
import { Input } from './Input';
import { Camera } from './Camera';
import { Renderer } from './Renderer';
import { StateManager } from './StateManager';
import { HUD } from './ui/HUD';
import { ChatBox } from './ui/ChatBox';
import { LookPicker } from './ui/LookPicker';
import { DeathCinematic, DEATH_CINEMATIC_MS } from './fx/DeathCinematic';
import { autoTune, toggleQuality } from './fx/quality';
import { sound } from './fx/Sound';

const INPUT_INTERVAL_MS = 1000 / TICK_RATE;

class ClientGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly network: Network;
  private readonly input: Input;
  private readonly camera: Camera;
  // /camera's full-map inset gets its own Camera (framed via Camera.frameMap
  // — see Renderer.renderCameraOverview) so it can show a completely
  // different zoom/pan than the normal follow-camera it's drawn on top of.
  private readonly overviewCamera = new Camera();
  private readonly renderer: Renderer;
  private readonly state: StateManager;
  // The menu-screen backdrop's own snapshot stream — kept separate from
  // `state` above rather than reusing it, since the two never overlap (see
  // LOBBY_ROOM) but carry different shapes (PreviewState vs GameState).
  private readonly previewState = new StateManager<PreviewState>();
  private previewLakesSet = false;
  private readonly hud: HUD;
  private readonly chat: ChatBox;

  private mapSize = 4000;
  private lastInputSend = 0;
  private running = false;
  private hotbarDragActive = false;
  // The /camera overview's full-map resource list arrives only on the tick
  // it's refreshed (see GameState.cameraResources) — everything in between,
  // this holds the last one actually received so the inset keeps drawing
  // something instead of flashing empty on the ticks it's omitted.
  private cachedCameraResources: ResourceState[] = [];

  // Cinematic presentation state (see fx/).
  private readonly death = new DeathCinematic();
  private lastFrameTime = 0;
  // Shift held — a shift-click in the chest panel moves one item, not a stack.
  private shiftHeld = false;
  // Set when C is pressed on an island treasure chest, so the loot's harvest
  // event that follows plays the treasure fanfare instead of a plain pickup.
  private expectTreasureUntil = 0;
  // Set on 'joined', cleared by the first snapshot after it — which shows the
  // "Day N" title card (see showTitleCard), since only a snapshot knows the tick.
  private titleCardPending = false;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.network = new Network();
    this.input = new Input(this.canvas);
    this.camera = new Camera();
    this.renderer = new Renderer(this.canvas, this.camera);
    this.state = new StateManager();
    this.hud = new HUD();
    this.chat = new ChatBox();

    this.setupResize();
    this.setupNetwork();
    this.setupMenu();
    this.setupHotbar();
    this.setupChat();

    const trackShift = (e: KeyboardEvent): void => { this.shiftHeld = e.shiftKey; };
    window.addEventListener('keydown', trackShift);
    window.addEventListener('keyup', trackShift);

    // Starts immediately rather than waiting for 'joined' — loop() itself
    // branches on `running` to draw the menu-screen backdrop until then.
    requestAnimationFrame((t) => this.loop(t));
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  private setupResize(): void {
    const resize = (): void => {
      this.renderer.resize();
      this.hud.resize();
    };
    window.addEventListener('resize', resize);
    resize();
  }

  private setupNetwork(): void {
    this.network.onJoined(({ mapSize, lakes, islands }) => {
      this.mapSize = mapSize;
      this.renderer.setLakes(lakes);
      this.hud.setLakes(lakes);
      this.renderer.setIslands(islands);
      this.hud.setIslands(islands);
      this.hideMenu();
      this.titleCardPending = true;
      this.running = true;
      // The loop's already running (see the constructor) — no need to kick
      // off a second requestAnimationFrame chain, just switch what it draws.
    });

    this.network.onState((snapshot) => {
      // The first snapshot after joining is what knows the day number.
      if (this.titleCardPending) {
        this.titleCardPending = false;
        this.showTitleCard(Math.floor(snapshot.tick / TICK_RATE / DAY_DURATION) + 1);
      }
      if (snapshot.cameraResources) this.cachedCameraResources = snapshot.cameraResources;
      this.state.push(snapshot);
      // Raw (un-interpolated) snapshots are what hit/kill detection diffs —
      // see Effects.ingest.
      this.renderer.fx.ingest(snapshot);
    });

    // The menu-screen backdrop (see loop()'s !running branch). The server
    // only ever sends this before this socket has joined (LOBBY_ROOM), so it
    // naturally stops arriving the moment `running` flips true above.
    this.network.onPreview((snapshot) => {
      this.previewState.push(snapshot);
      // Lakes are static for the session and expensive to rebuild (see
      // Renderer.setLakes) — set once, from whichever arrives first.
      if (!this.previewLakesSet) {
        this.previewLakesSet = true;
        this.renderer.setLakes(snapshot.lakes);
        this.renderer.setIslands(snapshot.islands);
      }
    });

    this.network.onHarvest(({ drops, inventory }) => {
      this.hud.updateInventory(inventory);
      this.flyPickups(drops);
      if (drops.length > 0) sound.play(performance.now() < this.expectTreasureUntil ? 'treasure' : 'pickup');
      if (drops.length > 0) {
        const text = drops.map((d) => `+${d.count} ${d.type}`).join('  ');
        this.hud.notify(text, '#f1c40f');
      }
    });

    this.network.onInventory(({ inventory, message }) => {
      this.hud.updateInventory(inventory);
      if (message?.startsWith('+1 ')) sound.play('craft');
      else if (message?.endsWith(' placed')) sound.play('place');
      if (message) this.hud.notify(message, '#f1c40f');
    });

    this.network.onChat(({ id, name, text }) => {
      this.hud.pushChat(name, text, id === this.network.myId);
    });

    this.network.onChest((payload) => this.hud.openChest(payload));
    this.network.onChestClosed(() => this.hud.closeChest());

    this.network.onDied((info) => {
      sound.play('death');
      this.hud.closeChest();
      // Freeze the frame as it was the moment before death and play it out
      // (see DeathCinematic) — the "You died" card comes in on top as it ends.
      const me = this.state.interpolated()?.players.find((p) => p.isMe);
      const focus = me ? this.camera.toScreen(me.x, me.y) : null;
      this.death.capture(
        this.canvas,
        focus ? focus.sx * this.camera.zoom : this.canvas.width / 2,
        focus ? focus.sy * this.camera.zoom : this.canvas.height / 2,
      );
      this.hud.updateInventory({});
      setTimeout(() => this.showDeathScreen(info), DEATH_CINEMATIC_MS * 0.6);
    });

    this.network.onSystem((text) => {
      this.hud.notify(text, '#56c9ff');
    });
  }

  private setupMenu(): void {
    const playBtn = document.getElementById('play-btn')!;
    const nameInput = document.getElementById('name-input') as HTMLInputElement;
    // Hair / skin / hat rows and their preview — remembers the pick itself.
    const picker = new LookPicker();
    if (!nameInput.value) nameInput.value = LookPicker.savedName();

    playBtn.addEventListener('click', () => {
      if (playBtn.hasAttribute('disabled')) return;
      const typed = nameInput.value.trim();
      // Only a name actually typed is worth remembering, not the fallback.
      if (typed) LookPicker.saveName(typed);
      const name = typed || 'Anonymous';
      this.network.join(name, picker.current);
      playBtn.textContent = 'Joining…';
      playBtn.setAttribute('disabled', 'true');
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') playBtn.click();
    });
  }

  /**
   * Hotbar slot selection: number keys pick a slot directly, the wheel
   * cycles it. Food is a special case — it can't be selected/held at all
   * (see HUD.selectSlot), so picking its slot either way eats it on the
   * spot instead, leaving whatever's currently held untouched.
   */
  /**
   * Chat: Enter or T opens the composer, which takes over the keyboard until
   * it closes (see Input.setTyping). Sending is the composer's own business —
   * this only relays what comes back out of it.
   */
  private setupChat(): void {
    this.chat.onSubmit((text) => this.network.chat(text));
    this.chat.onClose(() => this.input.setTyping(false));

    window.addEventListener('keydown', (e) => {
      if (!this.running || this.chat.isOpen()) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.code !== 'Enter' && e.code !== 'KeyT') return;

      // Otherwise the keypress that opened the box lands inside it as text.
      e.preventDefault();
      this.input.setTyping(true);
      this.chat.show();
    });
  }

  private setupHotbar(): void {
    window.addEventListener('keydown', (e) => {
      // Before joining, this is the menu-screen backdrop (see
      // loopMenuBackdrop) — there's no hotbar/recipe book on screen to
      // toggle, and no inventory to eat from either.
      if (!this.running) return;
      // Typing a name in the menu isn't hotbar/UI input.
      if (e.target instanceof HTMLInputElement) return;
      if (this.chat.isOpen()) return;

      // R toggles the recipe book, Esc closes it — or, while spectating,
      // stops spectating instead (recipe book isn't reachable there anyway,
      // see loopGame's spectating branch).
      if (e.code === 'KeyR') {
        this.hud.toggleRecipeBook();
        return;
      }
      // B opens/closes the animal compendium — same toggle-both-ways
      // pattern as R above.
      if (e.code === 'KeyB') {
        this.hud.toggleBestiary();
        return;
      }
      // V opens/closes the trading post — same toggle-both-ways pattern as
      // R/B above. Not T: that's already chat's own open shortcut (see
      // setupChat), sharing a keydown listener with this one so both would
      // fire on the same press.
      if (e.code === 'KeyV') {
        this.hud.toggleTrade();
        return;
      }
      // M opens/closes the full-map view — same toggle either way (see
      // handleSlashCommand), so there's no separate on/off branch to pick
      // between the way Escape below has to.
      if (e.code === 'KeyM') {
        this.network.chat('/camera');
        return;
      }
      // C opens the storage chest in reach (or closes the open one), or
      // loots an island treasure chest — see HUD.getNearChest.
      if (e.code === 'KeyC') {
        if (this.hud.getOpenChestId()) {
          this.closeChest();
          return;
        }
        const chest = this.hud.getNearChest();
        if (!chest || this.state.interpolated()?.spectating) return;
        if (chest.type === 'treasure_chest') this.expectTreasureUntil = performance.now() + 1500;
        this.network.openChest(chest.id);
        sound.play('click');
        return;
      }
      // N mutes/unmutes all sound (see fx/Sound).
      if (e.code === 'KeyN') {
        const muted = sound.toggleMute();
        this.hud.notify(muted ? 'Sound off (N)' : 'Sound on (N)', '#56c9ff');
        return;
      }
      // G flips graphics quality (see fx/quality) — the heavy cinematic
      // effects off for slower machines, or back on.
      if (e.code === 'KeyG') {
        const q = toggleQuality();
        this.hud.notify(q === 'high' ? 'Graphics: high' : 'Graphics: low (faster)', '#56c9ff');
        return;
      }
      if (e.code === 'Escape') {
        if (this.hud.getOpenChestId()) {
          this.closeChest();
          return;
        }
        if (this.state.interpolated()?.cameraMode) {
          this.network.chat('/camera');
          return;
        }
        if (this.state.interpolated()?.spectating) {
          this.network.chat('/unspectate');
          return;
        }
        this.hud.closeRecipeBook();
        this.hud.closeBestiary();
        this.hud.closeTrade();
        return;
      }

      // The hotbar shown while spectating is the target's, not this
      // socket's own (see HUD.render's spectatingHeld) — selecting or eating
      // from it would silently act on a hotbar this socket doesn't actually
      // own, and the server ignores eat/craft/etc. from a spectator anyway
      // (see handleEat's spectator guard), so just don't offer it.
      if (this.state.interpolated()?.spectating) return;

      const match = e.code.match(/^Digit([1-9])$/);
      if (!match) return;
      const result = this.hud.selectSlot(Number(match[1]) - 1);
      if (result?.action === 'eat') this.network.eat(result.itemId);
      else if (result?.action === 'equip') this.network.equip(result.itemId);
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.state.interpolated()?.spectating) return;
      this.hud.scrollSlot(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    // Clicks on the hotbar start a drag (which also selects that slot — see
    // beginHotbarDrag), and clicks on the crafting panel start a craft;
    // neither should also swing the tool.
    this.input.setClickInterceptor((x, y) => {
      // Before joining there's no HUD on screen at all (see
      // loopMenuBackdrop) — nothing here to hit-test against.
      if (!this.running) return false;

      // The animal compendium's button and (while open) its whole panel —
      // checked first since it's a full-screen modal with nothing clickable
      // behind it, same reasoning as the recipe book/trading post below.
      if (this.hud.handleBestiaryClick(x, y)) return true;

      // While a storage chest is open: click its items to take them, click
      // hotbar items to store them (shift-click moves just one).
      const chestId = this.hud.getOpenChestId();
      if (chestId) {
        const taken = this.hud.hitTestChestItem(x, y);
        if (taken) {
          this.network.moveChestItem(chestId, taken, this.shiftHeld ? 1 : Number.MAX_SAFE_INTEGER, false);
          sound.play('click');
          return true;
        }
        if (this.hud.isOverChest(x, y)) return true;
        const storeSlot = this.hud.hitTestHotbar(x, y);
        const stored = storeSlot !== null ? this.hud.hotbarItemAt(storeSlot) : null;
        if (stored) {
          this.network.moveChestItem(chestId, stored, this.shiftHeld ? 1 : this.hud.getItemCount(stored), true);
          sound.play('click');
          return true;
        }
      }

      const slot = this.hud.hitTestHotbar(x, y);
      if (slot !== null) {
        // The hotbar shown here is the spectated target's, not this
        // socket's own (see HUD.render's spectatingHeld) — swallow the
        // click so it doesn't fall through and swing at whatever's behind
        // it, but don't act on a hotbar this socket doesn't actually own.
        if (this.state.interpolated()?.spectating) return true;
        const result = this.hud.beginHotbarDrag(slot);
        if (result?.action === 'eat') this.network.eat(result.itemId);
        else if (result?.action === 'equip') this.network.equip(result.itemId);
        else this.hotbarDragActive = true;
        return true;
      }

      // Opening/closing the recipe book. Clicks inside an open book fall
      // through to the craft test below, so its entries stay clickable.
      if (this.hud.handleRecipeBookClick(x, y)) return true;

      const recipeId = this.hud.hitTestCraft(x, y);
      if (recipeId) this.network.craft(recipeId);
      // Swallow clicks anywhere on the panel, so a click on an unaffordable
      // recipe doesn't fall through and harvest whatever is behind it.
      if (recipeId !== null || this.hud.isOverCrafting(x, y)) return true;

      // Trading post: same "toggle button, then offer rows" shape as the
      // recipe book/craft test just above.
      if (this.hud.handleTradeClick(x, y)) return true;

      const offerId = this.hud.hitTestTrade(x, y);
      if (offerId) this.network.trade(offerId, this.hud.getTradeQuantity());
      return offerId !== null || this.hud.isOverTrade(x, y);
    });

    // Ended on window (not the canvas) so releasing the mouse off-canvas
    // still stops the drag instead of leaving it stuck active.
    window.addEventListener('mouseup', () => {
      if (!this.hotbarDragActive) return;
      this.hotbarDragActive = false;
      this.hud.endHotbarDrag();
    });
  }

  /**
   * World position the selected structure would be placed at — the mouse
   * point, or null when the held item isn't something placeable.
   */
  private placementTarget(): { x: number; y: number } | null {
    const item = this.hud.getSelectedItem();
    if (!item || !RECIPES_BY_ID[item]?.placeAs) return null;
    if (this.hud.getItemCount(item) < 1) return null;

    const { wx, wy } = this.camera.toWorld(this.input.mouseX, this.input.mouseY);
    return { x: wx, y: wy };
  }

  /** World position a cast would land at — the mouse point, or null unless a rod is held. */
  private castTarget(): { x: number; y: number } | null {
    if (this.hud.getSelectedItem() !== FISHING_ROD_ID) return null;
    if (this.hud.getItemCount(FISHING_ROD_ID) < 1) return null;

    const { wx, wy } = this.camera.toWorld(this.input.mouseX, this.input.mouseY);
    return { x: wx, y: wy };
  }

  /** World position a till would land at — the mouse point, or null unless a hoe is held. */
  private tillTarget(): { x: number; y: number } | null {
    if (this.hud.getSelectedItem() !== WOODEN_HOE_ID) return null;
    if (this.hud.getItemCount(WOODEN_HOE_ID) < 1) return null;

    const { wx, wy } = this.camera.toWorld(this.input.mouseX, this.input.mouseY);
    return { x: wx, y: wy };
  }

  /**
   * True when a watering-can action is ready to fire. Unlike till/plant,
   * this isn't mouse-aimed at all — see Game.handleWater, which waters
   * every farm plot within swing range in one go, the same reach a harvest
   * connects with, rather than a single point the player clicked on.
   */
  private canWater(): boolean {
    return this.hud.getSelectedItem() === WATERING_CAN_ID && this.hud.getItemCount(WATERING_CAN_ID) >= 1;
  }

  /** World position a seed would be planted at — the mouse point, or null unless a seed is held. */
  private plantTarget(): { itemId: string; x: number; y: number } | null {
    const item = this.hud.getSelectedItem();
    if (item !== BERRY_SEED_ID && item !== WHEAT_SEED_ID) return null;
    if (this.hud.getItemCount(item) < 1) return null;

    const { wx, wy } = this.camera.toWorld(this.input.mouseX, this.input.mouseY);
    return { itemId: item, x: wx, y: wy };
  }

  // ── Game loop ──────────────────────────────────────────────────────────────

  private loop(timestamp: number): void {
    const dt = this.lastFrameTime ? Math.min((timestamp - this.lastFrameTime) / 1000, 0.1) : 0;
    this.lastFrameTime = timestamp;
    if (autoTune(dt)) this.hud.notify('Graphics lowered to keep things smooth (G to change)', '#56c9ff', 4000);
    if (this.running) {
      this.loopGame(timestamp, dt);
    } else {
      this.loopMenuBackdrop(dt);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  /** The ordinary in-game frame: input, camera-follow, world + HUD render. */
  private loopGame(timestamp: number, dt: number): void {
    const snapshot = this.state.interpolated();
    const me = snapshot?.players.find((p) => p.isMe);
    if (me && snapshot) {
      this.camera.track({ x: me.x, y: me.y }, dt, this.canvas.width, this.canvas.height);
      this.updateSound(dt, me.x, me.y, snapshot.structures);
    }


    // Send input at server tick rate (not every frame)
    if (timestamp - this.lastInputSend >= INPUT_INTERVAL_MS) {
      // Aim from the player's actual on-screen position (falling back to
      // the canvas center before the first snapshot arrives) rather than
      // always assuming the center — see Input.getInput.
      const aim = me ? this.camera.toScreen(me.x, me.y) : null;
      const aimX = aim ? aim.sx * this.camera.zoom : this.canvas.width / 2;
      const aimY = aim ? aim.sy * this.camera.zoom : this.canvas.height / 2;
      this.network.sendInput(this.input.getInput(this.hud.getSelectedItem(), aimX, aimY));
      this.lastInputSend = timestamp;
    }

    if (this.hotbarDragActive) {
      this.hud.updateHotbarDrag(this.input.mouseX, this.input.mouseY);
    }

    if (this.death.active) {
      // The freeze-frame owns the screen (input above still goes out, so
      // the respawned player isn't stuck) — nothing else draws over it.
      this.death.draw(this.canvas.getContext('2d')!, this.canvas.width, this.canvas.height);
      this.hud.render(null);
      return;
    }

    if (!snapshot) return;
    // The full-map view draws as an inset over the normal frame (see
    // renderCameraOverview) rather than replacing this.camera outright, so
    // the ordinary view above still needs framing even while it's on.
    if (snapshot.cameraMode) {
      const size = this.renderer.getCameraOverviewSize();
      this.overviewCamera.frameMap(this.mapSize, size, size);
    }

    // While spectating (see GameState.spectating), `me` above is the player
    // being watched, not this socket's own body — placing/casting would aim
    // from the wrong position and the server ignores both anyway (see
    // Game.ts's spectator guards), so skip computing them and show the
    // target's actual held item instead of this socket's own hotbar
    // selection (see Renderer's isMe-optimistic held-item rendering).
    if (snapshot.spectating) {
      this.input.consumeAltAction();
      this.renderer.setHeldItem(me?.held ?? null);
      this.renderer.setPlacementTarget(null);
      this.renderer.setCastTarget(null);
      this.renderer.setFarmActionTarget(null);
    } else {
      // Placement/casting/till/plant are all aimed with the mouse, so they
      // have to be resolved after the camera has been moved for this frame.
      // Watering is the one exception — it isn't aimed at all, see canWater.
      // Right-click / F means exactly one of "place", "cast", "till",
      // "water", or "plant" depending on what's held — never more than one,
      // since each of these is itself gated on a different, mutually
      // exclusive held item. Eating isn't part of this: food is never held
      // at all (see HUD's selectSlot), it's eaten straight from the hotbar
      // — see setupHotbar.
      const target = this.placementTarget();
      const fishTarget = this.castTarget();
      const tillTarget = this.tillTarget();
      const watering = this.canWater();
      const plantTarget = this.plantTarget();
      const altAction = this.input.consumeAltAction();
      if (altAction && target) {
        this.network.place(this.hud.getSelectedItem()!, target.x, target.y);
      } else if (altAction && fishTarget) {
        this.network.cast(fishTarget.x, fishTarget.y);
      } else if (altAction && tillTarget) {
        this.network.till(tillTarget.x, tillTarget.y);
      } else if (altAction && watering) {
        this.network.water();
      } else if (altAction && plantTarget) {
        this.network.plant(plantTarget.itemId, plantTarget.x, plantTarget.y);
      }

      this.renderer.setHeldItem(this.hud.getSelectedItem());
      this.renderer.setPlacementTarget(target);
      this.renderer.setCastTarget(fishTarget);
      this.renderer.setFarmActionTarget(
        tillTarget ? { kind: 'till', x: tillTarget.x, y: tillTarget.y } :
        watering ? { kind: 'water' } :
        plantTarget ? { kind: 'plant', x: plantTarget.x, y: plantTarget.y } :
        null,
      );
    }
    this.renderer.setOpenChest(this.hud.getOpenChestId());
    this.renderer.render(snapshot, this.mapSize);
    if (snapshot.cameraMode) {
      this.renderer.renderCameraOverview(snapshot, this.cachedCameraResources, this.mapSize, this.overviewCamera);
    }
    this.hud.setPointer(this.input.mouseX, this.input.mouseY);
    this.hud.render(snapshot);
  }

  /**
   * Behind the main menu, before the player has joined: the world renders
   * exactly as it would in a real game, camera locked onto the featured bot
   * (see PreviewState.focus) — but no input is read, nothing is sent, and
   * the HUD never renders at all, so none of its chrome (hotbar, minimap,
   * recipe book, crafting panel, leaderboard, chat log) shows up over the
   * login form. drawPlayer's hideChrome strips the per-player UI (name tag,
   * HP bar, chat bubble) too, so it's just a character wandering the world.
   */
  private loopMenuBackdrop(dt: number): void {
    const snapshot = this.previewState.interpolated();
    if (!snapshot) return;

    // `focus` is an id into `players`, not a raw coordinate — players are
    // already smoothly interpolated between server ticks (see
    // StateManager), and following the same interpolated position the bot
    // is actually drawn at is what keeps the camera in lockstep with him
    // instead of jumping to his raw once-per-tick position out ahead of
    // where he's currently rendered.
    const target = snapshot.players.find((p) => p.id === snapshot.focus);
    if (target) {
      // Same eased, leading camera as in-game — the menu backdrop is the
      // first thing anyone sees, so it should glide, not lock on.
      this.camera.track({ x: target.x, y: target.y }, dt, this.canvas.width, this.canvas.height);
    }
    this.renderer.render(snapshot, this.mapSize, true);
  }

  // ── Cinematic helpers ──────────────────────────────────────────────────────

  private closeChest(): void {
    this.hud.closeChest();
    this.network.closeChest();
  }

  /** Steers the ambient soundscape from what's around the listener. */
  private updateSound(dt: number, x: number, y: number, structures: { type: string; x: number; y: number }[]): void {
    let fireDistance = Infinity;
    for (const s of structures) {
      if (s.type === 'campfire') fireDistance = Math.min(fireDistance, Math.hypot(s.x - x, s.y - y));
    }
    sound.updateAmbience(dt, {
      rain: this.renderer.atmosphere.rain,
      nightness: this.renderer.nightLevel,
      seaDistance: Math.max(0, seaCoastAt(x) - y),
      fireDistance,
      inForest: !isInDesert(x, y) && forestFactor(x, y) > 0.5,
      inDesert: isInDesert(x, y),
    });
  }

  /** Harvest drops fly from where the hit landed into the hotbar. */
  private flyPickups(drops: { type: string; count: number }[]): void {
    if (drops.length === 0) return;
    const hit = this.renderer.fx.lastHitWorld;
    const me = this.state.interpolated()?.players.find((p) => p.isMe);
    const from = hit && performance.now() - hit.at < 1200 ? hit : me;
    if (!from) return;
    const { sx, sy } = this.camera.toScreen(from.x, from.y);
    this.hud.spawnPickups(drops, sx * this.camera.zoom, sy * this.camera.zoom);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  private hideMenu(): void {
    const menu = document.getElementById('menu')!;
    menu.style.opacity = '0';
    menu.style.transition = 'opacity 0.5s';
    setTimeout(() => { menu.style.display = 'none'; }, 500);
  }

  /**
   * The "Day N" card over the world just after joining — rises in as the
   * menu finishes fading, holds a beat, then drifts out (the whole sequence
   * is #title-card's CSS animation, ~2.5s). Purely decorative: the element
   * is pointer-events: none, so the game is playable underneath from the
   * first frame.
   */
  private showTitleCard(day: number): void {
    const card = document.getElementById('title-card')!;
    document.getElementById('title-card-day')!.textContent = `Day ${day}`;
    card.classList.remove('show');
    void card.offsetWidth; // restart the animation if it's somehow shown twice
    card.classList.add('show');
    card.addEventListener('animationend', () => card.classList.remove('show'), { once: true });
  }

  /**
   * The death screen: what killed you, your score, and how long you lasted.
   * The server has already respawned you behind it — any click or key (or
   * eight seconds) dismisses it and you're straight back in.
   */
  private showDeathScreen(info: DiedPayload): void {
    const overlay = document.getElementById('death-overlay')!;
    document.getElementById('death-cause')!.textContent = `Killed by ${info.cause}`;
    document.getElementById('death-score')!.textContent = info.score.toLocaleString();
    const m = Math.floor(info.survived / 60);
    const s = info.survived % 60;
    document.getElementById('death-time')!.textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;
    overlay.style.display = 'flex';

    const hide = (): void => {
      overlay.style.display = 'none';
      clearTimeout(timer);
      window.removeEventListener('keydown', hide);
      overlay.removeEventListener('pointerdown', hide);
    };
    const timer = setTimeout(hide, 8000);
    // Armed a beat late, so a key held at the moment of death doesn't skip it.
    setTimeout(() => {
      window.addEventListener('keydown', hide);
      overlay.addEventListener('pointerdown', hide);
    }, 600);
  }
}

window.addEventListener('load', () => new ClientGame());
