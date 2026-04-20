# 03-tech-stack.md: Technology Stack (v2 — Electron Pivot)

## MVP 캡슐 (요구사항 핵심 10줄)

> **목표**: 흩어진 추억을 안전하게 한 곳에 보존  
> **페르소나**: NAS+HDD+스마트폰에 20만+ 장 분산된 IT 개발자  
> **핵심 기능**: F1 중복감지(2-Stage), F2 베스탈 선별(AI추천+사용자확인), F4 내보내기(단순복사)  
> **North Star**: 중복 그룹 발견율 95%+ / 오탐율 5% 미만  
> **제약**: 20만 장 전체 스캔 30분 이내, 폴더별/기간별 선택 스캔, 증분 스캔  
> **v2 변경**: .NET WPF → Electron (크로스 플랫폼, macOS 개발 가능)  
> **다음 단계**: `/screen-spec`으로 화면 명세 생성 (재활용 가능)

---

## 1. 플랫폼 & 런타임

### 1.1 Electron + Node.js

**선택 이유**

| 측면 | 이유 |
|------|------|
| **크로스 플랫폼** | macOS, Windows, Linux 모두 지원 (개발+배포) |
| **개발 효율** | macOS에서 개발/테스트 가능 (WPF는 불가능했음) |
| **UI 생태계** | React + Tailwind — Stitch 디자인 HTML 직접 활용 가능 |
| **네이티브 접근** | Node.js 네이티브 모듈로 파일 시스템/이미지 처리 가능 |
| **배포** | electron-builder로 모든 OS 설치 파일 생성 |

**WPF에서 피봇한 이유**

| 문제 | 영향 |
|------|------|
| Windows 전용 | macOS에서 개발/테스트 불가 (EnableWindowsTargeting은 컴파일만 가능) |
| XAML 변환 비용 | Stitch가 생성한 HTML/Tailwind를 XAML로 변환해야 함 |
| OpenCvSharp4 바인딩 | Windows 전용 네이티브 라이브러리 |

---

## 2. 프론트엔드 (Renderer Process)

### 2.1 React 19 + TypeScript

| 측면 | 이유 |
|------|------|
| **Stitch 활용** | Stitch가 생성한 HTML/Tailwind 코드 직접 사용 가능 |
| **컴포넌트 기반** | Pencil 디자인 시스템 컴포넌트와 1:1 매핑 |
| **상태 관리** | Zustand — 경량, DevTools 지원 |
| **스타일** | Tailwind CSS — Stitch 생성 코드와 동일 |

### 2.2 상태 관리: Zustand

```typescript
// store/scan.ts
interface ScanState {
  status: ScanStatus;
  progress: number;
  discoveries: ScanDiscovery[];
  startScan: () => Promise<void>;
  pauseScan: () => void;
}
```

**대안 검토**

| 기술 | 장점 | 단점 | 선택 |
|------|------|------|------|
| Zustand | 경량, 직관적 | - | ✅ |
| Redux Toolkit | 성숙, DevTools | 보일러플레이트 | ❌ |
| Jotai | 원자적 상태 | 복잡한 흐름에 약함 | ❌ |

---

## 3. 백엔드 (Main Process)

### 3.1 Electron Main Process + CQRS

```
Renderer (React)  ←─ CQRS ─→  Main (Node.js)
  command/query                  CommandBus / QueryBus
  subscribe                      EventBus
  Zustand stores                 Services → DB/FS
```

### 3.2 CQRS 통신 패턴

42개 개별 `ipcMain.handle` 채널 → 3개 버스로 통합:

```typescript
// main/cqrs/handlers/scan.ts — 핸들러 등록
cmd.register('scan.start', async (input) => {
  const db = getDb()
  return await startScan(db, input, (progress) => {
    evt.publish('scan.progress', progress)  // EventBus로 진행률 발행
  })
})

// renderer/stores/scan.ts — 사용
const response = await window.electron.command('scan.start', options)
//                                      ^^^^^^^ 자동 완성 + 타입 체크

const unsubscribe = window.electron.subscribe('scan.progress', (progress) => {
  // progress: ScanProgress로 자동 추론
})
```

