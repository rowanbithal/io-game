import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { Game, LOBBY_ROOM } from './Game';
import { PlayerInput, CraftRequest, PlaceRequest, CastRequest, EatRequest, ChatRequest } from '@io-game/shared';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*' },
  // Use websocket transport only - faster and simpler than polling fallback
  transports: ['websocket'],
});

// ── Static serving ────────────────────────────────────────────────────────────
// In production, the Vite build output is served from here.
// In development, Vite's dev server runs separately (see npm run dev at root).
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// ── Game ──────────────────────────────────────────────────────────────────────
const game = new Game(io);
// Dev-only time acceleration for watching bots play out a full tool
// progression without actually waiting for it — scales movement, hunger,
// crafting, the day/night cycle, everything (see Game.step). Leave unset for
// real time; e.g. GAME_SPEED=8 to run the whole simulation 8x faster.
const GAME_SPEED = Number(process.env.GAME_SPEED ?? 1);
game.start(Number.isFinite(GAME_SPEED) && GAME_SPEED > 0 ? GAME_SPEED : 1);

// Server-simulated players, so the world isn't empty with nobody online.
// Set BOT_COUNT=0 to run without them.
const BOT_COUNT = Number(process.env.BOT_COUNT ?? 4);
if (Number.isFinite(BOT_COUNT) && BOT_COUNT > 0) game.addBots(BOT_COUNT);

// ── Sockets ───────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  // Not a player yet — sits in the lobby room and gets the menu-screen
  // preview broadcast (see Game.ts's broadcastPreview) until it joins.
  socket.join(LOBBY_ROOM);

  socket.on('join', ({ name }: { name: string }) => {
    socket.leave(LOBBY_ROOM);
    game.addPlayer(socket, name);
  });

  socket.on('input', (input: PlayerInput) => {
    game.handleInput(socket.id, input);
  });

  socket.on('craft', (req: CraftRequest) => {
    game.handleCraft(socket.id, req);
  });

  socket.on('place', (req: PlaceRequest) => {
    game.handlePlace(socket.id, req);
  });

  socket.on('cast', (req: CastRequest) => {
    game.handleCast(socket.id, req);
  });

  socket.on('eat', (req: EatRequest) => {
    game.handleEat(socket.id, req);
  });

  socket.on('chat', (req: ChatRequest) => {
    game.handleChat(socket.id, req);
  });

  socket.on('disconnect', () => {
    game.removePlayer(socket.id);
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ── Listen ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, () => {
  console.log(`\n🌍 Server listening on http://localhost:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV ?? 'development'}\n`);
});
