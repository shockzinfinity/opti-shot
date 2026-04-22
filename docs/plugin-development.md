# OptiShot 알고리즘 개발 가이드

**작성일**: 2026-04-21 | **최종 수정**: 2026-04-22
**대상**: OptiShot에 새로운 해시/검증 알고리즘을 추가하려는 개발자
**현재 버전**: v0.3 (HashAlgorithm / VerifyAlgorithm 분리 아키텍처, Worker Threads 병렬 계산)

---

## 1. 아키텍처 개요

OptiShot의 감지 파이프라인은 **2-Stage 분리 아키텍처**입니다. Stage 1(해시)과 Stage 2(검증)가 독립된 인터페이스로 분리되어, 각 단계의 알고리즘을 자유롭게 조합할 수 있습니다.

```
AlgorithmRegistry (싱글턴 — 순수 등록/조회)
    │
    ├── Hash: phash, dhash, ...
    └── Verify: ssim, nmse, ...
         │
         ▼
    ScanEngine(ScanEngineAlgorithmOptions)
         │
         ├── Stage 1: hashAlgorithms[].computeHash() → BK-Tree(computeDistance) per algo
         │       └── 다중 해시 그룹 병합 (Union-Find: union | intersection)
         ├── Stage 2: verifyAlgorithms[] 순차 파이프라인
         │       └── 각 검증기가 서브그룹을 점진적으로 분할
         └── Quality Scoring (알고리즘 독립, 항상 실행)
```

**핵심 원칙**:
- `HashAlgorithm`과 `VerifyAlgorithm`은 완전히 독립된 인터페이스
- `AlgorithmRegistry`는 순수 등록/조회만 담당 — 활성화 상태는 Settings에서 관리
- `ScanEngine`은 배열로 여러 알고리즘을 받아 다중 실행 + 병합
- 프리셋(balanced, fast, conservative, precise) + custom 조합 지원
- 품질 평가(Laplacian variance)는 알고리즘과 무관하게 항상 실행됨

---

## 2. HashAlgorithm 인터페이스

```typescript
// src/main/engine/algorithm-registry.ts

interface HashAlgorithm {
  readonly id: string              // 고유 식별자 (kebab-case, e.g. 'dhash')
  readonly name: string            // 표시 이름 (e.g. 'dHash (Gradient)')
  readonly description: string     // 한 줄 요약 (Settings 토글 옆에 표시)
  readonly detailDescription: string // 상세 설명 (tooltip)
  readonly version: string         // semver (e.g. '1.0.0')

  computeHash(imagePath: string): Promise<string>
  computeDistance(hash1: string, hash2: string): number
  readonly defaultThreshold: number
}
```

### 2.1 각 필드 상세

#### `id` (필수)
- 형식: `kebab-case`, 영문 소문자 + 하이픈
- 고유해야 함 — 중복 등록 시 덮어씌워짐
- Settings의 `hashThresholds`, 프리셋에서 키로 사용됨
- 예: `'phash'`, `'dhash'`, `'ahash'`

#### `computeHash(imagePath)` (필수)
- 입력: 절대 경로 문자열
- 출력: 해시 문자열 (형식 자유, 단 `computeDistance`와 호환 필수)
- 비동기 — 이미지 로딩/처리에 `sharp` 사용 권장
- HEIC 지원: `sharpFromPath()` 헬퍼 사용 (`src/main/engine/heic.ts`)

#### `computeDistance(hash1, hash2)` (필수)
- 입력: `computeHash`가 반환한 해시 문자열 2개
- 출력: 음이 아닌 정수 또는 실수 (거리)
- **메트릭 공간 조건 충족 필수** (BK-Tree가 삼각 부등식에 의존):
  - `d(a, a) = 0`
  - `d(a, b) = d(b, a)`
  - `d(a, c) <= d(a, b) + d(b, c)`
- 동기 함수 — 빠르게 실행되어야 함 (N² 호출 가능)
- 공통 해밍 거리 함수: `hash-utils.ts`의 `hammingDistance()` 재사용 가능

