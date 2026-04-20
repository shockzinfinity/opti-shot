# OptiShot

Photo duplicate detection and cleanup desktop app.

2-stage image hashing (pHash + SSIM) finds similar and duplicate photos, quality scoring selects the best version, and soft delete keeps originals safe. 100% local — no cloud, no network calls.

## Tech Stack

- **Runtime**: Electron 41 (Node 22)
- **Frontend**: React 19, TypeScript 6, Tailwind CSS 4, Zustand
- **Backend**: better-sqlite3 + Drizzle ORM, sharp (libvips)
- **Build**: Vite 7, electron-vite, electron-builder
- **Test**: Vitest, Playwright

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Bun](https://bun.sh/) >= 1.3

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server
bun run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Electron + Vite dev server |
| `bun run build` | Production build |
| `bun run test` | Unit tests (Vitest) |
| `bun run test:watch` | Unit tests in watch mode |
| `bun run test:e2e` | E2E tests (Playwright) |
| `bun run lint` | ESLint |
| `bun run build:mac` | Build .dmg |
| `bun run build:win` | Build .exe installer |
| `bun run build:linux` | Build AppImage |

## Architecture

IPC 통신은 CQRS 패턴으로 구성 — 42개 개별 채널 대신 3개 버스(CommandBus, QueryBus, EventBus)를 통해 통신합니다.

```
Renderer (React)                        Main (Node.js)
  command('scan.start', opts) ──────►  CommandBus → Service
  query('group.list', params) ──────►  QueryBus  → Service
  subscribe('scan.progress')  ◄──────  EventBus  → broadcast
```

## Project Structure

```
src/
├── main/                # Electron Main Process
│   ├── cqrs/            # CQRS infrastructure
│   │   ├── commandBus.ts    # 21 commands (state changes)
│   │   ├── queryBus.ts      # 16 queries (data reads)
│   │   ├── eventBus.ts      # 5 events (Main→Renderer push)
│   │   ├── ipcBridge.ts     # IPC entry (dual validation: allowlist + Zod)
│   │   ├── schemas.ts       # Zod payload schemas
│   │   └── handlers/        # Domain handlers (folder, scan, group, ...)
│   ├── db/              # Drizzle schema & migrations
│   ├── engine/          # BK-Tree, pHash, SSIM, quality scoring
│   └── services/        # Business logic
├── renderer/            # React App (Renderer Process)
│   ├── components/      # UI components
│   ├── pages/           # 7 route-based screens
│   ├── stores/          # Zustand stores (command/query/subscribe)
│   ├── hooks/           # Custom hooks
│   └── i18n/            # ko, en, ja
├── shared/              # Types shared between processes
│   ├── types.ts         # Domain types, IpcResponse
│   └── cqrs/            # CommandMap, QueryMap, EventMap type registries
└── preload/             # contextBridge — command/query/subscribe API
```

## How It Works

1. **Folder Select** — Choose directories to scan
2. **Stage 1: pHash** — Fast perceptual hashing with BK-Tree indexing
3. **Stage 2: SSIM** — Structural similarity on pHash candidates
4. **Group Review** — Side-by-side comparison with quality scores
5. **Soft Delete** — Move to trash (30-day retention), never delete originals

## Safety

- Original files are never modified or deleted directly
- Soft delete only, with 30-day trash retention
- All processing runs locally on your machine

## License

MIT
