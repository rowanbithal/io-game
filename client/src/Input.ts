import { PlayerInput } from '@io-game/shared';

/** Returns true if the UI consumed the click, so it shouldn't also swing. */
type ClickInterceptor = (screenX: number, screenY: number) => boolean;

/** True for the game's own text fields — the chat composer and the name box. */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export class Input {
  private keys = new Set<string>();
  private mouseAngle = 0;
  private mouseDown = false; // Held, like a movement key — swings repeat every tick while true
  // One-shot: right-click / F, consumed by consumeAltAction(). Context-
  // sensitive — the caller decides whether it means "place" or "cast"
  // based on what's currently held.
  private altActionPulse = false;
  private clickInterceptor: ClickInterceptor | null = null;
  // True while the chat composer is open (see setTyping).
  private typing = false;

  /** Mouse position in canvas pixels — used to aim structure placement. */
  mouseX = 0;
  mouseY = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      // Typing into a text field (chat, the name box on the menu) is never
      // game input — otherwise saying "wade" would walk you into a lake.
      if (this.typing || isTextField(e.target)) return;

      this.keys.add(e.code);
      if (e.code === 'KeyF') {
        this.altActionPulse = true;
      }
      // Prevent page scroll with arrow/space keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });

    // Not gated on `typing`: a key pressed before the chat box opened still
    // has to be released, or it stays down forever.
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      this.mouseAngle = Math.atan2(this.mouseY - cy, this.mouseX - cx);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // left button only — right-click is placement
      if (this.typing) return; // clicking the world while chatting only dismisses the box
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Give the HUD first refusal — clicking a craft button shouldn't also
      // start swinging the tool at whatever happens to be in front of the
      // player, and shouldn't keep swinging if the button stays held there.
      if (this.clickInterceptor?.(x, y)) return;
      this.mouseDown = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    // Right-click places the selected structure, or casts a fishing rod
    // (left-click is already harvest).
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.typing) this.altActionPulse = true;
    });
  }

  /** Lets the HUD claim clicks that land on its interactive panels. */
  setClickInterceptor(fn: ClickInterceptor): void {
    this.clickInterceptor = fn;
  }

  /**
   * Puts input on hold while the player is typing a chat message. Keys held
   * when it goes on are released rather than left stuck down — walking into
   * the chat box shouldn't leave you walking for as long as you type.
   */
  setTyping(typing: boolean): void {
    this.typing = typing;
    if (typing) {
      this.keys.clear();
      this.mouseDown = false;
      this.altActionPulse = false;
    }
  }

  /** True once per right-click / F press, then resets. */
  consumeAltAction(): boolean {
    const fired = this.altActionPulse;
    this.altActionPulse = false;
    return fired;
  }

  /**
   * Returns the current input state and resets one-shot actions.
   * Call once per send interval. `held` is the hotbar selection, which the
   * server needs in order to apply held-tool bonuses.
   */
  getInput(held: string | null): PlayerInput {
    return {
      up: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      down: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      angle: this.mouseAngle,
      // Held like a movement key, not a one-shot pulse — the server's own
      // HARVEST_COOLDOWN already throttles actual swings, so sending this
      // continuously while the button/key is down is what makes holding it
      // auto-repeat instead of requiring a fresh click per swing.
      harvest: this.mouseDown || this.keys.has('KeyE') || this.keys.has('Space'),
      held,
    };
  }
}