#### `defaultThreshold` (필수)
- Stage 1 그룹화에서 사용하는 기본 거리 임계값
- 사용자가 Settings의 인라인 슬라이더 또는 프리셋에서 오버라이드 가능
- 예: pHash 기본값 `8`, dHash 기본값 `10`

#### `description` / `detailDescription`
- `description`: Settings 알고리즘 토글 옆에 표시되는 한 줄 요약
- `detailDescription`: tooltip에 나타나는 상세 설명 (줄바꿈 `\n` 지원)

---

## 3. VerifyAlgorithm 인터페이스

```typescript
// src/main/engine/algorithm-registry.ts

interface VerifyAlgorithm {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly detailDescription: string
  readonly version: string

  verify(imagePaths: string[], threshold: number): Promise<string[][]>
  readonly defaultThreshold: number
}
```

### 3.1 각 필드 상세

#### `verify(imagePaths, threshold)` (필수)
- Stage 1 후보 그룹을 정밀 검증하여 서브그룹으로 분할
- 입력: 후보 이미지 경로 배열, 검증 임계값
- 출력: `string[][]` — 검증된 서브그룹 배열
- 다중 검증기가 있으면 **순차 파이프라인**으로 실행 — 이전 검증기의 출력이 다음 검증기의 입력
- 예: SSIM 쌍별 비교 후 그리디 클러스터링, NMSE 정규화 제곱 오차

#### `defaultThreshold` (필수)
- 검증 시 기본 임계값
- 예: SSIM 기본값 `0.82`, NMSE 기본값 `0.05`

#### 메타데이터 필드
- `id`, `name`, `description`, `detailDescription`, `version`은 HashAlgorithm과 동일

---

## 4. 구현 예제: aHash (Average Hash) 알고리즘 추가

### 4.1 해시 알고리즘 파일 생성

```typescript
// src/main/engine/algorithms/ahash.ts

import type { HashAlgorithm } from '../algorithm-registry'
import { sharpFromPath } from '../heic'
import { hammingDistance } from '../hash-utils'

/**
 * Compute aHash (Average Hash) for an image.
 *
 * Algorithm:
 * 1. Resize to 8x8 greyscale
 * 2. Compute mean pixel value
 * 3. Each pixel: >= mean → 1, < mean → 0
 * 4. 64-bit hash → 16-char hex string
 */
async function computeAhash(imagePath: string): Promise<string> {
  const SIZE = 8

  const sharpInstance = await sharpFromPath(imagePath)
  const { data } = await sharpInstance
    .resize(SIZE, SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Compute mean
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]
  }
  const mean = sum / data.length

  // Generate binary hash
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += data[i] >= mean ? '1' : '0'
  }

  // Convert to hex
  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }

  return hex
}

export const ahashAlgorithm: HashAlgorithm = {
  id: 'ahash',
  name: 'aHash (Average)',
  description: '평균값 기반 해시 — 가장 빠르고 단순한 유사도 감지',
  detailDescription: [
    'aHash (Average Hash):',
    '이미지를 8×8 그레이스케일로 축소한 뒤 전체 평균 밝기를 기준으로 각 픽셀을 0/1로 변환하여 64-bit 해시를 생성합니다.',
    '',
    '강점: 가장 빠른 계산, 구현이 단순',
    '약점: 밝기/대비 변화에 민감, 다른 해시 대비 정확도 낮음',
  ].join('\n'),
  version: '1.0.0',
  defaultThreshold: 10,

  computeHash: computeAhash,
  computeDistance: hammingDistance,  // hash-utils.ts에서 import
}
```

**요점**:
- `HashAlgorithm` 인터페이스만 구현
- `hammingDistance`는 `hash-utils.ts`에서 공유 — 64-bit hex 해시를 사용하는 모든 알고리즘이 재사용
- `sharpFromPath()`로 HEIC 지원 자동 포함
- 메타데이터(`description`, `detailDescription`)는 한국어로 작성

### 4.2 검증 알고리즘 추가 예제

