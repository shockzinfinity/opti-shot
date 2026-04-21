# OptiShot — Electron + React + TypeScript

## Project Overview
사진 중복 감지 및 정리 데스크톱 도구. 2-Stage 이미지 해싱(pHash→SSIM)으로 유사/중복 감지, 품질 평가로 베스탈 선별, Soft Delete 안전 정책. 크로스 플랫폼 (macOS/Windows/Linux).

## Architecture
- **Framework**: Electron (Main + Renderer process)
- **IPC**: CQRS 패턴 — CommandBus(25) / QueryBus(18) / EventBus(6)
- **Plugin**: DetectionPlugin 인터페이스 + PluginRegistry (감지 알고리즘 교체 가능)
- **Renderer**: React 19 + TypeScript + Tailwind CSS + Zustand
- **Main**: Node.js + CQRS handlers + Services
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

## Project Structure
```
src/
├── main/              # Electron Main Process
│   ├── cqrs/          # CQRS infrastructure
│   │   ├── commandBus.ts    # Command 실행 (상태 변경)
│   │   ├── queryBus.ts      # Query 실행 (데이터 조회)
│   │   ├── eventBus.ts      # Event 발행 (Main→Renderer)
│   │   ├── ipcBridge.ts     # IPC 진입점 (cqrs:cmd, cqrs:qry) + 이중 검증
│   │   ├── schemas.ts       # Zod 스키마 (payload 검증)
│   │   └── handlers/        # 도메인별 핸들러 (folder, scan, group, organize, ...)
│   ├── services/      # Business logic (변경 없음)
│   ├── engine/        # ScanEngine, BK-Tree, pHash, PluginRegistry
│   │   └── plugins/   # DetectionPlugin 구현체 (phash-ssim 내장)
│   ├── db/            # Drizzle schema + migrations
│   └── index.ts       # Entry point
├── renderer/          # React App (Renderer Process)
│   ├── components/    # Reusable UI components (FolderPicker, ActionBar 등 공통 패턴)
│   ├── pages/         # Route-based pages (7 screens)
│   ├── stores/        # Zustand stores — command/query/subscribe API 사용
│   ├── hooks/         # Custom hooks
│   └── App.tsx
├── shared/            # Types shared between main/renderer
│   ├── types.ts       # 도메인 타입, IpcResponse, ScanRecord
│   ├── constants.ts   # 단일 소스: SCAN_PRESETS, DEFAULT_*_SETTINGS, IMAGE_EXTENSIONS
│   ├── utils.ts       # 공유 포맷 함수 (formatBytes, formatDuration, formatDateTime 등)
│   ├── plugins.ts     # PluginInfo 타입 (UI-safe)
│   └── cqrs/          # CQRS 타입 레지스트리
│       ├── commands.ts  # CommandMap (25 commands)
│       ├── queries.ts   # QueryMap (18 queries)
│       ├── events.ts    # EventMap (6 events)
│       └── bus.ts       # 공통 타입, allowlist 배열
└── preload/           # contextBridge — command/query/subscribe API
    └── index.ts
```

## IPC Communication (CQRS)
```
Renderer                          Main
  │                                │
  ├─ command('scan.start', opts) ──►  CommandBus → notificationMiddleware → handler → Service
  ├─ query('group.list', params) ──►  QueryBus  → handler → Service
  └─ subscribe('scan.progress') ◄──  EventBus  → BrowserWindow.send
```
- Preload: type allowlist 검증 (ALL_COMMAND_TYPES, ALL_QUERY_TYPES, ALL_EVENT_TYPES)
- Main IpcBridge: type allowlist 재검증 + Zod payload 검증
- 알림 미들웨어: CommandBus.execute 래핑, 정책 기반 자동 알림 생성
- 설계 문서: docs/planning/10-cqrs-architecture.md

## Notification System
- 3계층: 로그 파일(영구) + EventBus(실시간) + 인메모리 store(세션)
- 로그: `~/Library/Logs/OptiShot/optishot-YYYY-MM-DD.log` (JSON Lines)
- 읽음 상태: `notification-state.json` (세션 간 유지, 앱 시작 시 초기화)
- CQRS 미들웨어: `notification-policy.ts`에서 명령별 알림 규칙 관리
  - 정책에 등록된 명령만 알림 발생 (미등록 = 사일런트)
  - 새 명령 추가 시 정책만 추가하면 자동 적용
- 비-CQRS 이벤트(스케줄러, updater): `sendNotification()` 직접 호출
- UI: HeaderBar 벨 아이콘 + 배지 + 드롭다운 패널
- 읽음 처리: 패널 닫을 때 전체 읽음 / "모두 읽음" 버튼
- 레벨: info, success, warning, error (LEVEL_BEHAVIOR로 동작 제어)

