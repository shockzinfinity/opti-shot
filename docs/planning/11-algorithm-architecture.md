# 감지 알고리즘 아키텍처 재설계

> 작성일: 2026-04-21
> 최종 수정: 2026-04-21 (리뷰 반영)

## 1. 배경

현재 `DetectionPlugin` 인터페이스는 Stage 1(해시) + Stage 2(검증)을 하나의 플러그인으로 묶는 모놀리식 구조.
새 알고리즘(dHash, MSE 등)을 추가하려면 조합마다 별도 플러그인을 만들어야 하는 조합 폭발 문제가 있음.

### 목표

- 각 알고리즘을 독립 단위로 분리
- 사용자가 Stage 1 / Stage 2 알고리즘을 자유롭게 조합
- 최적 조합을 프리셋으로 제공하여 초보 사용자도 쉽게 사용
- 고급 사용자는 직접 조합 + 임계값 조정 가능

### UX 원칙

> **내부 아키텍처는 유연하게, UI는 단순하게.**

사진 정리 앱의 핵심 가치는 "쉽고 빠른 중복 정리"이다.
알고리즘 선택이 복잡해지면 사용자가 오히려 부담을 느끼고 앱의 매력이 떨어진다.

- **기본 사용자**: 프리셋 하나 고르면 끝. 알고리즘 존재 자체를 몰라도 됨.
- **관심 있는 사용자**: 프리셋 이름과 한 줄 설명으로 차이를 이해.
- **고급 사용자**: "사용자 정의"를 열면 개별 알고리즘 토글 + 임계값 조정 가능.

UI 표면에 노출되는 것은 **프리셋 선택** 하나뿐.
알고리즘 세부 설정은 접힘(collapsed) 영역에 숨기고, 필요할 때만 펼침.

---

## 2. 인터페이스 설계

### 2.1 현재 (변경 전)

```typescript
interface DetectionPlugin {
  id: string
  name: string
  computeHash(path: string): Promise<string>
  computeDistance(h1: string, h2: string): number
  defaultHashThreshold: number
  verify?(paths: string[], threshold: number): Promise<string[][]>
  defaultVerifyThreshold?: number
}
```

Stage 1과 Stage 2가 하나의 인터페이스에 결합되어 있음.

### 2.2 제안 (변경 후)

```typescript
/** Stage 1: 해시 생성 + 거리 계산 (BK-Tree 그룹핑용) */
interface HashAlgorithm {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly detailDescription: string
  readonly version: string

  /** 이미지에서 해시 생성 */
  computeHash(imagePath: string): Promise<string>

  /** 두 해시 간 거리 (메트릭 공간) */
  computeDistance(hash1: string, hash2: string): number

  /** 기본 임계값 */
  readonly defaultThreshold: number
}

/** Stage 2: 후보 그룹 검증 — greedy clustering 방식으로 서브그룹 반환 */
interface VerifyAlgorithm {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly detailDescription: string
  readonly version: string

  /** 후보 그룹의 모든 쌍을 비교 → greedy clustering → 서브그룹 반환 */
  verify(imagePaths: string[], threshold: number): Promise<string[][]>

  /** 기본 임계값 */
  readonly defaultThreshold: number
}
```

**공통 유틸리티:**
- `hammingDistance()` — pHash, dHash 모두 64-bit 해시 → 해밍 거리를 공유.
  기존 `phash.ts`의 `hammingDistance`를 공통 유틸로 추출.
- MSE의 `verify` 구현도 SSIM과 동일한 greedy clustering 패턴 사용.
  쌍별 MSE 계산 → threshold 이하 쌍을 유사로 판정 → greedy clustering.

### 2.3 알고리즘 레지스트리