```typescript
// src/main/engine/algorithms/my-verify.ts

import type { VerifyAlgorithm } from '../algorithm-registry'
import { sharpFromPath } from '../heic'

async function verifyMyGroup(
  imagePaths: string[],
  threshold: number,
): Promise<string[][]> {
  if (imagePaths.length <= 1) return [imagePaths]

  // 1. 이미지 로딩 + 버퍼 준비
  const buffers = new Map<string, Buffer>()
  for (const path of imagePaths) {
    const sharpInstance = await sharpFromPath(path)
    const { data } = await sharpInstance
      .resize(256, 256, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    buffers.set(path, data)
  }

  // 2. 쌍별 유사도 계산
  const pairKey = (a: string, b: string): string =>
    a < b ? `${a}|${b}` : `${b}|${a}`
  const scores = new Map<string, number>()
  for (let i = 0; i < imagePaths.length; i++) {
    for (let j = i + 1; j < imagePaths.length; j++) {
      const key = pairKey(imagePaths[i], imagePaths[j])
      const score = computeMyMetric(buffers.get(imagePaths[i])!, buffers.get(imagePaths[j])!)
      scores.set(key, score)
    }
  }

  // 3. Greedy clustering (SSIM/NMSE와 동일 패턴)
  const clusters: string[][] = []
  for (const path of imagePaths) {
    let added = false
    for (const cluster of clusters) {
      const allSimilar = cluster.every((member) => {
        const key = pairKey(path, member)
        const score = scores.get(key) ?? Infinity
        return score <= threshold
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

export const myVerifyAlgorithm: VerifyAlgorithm = {
  id: 'my-verify',
  name: 'My Verify',
  description: '커스텀 검증 알고리즘 설명',
  detailDescription: '상세 설명...',
  version: '1.0.0',
  defaultThreshold: 0.1,
  verify: verifyMyGroup,
}
```

**요점**:
- 검증 알고리즘은 `verify(imagePaths, threshold) → string[][]` 하나만 구현
- Greedy clustering 패턴은 SSIM, NMSE와 동일 — 복사 후 메트릭 함수만 교체
- 다중 검증기 파이프라인: 이전 검증기 출력(서브그룹)이 다음 검증기 입력으로 전달됨

---

## 5. 알고리즘 등록

### 5.1 등록 위치

`src/main/cqrs/index.ts`의 `initCqrs()` 함수에서 등록합니다:

```typescript
import { phashAlgorithm } from '@main/engine/algorithms/phash'
import { dhashAlgorithm } from '@main/engine/algorithms/dhash'
import { ssimAlgorithm } from '@main/engine/algorithms/ssim'
import { nmseAlgorithm } from '@main/engine/algorithms/nmse'
import { ahashAlgorithm } from '@main/engine/algorithms/ahash'  // 추가

export function initCqrs(): void {
  // ...

  // Register algorithms
  algorithmRegistry.registerHash(phashAlgorithm)
  algorithmRegistry.registerHash(dhashAlgorithm)
  algorithmRegistry.registerHash(ahashAlgorithm)    // 추가
  algorithmRegistry.registerVerify(ssimAlgorithm)
  algorithmRegistry.registerVerify(nmseAlgorithm)

  // ...
}
```

### 5.2 자동 반영되는 것들

알고리즘을 `registerHash()` 또는 `registerVerify()`하면 **코드 수정 없이** 자동으로:

1. **Settings UI** — 스캔 탭에 알고리즘 토글 표시 (on/off + 인라인 임계값 슬라이더)
2. **CQRS** — `algorithm.list` 쿼리에 `AlgorithmInfo`로 포함 (`stage: 'hash' | 'verify'`)
3. **프리셋 통합** — balanced/fast/conservative/precise 프리셋에서 알고리즘 조합에 포함 가능
4. **스캔 실행** — `ScanEngineAlgorithmOptions`에 배열로 전달

### 5.3 추가 코드 수정이 필요 없는 이유

| 계층 | 알고리즘 인식 방식 |
|------|-------------------|
| `AlgorithmRegistry` | `registerHash()` / `registerVerify()` 호출 시 Map에 저장 |
| `algorithm.list` 쿼리 | `algorithmRegistry.listHash()` + `listVerify()` → `AlgorithmInfo[]` 반환 |
| `ScanEngine` | `ScanEngineAlgorithmOptions`로 알고리즘 배열 + 임계값 맵 주입 |
| Settings UI | `algorithm.list` 쿼리 결과를 `stage`별로 분리하여 렌더링 |