**IPC 보안 — 이중 검증**:
1. Preload: `ALLOWED_COMMANDS/QUERIES/EVENTS` Set으로 type 필터링
2. Main IpcBridge: type allowlist 재검증 + Zod payload 스키마 검증
3. Handler 내부: 비즈니스 로직 검증

**분류 (총 42개)**:
- Commands (21): 상태 변경 — folder.add, scan.start, trash.move, settings.save, ...
- Queries (16): 데이터 조회 — folder.list, group.detail, photo.thumbnail, stats.dashboard, ...
- Events (5): Main→Renderer 알림 — scan.progress, export.progress, updater.*, ...

> 상세 설계: `docs/planning/10-cqrs-architecture.md`

---

## 4. 이미지 처리

### 4.1 sharp (libvips 기반)

| 측면 | 이유 |
|------|------|
| **크로스 플랫폼** | macOS, Windows, Linux 모두 지원 |
| **고성능** | libvips — OpenCV에 버금가는 속도 |
| **썸네일** | 빠른 리사이즈/크롭 |
| **메타데이터** | EXIF 읽기 내장 |

### 4.2 pHash 구현: phash-image 또는 커스텀

```typescript
// Stage 1: pHash 계산
import sharp from 'sharp';

async function computePHash(imagePath: string): Promise<bigint> {
  const pixels = await sharp(imagePath)
    .resize(32, 32, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  // DCT + 중앙값 비교 → 64bit hash
  return dctHash(pixels);
}

function hammingDistance(h1: bigint, h2: bigint): number {
  let xor = h1 ^ h2;
  let count = 0;
  while (xor) { count += Number(xor & 1n); xor >>= 1n; }
  return count;
}
```

### 4.3 BK-Tree: TypeScript 포팅

WPF 버전의 순수 C# BK-Tree를 TypeScript로 1:1 포팅:

```typescript
class BKTree {
  private root: BKNode | null = null;
  
  add(photoId: string, hash: bigint): void { ... }
  findSimilar(hash: bigint, threshold: number): Match[] { ... }
}
```

### 4.4 SSIM: sharp 기반

```typescript
async function computeSsim(path1: string, path2: string): Promise<number> {
  // sharp로 동일 크기 리사이즈 → 픽셀 비교
  // 구조적 유사도 계산
}
```

**대안 검토**

| 라이브러리 | 장점 | 단점 | 선택 |
|-----------|------|------|------|
| sharp | 크로스 플랫폼, 고성능 | pHash 직접 구현 필요 | ✅ |
| opencv4nodejs | OpenCV 바인딩 | 설치 복잡, deprecated | ❌ |
| Jimp | 순수 JS | 느림 | ❌ |
| WASM (OpenCV.js) | 브라우저 호환 | 메모리 제한 | △ (v2) |

---

## 5. 데이터베이스

### 5.1 better-sqlite3 + Drizzle ORM

| 측면 | 이유 |
|------|------|
| **better-sqlite3** | 동기 API, Node.js 최고 성능 SQLite 바인딩 |
| **Drizzle ORM** | 타입 안전, 경량, SQL에 가까운 API |
| **로컬 처리** | 파일 기반, 클라우드 전송 없음 |
| **증분 스캔** | 이전 결과 조회 효율적 |

```typescript
// db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  path: text('path').notNull(),
  fileSize: integer('file_size').notNull(),
  qualityScore: real('quality_score'),
  phash: text('phash'),
  isMaster: integer('is_master', { mode: 'boolean' }),
  groupId: text('group_id').references(() => photoGroups.id),
  thumbnailPath: text('thumbnail_path'),
});
```

---

## 6. 메타데이터 추출

### 6.1 exifr

| 측면 | 이유 |
|------|------|
| **순수 JS** | 네이티브 의존 없음 |
| **고성능** | 필요한 태그만 파싱 |
| **EXIF + XMP** | 촬영 시각, 카메라, GPS 완벽 지원 |

```typescript
import exifr from 'exifr';
const metadata = await exifr.parse(imagePath, ['DateTimeOriginal', 'Make', 'Model', 'LensModel']);
```

