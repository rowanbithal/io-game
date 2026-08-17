# Survive.io — Multiplayer Browser Survival Game

A from-scratch multiplayer .io survival game.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Language** | TypeScript (everywhere) | Shared types between client and server |
| **Client renderer** | HTML5 Canvas 2D API | Direct draw, no framework overhead |
| **Client networking** | socket.io-client | Persistent WebSocket connection |
| **Client build** | Vite | Fast HMR in dev, optimal bundle in prod |
| **Server runtime** | Node.js + Express | Non-blocking I/O, huge ecosystem |
| **Server networking** | socket.io | Rooms, namespaces, reliable delivery |
| **Monorepo** | npm workspaces | Shared `@io-game/shared` package |

---

## Project Structure

```
io-game/
├── package.json              # Root workspaces + concurrently dev script
│
├── shared/                   # @io-game/shared — imported by both packages
│   └── src/
│       ├── types.ts          # All shared interfaces (GameState, PlayerInput…)
│       ├── constants.ts      # Tuning values (TICK_RATE, MAP_SIZE, speeds…)
│       └── index.ts          # Barrel export
│
├── server/                   # Node.js game server
│   └── src/
│       ├── index.ts          # Express + Socket.io bootstrap
│       ├── Game.ts           # Authoritative game loop, harvest logic, broadcast
│       ├── World.ts          # Procedural map generation + spatial grid
│       └── entities/
│           ├── Player.ts     # Server-side player: movement, stats, cooldowns
│           └── Resource.ts   # Trees/rocks/berries: HP, drops, respawning
│
└── client/                   # Vite + TypeScript browser client
    ├── index.html            # Menu UI (CSS-only, no framework)
    └── src/
        ├── main.ts           # Bootstrap, game loop, menu flow
        ├── Network.ts        # Typed socket.io wrapper
        ├── Input.ts          # Keyboard + mouse capture
        ├── Camera.ts         # World → screen coordinate transforms
        ├── Renderer.ts       # Full Canvas 2D draw: ground, resources, players
        ├── StateManager.ts   # Double-buffer + linear interpolation
        └── ui/
            └── HUD.ts        # Stat bars, inventory, leaderboard, minimap
```

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm ≥ 8 (for workspaces)

### Install
```bash
cd io-game
npm install
```

### Development (two terminals auto-started by concurrently)
```bash
npm run dev
```
- **Server** runs on `http://localhost:3000` (tsx watch — auto-restarts on changes)
- **Client** runs on `http://localhost:5173` (Vite — instant HMR)

Open `http://localhost:5173` in your browser, enter a name, and play.

### Production Build
```bash
npm run build      # Compiles server TS → dist/, Vite bundles client → dist/
npm start          # Serves both from the Node server on port 3000
```

---

## Architecture

### Authoritative Server Model

```
Browser Client                         Node.js Server
─────────────────────────────────────────────────────
[Input] WASD + mouse angle             [Game Loop @20Hz]
        ──── socket.io ──→               Update all players
                                         Process harvests
        ←── GameState ────               Check deaths
                                         Broadcast per-player view
[Interpolate prev→curr state]
[Render on canvas @ 60fps]
```

**The server is the single source of truth.** Clients cannot cheat positions, damage, or inventory counts because all logic runs server-side. The client only:
1. Sends raw input (keys + mouse angle)
2. Renders the interpolated state it receives

### Client-Side Interpolation
The server sends 20 snapshots/second. The client renders at ~60fps. `StateManager` stores the **previous** and **current** server state and linearly interpolates player positions between them, producing smooth movement even at the lower network rate.

### Spatial Grid
`World.ts` divides the map into 120×120 unit cells. When a player needs nearby resources (for rendering or harvesting), only the cells overlapping the query radius are checked — not every resource. This keeps per-tick queries O(1) regardless of world size.

---

## Gameplay

| Action | Key |
|---|---|
| Move | WASD or Arrow Keys |
| Harvest | E or left-click |

**Survival stats:**
- **Health** — Regenerates when fed and warm. Drops to zero → respawn.
- **Hunger** — Decays constantly. Harvest berries/mushrooms to replenish.
- **Temperature** — Drops at night, recovers during the day.

**Resources:**
| Resource | Drops | HP |
|---|---|---|
| 🌲 Tree | 3× Wood + 1× Berry | 90 |
| 🪨 Rock | 3× Stone | 150 |
| 🫐 Berry bush | 2× Food (auto-consumed) | 30 |
| 🍄 Mushroom | 1× Food (auto-consumed) | 20 |

Food items are auto-consumed on pickup, instantly restoring hunger.

---

## Extending the Game

Some natural next steps:

- **Crafting** — Use wood + stone to make axes (harvest faster) or campfires (restore temperature).
- **Biomes** — Forest, snow, desert zones with different resource distributions and temperature effects.
- **Combat** — Player-to-player damage with weapons crafted from resources.
- **Building** — Place walls and structures using wood/stone (like devast.io).
- **Persistence** — Save player progress to Redis between sessions.
- **Binary protocol** — Replace JSON socket payloads with `flatbuffers` or a custom binary format for lower bandwidth at scale.
- **Spatial partitioning for players** — At high player counts, only broadcast players in VIEW_DISTANCE (currently all players are broadcast to everyone).