---

## 6. 실행 흐름

```
앱 시작
  └─ initCqrs()
      ├─ algorithmRegistry.registerHash(phashAlgorithm)
      ├─ algorithmRegistry.registerHash(dhashAlgorithm)
      ├─ algorithmRegistry.registerVerify(ssimAlgorithm)
      └─ algorithmRegistry.registerVerify(nmseAlgorithm)

사용자가 스캔 시작
  └─ scan.start 커맨드
      └─ startScan()
          └─ new ScanEngine({
               hashAlgorithms: [phashAlgorithm, dhashAlgorithm],  // 사용자 선택
               hashThresholds: { phash: 8, dhash: 8 },            // 균형 프리셋 기본값
               mergeStrategy: 'union',                             // union | intersection
               verifyAlgorithms: [ssimAlgorithm],                 // 사용자 선택
               verifyThresholds: { ssim: 0.82 },                  // 프리셋 또는 커스텀
               batchSize: 100,
             })

ScanEngine.scanFiles()
  ├─ Stage 1: 각 HashAlgorithm별
  │    ├─ algo.computeHash(path) → hash
  │    └─ groupByDistance(items, threshold, algo.computeDistance)
  ├─ Stage 1b: 다중 해시 그룹 병합 (Union-Find)
  │    ├─ union: 어느 해시든 유사하면 같은 그룹
  │    └─ intersection: 모든 해시에서 유사해야 같은 그룹
  ├─ Stage 2: VerifyAlgorithm 순차 파이프라인
  │    ├─ verifier1.verify(group, threshold1) → subgroups
  │    └─ verifier2.verify(subgroup, threshold2) → refined subgroups
  └─ Quality: computeQualityScore(path) + getExifData(path)  // 항상 실행
```

### 6.1 프리셋

| 프리셋 | 해시 | 검증 | 병합 전략 |
|--------|------|------|-----------|
| **balanced** | phash(8) + dhash(8) | ssim(0.82) | union |
| **fast** | dhash(8) | ssim(0.75) | — |
| **conservative** | phash(6) | ssim(0.85) | — |
| **precise** | phash(8) + dhash(8) | ssim(0.82) + nmse(0.05) | intersection |
| **custom** | 사용자 선택 | 사용자 선택 | 사용자 선택 |

---

## 7. 테스트 작성

### 7.1 해시 알고리즘 단위 테스트

```typescript
// tests/unit/engine/algorithms/ahash.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { ahashAlgorithm } from '@main/engine/algorithms/ahash'
import {
  generateSolidImage,
  generateNearDuplicate,
  getFixtureDir,
  setFixtureNamespace,
} from '../../../fixtures/generate-test-images'

const NS = 'ahash'

describe('ahashAlgorithm', () => {
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
    expect(ahashAlgorithm.id).toBe('ahash')
    expect(ahashAlgorithm.defaultThreshold).toBeGreaterThan(0)
  })

  // Stage 1: 해시 형식
  it('should compute hash as 16-char hex string', async () => {
    const hash = await ahashAlgorithm.computeHash(redPath)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  // Stage 1: 유사 이미지는 거리가 작아야 함
  it('should produce small distance for near-duplicates', async () => {
    const hash1 = await ahashAlgorithm.computeHash(redPath)
    const hash2 = await ahashAlgorithm.computeHash(redDupPath)
    const distance = ahashAlgorithm.computeDistance(hash1, hash2)
    expect(distance).toBeLessThan(ahashAlgorithm.defaultThreshold)
  })

  // 메트릭 공간 조건
  it('should satisfy metric space properties', async () => {
    const hash = await ahashAlgorithm.computeHash(redPath)
    expect(ahashAlgorithm.computeDistance(hash, hash)).toBe(0)
  })
})
```

### 7.2 검증 알고리즘 단위 테스트