```typescript
/**
 * AlgorithmRegistry: 알고리즘 등록소.
 * 순수 등록/조회만 담당. 활성화 상태는 Settings에서 관리.
 */
class AlgorithmRegistry {
  private hashAlgorithms = new Map<string, HashAlgorithm>()
  private verifyAlgorithms = new Map<string, VerifyAlgorithm>()

  registerHash(algo: HashAlgorithm): void
  registerVerify(algo: VerifyAlgorithm): void

  getHash(id: string): HashAlgorithm | undefined
  getVerify(id: string): VerifyAlgorithm | undefined

  listHash(): HashAlgorithm[]
  listVerify(): VerifyAlgorithm[]
}
```

**활성화 상태 관리 책임 분리:**
- `AlgorithmRegistry` — 순수 등록소. 어떤 알고리즘이 존재하는지만 관리.
- `Settings (shared/constants.ts)` — 프리셋 정의 + 사용자가 선택한 알고리즘 조합 저장.
- `ScanEngine` — Settings에서 받은 알고리즘 ID 목록으로 Registry에서 인스턴스를 꺼내 실행.

---

## 3. 알고리즘 구현체

### 3.1 Stage 1 — HashAlgorithm

| ID | 이름 | 원리 | 강점 | 약점 | 속도 |
|----|------|------|------|------|------|
| `phash` | pHash (DCT) | 32×32 그레이스케일 → DCT → 64-bit | 크기/압축 변화에 강함 | 회전/반전에 약함 | 보통 |
| `dhash` | dHash (Gradient) | 9×8 리사이즈 → 인접 픽셀 밝기 비교 → 64-bit | 밝기/대비 변화에 강함, 매우 빠름 | 미세한 구조 차이에 둔감 | 빠름 |

dHash 알고리즘:
```
1. 이미지를 9×8 그레이스케일로 리사이즈
2. 각 행에서 인접 픽셀 비교: pixel[x] > pixel[x+1] → 1, else 0
3. 8×8 = 64-bit 해시 생성
4. 거리: 해밍 거리 (pHash와 동일한 hammingDistance 함수 공유)
```

### 3.2 Stage 2 — VerifyAlgorithm

| ID | 이름 | 원리 | 강점 | 약점 |
|----|------|------|------|------|
| `ssim` | SSIM | 8×8 슬라이딩 윈도우 구조적 유사도 | 인간 시각에 기반, 정확 | 계산 비용 높음 |
| `mse` | NMSE | 픽셀 간 평균 제곱 오차 (정규화) | 단순, 빠름 | 밝기 변화에 민감 |

MSE 알고리즘 (NMSE로 정규화):
```
1. 두 이미지를 256×256 그레이스케일로 리사이즈
2. 각 픽셀 차이의 제곱 합 / 총 픽셀 수 = MSE
3. 정규화: NMSE = MSE / (255^2) → 0~1 범위 (0 = 동일, 1 = 완전 상이)
4. 유사 판정: NMSE < threshold (기본값 0.05)
5. 쌍별 NMSE 비교 → SSIM과 동일한 greedy clustering으로 서브그룹 반환
```

---

## 4. 복수 알고리즘 실행 전략

### 4.1 복수 Stage 1 — 그룹 병합

pHash와 dHash를 동시에 실행하면 각각 다른 그룹이 생성됨.

**실행 흐름:**
```
파일 목록
  ├─ pHash 계산 → BK-Tree → 후보 그룹 A
  └─ dHash 계산 → BK-Tree → 후보 그룹 B
       ↓
  병합 전략 적용 → 최종 후보 그룹
       ↓
  Stage 2 검증 → 최종 확정 그룹
```

**병합 전략:**

| 전략 | 동작 | 효과 | 적합 상황 |
|------|------|------|-----------|
| **Union (합집합)** | 어느 하나라도 유사하면 그룹 | 재현율↑ 정밀도↓ | Stage 2 검증이 강력할 때 |
| **Intersection (교집합)** | 둘 다 유사해야 그룹 | 정밀도↑ 재현율↓ | Stage 2 없이 빠른 스캔할 때 |

Union이 기본 권장 — Stage 2에서 거짓 양성을 걸러내므로 Stage 1은 넓게 잡는 게 유리.

