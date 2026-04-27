<p align="center">
  <img src="resources/icon.png" alt="OptiShot" width="128" height="128" />
</p>

<h1 align="center">OptiShot</h1>

<p align="center">
  <strong>내 사진을 내 규칙으로, 안전하게 정리하는 로컬 데스크톱 도구</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-888" alt="Platform" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## Why OptiShot?

스마트폰, NAS, 외장 하드, 클라우드 백업... 수년간 쌓인 사진은 어느새 수만~수십만 장.
같은 사진이 여러 곳에 복제되고, 보정본과 원본이 뒤섞이며, 어떤 것이 가장 좋은 버전인지 알 수 없게 됩니다.

**OptiShot**은 이 문제를 해결합니다.

- **2단계 이미지 해싱**으로 육안으로 구분 어려운 유사/중복 사진까지 감지
- **품질 평가 알고리즘**으로 가장 선명한 버전을 자동 추천
- **파일 정리** — 촬영 날짜 기준으로 파일명을 일괄 변경하고, 되돌리기도 가능
- **100% 로컬 처리** — 사진이 절대 외부 서버로 전송되지 않습니다
- **Soft Delete 안전 정책** — 원본 파일을 직접 삭제하지 않으며, 30일간 복원 가능

---

## Key Features

### Duplicate Detection (2-Stage Algorithm Architecture)

**HashAlgorithm**(Stage 1)과 **VerifyAlgorithm**(Stage 2) 인터페이스로 분리된 2-Stage 파이프라인입니다.
각 단계에 복수의 알고리즘을 자유롭게 조합할 수 있고, 프리셋으로 빠르게 시작할 수 있습니다.

| Stage | Algorithms | Purpose |
|-------|------------|---------|
| **Stage 1 (HashAlgorithm)** | pHash, dHash | 64-bit 해시 + BK-Tree로 후보 그룹 빠르게 도출 (O(log N) 근방 탐색) |
| **Stage 2 (VerifyAlgorithm)** | SSIM, NMSE | 후보 쌍에 대해서만 픽셀 단위 정밀 비교, 오탐 제거 |

- **그룹 병합 전략**: 복수 Stage 1 결과를 Union(합집합) 또는 Intersection(교집합)으로 병합 — Union-Find 자료구조
- **Stage 2 순차 파이프라인**: 복수 검증 알고리즘은 순차 적용 (모두 통과해야 그룹에 잔류)
- **프리셋 4종**: 균형 / 빠른 / 보수적 / 정밀 + 사용자 정의
- **AlgorithmRegistry**: 내장 알고리즘 외 향후 동적 등록 확장 예정

### Quality Scoring

중복 그룹 내에서 **가장 좋은 버전(Best)**을 자동 선별합니다.

- **해상도** — 픽셀 수가 클수록 정보량 우위
- **파일 크기** — 같은 해상도에서 클수록 압축률↓ (원본 품질 보존 우위)
- **EXIF 메타데이터** — 카메라/촬영 설정 보존 여부 가점
- **포맷 우선순위** — RAW > 무손실 > JPEG 압축본
- *(향후)* 선명도(sharpness) 추정, 노출/포커스 점수, 얼굴 보존 우선순위

### About OptiShot (인앱 기술 가이드)

설정 → 정보 탭의 **About OptiShot** 버튼으로 진입하는 풀스크린 기술 가이드입니다 (10개 섹션).
앱의 동작 원리, 알고리즘, 임계값 튜닝, 안전 정책을 좌측 사이드 네비 + 우측 본문 스크롤 형태로 제공합니다.
콘텐츠 데이터(`src/renderer/content/about/`)는 다국어 확장이 가능한 구조이며, 현재는 한국어 본문을 제공합니다.

### File Organizer

촬영 날짜 기준으로 파일명을 일괄 변경합니다.