```typescript
// tests/unit/engine/algorithms/my-verify.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'fs'
import { myVerifyAlgorithm } from '@main/engine/algorithms/my-verify'
import {
  generateSolidImage,
  generateNearDuplicate,
  getFixtureDir,
  setFixtureNamespace,
} from '../../../fixtures/generate-test-images'

const NS = 'my-verify'

describe('myVerifyAlgorithm', () => {
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

  it('should have valid metadata', () => {
    expect(myVerifyAlgorithm.id).toBe('my-verify')
    expect(myVerifyAlgorithm.defaultThreshold).toBeGreaterThan(0)
  })

  it('should verify near-duplicates into same subgroup', async () => {
    const subgroups = await myVerifyAlgorithm.verify(
      [redPath, redDupPath],
      myVerifyAlgorithm.defaultThreshold,
    )
    expect(subgroups.some((g) => g.length >= 2)).toBe(true)
  })

  it('should return single-element array for single image', async () => {
    const subgroups = await myVerifyAlgorithm.verify(
      [redPath],
      myVerifyAlgorithm.defaultThreshold,
    )
    expect(subgroups).toEqual([[redPath]])
  })
})
```

---

## 8. 체크리스트

새 알고리즘을 추가할 때 확인할 항목:

### HashAlgorithm 추가 시
- [ ] `HashAlgorithm` 인터페이스의 모든 필드 구현
- [ ] `id`가 기존 알고리즘과 충돌하지 않음
- [ ] `computeDistance`가 메트릭 공간 조건 충족 (삼각 부등식)
- [ ] `computeHash`에서 HEIC 지원 (`sharpFromPath` 사용)
- [ ] `description` + `detailDescription` 작성
- [ ] `src/main/cqrs/index.ts`에 `algorithmRegistry.registerHash()` 추가
- [ ] 단위 테스트 작성 (해시 형식, 거리, 메트릭 공간)
- [ ] `npx tsc --noEmit` 통과
- [ ] `bun run test` 전체 통과

### VerifyAlgorithm 추가 시
- [ ] `VerifyAlgorithm` 인터페이스의 모든 필드 구현
- [ ] `id`가 기존 알고리즘과 충돌하지 않음
- [ ] `verify` 반환값이 `string[][]` (서브그룹 배열)
- [ ] 단일 이미지 입력 시 `[[path]]` 반환
- [ ] `description` + `detailDescription` 작성
- [ ] `src/main/cqrs/index.ts`에 `algorithmRegistry.registerVerify()` 추가
- [ ] 단위 테스트 작성 (유사 이미지 그룹핑, 단일 이미지 처리)
- [ ] `npx tsc --noEmit` 통과
- [ ] `bun run test` 전체 통과

---

## 9. 참조 파일

| 파일 | 역할 |
|------|------|
| `src/main/engine/algorithm-registry.ts` | `HashAlgorithm` / `VerifyAlgorithm` 인터페이스 + `AlgorithmRegistry` 싱글턴 |
| `src/main/engine/algorithms/phash.ts` | 내장 해시 알고리즘 (pHash DCT) |
| `src/main/engine/algorithms/dhash.ts` | 내장 해시 알고리즘 (dHash Gradient) |
| `src/main/engine/algorithms/ssim.ts` | 내장 검증 알고리즘 (SSIM) |
| `src/main/engine/algorithms/nmse.ts` | 내장 검증 알고리즘 (NMSE) |
| `src/main/engine/hash-utils.ts` | 공유 `hammingDistance()` 함수 |
| `src/main/engine/scan-engine.ts` | `ScanEngineAlgorithmOptions` + 2-Stage 파이프라인 |
| `src/main/engine/bk-tree.ts` | `groupByDistance(items, threshold, distanceFn)` |
| `src/main/engine/heic.ts` | `sharpFromPath()` HEIC 호환 이미지 로더 |
| `src/shared/plugins.ts` | `AlgorithmInfo` UI 타입 정의 |
| `src/main/cqrs/index.ts` | 알고리즘 등록 진입점 |
| `src/main/cqrs/handlers/algorithm.ts` | `algorithm.list` 쿼리 핸들러 |