## Error Handling & Robustness
- ipcBridge: 모든 명령/쿼리를 try/catch → `{ success: false }` 반환 (절대 크래시 안 함)
- abort 에러(스캔 취소): console.error 미출력, 조용히 반환
- 알림 미들웨어: `safeSendNotification()` — 알림 실패가 원래 에러를 가리지 않음
- sendNotification: 로그 쓰기/EventBus emit 각각 try/catch
- 글로벌 핸들러: `uncaughtException` + `unhandledRejection` → 로그만, 앱 유지

## Domain
- 16 resources: specs/domain/resources.yaml
- 7 screens: /, /folders, /scan, /review, /trash, /organize, /settings
- Design system: design/design-system.pen (Pencil)
- Stitch mockups: design/stitch-project.json (project 977412230907375002)

## Design System
- Style: Soft Bento + Electric Cobalt
- Theme: Light/Dark/Auto — CSS 변수 오버라이드 (.dark 클래스), useTheme 훅
- Light: Primary #0062FF, Surface #FFFFFF/#F7F8FA, Text #1A1A1A
- Dark: Primary #4D8EFF, Surface #121317/#1C1D24, Text #E8EAED
- Fonts: Geist (headings), Inter (body), Geist Mono (data)
- Icons: lucide-react
- Stitch HTML can be directly used as React component templates

## EXIF Pre-Scan Filtering
- 4개 필터: 촬영날짜 범위, 카메라 모델, GPS 유/무, 최소 해상도
- Pre-scan 단계에서 32 concurrent 배치로 파일 목록 필터링 (Stage 1 pHash 전)
- FolderSelect 페이지에서 스캔 모드 아래 별도 섹션으로 표시 (설정 ON 시)
- `exifr` 라이브러리 주의사항:
  - `GPSLatitude`는 `number`가 아닌 DMS 배열(`[도, 분, 초]`) 반환 → `!= null`로 체크
  - `latitude`/`longitude` (소수점 변환값)은 `pick`으로 선택 불가 → `exifr.gps()` 별도 호출
- GPS 좌표 추출: `exifr.gps()` → `{ latitude: number, longitude: number }`
- DB 저장: `photos.latitude`, `photos.longitude` (REAL)

## FolderSelect Page Layout
```
1. 스캔 대상 폴더
2. 스캔 모드
3. EXIF 필터 섹션 (설정 ON 시만 표시)
4. 고급 설정 — 활성 플러그인별 파라미터 (플러그인 ON 시만 표시)
5. 액션 바
```
- 고급 설정: 플러그인별 섹션 분리 (PluginSection 컴포넌트)
- 향후 기능(보정 감지, 증분 스캔 등)도 설정 ON 시 별도 섹션으로 추가 예정

## File Organize (/organize)
- 스캔과 독립된 별도 기능 — 폴더 내 이미지 파일명을 촬영일 기준 일괄 변경
- 네이밍 규칙: `YYYY-MM-DD_HHmmss.ext` (충돌 시만 `_001` seq 추가)
- 날짜 소스: EXIF DateTimeOriginal → CreateDate → file birthtime → mtime
- 워크플로우: 폴더 선택 → 미리보기 → 확인 → 실행 → 되돌리기(직전 1회)
- DB: `organize_jobs` + `organize_renames` (최근 1개 job만 유지)
- 되돌리기: DB에 저장된 원래 경로로 renameSync 역실행
- 대시보드: 최근 스캔 아래 최근 정리 카드 표시
- 공통 컴포넌트: FolderPicker(Single/Multi), ActionBar, PageCloseButton

## Performance Targets
- 200K images Stage 1 scan: < 30 minutes
- Worker threads for parallel pHash computation (현재 stub — 순차 실행)
- Virtual lists for large datasets (react-window 적용)

## Current Status
- 핵심 기능 완료 (P0~P5), Export 제거, 알림 시스템/크래시 방어 완료
- 추가: EXIF 필터링, Plugin, HEIC, i18n, 알림(CQRS 미들웨어), 크래시 방어
- 추가: 다크 모드 테마, 파일 정리(일괄 리네임 + 되돌리기)
- 단기 논의 필요: Auto-updater 배포, Incremental Scan
- 중기: Worker Threads (stub), Correction Detection 정리, exifr 최적화
- 테스트: 기능 구현 시 함께 작성 (별도 과제 아님)
- 로드맵 상세: docs/ROADMAP.md

## Safety Rules
- 휴지통 이동 시 원본을 휴지통 디렉토리로 복사 후 원본 삭제 (copy + delete)
- 휴지통에서 복원 가능 (30일 보관 후 영구삭제)
- 원본 파일을 직접 수정(내용 변경)하지 않음 — 이동/삭제만 허용
- 100% local — no cloud, no network calls

## Previous Work (archived at tag `wpf-archive`)
.NET 10 WPF implementation — fully functional backend with 44 tests.
BK-Tree algorithm can be ported from C# to TypeScript.