- 네이밍 규칙: `YYYY-MM-DD_HHmmss.ext` (충돌 시만 `_001` seq 추가)
- 날짜 소스: EXIF DateTimeOriginal > CreateDate > 파일 생성일 > 수정일
- 미리보기에서 변경 전/후를 확인하고 실행
- 되돌리기 지원 (직전 1회, DB 저장)
- 설정에서 정리 이력 초기화 가능

### EXIF Pre-Scan Filtering

수십만 장의 사진을 스캔하기 전에, EXIF 메타데이터로 **대상 파일을 사전 필터링**합니다.

| Filter | Description |
|--------|-------------|
| 촬영 날짜 범위 | 특정 기간의 사진만 스캔 |
| 카메라 모델 | 특정 카메라로 촬영한 사진만 포함 |
| GPS 유/무 | 위치 정보 포함/미포함 사진 선택 |
| 최소 해상도 | 일정 크기 이하 이미지 제외 |

### Dark Mode

Light / Dark / Auto 3가지 테마를 지원합니다. Auto 모드는 시스템 설정을 따릅니다.

### Notification System

3계층 알림 아키텍처로 앱 내 활동을 추적합니다.

- 로그 파일 (영구, JSON Lines)
- EventBus (실시간 UI 알림)
- 인메모리 store (세션)
- CQRS 미들웨어 정책: 명령별 알림 규칙 자동 적용

### Safety First

사진은 되돌릴 수 없는 소중한 자산입니다. OptiShot은 **안전을 최우선**으로 설계되었습니다.

- 원본 파일을 직접 수정하거나 삭제하지 않음
- Soft Delete: 휴지통으로 이동 (복사 후 삭제)
- 30일 보관 후 영구 삭제 (자동 정리 스케줄러)
- 글로벌 에러 핸들러 — 에러가 앱 크래시로 이어지지 않음
- 100% 로컬 — 네트워크 호출 없음, 클라우드 전송 없음

---

## Screenshots

> *Coming soon*

---

## How It Works

```
┌────────────────────────────────────────────────────────────┐
│                      OptiShot Pipeline                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. Folder Selection                                       │
│     └─ 스캔 대상 폴더 선택 (다중, 하위폴더 포함 옵션)         │
│                                                            │
│  2. EXIF Pre-Filter (Optional)                             │
│     └─ 날짜/카메라/GPS/해상도로 대상 파일 사전 축소            │
│                                                            │
│  3. Stage 1: HashAlgorithm (pHash, dHash)                  │
│     └─ Worker Thread Pool에서 병렬 해시 계산                │
│     └─ BK-Tree 인덱싱 → Hamming 거리 근방 탐색              │
│     └─ Union-Find로 복수 알고리즘 결과 Union/Intersection   │
│                                                            │
│  4. Stage 2: VerifyAlgorithm (SSIM, NMSE)                  │
│     └─ 후보 쌍에 대해서만 픽셀 단위 정밀 비교                │
│     └─ 복수 알고리즘은 순차 적용, 모두 통과해야 잔류          │
│                                                            │
│  5. Quality Scoring                                        │
│     └─ 해상도 + 파일크기 + EXIF + 포맷 가중 합산            │
│     └─ 그룹 내 Best (최적 버전) 자동 선정                   │
│                                                            │
│  6. Group Review                                           │
│     └─ Side-by-side 비교, EXIF 상세, 대표 사진 선택          │
│     └─ 사용자 최종 판정 (Keep All / Delete Duplicates)       │
│                                                            │
│  7. Cleanup                                                │
│     └─ Soft Delete → 30일 보관 → 자동 정리 스케줄러          │
│                                                            │
│  + File Organizer (독립 기능)                               │
│     └─ 촬영일 기준 일괄 리네임 + 되돌리기                     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Supported Formats

| Category | Extensions |
|----------|-----------|
| Standard | `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.gif` |
| RAW-adjacent | `.tiff`, `.tif` |
| Apple | `.heic`, `.heif` (자동 변환 + 캐싱) |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| 200K images full scan | < 30 minutes |
| 1K images Stage 1 (pHash) | < 10 seconds |
| 100 groups Stage 2 (SSIM) | < 5 seconds |
| Detection rate | 95%+ |
| False positive rate | < 5% |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Bun](https://bun.sh/) >= 1.3

### Installation

```bash
# Clone the repository
git clone https://github.com/shockzinfinity/opti-shot.git
cd opti-shot