**병합 알고리즘:**
```
Union 병합:
  1. 모든 해시 알고리즘의 그룹을 수집
  2. 파일 단위로 인접 리스트 구성 (file → 같은 그룹에 속한 다른 파일들)
  3. Union-Find로 연결 요소 추출 → 최종 후보 그룹

Intersection 병합:
  1. 모든 해시 알고리즘의 그룹을 파일 쌍으로 분해
  2. 모든 알고리즘에서 동시에 같은 그룹에 속한 쌍만 유지
  3. Union-Find로 연결 요소 추출 → 최종 후보 그룹
```

### 4.2 복수 Stage 2 — 순차 파이프라인

Stage 2를 여러 개 선택했을 때의 전략: **순차 적용 (Pipeline)**.

```
후보 그룹 → SSIM 검증 → 통과한 서브그룹 → MSE 검증 → 최종 그룹
```

- 첫 번째 검증의 결과(서브그룹)를 다음 검증의 입력으로 전달.
- 각 단계에서 그룹이 더 세분화되거나 탈락.
- 순서: UI에서 사용자가 정한 순서대로, 프리셋에서는 고정 순서.
- 효과: AND와 동일하지만, 비싼 검증을 뒤에 놓으면 계산량 절약.

**프리셋 "정밀"의 경우:**
```
후보 → SSIM(0.85) → 통과 → NMSE(0.03) → 최종 확정
```
SSIM에서 대부분 걸러지고, NMSE는 소수 후보만 추가 검증 → 속도 유지.

---

## 5. 프리셋

### 5.1 기존 SCAN_PRESETS와의 관계

기존 `SCAN_PRESETS` (balanced/conservative/sensitive)는 임계값 조합만 관리.
새 프리셋은 **알고리즘 조합 + 임계값 + 병합 전략**을 포괄.

**결정: 교체.** 기존 SCAN_PRESETS를 새 프리셋으로 대체.
기존 프리셋 이름(균형/보수적/민감)을 유지하되, 알고리즘 선택까지 포함하도록 확장.

### 5.2 프리셋 정의

| 프리셋 | Stage 1 | 병합 | Stage 2 | 특성 | 사용자 관점 설명 |
|--------|---------|------|---------|------|------------------|
| **균형 (기본값)** | pHash(8) + dHash(8) | Union | SSIM(0.82) | 넓은 커버리지 + 정확한 검증 | "대부분의 경우 최적" |
| **빠른 스캔** | dHash(10) | — | 없음 | 최대 속도 | "빠르게 훑기, 오탐 가능" |
| **보수적** | pHash(6) | — | SSIM(0.90) | 거짓 양성 최소화 | "확실한 중복만 찾기" |
| **정밀** | pHash(8) + dHash(8) | Intersection | SSIM(0.85) → NMSE(0.03) | 이중 검증 | "편집된 사진도 잡기" |

### 5.3 ScanPresetConfig 구조 변경

```typescript
// 변경 전
interface ScanPresetConfig {
  phashThreshold: number
  ssimThreshold: number
  timeWindowHours: number
  parallelThreads: number
}

// 변경 후
interface ScanPresetConfig {
  hashAlgorithms: string[]                // ['phash', 'dhash']
  hashThresholds: Record<string, number>  // { phash: 8, dhash: 8 }
  mergeStrategy: 'union' | 'intersection'
  verifyAlgorithms: string[]              // ['ssim']
  verifyThresholds: Record<string, number> // { ssim: 0.82 }
  timeWindowHours: number
  parallelThreads: number
}
```

---

## 6. UI 설계

### 6.1 핵심 원칙: 점진적 공개 (Progressive Disclosure)

