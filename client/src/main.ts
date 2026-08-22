import { TICK_RATE, RECIPES_BY_ID, FISHING_ROD_ID, PreviewState } from '@io-game/shared';
import { Network } from './Network';
import { Input } from './Input';
import { Camera } from './Camera';
import { Renderer } from './Renderer';
import { StateManager } from './StateManager';
import { HUD } from './ui/HUD';
import { ChatBox } from './ui/ChatBox';

const INPUT_INTERVAL_MS = 1000 / TICK_RATE;

class ClientGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly network: Network;
  private readonly input: Input;
  private readonly camera: Camera;
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
    this.network.onJoined(({ mapSize, lakes }) => {
      this.mapSize = mapSize;
      this.renderer.setLakes(lakes);
      this.hud.setLakes(lakes);
      this.hideMenu();
      this.running = true;
      // The loop's already running (see the constructor) — no need to kick
      // off a second requestAnimationFrame chain, just switch what it draws.
    });

    this.network.onState((snapshot) => {
      this.state.push(snapshot);
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
      }
    });

    this.network.onHarvest(({ drops, inventory }) => {
      this.hud.updateInventory(inventory);
      if (drops.length > 0) {
        const text = drops.map((d) => `+${d.count} ${d.type}`).join('  ');
        this.hud.notify(text, '#f1c40f');
      }
    });

    this.network.onInventory(({ inventory, message }) => {
      this.hud.updateInventory(inventory);
      if (message) this.hud.notify(message, '#f1c40f');
    });

    this.network.onChat(({ id, name, text }) => {
      this.hud.pushChat(name, text, id === this.network.myId);
    });

    this.network.onDied(() => {
      this.hud.notify('☠ You died! Respawning…', '#e74c3c', 2500);
      this.hud.updateInventory({});
      this.flashDeathScreen();
    });

    this.network.onSystem((text) => {
      this.hud.notify(text, '#56c9ff');
    });
  }

  private setupMenu(): void {
    const playBtn = document.getElementById('play-btn')!;
    const nameInput = document.getElementById('name-input') as HTMLInputElement;

    playBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'Anonymous';
      this.network.join(name);
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
      if (e.code === 'Escape') {
        if (this.state.interpolated()?.spectating) {
          this.network.chat('/unspectate');
          return;
        }
        this.hud.closeRecipeBook();
        return;
      }

      const match = e.code.match(/^Digit([1-9])$/);
      if (!match) return;
      const eaten = this.hud.selectSlot(Number(match[1]) - 1);
      if (eaten) this.network.eat(eaten);
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.hud.scrollSlot(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    // Clicks on the hotbar start a drag (which also selects that slot — see
    // beginHotbarDrag), and clicks on the crafting panel start a craft;
    // neither should also swing the tool.
    this.input.setClickInterceptor((x, y) => {
      // Before joining there's no HUD on screen at all (see
      // loopMenuBackdrop) — nothing here to hit-test against.
      if (!this.running) return false;

      const slot = this.hud.hitTestHotbar(x, y);
      if (slot !== null) {
        const eaten = this.hud.beginHotbarDrag(slot);
        if (eaten) this.network.eat(eaten);
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
      return recipeId !== null || this.hud.isOverCrafting(x, y);
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

  // ── Game loop ──────────────────────────────────────────────────────────────

  private loop(timestamp: number): void {
    if (this.running) {
      this.loopGame(timestamp);
    } else {
      this.loopMenuBackdrop();
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  /** The ordinary in-game frame: input, camera-follow, world + HUD render. */
  private loopGame(timestamp: number): void {
    // Send input at server tick rate (not every frame)
    if (timestamp - this.lastInputSend >= INPUT_INTERVAL_MS) {
      this.network.sendInput(this.input.getInput(this.hud.getSelectedItem()));
      this.lastInputSend = timestamp;
    }

    if (this.hotbarDragActive) {
      this.hud.updateHotbarDrag(this.input.mouseX, this.input.mouseY);
    }

    const snapshot = this.state.interpolated();
    if (!snapshot) return;

    const me = snapshot.players.find((p) => p.isMe);
    if (me) {
      this.camera.follow(me.x, me.y, this.canvas.width, this.canvas.height);
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
    } else {
      // Placement/casting are aimed with the mouse, so they have to be
      // resolved after the camera has been moved for this frame. Right-
      // click / F means "place" or "cast" depending on what's held — never
      // both, since nothing is simultaneously placeable and a fishing rod.
      // Eating isn't part of this: food is never held at all (see HUD's
      // selectSlot), it's eaten straight from the hotbar — see setupHotbar.
      const target = this.placementTarget();
      const fishTarget = this.castTarget();
      const altAction = this.input.consumeAltAction();
      if (altAction && target) {
        this.network.place(this.hud.getSelectedItem()!, target.x, target.y);
      } else if (altAction && fishTarget) {
        this.network.cast(fishTarget.x, fishTarget.y);
      }

      this.renderer.setHeldItem(this.hud.getSelectedItem());
      this.renderer.setPlacementTarget(target);
      this.renderer.setCastTarget(fishTarget);
    }
    this.renderer.render(snapshot, this.mapSize);
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
  private loopMenuBackdrop(): void {
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
      this.camera.follow(target.x, target.y, this.canvas.width, this.canvas.height);
    }
    this.renderer.render(snapshot, this.mapSize, true);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  private hideMenu(): void {
    const menu = document.getElementById('menu')!;
    menu.style.opacity = '0';
    menu.style.transition = 'opacity 0.5s';
    setTimeout(() => { menu.style.display = 'none'; }, 500);
  }

  private flashDeathScreen(): void {
    const overlay = document.getElementById('death-overlay')!;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.style.display = 'none'; }, 2000);
  }
}

window.addEventListener('load', () => new ClientGame());