# Install dependencies
bun install

# Start development server
bun run dev
```

### Build

```bash
# macOS (.dmg)
bun run build:mac

# Windows (.exe installer)
bun run build:win

# Linux (.AppImage)
bun run build:linux
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Electron + Vite dev server (HMR) |
| `bun run build` | Production build |
| `bun run test` | Unit tests (Vitest) |
| `bun run test:watch` | Unit tests in watch mode |
| `bun run test:e2e` | E2E tests (Playwright) |
| `bun run lint` | ESLint |
| `bun run build:mac` | Build .dmg |
| `bun run build:win` | Build .exe installer |
| `bun run build:linux` | Build AppImage |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Electron 41 (Node 22) | Cross-platform desktop |
| **Frontend** | React 19 + TypeScript 6 | UI framework |
| **Styling** | Tailwind CSS 4 | Utility-first CSS + dark mode |
| **State** | Zustand | Lightweight state management |
| **Database** | better-sqlite3 + Drizzle ORM | Embedded SQL with type-safe ORM (8 tables) |
| **Image** | sharp (libvips) | pHash, SSIM, thumbnails, HEIC conversion |
| **EXIF** | exifr | Metadata extraction (GPS, camera, date) |
| **Build** | Vite 7 + electron-vite | Fast HMR + production bundling |
| **Package** | electron-builder | Cross-platform installers + auto-update |
| **Test** | Vitest + Playwright | Unit (190 tests) + E2E (6 tests, macOS) |
| **i18n** | Custom (ko/en/ja) | 3-language UI labels |
| **Update** | GitHub Releases (직접) | net.request → ~/Downloads, 수동 설치 |

---

## Architecture

### IPC: CQRS Pattern

개별 IPC 채널 대신, **3개의 타입 안전한 버스**로 통신합니다.

```
Renderer (React)                          Main (Node.js)
  │                                         │
  ├── command('scan.start', opts) ────────► CommandBus (25) → notificationMiddleware → Handler → Service
  ├── query('group.list', params) ────────► QueryBus   (17) → Handler → Service
  └── subscribe('scan.progress')  ◄──────── EventBus    (6) → BrowserWindow.send
```

**이중 검증 보안:**
1. **Preload**: Type allowlist 검증 (허용된 command/query/event만 통과)
2. **Main IpcBridge**: Zod 스키마로 payload 구조 검증

### Screens

| Route | Screen | Description |
|-------|--------|-------------|
| `/` | Dashboard | 통계, 최근 스캔/정리, 빠른 실행 |
| `/folders` | Folder Select | 스캔 대상 폴더 + 모드 + 필터 + 고급 설정 |
| `/scan` | Scan Progress | 실시간 진행률 + 발견 그룹 |
| `/review` | Group Review | Side-by-side 비교 + 판정 |
| `/trash` | Trash | 30일 보관 + 복원/영구삭제 |
| `/organize` | File Organizer | 촬영일 기반 일괄 리네임 + 되돌리기 |
| `/settings` | Settings | 스캔/UI/데이터 설정 (4탭) |

### Security

| Feature | Status |
|---------|--------|
| `contextIsolation` | `true` — Renderer에서 Node.js API 접근 차단 |
| `nodeIntegration` | `false` — 원격 코드 실행 방지 |
| `sandbox` | `true` — Renderer 샌드박스 격리 |
| Navigation guard | 외부 URL 이동 차단 |
| Preload | `contextBridge`를 통한 선택적 API 노출 |

### Project Structure

