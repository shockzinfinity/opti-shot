# OptiShot 감지 플러그인 개발 가이드

**작성일**: 2026-04-20
**대상**: OptiShot에 새로운 중복 감지 알고리즘을 추가하려는 개발자
**현재 버전**: v0.2 (내장 플러그인 전용)

---

## 1. 아키텍처 개요

OptiShot의 감지 파이프라인은 **Strategy Pattern + Constructor Injection** 구조입니다.

```
PluginRegistry (싱글턴)
    │
    ├── phash-ssim (내장)
    ├── dhash-mse (추가 예시)
    └── ...
         │
         ▼
    ScanEngine(plugin: DetectionPlugin)
         │
         ├── Stage 1: plugin.computeHash() → BK-Tree(plugin.computeDistance)
         ├── Stage 2: plugin.verify?.() (선택)
         └── Quality Scoring (플러그인 독립, 항상 실행)
```

**핵심 원칙**:
- `ScanEngine`은 `DetectionPlugin` 인터페이스만 의존 — 구체 구현을 모름
- `groupByDistance()`는 `distanceFn`을 외부에서 주입받음
- 품질 평가(Laplacian variance)는 플러그인과 무관하게 항상 실행됨

---

## 2. DetectionPlugin 인터페이스

```typescript
// src/main/engine/plugin-registry.ts

interface DetectionPlugin {
  // --- 메타데이터 ---
  readonly id: string              // 고유 식별자 (kebab-case, e.g. 'dhash-mse')
  readonly name: string            // 표시 이름 (e.g. 'dHash + MSE')
  readonly description: string     // 한 줄 요약 (Settings 카드에 표시)
  readonly detailDescription: string // 상세 설명 (? 버튼 hover 시 tooltip)
  readonly version: string         // semver (e.g. '1.0.0')
  readonly builtIn: boolean        // 내장 플러그인이면 true

  // --- Stage 1 (필수) ---
  computeHash(imagePath: string): Promise<string>
  computeDistance(hash1: string, hash2: string): number
  readonly defaultHashThreshold: number

  // --- Stage 2 (선택) ---
  verify?(imagePaths: string[], threshold: number): Promise<string[][]>
  readonly defaultVerifyThreshold?: number
}
```

### 2.1 각 필드 상세

#### `id` (필수)
- 형식: `kebab-case`, 영문 소문자 + 하이픈
- 고유해야 함 — 중복 등록 시 덮어씌워짐
- Settings에 `enabledPlugins` 키로 저장됨
- 예: `'phash-ssim'`, `'dhash-mse'`, `'orb-bf'`

#### `computeHash(imagePath)` (필수)
- 입력: 절대 경로 문자열
- 출력: 해시 문자열 (형식 자유, 단 `computeDistance`와 호환 필수)
- 비동기 — 이미지 로딩/처리에 `sharp` 사용 권장
- HEIC 지원: `sharpFromPath()` 헬퍼 사용 (`src/main/engine/heic.ts`)

```typescript
import { sharpFromPath } from '../heic'

async function computeMyHash(imagePath: string): Promise<string> {
  const sharp = sharpFromPath(imagePath)
  const { data } = await sharp
    .resize(32, 32, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // ... 해시 알고리즘 적용
  return hashString
}
```

#### `computeDistance(hash1, hash2)` (필수)
- 입력: `computeHash`가 반환한 해시 문자열 2개
- 출력: 음이 아닌 정수 또는 실수 (거리)
- **메트릭 공간 조건 충족 필수** (BK-Tree가 삼각 부등식에 의존):
  - `d(a, a) = 0`
  - `d(a, b) = d(b, a)`
  - `d(a, c) <= d(a, b) + d(b, c)`
- 동기 함수 — 빠르게 실행되어야 함 (N² 호출 가능)

#### `defaultHashThreshold` (필수)
- Stage 1 그룹화에서 사용하는 기본 거리 임계값
- 사용자가 Settings의 프리셋이나 AdvancedSettings에서 오버라이드 가능
- 예: pHash 해밍 거리 기본값 `8`, dHash는 `10`

