import { io, Socket } from 'socket.io-client';
import {
  GameState,
  PlayerInput,
  JoinedPayload,
  HarvestPayload,
  InventoryPayload,
  ChatMessage,
  PreviewState,
} from '@io-game/shared';

type Listener<T> = (data: T) => void;

export class Network {
  private socket: Socket;
  myId = '';

  private onJoinedCb: Listener<JoinedPayload> | null = null;
  private onStateCb: Listener<GameState> | null = null;
  private onHarvestCb: Listener<HarvestPayload> | null = null;
  private onInventoryCb: Listener<InventoryPayload> | null = null;
  private onDiedCb: Listener<void> | null = null;
  private onChatCb: Listener<ChatMessage> | null = null;
  private onPreviewCb: Listener<PreviewState> | null = null;
  private onSystemCb: Listener<string> | null = null;

  constructor() {
    this.socket = io({
      transports: ['websocket'],
    });

    this.socket.on('joined', (data: JoinedPayload) => {
      this.myId = data.id;
      this.onJoinedCb?.(data);
    });

    this.socket.on('state', (state: GameState) => {
      this.onStateCb?.(state);
    });

    this.socket.on('harvest', (data: HarvestPayload) => {
      this.onHarvestCb?.(data);
    });

    this.socket.on('inventory', (data: InventoryPayload) => {
      this.onInventoryCb?.(data);
    });

    this.socket.on('chat', (msg: ChatMessage) => {
      this.onChatCb?.(msg);
    });

    this.socket.on('preview', (state: PreviewState) => {
      this.onPreviewCb?.(state);
    });

    // Private command feedback (e.g. "/spectate" results) — never broadcast
    // to the public chat log, see Game.ts's sendSystem.
    this.socket.on('system', (text: string) => {
      this.onSystemCb?.(text);
    });

    this.socket.on('died', () => {
      this.onDiedCb?.();
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Network] Connection error:', err.message);
    });
  }

  // ── Emitters ───────────────────────────────────────────────────────────────

  join(name: string): void {
    this.socket.emit('join', { name });
  }

  sendInput(input: PlayerInput): void {
    this.socket.emit('input', input);
  }

  craft(recipeId: string): void {
    this.socket.emit('craft', { recipeId });
  }

  place(itemId: string, x: number, y: number): void {
    this.socket.emit('place', { itemId, x, y });
  }

  cast(x: number, y: number): void {
    this.socket.emit('cast', { x, y });
  }

  eat(itemId: string): void {
    this.socket.emit('eat', { itemId });
  }

  chat(text: string): void {
    this.socket.emit('chat', { text });
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  onJoined(cb: Listener<JoinedPayload>): void { this.onJoinedCb = cb; }
  onState(cb: Listener<GameState>): void { this.onStateCb = cb; }
  onHarvest(cb: Listener<HarvestPayload>): void { this.onHarvestCb = cb; }
  onInventory(cb: Listener<InventoryPayload>): void { this.onInventoryCb = cb; }
  onDied(cb: Listener<void>): void { this.onDiedCb = cb; }
  onChat(cb: Listener<ChatMessage>): void { this.onChatCb = cb; }
  /** The menu-screen backdrop, sent only before this socket has joined — see PreviewState. */
  onPreview(cb: Listener<PreviewState>): void { this.onPreviewCb = cb; }
  onSystem(cb: Listener<string>): void { this.onSystemCb = cb; }
}