```
src/
├── main/                # Electron Main Process
│   ├── cqrs/            # CQRS infrastructure
│   │   ├── commandBus.ts                # 25 commands (state changes)
│   │   ├── queryBus.ts                  # 17 queries (data reads)
│   │   ├── eventBus.ts                  # 6 events (Main→Renderer push)
│   │   ├── ipcBridge.ts                 # IPC entry (dual validation)
│   │   ├── schemas.ts                   # Zod payload schemas
│   │   ├── notificationMiddleware.ts    # Auto-notification via policy
│   │   └── handlers/                    # Domain handlers per resource
│   ├── db/              # Drizzle schema (8 tables) & migrations
│   ├── engine/          # ScanEngine, BK-Tree, AlgorithmRegistry
│   │   ├── algorithms/  # HashAlgorithm (pHash, dHash) + VerifyAlgorithm (SSIM, NMSE)
│   │   ├── hash-worker.ts        # Worker thread entrypoint
│   │   └── hash-worker-pool.ts   # Round-robin dispatch + abort propagation
│   ├── services/        # Business logic (scan, organize, trash, notification, updater, ...)
│   └── scheduler/       # Trash cleanup scheduler
├── renderer/            # React App (Renderer Process)
│   ├── components/      # Reusable UI (FolderPicker, ActionBar, AboutOptiShotModal, ...)
│   ├── content/about/   # About OptiShot 콘텐츠 데이터 (ko.ts + types.ts + index.ts)
│   ├── pages/           # 7 route-based screens
│   ├── stores/          # Zustand stores
│   ├── hooks/           # Custom hooks (useTheme, useTranslation, ...)
│   └── i18n/            # ko, en, ja UI label translations
├── shared/              # Types shared between processes
│   ├── types.ts         # Domain types
│   ├── constants.ts     # Single-source constants (SCAN_PRESETS, DEFAULT_*_SETTINGS)
│   ├── utils.ts         # Shared format functions
│   └── cqrs/            # Type registries (CommandMap, QueryMap, EventMap)
└── preload/             # contextBridge API

e2e/                     # Playwright Electron tests (macOS, 6 critical paths)
```

---

## Algorithms Deep Dive

> 더 자세한 설명과 임계값 튜닝 가이드는 앱 내 **About OptiShot** 모달(설정 → 정보 탭)을 참고하세요.

### Stage 1 — HashAlgorithm

**pHash (Perceptual Hash)**
```
Input → Grayscale → Resize 32x32 → DCT → Top-left 8x8 → Median → 64-bit Hash
```
DCT(이산 코사인 변환) 저주파 영역 기반. 색상·밝기·약한 압축 변화에 강건.

**dHash (Difference Hash)**
```
Input → Grayscale → Resize 9x8 → Adjacent pixel diff (sign) → 64-bit Hash
```
그래디언트 기반. 회전·왜곡에 더 민감하지만 계산이 매우 빠름.

### BK-Tree (Burkhard-Keller Tree)

- 메트릭 공간 범위 검색 트리, Hamming 거리 기반 근방 탐색
- 삽입/검색 O(log N) 평균
- Stage 1 결과를 BK-Tree에 인덱싱한 뒤 임계값 이내 후보를 효율적으로 추출

### Union-Find (그룹 병합)

복수 해시 알고리즘이 만든 후보 쌍을 하나의 그룹으로 합칠 때 서로소 집합 자료구조 사용:
- **Union 전략**: 어느 알고리즘이든 묶이면 동일 그룹 (회수율↑)
- **Intersection 전략**: 모든 알고리즘이 동의해야 묶임 (정확도↑)

### Stage 2 — VerifyAlgorithm

**SSIM (Structural Similarity Index)**
```
SSIM(x, y) = [l(x,y)]^α · [c(x,y)]^β · [s(x,y)]^γ
  l = luminance, c = contrast, s = structure
```
인간 시각 인지 모델 기반. 256×256 그레이스케일 비교.