#### `verify(imagePaths, threshold)` (선택)
- Stage 1 후보 그룹을 정밀 검증하여 서브그룹으로 분할
- 입력: 후보 이미지 경로 배열, 검증 임계값
- 출력: `string[][]` — 검증된 서브그룹 배열
- **생략 가능** — 없으면 Stage 1 그룹이 그대로 최종 결과
- 예: SSIM 쌍별 비교 후 그리디 클러스터링

#### `defaultVerifyThreshold` (선택)
- `verify`가 있을 때만 의미 있음
- 예: SSIM 기본값 `0.82`, MSE 기본값 `0.05`

#### `description` / `detailDescription`
- `description`: Settings 카드에 표시되는 한 줄 요약
- `detailDescription`: `?` 버튼 hover 시 나타나는 상세 설명 (줄바꿈 `\n` 지원)

---

## 3. 구현 예제: dHash + MSE 플러그인

```typescript
// src/main/engine/plugins/dhash-mse.ts

import type { DetectionPlugin } from '../plugin-registry'
import { sharpFromPath } from '../heic'

// --- Stage 1: dHash (Difference Hash) ---

async function computeDhash(imagePath: string): Promise<string> {
  const SIZE = 9 // 9x8 → 8x8 = 64 bits
  const { data } = await sharpFromPath(imagePath)
    .resize(SIZE, SIZE - 1, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let binary = ''
  for (let y = 0; y < SIZE - 1; y++) {
    for (let x = 0; x < SIZE - 1; x++) {
      const left = data[y * SIZE + x]
      const right = data[y * SIZE + x + 1]
      binary += left < right ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }
  return hex
}

function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    let xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)
    while (xor) {
      distance += xor & 1
      xor >>= 1
    }
  }
  return distance
}

// --- Stage 2: MSE (Mean Squared Error) ---

async function loadGreyscale(imagePath: string, size: number): Promise<Buffer> {
  const { data } = await sharpFromPath(imagePath)
    .resize(size, size, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return data
}

function computeMse(buf1: Buffer, buf2: Buffer): number {
  let sum = 0
  for (let i = 0; i < buf1.length; i++) {
    const diff = buf1[i] - buf2[i]
    sum += diff * diff
  }
  return sum / buf1.length
}

async function verifyMseGroup(
  imagePaths: string[],
  threshold: number,
): Promise<string[][]> {
  if (imagePaths.length <= 1) return [imagePaths]

  const SIZE = 128
  const buffers = new Map<string, Buffer>()
  for (const path of imagePaths) {
    buffers.set(path, await loadGreyscale(path, SIZE))
  }

  // Greedy clustering (same pattern as SSIM)
  const clusters: string[][] = []
  for (const path of imagePaths) {
    let added = false
    for (const cluster of clusters) {
      const allSimilar = cluster.every((member) => {
        const mse = computeMse(buffers.get(path)!, buffers.get(member)!)
        return mse <= threshold // MSE: lower = more similar
      })
      if (allSimilar) {
        cluster.push(path)
        added = true
        break
      }
    }
    if (!added) clusters.push([path])
  }
  return clusters
}

// --- Plugin export ---

export const dhashMsePlugin: DetectionPlugin = {
  id: 'dhash-mse',
  name: 'dHash + MSE',
  description: '차이 해시(Stage 1) + 평균 제곱 오차(Stage 2) 검증',
  detailDescription: [
    'Stage 1 — dHash (Difference Hash):',
    '이미지를 9×8로 축소한 뒤 인접 픽셀 간 밝기 차이를 비교하여 64-bit 해시를 생성합니다.',
    'pHash보다 계산이 빠르고 회전 변형에 덜 민감합니다.',
    '',
    'Stage 2 — MSE (Mean Squared Error):',
    '후보 그룹의 이미지 쌍을 128×128로 리사이즈한 뒤 픽셀 단위 제곱 오차 평균을 계산합니다.',
    'SSIM보다 단순하지만 빠르며, 색상 보정된 사진에 효과적입니다.',
  ].join('\n'),
  version: '1.0.0',
  builtIn: true,
  defaultHashThreshold: 10,
  defaultVerifyThreshold: 500, // MSE: 500 이하면 유사

  computeHash: computeDhash,
  computeDistance: hammingDistance,
  verify: verifyMseGroup,
}
```

---

## 4. 플러그인 등록

### 4.1 등록 위치

