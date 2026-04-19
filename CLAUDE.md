# OptiShot — Electron + React + TypeScript

## Project Overview
사진 중복 감지 및 정리 데스크톱 도구. 2-Stage 이미지 해싱(pHash→SSIM)으로 유사/중복 감지, 품질 평가로 베스탈 선별, Soft Delete 안전 정책. 크로스 플랫폼 (macOS/Windows/Linux).

## Architecture
- **Framework**: Electron (Main + Renderer process)
- **Renderer**: React 19 + TypeScript + Tailwind CSS + Zustand
- **Main**: Node.js + IPC handlers + Services
- **Database**: better-sqlite3 + Drizzle ORM
- **Image Processing**: sharp (libvips)
- **Bundler**: Vite
- **Testing**: Vitest + Playwright

## Key Commands
```bash
bun run dev         # Electron + Vite dev server
bun run build       # Production build
bun run test        # Vitest unit tests
bun run test:e2e    # Playwright E2E
bun run build:mac   # .dmg
bun run build:win   # .exe installer
```

## Project Structure (planned)
```
src/
├── main/              # Electron Main Process
│   ├── ipc/           # IPC handlers
│   ├── services/      # Business logic
│   ├── engine/        # ScanEngine, BK-Tree, pHash
│   ├── db/            # Drizzle schema + migrations
│   └── index.ts       # Entry point
├── renderer/          # React App (Renderer Process)
│   ├── components/    # Reusable UI components
│   ├── pages/         # Route-based pages (7 screens)
│   ├── stores/        # Zustand stores
│   ├── hooks/         # Custom hooks
│   └── App.tsx
├── shared/            # Types shared between main/renderer
│   └── types.ts
└── preload/           # contextBridge
    └── index.ts
```

## Domain
- 16 resources: specs/domain/resources.yaml
- 7 screens: specs/screens/*.yaml
- Design system: design/design-system.pen (Pencil)
- Stitch mockups: design/stitch-project.json (project 977412230907375002)

## Design System
- Style: Soft Bento + Electric Cobalt
- Primary: #0062FF, Surface: #F7F8FA, Text: #1A1A1A
- Fonts: Geist (headings), Inter (body), Geist Mono (data)
- Icons: lucide-react
- Stitch HTML can be directly used as React component templates

## Performance Targets
- 200K images Stage 1 scan: < 30 minutes
- Worker threads for parallel pHash computation
- Virtual lists for large datasets

## Safety Rules
- 휴지통 이동 시 원본을 휴지통 디렉토리로 복사 후 원본 삭제 (copy + delete)
- 휴지통에서 복원 가능 (30일 보관 후 영구삭제)
- 원본 파일을 직접 수정(내용 변경)하지 않음 — 이동/삭제만 허용
- 100% local — no cloud, no network calls

## Previous Work (archived at tag `wpf-archive`)
.NET 10 WPF implementation — fully functional backend with 44 tests.
BK-Tree algorithm can be ported from C# to TypeScript.