```
┌─ 기본 화면 (모든 사용자) ──────────────┐
│                                        │
│  스캔 프리셋: [균형 ▼]                   │
│  "대부분의 경우 최적"                    │
│                                        │
│  ▸ 고급 설정                            │ ← 접힘 (기본)
│                                        │
└────────────────────────────────────────┘

┌─ 고급 설정 (펼침 시) ──────────────────┐
│                                        │
│  Stage 1 — 후보 탐색                    │
│  [✓] pHash (DCT)     임계값: [8 ]  (ℹ) │
│  [✓] dHash (Gradient) 임계값: [8 ]  (ℹ) │
│  복수 선택 시 병합: [Union ▼]            │
│                                        │
│  Stage 2 — 정밀 검증                    │
│  [✓] SSIM            임계값: [0.82] (ℹ) │
│  [ ] NMSE            임계값: [0.05] (ℹ) │
│                                        │
│  ※ 설정 변경 시 프리셋이                │
│    "사용자 정의"로 전환됩니다            │
│                                        │
└────────────────────────────────────────┘
```

- 프리셋 드롭다운만으로 완결. 고급 설정을 열 필요 없음.
- 고급 설정을 열면 현재 프리셋의 알고리즘 구성이 표시됨.
- 어떤 값이든 수정하면 자동으로 "사용자 정의"로 전환.
- (ℹ) 아이콘: 기존 InfoTooltip 컴포넌트로 각 알고리즘의 상세 설명 표시.
- "Stage 1", "Stage 2" 대신 **"후보 탐색"**, **"정밀 검증"** 같은 사용자 언어 사용.

### 6.2 FolderSelect 페이지의 기존 고급 설정과의 관계

현재 FolderSelect에서 플러그인별 파라미터를 표시하는 `PluginSection`이 있음.
이것은 새 구조에서 **고급 설정 영역**으로 대체.

---

## 7. 데이터 흐름 변경

### 7.1 ScanEngine 변경

```
현재:
  ScanEngine(plugin: DetectionPlugin)

변경:
  ScanEngine({
    hashAlgorithms: HashAlgorithm[]
    hashThresholds: Record<string, number>
    mergeStrategy: 'union' | 'intersection'
    verifyAlgorithms: VerifyAlgorithm[]
    verifyThresholds: Record<string, number>
  })
```

### 7.2 scan.start 커맨드 입력 변경

```typescript
// 현재
{ mode, phashThreshold, ssimThreshold, timeWindowHours, parallelThreads, batchSize }

// 변경
{
  mode,
  hashAlgorithms: string[]                // ['phash', 'dhash']
  hashThresholds: Record<string, number>  // { phash: 8, dhash: 8 }
  mergeStrategy: 'union' | 'intersection'
  verifyAlgorithms: string[]              // ['ssim']
  verifyThresholds: Record<string, number> // { ssim: 0.82 }
  timeWindowHours: number
  parallelThreads: number
  batchSize?: number
}
```

**Zod 스키마 (schemas.ts) 변경 필요:**
```typescript
const scanStartSchema = z.object({
  mode: z.enum(['full', 'date_range', 'folder_only']),
  hashAlgorithms: z.array(z.string()).min(1),
  hashThresholds: z.record(z.string(), z.number()),
  mergeStrategy: z.enum(['union', 'intersection']),
  verifyAlgorithms: z.array(z.string()),
  verifyThresholds: z.record(z.string(), z.number()),
  timeWindowHours: z.number().min(0),
  parallelThreads: z.number().min(1),
  batchSize: z.number().optional(),
})
```

### 7.3 DB scans 테이블

기존 `optionPhashThreshold`, `optionSsimThreshold` 컬럼 유지 (기존 기록 읽기용).
새 스캔부터 `optionAlgorithmConfig` (JSON TEXT) 컬럼 추가.

```typescript
// optionAlgorithmConfig JSON 예시
{
  "hashAlgorithms": ["phash", "dhash"],
  "hashThresholds": { "phash": 8, "dhash": 8 },
  "mergeStrategy": "union",
  "verifyAlgorithms": ["ssim"],
  "verifyThresholds": { "ssim": 0.82 }
}
```