`src/main/cqrs/index.ts`의 `initCqrs()` 함수에서 등록합니다:

```typescript
import { phashSsimPlugin } from '@main/engine/plugins/phash-ssim'
import { dhashMsePlugin } from '@main/engine/plugins/dhash-mse'  // 추가

export function initCqrs(): void {
  // ...

  // Register built-in detection plugins
  pluginRegistry.register(phashSsimPlugin)
  pluginRegistry.register(dhashMsePlugin)  // 추가

  // Restore plugin enabled state from settings
  const scanSettings = getSettings('scan')
  if (scanSettings.enabledPlugins) {
    pluginRegistry.loadState(scanSettings.enabledPlugins)
  }

  // ...
}
```

### 4.2 자동 반영되는 것들

플러그인을 `register()`하면 **코드 수정 없이** 자동으로:

1. **Settings UI** — 스캔 탭 > 감지 알고리즘에 카드 표시 (on/off 토글)
2. **CQRS** — `plugin.list` 쿼리에 포함
3. **Settings 저장** — `enabledPlugins`에 `{ "dhash-mse": true }` 자동 추가
4. **스캔 실행** — `pluginRegistry.getEnabled()[0]`으로 활성 플러그인 선택

### 4.3 추가 코드 수정이 필요 없는 이유

| 계층 | 플러그인 인식 방식 |
|------|-------------------|
| `PluginRegistry` | `register()` 호출 시 Map에 저장 |
| `plugin.list` 쿼리 | `pluginRegistry.list()` — 등록된 전체 목록 반환 |
| `plugin.toggle` 커맨드 | `pluginRegistry.setEnabled()` — id로 토글 |
| `ScanEngine` | 생성자에 `plugin` 주입 — 인터페이스만 의존 |
| Settings UI | `plugin.list` 쿼리 결과를 `.map()`으로 렌더링 |

---

## 5. 실행 흐름

```
앱 시작
  └─ initCqrs()
      ├─ pluginRegistry.register(phashSsimPlugin)
      ├─ pluginRegistry.register(dhashMsePlugin)
      └─ pluginRegistry.loadState(settings.scan.enabledPlugins)

사용자가 스캔 시작
  └─ scan.start 커맨드
      └─ startScan() (src/main/services/scan.ts)
          ├─ pluginRegistry.getEnabled()  → [활성 플러그인]
          ├─ activePlugin = enabledPlugins[0]  // 첫 번째 활성 플러그인
          └─ new ScanEngine({
               plugin: activePlugin,
               hashThreshold: options.phashThreshold,   // 사용자 오버라이드
               verifyThreshold: options.ssimThreshold,   // 또는 플러그인 기본값
               batchSize: options.batchSize,
             })

ScanEngine.scanFiles()
  ├─ Stage 1: plugin.computeHash(path) → hash
  ├─ Stage 1b: groupByDistance(items, threshold, plugin.computeDistance)
  ├─ Stage 2: plugin.verify?.(paths, verifyThreshold) || [paths]
  └─ Quality: computeQualityScore(path) + getExifData(path)  // 항상 실행
```

---

## 6. 테스트 작성

### 6.1 단위 테스트