**NMSE (Normalized Mean Squared Error)**
```
NMSE = mean((x - y)²) / normalization
```
픽셀 단위 차이 제곱 평균을 정규화. SSIM보다 보수적이며 미세 차이까지 분리.

복수 검증 알고리즘은 **순차 파이프라인**으로 모두 통과해야 그룹에 잔류 (예: 정밀 프리셋 = SSIM → NMSE).

### Quality Score (Best 선별)

```
Score = w1 × Resolution + w2 × FileSize + w3 × MetadataBonus + w4 × FormatPriority
```

- **Resolution**: 픽셀 수 (가로 × 세로)
- **FileSize**: 같은 해상도일수록 압축률↓, 즉 화질 손실↓
- **MetadataBonus**: EXIF(카메라/촬영 설정) 보존 여부 가점 — 원본 가능성 시그널
- **FormatPriority**: RAW(HEIC/HEIF) > 무손실 > JPEG 압축본
- *(향후)* 선명도(sharpness, Laplacian variance), 노출/포커스 점수, 얼굴 보존

---

## Design System

| Token | Light | Dark |
|-------|-------|------|
| Primary | `#0062FF` | `#4D8EFF` |
| Surface | `#FFFFFF` / `#F7F8FA` | `#121317` / `#1C1D24` |
| Text | `#1A1A1A` | `#E8EAED` |
| Heading Font | Geist (600+) | |
| Body Font | Inter (400-500) | |
| Mono Font | Geist Mono | |
| Icons | lucide-react | |
| Style | Soft Bento + Electric Cobalt | |

---

## Internationalization

3개 언어를 기본 지원합니다.

| Language | Code | Status |
|----------|------|--------|
| 한국어 | `ko` | Default |
| English | `en` | Complete |
| 日本語 | `ja` | Complete |

설정 페이지에서 실시간 전환 가능.

---

## Roadmap

핵심 기능 + 알고리즘 아키텍처 + 인앱 기술 가이드 + E2E 인프라까지 완료된 상태입니다 (v0.4.0).

| Phase | Feature | Status |
|-------|---------|--------|
| v0.2~v0.3 | Auto-updater (GitHub Releases 직접 다운로드) | ✅ 완료 |
| v0.2~v0.3 | 알고리즘 아키텍처 재설계 (HashAlgorithm/VerifyAlgorithm) + 프리셋 | ✅ 완료 |
| v0.2~v0.3 | Worker Threads 병렬 해시 (HashWorkerPool) | ✅ 완료 |
| v0.2~v0.3 | dHash + NMSE 추가 | ✅ 완료 |
| v0.2~v0.3 | 그룹 병합 (Union/Intersection, Union-Find) | ✅ 완료 |
| v0.2~v0.3 | GitHub Actions CI/CD (release.yml, 3-OS 매트릭스) | ✅ 완료 |
| **v0.4** | **About OptiShot 인앱 기술 가이드** | ✅ 완료 |
| **v0.4** | **Playwright Electron E2E (macOS, 6 critical paths)** | ✅ 완료 |
| v0.5+ | 다중 회전 해시 (Stage 1 확장) | 기획 |
| v0.5+ | About 본문 영어/일본어 번역 | 기획 |
| v0.5+ | 코드 서명 (Apple notarization, Windows signing) | 미구현 |
| v0.5+ | E2E 확장 (스캔/그룹 휴지통 플로우) | 픽스처 셋업 후 |
| v0.6+ | ORB 특징점 매칭 / 딥러닝 임베딩(CLIP/Gemma 4 E2B) | 기획 |
| v0.6+ | 지도 기반 위치 필터링 / EXIF 편집 | 아이디어 |

상세 로드맵: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## Contributing

```bash
# Fork & Clone
git clone https://github.com/YOUR_USERNAME/opti-shot.git
cd opti-shot

# Install
bun install

# Development
bun run dev

# Run tests before PR
bun run test
bun run lint
```

---

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with Electron, React, and sharp. 100% local, zero cloud.</sub>
</p>