---

## 8. 구현 단계

### Step 1: 인터페이스 분리 + 마이그레이션

- `HashAlgorithm`, `VerifyAlgorithm` 인터페이스 정의 (`src/main/engine/algorithm-registry.ts`)
- `AlgorithmRegistry` 구현 (순수 등록소, 활성화 상태 없음)
- `hammingDistance` → 공통 유틸리티로 추출 (`src/main/engine/hash-utils.ts`)
- 기존 pHash → `HashAlgorithm` 구현체 추출 (`src/main/engine/algorithms/phash.ts`)
- 기존 SSIM → `VerifyAlgorithm` 구현체 추출 (`src/main/engine/algorithms/ssim.ts`)
- ScanEngine이 새 인터페이스로 동작하도록 변경 (단일 해시 + 단일 검증 먼저)
- 기존 `DetectionPlugin` + `PluginRegistry` → 어댑터 계층 유지 (Step 4 완료 후 제거)
- 기존 테스트가 통과하는지 확인

### Step 2: dHash + MSE 알고리즘 추가

- dHash `HashAlgorithm` 구현 (`src/main/engine/algorithms/dhash.ts`)
- NMSE `VerifyAlgorithm` 구현 (`src/main/engine/algorithms/nmse.ts`)
- 단위 테스트 (알고리즘별 독립 테스트)

### Step 3: 복수 알고리즘 실행 + 병합

- Union-Find 기반 병합 로직 (`src/main/engine/group-merger.ts`)
- Union/Intersection 전략
- ScanEngine에서 복수 해시 실행 + 병합 + 복수 검증 순차 파이프라인
- 통합 테스트

### Step 4: UI + 프리셋 + 정리

- `ScanPresetConfig` 구조 변경 (`shared/constants.ts`)
- `scan.start` Zod 스키마 변경 (`schemas.ts`)
- DB `scans` 테이블에 `optionAlgorithmConfig` 컬럼 추가
- AlgorithmRegistry 목록을 Renderer에 노출 (쿼리 추가)
- 설정 > 스캔 탭 UI 변경 (점진적 공개 패턴)
- FolderSelect 고급 설정 영역 변경
- i18n (각 알고리즘 이름/설명, 프리셋 설명)
- **`DetectionPlugin` + `PluginRegistry` 제거** — 새 아키텍처로 완전 전환
- SCAN_MODE에서 'incremental' 제거 (보류 항목이므로)

---

## 9. 하위 호환성

- 기존 스캔 기록(DB)의 `optionPhashThreshold`, `optionSsimThreshold` 컬럼 유지
- 새 스캔부터 `optionAlgorithmConfig` JSON 사용
- DB 마이그레이션: `optionAlgorithmConfig` 컬럼 추가만 (기존 컬럼 삭제 안 함)
- `DetectionPlugin` 제거 시점: Step 4 완료 후. Step 1~3 동안은 어댑터로 기존 코드 호환 유지.

---

## 10. 리스크

| 리스크 | 대응 |
|--------|------|
| UI 복잡도 증가 → 사용성 저하 | 점진적 공개: 프리셋만 노출, 고급 설정은 접힘. 사용자 언어 사용 ("후보 탐색"/"정밀 검증") |
| 복수 해시 실행 시 속도 저하 | 해시 계산은 독립적이므로 병렬 가능 (Worker Threads와 시너지). dHash는 pHash보다 빠름 |
| 임계값 조합이 복잡 | 프리셋에 기본값 내장. 사용자 정의 시에만 노출 |
| 그룹 병합 정확도 | Union + Stage 2 순차 검증으로 거짓 양성 제어 |
| 복수 Stage 2 조합 혼란 | 순차 파이프라인으로 단순화 (AND와 동일 효과, 순서로 최적화 가능) |
| 기존 코드 대규모 변경 | Step별 점진적 마이그레이션 + 어댑터 계층으로 중간 상태 안정성 확보 |