```typescript
// tests/unit/engine/plugins/dhash-mse.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { dhashMsePlugin } from '@main/engine/plugins/dhash-mse'
import {
  generateSolidImage,
  generateNearDuplicate,
  getFixtureDir,
  setFixtureNamespace,
} from '../../../fixtures/generate-test-images'

const NS = 'dhash-mse'

describe('dhashMsePlugin', () => {
  let redPath: string
  let redDupPath: string

  beforeAll(async () => {
    setFixtureNamespace(NS)
    redPath = await generateSolidImage('red.png', { r: 255, g: 0, b: 0 })
    redDupPath = await generateNearDuplicate(redPath, 'red-dup.png', 2)
  })

  afterAll(() => {
    rmSync(getFixtureDir(NS), { recursive: true, force: true })
  })

  // 메타데이터 검증
  it('should have valid metadata', () => {
    expect(dhashMsePlugin.id).toBe('dhash-mse')
    expect(dhashMsePlugin.builtIn).toBe(true)
    expect(dhashMsePlugin.defaultHashThreshold).toBeGreaterThan(0)
  })

  // Stage 1: 해시 계산
  it('should compute hash as 16-char hex string', async () => {
    const hash = await dhashMsePlugin.computeHash(redPath)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  // Stage 1: 유사 이미지는 거리가 작아야 함
  it('should produce small distance for near-duplicates', async () => {
    const hash1 = await dhashMsePlugin.computeHash(redPath)
    const hash2 = await dhashMsePlugin.computeHash(redDupPath)
    const distance = dhashMsePlugin.computeDistance(hash1, hash2)
    expect(distance).toBeLessThan(dhashMsePlugin.defaultHashThreshold)
  })

  // Stage 1: 거리 함수의 메트릭 공간 조건
  it('should satisfy metric space properties', async () => {
    const hash = await dhashMsePlugin.computeHash(redPath)
    // d(a, a) = 0
    expect(dhashMsePlugin.computeDistance(hash, hash)).toBe(0)
  })

  // Stage 2: 검증 (verify가 있는 경우)
  it('should verify near-duplicates into same subgroup', async () => {
    if (!dhashMsePlugin.verify) return
    const subgroups = await dhashMsePlugin.verify(
      [redPath, redDupPath],
      dhashMsePlugin.defaultVerifyThreshold!,
    )
    expect(subgroups.some((g) => g.length >= 2)).toBe(true)
  })
})
```

### 6.2 ScanEngine 통합 테스트

```typescript
import { ScanEngine } from '@main/engine/scan-engine'
import { dhashMsePlugin } from '@main/engine/plugins/dhash-mse'

const engine = new ScanEngine({ plugin: dhashMsePlugin })
const result = await engine.scanFiles(filePaths, () => {})
// result.groups 검증
```

---

## 7. 체크리스트

새 플러그인을 추가할 때 확인할 항목:

- [ ] `DetectionPlugin` 인터페이스의 모든 필수 필드 구현
- [ ] `id`가 기존 플러그인과 충돌하지 않음
- [ ] `computeDistance`가 메트릭 공간 조건 충족 (삼각 부등식)
- [ ] `computeHash`에서 HEIC 지원 (`sharpFromPath` 사용)
- [ ] `description` + `detailDescription` 작성 (한국어/영어)
- [ ] `src/main/cqrs/index.ts`에 `register()` 호출 추가
- [ ] 단위 테스트 작성 (해시, 거리, 검증)
- [ ] `npx tsc --noEmit` 통과
- [ ] `bun run test` 전체 통과

---

## 8. 제약 사항 및 향후 계획

### 현재 제약 (v0.2)

- **내장 플러그인만 지원** — 코드에 직접 추가 후 빌드 필요
- **단일 플러그인 실행** — `getEnabled()[0]` 첫 번째 활성 플러그인만 사용
- **임계값 UI 미분리** — 모든 플러그인이 동일한 pHash/SSIM 슬라이더 공유

### 향후 계획

| 버전 | 기능 |
|------|------|
| **v0.3** | 다중 플러그인 동시 실행 + 그룹 병합 로직 |
| **v0.3** | 플러그인별 임계값 슬라이더 (configSchema) |
| **v0.4** | 외부 플러그인 로더 (dynamic import from plugins/ 디렉토리) |
| **v0.4** | 플러그인 SDK 패키지 분리 (`@optishot/plugin-sdk`) |

---

## 9. 참조 파일

| 파일 | 역할 |
|------|------|
| `src/shared/plugins.ts` | `PluginInfo` UI 타입 정의 |
| `src/main/engine/plugin-registry.ts` | `DetectionPlugin` 인터페이스 + `PluginRegistry` |
| `src/main/engine/plugins/phash-ssim.ts` | 내장 플러그인 레퍼런스 구현 |
| `src/main/engine/scan-engine.ts` | 플러그인 주입받는 ScanEngine |
| `src/main/engine/bk-tree.ts` | `groupByDistance(items, threshold, distanceFn)` |
| `src/main/engine/heic.ts` | `sharpFromPath()` HEIC 호환 이미지 로더 |
| `src/main/services/scan.ts` | 활성 플러그인 선택 + ScanEngine 생성 |
| `src/main/cqrs/index.ts` | 플러그인 등록 진입점 |