---

## 7. 아키텍처 다이어그램

```
┌─────────────────────────────────────────────┐
│     Renderer Process (React + Tailwind)     │
│  ┌───────────┬────────────┬────────────┐   │
│  │ Dashboard │ FolderSelect│ ScanProgress│   │
│  │ GroupReview│ Export     │ Settings   │   │
│  └───────────┴────────────┴────────────┘   │
│  Zustand stores: command/query/subscribe   │
└──────────────────┬──────────────────────────┘
                   │ contextBridge (CQRS API)
              ┌────┼────┐
         cqrs:cmd  cqrs:qry  cqrs:evt:*
              │    │    │
┌─────────────▼────▼────▼─────────────────────┐
│         Main Process (Node.js)              │
│  ┌────────────────────────────────────┐    │
│  │ CQRS Buses                         │    │
│  │ ├─ CommandBus (21 commands)       │    │
│  │ ├─ QueryBus   (16 queries)        │    │
│  │ └─ EventBus   (5 events)          │    │
│  ├─ IpcBridge: allowlist + Zod 검증   │    │
│  └────────────────────────────────────┘    │
│  ┌────────────────────────────────────┐    │
│  │ Services (변경 없음)                │    │
│  │ ├─ ScanEngine (pHash + BK-Tree)   │    │
│  │ ├─ ScanService (orchestrator)     │    │
│  │ ├─ GroupService                    │    │
│  │ ├─ ExportService                  │    │
│  │ └─ TrashService                   │    │
│  └────────────────────────────────────┘    │
│  ┌────────────────────────────────────┐    │
│  │ Data                               │    │
│  │ ├─ better-sqlite3 + Drizzle ORM   │    │
│  │ ├─ sharp (image processing)       │    │
│  │ └─ exifr (metadata)               │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## 8. 의존성 목록

### Production

| 패키지 | 목적 |
|--------|------|
| electron | 데스크톱 앱 프레임워크 |
| react + react-dom | UI 프레임워크 |
| tailwindcss | 스타일링 (Stitch 호환) |
| zustand | 상태 관리 |
| sharp | 이미지 처리 (pHash, 썸네일, SSIM) |
| better-sqlite3 | SQLite 바인딩 |
| drizzle-orm | 타입 안전 ORM |
| exifr | EXIF/XMP 메타데이터 |
| lucide-react | 아이콘 (디자인 시스템 호환) |

### Development

| 패키지 | 목적 |
|--------|------|
| typescript | 타입 안전 |
| vite | 번들러 (fast HMR) |
| electron-builder | 패키징/배포 |
| vitest | 테스트 러너 |
| @testing-library/react | 컴포넌트 테스트 |
| playwright | E2E 테스트 |

---

## 9. 개발 환경 & 배포

### 9.1 개발

```bash
# 개발 서버 (HMR)
npm run dev        # Vite + Electron

# 테스트
npm run test       # Vitest
npm run test:e2e   # Playwright
```

### 9.2 배포

```bash
# macOS
npm run build:mac   # .dmg

# Windows
npm run build:win   # .exe (NSIS installer)

# Linux
npm run build:linux # .AppImage, .deb
```

---

## 10. WPF 대비 트레이드오프

| 영역 | WPF (v1) | Electron (v2) | 판단 |
|------|----------|---------------|------|
| 성능 | C# JIT 최적화 | Node.js + sharp (libvips) | sharp도 충분히 빠름 |
| 메모리 | ~100MB | ~200MB (Chromium 오버헤드) | 수용 가능 |
| 시작 시간 | ~1초 | ~2-3초 | 수용 가능 |
| UI 품질 | XAML (제한적) | HTML/CSS (무한) | Electron 우위 |
| 개발 속도 | 느림 (XAML+C#) | 빠름 (React+HMR) | Electron 압도적 우위 |
| 네이티브 느낌 | Windows 네이티브 | 웹 기반 (커스텀) | 트레이드오프 |
| 파일 크기 | ~30MB | ~150MB (Chromium) | 수용 가능 |
