import { CHAT_MAX_LENGTH } from '@io-game/shared';

/**
 * The chat composer: a real <input> laid over the canvas rather than a
 * canvas-drawn field, so the caret, selection, clipboard and IME all behave
 * the way a text box is supposed to without reimplementing any of it. It's
 * styled to sit with the rest of the HUD (see index.html's font stack), and
 * only exists on screen while you're actually typing.
 *
 * Everything else in the game reads keys off `window`, so while this is open
 * the game's own input has to stand down — see Input.setTyping, which main.ts
 * drives off open()/close().
 */
export class ChatBox {
  private readonly input: HTMLInputElement;
  private open = false;
  private onSubmitCb: ((text: string) => void) | null = null;
  private onCloseCb: (() => void) | null = null;

  constructor() {
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = CHAT_MAX_LENGTH;
    this.input.placeholder = 'Say something…  (Enter to send, Esc to cancel)';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.style.cssText = [
      'position:fixed',
      'left:50%',
      'transform:translateX(-50%)',
      'bottom:150px',
      'width:min(560px, 70vw)',
      'padding:8px 12px',
      'z-index:30',
      'display:none',
      'box-sizing:border-box',
      'font:bold 13px "Courier New", monospace',
      'color:#ffffff',
      'background:rgba(0,0,0,0.72)',
      'border:2px solid rgba(255,255,255,0.35)',
      'border-radius:6px',
      'outline:none',
    ].join(';');
    document.body.appendChild(this.input);

    this.input.addEventListener('keydown', (e) => {
      // Stopping propagation keeps these keys away from the game's own
      // window-level listeners — Esc would otherwise also close the recipe
      // book behind the chat box.
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const text = this.input.value.trim();
        this.close();
        if (text) this.onSubmitCb?.(text);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else {
        e.stopPropagation();
      }
    });

    // Clicking back into the world closes the composer rather than leaving a
    // field open that no longer has focus.
    this.input.addEventListener('blur', () => {
      if (this.open) this.close();
    });
  }

  onSubmit(cb: (text: string) => void): void {
    this.onSubmitCb = cb;
  }

  /** Fired whenever the box closes, however it closed — sent or cancelled. */
  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.input.value = '';
    this.input.style.display = 'block';
    this.input.focus();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.input.value = '';
    this.input.style.display = 'none';
    this.input.blur();
    this.onCloseCb?.();
  }
}
