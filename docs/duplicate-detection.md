# OptiShot 중복 감지 파이프라인 기술 문서

**작성일**: 2026-04-17  
**최종 수정**: 2026-04-21  
**프로젝트**: OptiShot (Electron + React + TypeScript)  
**목적**: 모듈러 2-Stage 이미지 해싱을 통한 중복/유사 사진 감지 알고리즘 완전 가이드

---

## 1. 파이프라인 개요

OptiShot의 중복 감지 시스템은 모듈러 2단계 아키텍처로 설계되었습니다. 복수의 해시 알고리즘과 검증 알고리즘을 자유롭게 조합할 수 있습니다.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                OptiShot 모듈러 2-Stage 감지 파이프라인                      │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  [입력: 이미지 파일 경로 배열]                                             │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 1: 다중 해시 계산 + BK-Tree 그룹화 + 그룹 병합              │  │
│  │                                                                    │  │
│  │  ┌─────────────┐    ┌─────────────┐                              │  │
│  │  │ HashAlgo A  │    │ HashAlgo B  │  (pHash, dHash, ...)         │  │
│  │  │ → BK-Tree A │    │ → BK-Tree B │                              │  │
│  │  │ → Groups A  │    │ → Groups B  │                              │  │
│  │  └──────┬──────┘    └──────┬──────┘                              │  │
│  │         └───────┬──────────┘                                      │  │
│  │                 ▼                                                  │  │
│  │       Union-Find 그룹 병합                                        │  │
│  │       (union: 하나라도 유사 → 포함)                                │  │
│  │       (intersection: 모두 유사해야 포함)                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│           │ [후보 그룹: 유사 사진들]                                    │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 2: 순차 검증 파이프라인                                      │  │
│  │                                                                    │  │
│  │  후보 그룹 → VerifyAlgo 1 (SSIM) → 서브그룹                       │  │
│  │                    → VerifyAlgo 2 (NMSE) → 서브그룹               │  │
│  │                         → ... (순차 적용)                          │  │
│  │                                                                    │  │
│  │  각 검증기: 그리디 클러스터링으로 서브그룹 분할                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│           │ [최종 그룹: 검증된 중복]                                    │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 품질 평가 및 마스터 선택                                          │  │
│  │  • Laplacian Variance로 각 사진 품질 점수 계산 (0-100)             │  │
│  │  • EXIF 메타데이터 추출                                           │  │
│  │  • 그룹 내 최고 품질 사진을 "마스터"로 설정                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│           │                                                              │
│           ▼                                                              │
│  [출력: GroupResult[] (id, photos[], masterId)]                         │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.1 핵심 특징

- **모듈러 2-Stage 설계**: 복수 해시 알고리즘(Stage 1) + 순차 검증 파이프라인(Stage 2)
- **알고리즘 조합**: pHash, dHash (Stage 1) / SSIM, NMSE (Stage 2) 자유 조합
- **그룹 병합**: Union-Find로 다중 해시 결과를 union/intersection 전략으로 병합
- **효율성**: BK-Tree 사용으로 O(log N) ~ O(N log N) 시간복잡도
- **정확성**: 순차 검증으로 거짓 양성(False Positive) 제거
- **메타데이터**: EXIF 기반 촬영 정보 유지
- **안전성**: Soft Delete 정책 (30일 휴지통)

---

## 2. Stage 1 해시 알고리즘: pHash (Perceptual Hash)

### 2.1 알고리즘 개요

pHash는 이미지의 "지각적 특성"을 64-bit 이진 수로 압축하는 기술입니다. 작은 편집(노이즈, 압축, 스케일 조정)에도 해시가 유사하게 유지됩니다.

#### 단계별 프로세스

```
이미지 파일
    │
    ▼
1. 32x32 리사이즈 + Greyscale 변환
   └─ sharp 라이브러리 사용
   └─ 원본 종횡비 무시 (fit: 'fill')
    │
    ▼
2. 2D DCT (Discrete Cosine Transform) 적용
   └─ 32x32 픽셀 → 32x32 주파수 계수
   └─ 저주파 성분이 앞쪽에 집중
    │
    ▼
3. 8x8 좌상단 블록 추출
   └─ 이미지의 전체 특성 대표
   └─ 64개 계수 (DC 제외 63개 비교)
    │
    ▼
4. 평균값 계산 (DC 제외)
   └─ 평균 = Σ(coefficient[1..63]) / 63
    │
    ▼
5. 이진화
   └─ coefficient > 평균 ? '1' : '0'
   └─ DC 위치([0,0]) = 항상 '0'
    │
    ▼
6. 16진수 변환
   └─ 64-bit 이진 → 16자리 16진수 문자열
   
결과: "a4f2d8c0f3e9b2a1"
```

#### HashAlgorithm 등록

```typescript
// src/main/engine/algorithms/phash.ts
export const phashAlgorithm: HashAlgorithm = {
  id: 'phash',
  name: 'pHash (DCT)',
  description: 'DCT 기반 지각 해시 — 크기/압축 변화에 강함',
  version: '1.0.0',
  defaultThreshold: 8,

  computeHash: computePhash,
  computeDistance: hammingDistance,  // shared hash-utils.ts
}
```

### 2.2 DCT 알고리즘 상세

OptiShot의 DCT 구현 (DCT-II 표준):

```typescript
/**
 * 2D Discrete Cosine Transform.
 * Standard DCT-II formula applied to an NxN matrix.
 */
export function dct2d(matrix: number[][], N: number): number[][] {
  const result: number[][] = Array.from({ length: N }, () =>
    new Array(N).fill(0),
  )

  // Precompute cosine values for performance
  const cosTable: number[][] = Array.from({ length: N }, () =>
    new Array(N).fill(0),
  )
  for (let k = 0; k < N; k++) {
    for (let n = 0; n < N; n++) {
      cosTable[k][n] = Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))
    }
  }

  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += matrix[x][y] * cosTable[u][x] * cosTable[v][y]
        }
      }

      const cu = u === 0 ? 1 / Math.sqrt(2) : 1
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1
      result[u][v] = (2 / N) * cu * cv * sum
    }
  }

  return result
}
```

**DCT-II 공식**:
$$F(u,v) = \frac{2}{N} C_u C_v \sum_{x=0}^{N-1} \sum_{y=0}^{N-1} f(x,y) \cos\left(\frac{(2x+1)u\pi}{2N}\right) \cos\left(\frac{(2y+1)v\pi}{2N}\right)$$

여기서:
- $C_k = \frac{1}{\sqrt{2}}$ (k=0일 때), $C_k = 1$ (k>0일 때)
- $F(u,v)$ = 주파수 영역의 계수
- $f(x,y)$ = 공간 영역의 픽셀값

### 2.3 pHash 계산 코드

```typescript
/**
 * Compute perceptual hash (pHash) for an image.
 *
 * Algorithm:
 * 1. Resize to 32x32 greyscale
 * 2. Apply 2D DCT
 * 3. Extract top-left 8x8 block (low frequencies)
 * 4. Calculate mean of 64 coefficients (excluding DC [0,0])
 * 5. Each coefficient > mean = 1, else 0 -> 64-bit binary -> hex
 *
 * @returns 16-character hex string (64-bit hash)
 */
export async function computePhash(imagePath: string): Promise<string> {
  const SIZE = 32
  const HASH_SIZE = 8

  // Step 1: Resize to 32x32 greyscale (HEIC-aware)
  const sharpInstance = await sharpFromPath(imagePath)
  const { data } = await sharpInstance
    .resize(SIZE, SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Step 2: Build NxN matrix from raw pixel data
  const matrix: number[][] = Array.from({ length: SIZE }, (_, row) =>
    Array.from(
      { length: SIZE },
      (_, col) => data[row * SIZE + col],
    ),
  )

  // Step 3: Apply 2D DCT
  const dctMatrix = dct2d(matrix, SIZE)

  // Step 4: Extract top-left 8x8 block and compute mean (excluding DC)
  const coefficients: number[] = []
  for (let i = 0; i < HASH_SIZE; i++) {
    for (let j = 0; j < HASH_SIZE; j++) {
      if (i === 0 && j === 0) continue // Skip DC component
      coefficients.push(dctMatrix[i][j])
    }
  }

  const mean =
    coefficients.reduce((sum, val) => sum + val, 0) / coefficients.length

  // Step 5: Generate hash bits — include DC position as 0 in final hash
  let binary = ''
  for (let i = 0; i < HASH_SIZE; i++) {
    for (let j = 0; j < HASH_SIZE; j++) {
      if (i === 0 && j === 0) {
        // DC component always set to 0 (excluded from mean comparison)
        binary += '0'
      } else {
        binary += dctMatrix[i][j] > mean ? '1' : '0'
      }
    }
  }

  // Convert 64-bit binary to 16-character hex
  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }

  return hex
}
```

### 2.4 해밍 거리 (Hamming Distance)

두 해시 간 유사도를 측정하는 메트릭. pHash와 dHash가 공유하는 공통 유틸리티(`hash-utils.ts`):

```typescript
// src/main/engine/hash-utils.ts

/** Count set bits in a 4-bit value (0-15). */
function popcount4(n: number): number {
  let count = 0
  let val = n
  while (val) {
    count += val & 1
    val >>= 1
  }
  return count
}

/**
 * Compute Hamming distance between two hex hash strings.
 * XOR each corresponding nibble and count set bits.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error(
      `Hash length mismatch: ${hash1.length} vs ${hash2.length}`,
    )
  }

  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)
    distance += popcount4(xor)
  }

  return distance
}
```

**예시**:
```
Hash A: a4f2d8c0f3e9b2a1
Hash B: a4f2d8c0f3e9b2a3
         + + + + + + + + (마지막 a1 vs a3)
XOR 결과: 0 0 0 0 0 0 0 2 (1번 다름)
Hamming Distance = 1
```

### 2.5 BK-Tree (Burkhard-Keller Tree)

#### 자료구조 정의

BK-Tree는 메트릭 공간(Metric Space)에서 효율적인 근처 이웃 탐색을 지원하는 이진 트리입니다.

```
BK-Tree 구조:
┌──────────────────────────────┐
│  Root (id1, hash1)           │
├──────────────────────────────┤
│  children: Map<distance, node>
│  ├─ distance=2 → node2       │
│  ├─ distance=4 → node3       │
│  └─ distance=6 → node4       │
└──────────────────────────────┘
```

**핵심 성질** (삼각형 부등식):
```
d(query, node) = r (쿼리에서 노드까지의 거리)
threshold = t (탐색 임계값)

자식 노드를 방문할 조건:
|d(node, child) - r| <= t

즉, 다음을 만족하는 엣지만 탐색:
d(node, child) >= r - t  AND  d(node, child) <= r + t
```

#### 구현 코드

```typescript
export class BKTree {
  private root: BKTreeNode | null = null
  private _size = 0
  private distanceFn: DistanceFunction

  constructor(distanceFn: DistanceFunction) {
    this.distanceFn = distanceFn
  }

  get size(): number {
    return this._size
  }

  /**
   * Insert a hash with its associated ID into the tree.
   */
  insert(hash: string, id: string): void {
    const node: BKTreeNode = { hash, id, children: new Map() }

    if (this.root === null) {
      this.root = node
      this._size++
      return
    }

    let current = this.root
    while (true) {
      const distance = this.distanceFn(current.hash, hash)
      const child = current.children.get(distance)
      if (child === undefined) {
        current.children.set(distance, node)
        this._size++
        return
      }
      current = child
    }
  }

  /**
   * Find all entries within `threshold` distance of the query hash.
   * Returns array of { id, hash, distance }.
   */
  query(hash: string, threshold: number): QueryResult[] {
    if (this.root === null) return []

    const results: QueryResult[] = []
    const stack: BKTreeNode[] = [this.root]

    while (stack.length > 0) {
      const node = stack.pop()!
      const distance = this.distanceFn(node.hash, hash)

      if (distance <= threshold) {
        results.push({ id: node.id, hash: node.hash, distance })
      }

      // BK-tree property: only check children where edge distance d
      // satisfies |d - distance| <= threshold (triangle inequality)
      const minDist = distance - threshold
      const maxDist = distance + threshold

      for (const [edge, child] of node.children) {
        if (edge >= minDist && edge <= maxDist) {
          stack.push(child)
        }
      }
    }

    return results
  }
}
```

#### 그룹화 (Grouping by Distance)

BK-Tree와 Union-Find를 결합하여 연결된 그룹을 구성:

```typescript
/**
 * Group items by pairwise distance within a threshold.
 * Uses union-find to merge overlapping groups.
 *
 * Only returns groups with 2 or more members (duplicates/near-duplicates).
 */
export function groupByDistance(
  items: Array<{ id: string; hash: string }>,
  threshold: number,
  distFn: DistanceFunction,  // HashAlgorithm.computeDistance 주입
): string[][] {
  if (items.length < 2) return []

  // Build BK-tree
  const tree = new BKTree(distFn)
  for (const item of items) {
    tree.insert(item.hash, item.id)
  }

  // Union-Find data structure
  const parent = new Map<string, string>()
  const rank = new Map<string, number>()

  // ... (find/union 구현 생략)

  // For each item, query the BK-tree for neighbors and union them
  for (const item of items) {
    const neighbors = tree.query(item.hash, threshold)
    for (const neighbor of neighbors) {
      if (neighbor.id !== item.id) {
        union(item.id, neighbor.id)
      }
    }
  }

  // Collect groups and filter (2+ members)
  const groupMap = new Map<string, string[]>()
  for (const item of items) {
    const root = find(item.id)
    if (!groupMap.has(root)) {
      groupMap.set(root, [])
    }
    groupMap.get(root)!.push(item.id)
  }

  return Array.from(groupMap.values()).filter((g) => g.length >= 2)
}
```

#### 시간복잡도 분석

| 작업 | 최선 | 평균 | 최악 |
|-----|------|------|------|
| **삽입** | O(log N) | O(log N) | O(N) |
| **쿼리** | O(log N) | O(log N) | O(N) |
| **전체 그룹화** (N개 항목) | O(N log N) | O(N log N) | O(N^2) |

최악의 경우는 모든 항목이 임계값 내에 있을 때 발생합니다.

---

## 3. Stage 1 해시 알고리즘: dHash (Difference Hash)

### 3.1 알고리즘 개요

dHash는 인접 픽셀 간 밝기 차이(gradient)를 기반으로 64-bit 해시를 생성합니다. pHash보다 계산이 빠르고, 밝기/대비 조정에 덜 민감합니다.

### 3.2 단계별 프로세스

```
이미지 파일
    │
    ▼
1. 9x8 리사이즈 + Greyscale 변환
   └─ sharp 라이브러리 사용
   └─ 가로 9px: 인접 비교를 위해 1px 추가
    │
    ▼
2. 인접 픽셀 밝기 비교
   └─ 각 행에서 left < right → 1, else → 0
   └─ 8x8 = 64-bit 해시
    │
    ▼
3. 16진수 변환
   └─ 64-bit 이진 → 16자리 16진수 문자열

결과: "b3c1e7a9d4f52810"
```

### 3.3 구현 코드

```typescript
// src/main/engine/algorithms/dhash.ts

async function computeDhash(imagePath: string): Promise<string> {
  const WIDTH = 9
  const HEIGHT = 8

  const sharpInstance = await sharpFromPath(imagePath)
  const { data } = await sharpInstance
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let binary = ''
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH - 1; x++) {
      const left = data[y * WIDTH + x]
      const right = data[y * WIDTH + x + 1]
      binary += left < right ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
  }

  return hex
}

export const dhashAlgorithm: HashAlgorithm = {
  id: 'dhash',
  name: 'dHash (Gradient)',
  description: '인접 픽셀 밝기 비교 — 빠르고 밝기/대비 변화에 강함',
  version: '1.0.0',
  defaultThreshold: 10,

  computeHash: computeDhash,
  computeDistance: hammingDistance,  // pHash와 동일한 거리 함수
}
```

### 3.4 pHash vs dHash 비교

| 특성 | pHash | dHash |
|------|-------|-------|
| **리사이즈** | 32x32 | 9x8 |
| **계산 방식** | DCT + 저주파 블록 | 인접 픽셀 밝기 차이 |
| **계산 속도** | 보통 (DCT 연산) | 빠름 (단순 비교) |
| **리사이즈/압축** | 강함 | 강함 |
| **밝기/대비** | 보통 | 강함 |
| **회전/반전** | 약함 | 약함 |
| **미세 구조** | 정확 | 둔감 |
| **기본 임계값** | 8 | 10 |

---

## 4. Stage 2 검증 알고리즘: SSIM (Structural Similarity Index)

### 4.1 SSIM 개요

SSIM은 두 이미지의 **구조적 유사성**을 측정하는 지표입니다. 픽셀 차이가 아니라 인간이 지각하는 유사성에 기반합니다.

**논문**: Z. Wang et al. (2004) - "Image Quality Assessment: From Error Visibility to Structural Similarity"

#### VerifyAlgorithm 등록

```typescript
// src/main/engine/algorithms/ssim.ts
export const ssimAlgorithm: VerifyAlgorithm = {
  id: 'ssim',
  name: 'SSIM',
  description: '구조적 유사도 — 인간 시각 기반 정밀 검증',
  version: '1.0.0',
  defaultThreshold: 0.82,

  verify: verifySsimGroup,
}
```

### 4.2 SSIM 수학 공식

기본 SSIM 공식 (단일 윈도우):

$$\text{SSIM}(x,y) = \frac{(2\mu_x\mu_y + C_1)(2\sigma_{xy} + C_2)}{(\mu_x^2 + \mu_y^2 + C_1)(\sigma_x^2 + \sigma_y^2 + C_2)}$$

여기서:
- $\mu_x, \mu_y$ = 각 이미지의 평균값
- $\sigma_x^2, \sigma_y^2$ = 각 이미지의 분산
- $\sigma_{xy}$ = 두 이미지의 공분산
- $C_1 = (K_1 L)^2$ = 분모 안정화 상수
- $C_2 = (K_2 L)^2$ = 분모 안정화 상수
- $K_1 = 0.01, K_2 = 0.03$ (논문 기본값)
- $L = 255$ (8-bit 이미지의 동적 범위)

따라서:
- $C_1 = (0.01 \times 255)^2 = 6.5025$
- $C_2 = (0.03 \times 255)^2 = 58.5225$

### 4.3 전체 이미지 SSIM (평균화)

256x256 이미지를 8x8 슬라이딩 윈도우로 분할하여 각 윈도우의 SSIM을 계산 후 평균:

$$\text{SSIM}(X,Y) = \frac{1}{M} \sum_{j=1}^{M} \text{SSIM}(x_j, y_j)$$

여기서 M은 윈도우 개수:
- 256 / 8 = 32 행, 32 열
- M = 32 x 32 = 1024개 윈도우

### 4.4 구현 코드

```typescript
import { sharpFromPath } from './heic'

// SSIM constants (based on the SSIM paper, Wang et al. 2004)
const K1 = 0.01
const K2 = 0.03
const L = 255 // Dynamic range for 8-bit images
const C1 = (K1 * L) ** 2 // (0.01 * 255)^2 = 6.5025
const C2 = (K2 * L) ** 2 // (0.03 * 255)^2 = 58.5225

const COMPARE_SIZE = 256
const WINDOW_SIZE = 8

/**
 * Compute SSIM between two images.
 * Both images are resized to 256x256 greyscale, then SSIM is computed
 * using a sliding window approach.
 *
 * @returns SSIM score between 0.0 and 1.0
 */
export async function computeSsim(
  imagePath1: string,
  imagePath2: string,
): Promise<number> {
  // Load both images as 256x256 greyscale raw buffers
  const [buf1, buf2] = await Promise.all([
    loadGreyscaleBuffer(imagePath1),
    loadGreyscaleBuffer(imagePath2),
  ])

  return computeSsimFromBuffers(buf1, buf2, COMPARE_SIZE, COMPARE_SIZE)
}

/**
 * Compute SSIM for a single window at position (wx, wy).
 *
 * SSIM(x,y) = (2*ux*uy + C1)(2*sxy + C2) / (ux^2 + uy^2 + C1)(sx^2 + sy^2 + C2)
 */
function computeWindowSsim(
  buf1: Buffer,
  buf2: Buffer,
  wx: number,
  wy: number,
  stride: number,
): number {
  const n = WINDOW_SIZE * WINDOW_SIZE

  let sum1 = 0
  let sum2 = 0
  let sumSq1 = 0
  let sumSq2 = 0
  let sumCross = 0

  for (let dy = 0; dy < WINDOW_SIZE; dy++) {
    for (let dx = 0; dx < WINDOW_SIZE; dx++) {
      const idx = (wy + dy) * stride + (wx + dx)
      const p1 = buf1[idx]
      const p2 = buf2[idx]

      sum1 += p1
      sum2 += p2
      sumSq1 += p1 * p1
      sumSq2 += p2 * p2
      sumCross += p1 * p2
    }
  }

  const mu1 = sum1 / n
  const mu2 = sum2 / n
  const sigma1Sq = sumSq1 / n - mu1 * mu1
  const sigma2Sq = sumSq2 / n - mu2 * mu2
  const sigma12 = sumCross / n - mu1 * mu2

  const numerator = (2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)
  const denominator =
    (mu1 * mu1 + mu2 * mu2 + C1) * (sigma1Sq + sigma2Sq + C2)

  return numerator / denominator
}

/**
 * Compute SSIM from two raw greyscale buffers using sliding window.
 */
function computeSsimFromBuffers(
  buf1: Buffer,
  buf2: Buffer,
  width: number,
  height: number,
): number {
  let totalSsim = 0
  let windowCount = 0

  // Slide 8x8 window across the image
  for (let y = 0; y <= height - WINDOW_SIZE; y += WINDOW_SIZE) {
    for (let x = 0; x <= width - WINDOW_SIZE; x += WINDOW_SIZE) {
      const ssim = computeWindowSsim(buf1, buf2, x, y, width)
      totalSsim += ssim
      windowCount++
    }
  }

  return windowCount > 0 ? totalSsim / windowCount : 0
}
```

### 4.5 그리디 클러스터링 (Greedy Clustering)

Stage 1에서 후보 그룹이 나오면, SSIM으로 추가 검증합니다. 같은 그룹의 **모든 쌍**이 SSIM 임계값을 초과해야 합니다.

```typescript
/**
 * Verify a candidate group by computing pairwise SSIM.
 * Splits into sub-groups where all pairs exceed the threshold.
 *
 * Uses a greedy clustering approach:
 * - Start with first image as first cluster seed
 * - For each remaining image, try to add to existing cluster (all pairs pass threshold)
 * - If no cluster fits, create a new one
 */
export async function verifySsimGroup(
  imagePaths: string[],
  threshold: number,
): Promise<string[][]> {
  if (imagePaths.length <= 1) {
    return [imagePaths]
  }

  // Precompute all pairwise SSIM scores
  const scores = new Map<string, number>()
  const pairKey = (a: string, b: string): string =>
    a < b ? `${a}|${b}` : `${b}|${a}`

  const promises: Array<Promise<void>> = []
  for (let i = 0; i < imagePaths.length; i++) {
    for (let j = i + 1; j < imagePaths.length; j++) {
      const key = pairKey(imagePaths[i], imagePaths[j])
      promises.push(
        computeSsim(imagePaths[i], imagePaths[j]).then((score) => {
          scores.set(key, score)
        }),
      )
    }
  }
  await Promise.all(promises)

  // Greedy clustering
  const clusters: string[][] = []

  for (const path of imagePaths) {
    let added = false
    for (const cluster of clusters) {
      // Check if this path is similar to ALL existing members of the cluster
      const allSimilar = cluster.every((member) => {
        const key = pairKey(path, member)
        const score = scores.get(key) ?? 0
        return score >= threshold
      })

      if (allSimilar) {
        cluster.push(path)
        added = true
        break
      }
    }

    if (!added) {
      clusters.push([path])
    }
  }

  return clusters
}
```

---

## 5. Stage 2 검증 알고리즘: NMSE (Normalized Mean Squared Error)

### 5.1 NMSE 개요

NMSE는 두 이미지의 픽셀 단위 제곱 오차의 평균을 255^2으로 정규화하여 0~1 범위로 반환합니다. 값이 작을수록 유사합니다.

$$\text{NMSE}(X,Y) = \frac{1}{N \cdot 255^2} \sum_{i=1}^{N} (X_i - Y_i)^2$$

여기서:
- $X_i, Y_i$ = 각 이미지의 i번째 픽셀값
- $N$ = 총 픽셀 수 (256 x 256 = 65,536)
- 0 = 동일한 이미지, 1 = 완전히 상이한 이미지

#### VerifyAlgorithm 등록

```typescript
// src/main/engine/algorithms/nmse.ts
export const nmseAlgorithm: VerifyAlgorithm = {
  id: 'nmse',
  name: 'NMSE',
  description: '정규화 평균 제곱 오차 — 빠른 픽셀 수준 검증',
  version: '1.0.0',
  defaultThreshold: 0.05,  // NMSE < 0.05 → 유사

  verify: verifyNmseGroup,
}
```

### 5.2 구현 코드

```typescript
const COMPARE_SIZE = 256

/**
 * Compute Normalized MSE between two greyscale buffers.
 * NMSE = MSE / (255^2) -> 0~1 range (0 = identical, 1 = maximally different)
 */
function computeNmse(buf1: Buffer, buf2: Buffer): number {
  let sum = 0
  for (let i = 0; i < buf1.length; i++) {
    const diff = buf1[i] - buf2[i]
    sum += diff * diff
  }
  const mse = sum / buf1.length
  return mse / (255 * 255)
}

/**
 * Verify a candidate group using NMSE with greedy clustering.
 * Same pattern as SSIM verification -- precompute all pairs, then cluster.
 * NMSE < threshold means similar (lower = more similar).
 */
async function verifyNmseGroup(
  imagePaths: string[],
  threshold: number,
): Promise<string[][]> {
  if (imagePaths.length <= 1) {
    return [imagePaths]
  }

  // Load all buffers
  const buffers = new Map<string, Buffer>()
  for (const path of imagePaths) {
    buffers.set(path, await loadGreyscaleBuffer(path))
  }

  // Precompute all pairwise NMSE scores
  const scores = new Map<string, number>()
  const pairKey = (a: string, b: string): string =>
    a < b ? `${a}|${b}` : `${b}|${a}`

  for (let i = 0; i < imagePaths.length; i++) {
    for (let j = i + 1; j < imagePaths.length; j++) {
      const key = pairKey(imagePaths[i], imagePaths[j])
      const nmse = computeNmse(buffers.get(imagePaths[i])!, buffers.get(imagePaths[j])!)
      scores.set(key, nmse)
    }
  }

  // Greedy clustering: NMSE < threshold means similar
  const clusters: string[][] = []

  for (const path of imagePaths) {
    let added = false
    for (const cluster of clusters) {
      const allSimilar = cluster.every((member) => {
        const key = pairKey(path, member)
        const score = scores.get(key) ?? 1
        return score <= threshold
      })

      if (allSimilar) {
        cluster.push(path)
        added = true
        break
      }
    }

    if (!added) {
      clusters.push([path])
    }
  }

  return clusters
}
```

### 5.3 SSIM vs NMSE 비교

| 특성 | SSIM | NMSE |
|------|------|------|
| **비교 방식** | 구조적 유사도 (윈도우 기반) | 픽셀 단위 오차 |
| **범위** | 0~1 (높을수록 유사) | 0~1 (낮을수록 유사) |
| **계산 속도** | 보통 (1024 윈도우) | 빠름 (단순 산술) |
| **밝기/대비 변화** | 강함 | 민감 |
| **인간 시각** | 일치 | 불일치 가능 |
| **기본 임계값** | 0.82 | 0.05 |

---

## 6. Union-Find 그룹 병합

### 6.1 개요

복수의 해시 알고리즘이 각각 BK-Tree로 그룹화한 결과를 하나로 병합합니다. Union-Find 자료구조를 사용하여 union(합집합) 또는 intersection(교집합) 전략을 적용합니다.

### 6.2 Union-Find 구현

```typescript
// src/main/engine/group-merger.ts

class UnionFind {
  private parent = new Map<string, string>()
  private rank = new Map<string, number>()

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
      this.rank.set(x, 0)
    }
    let root = x
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!
    }
    // Path compression
    let current = x
    while (current !== root) {
      const next = this.parent.get(current)!
      this.parent.set(current, root)
      current = next
    }
    return root
  }

  union(x: string, y: string): void {
    const rootX = this.find(x)
    const rootY = this.find(y)
    if (rootX === rootY) return

    const rankX = this.rank.get(rootX) ?? 0
    const rankY = this.rank.get(rootY) ?? 0

    if (rankX < rankY) {
      this.parent.set(rootX, rootY)
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX)
    } else {
      this.parent.set(rootY, rootX)
      this.rank.set(rootX, rankX + 1)
    }
  }

  /** Extract connected components with 2+ members. */
  groups(allIds: string[]): string[][] {
    const groupMap = new Map<string, string[]>()
    for (const id of allIds) {
      const root = this.find(id)
      if (!groupMap.has(root)) {
        groupMap.set(root, [])
      }
      groupMap.get(root)!.push(id)
    }
    return Array.from(groupMap.values()).filter((g) => g.length >= 2)
  }
}
```

### 6.3 병합 전략

#### Union (합집합)

어느 한 해시 알고리즘이라도 두 이미지를 유사하다고 판단하면 같은 그룹에 포함합니다. 가장 넓은 후보를 생성하며, Stage 2 검증에 의존하여 거짓 양성을 제거합니다.

```typescript
export function mergeUnion(groupSets: string[][][], allIds: string[]): string[][] {
  const uf = new UnionFind()

  for (const groups of groupSets) {
    for (const group of groups) {
      for (let i = 1; i < group.length; i++) {
        uf.union(group[0], group[i])
      }
    }
  }

  return uf.groups(allIds)
}
```

#### Intersection (교집합)

모든 해시 알고리즘이 두 이미지를 유사하다고 판단해야만 같은 그룹에 포함합니다. 가장 정밀하지만 일부 중복을 놓칠 수 있습니다.

```typescript
export function mergeIntersection(groupSets: string[][][], allIds: string[]): string[][] {
  // Extract pairs from each algorithm's groups
  const pairSets = groupSets.map((groups) => {
    const allPairs = new Set<string>()
    for (const group of groups) {
      for (const pair of groupToPairs(group)) {
        allPairs.add(pair)
      }
    }
    return allPairs
  })

  // Intersection: keep only pairs present in ALL algorithms
  const intersected = new Set<string>()
  for (const pair of pairSets[0]) {
    if (pairSets.every((ps) => ps.has(pair))) {
      intersected.add(pair)
    }
  }

  // Rebuild groups from intersected pairs via Union-Find
  const uf = new UnionFind()
  for (const pair of intersected) {
    const [a, b] = pair.split('|')
    uf.union(a, b)
  }

  return uf.groups(allIds)
}
```

### 6.4 병합 흐름도

```
pHash → BK-Tree → Groups A ─┐
                              ├─ mergeGroups(strategy) → 후보 그룹
dHash → BK-Tree → Groups B ─┘

strategy = 'union':        A ∪ B (넓은 후보)
strategy = 'intersection': A ∩ B (좁은 후보)
```

---

## 7. 품질 평가 (Quality Scoring)

### 7.1 Laplacian Variance 알고리즘

품질 점수는 이미지의 **선명도(Sharpness)**를 Laplacian 필터로 측정합니다.

**Laplacian 커널** (3x3):
```
[ 0   1   0 ]
[ 1  -4   1 ]
[ 0   1   0 ]
```

이 커널은 이미지의 **엣지(경계)** 및 **고주파 성분**을 강조합니다.

#### 알고리즘 단계

```
원본 이미지
    │
    ▼
1. 512x512 리사이즈 + Greyscale
   └─ sharp 라이브러리 사용
    │
    ▼
2. 3x3 Laplacian 컨볼루션 적용
   └─ 각 픽셀에 대해 주변 8개 픽셀과 중앙 픽셀 가중치 계산
   └─ 경계 제외 (1px 테두리)
    │
    ▼
3. 컨볼루션 결과 분산(variance) 계산
   └─ 높은 분산 = 선명한 엣지 많음 = 고품질
   └─ 낮은 분산 = 흐릿함 = 저품질
    │
    ▼
4. Sigmoid 함수로 0-100 범위로 정규화
   └─ score = 100 * (1 - e^(-variance / 500))
   
결과: 0-100 점수
```

### 7.2 구현 코드

```typescript
const QUALITY_SIZE = 512

// 3x3 Laplacian kernel for edge/sharpness detection
// [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
const LAPLACIAN_KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0]

/**
 * Compute quality score (0-100) based on Laplacian variance.
 * Higher score = sharper image, lower score = blurrier image.
 *
 * Algorithm:
 * 1. Load image, resize to 512x512, greyscale
 * 2. Apply 3x3 Laplacian convolution
 * 3. Compute variance of convolved output
 * 4. Normalize to 0-100 scale
 */
export async function computeQualityScore(
  imagePath: string,
): Promise<number> {
  const sharpInstance = await sharpFromPath(imagePath)
  const { data, info } = await sharpInstance
    .resize(QUALITY_SIZE, QUALITY_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height

  // Apply Laplacian convolution (skip 1px border)
  const laplacianValues: number[] = []

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixelIdx = (y + ky) * width + (x + kx)
          const kernelIdx = (ky + 1) * 3 + (kx + 1)
          sum += data[pixelIdx] * LAPLACIAN_KERNEL[kernelIdx]
        }
      }
      laplacianValues.push(sum)
    }
  }

  // Compute variance
  const n = laplacianValues.length
  if (n === 0) return 0

  const mean = laplacianValues.reduce((s, v) => s + v, 0) / n
  const variance =
    laplacianValues.reduce((s, v) => s + (v - mean) ** 2, 0) / n

  // Normalize to 0-100 scale
  // Typical Laplacian variance range for real images: 0-2000+
  // Use sigmoid-like mapping: score = 100 * (1 - e^(-variance / scale))
  const SCALE = 500
  const score = 100 * (1 - Math.exp(-variance / SCALE))

  return Math.round(score * 100) / 100
}
```

### 7.3 정규화 함수

$$\text{score} = 100 \times \left(1 - e^{-\frac{\text{variance}}{500}}\right)$$

**예시 값**:
| Variance | Score |
|----------|-------|
| 0 | 0.00 |
| 100 | 18.13 |
| 500 | 63.21 |
| 1000 | 86.47 |
| 2000 | 99.33 |

### 7.4 EXIF 메타데이터 추출

```typescript
export interface ExifData {
  width: number
  height: number
  format: string
  fileSize: number
  takenAt: string | null
  cameraModel: string | null
  lensModel: string | null
  iso: number | null
  shutterSpeed: string | null
  aperture: number | null
  focalLength: number | null
  latitude: number | null
  longitude: number | null
}

export async function getExifData(imagePath: string): Promise<ExifData> {
  const sharpInstance = await sharpFromPath(imagePath)
  const metadata = await sharpInstance.metadata()
  const stats = statSync(imagePath)

  // ... EXIF 파싱 (exifr 라이브러리 사용)

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? 'unknown',
    fileSize: stats.size,
    takenAt,
    cameraModel,
    lensModel,
    iso,
    shutterSpeed,
    aperture,
    focalLength,
  }
}
```

---

## 8. 알고리즘 아키텍처

### 8.1 HashAlgorithm 인터페이스

Stage 1 해시 생성 + 거리 계산을 캡슐화합니다. BK-Tree에서 그룹화에 사용됩니다.

```typescript
// src/main/engine/algorithm-registry.ts

interface HashAlgorithm {
  readonly id: string              // 고유 식별자 (e.g., 'phash', 'dhash')
  readonly name: string            // 표시 이름
  readonly description: string     // 짧은 설명
  readonly detailDescription: string  // 상세 설명
  readonly version: string

  /** 이미지에서 해시 생성 */
  computeHash(imagePath: string): Promise<string>
  /** 두 해시 간 거리 (메트릭 공간) */
  computeDistance(hash1: string, hash2: string): number
  /** 기본 임계값 */
  readonly defaultThreshold: number
}
```

### 8.2 VerifyAlgorithm 인터페이스

Stage 2 후보 그룹 검증을 캡슐화합니다. 그리디 클러스터링으로 서브그룹을 반환합니다.

```typescript
interface VerifyAlgorithm {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly detailDescription: string
  readonly version: string

  /** 후보 그룹의 모든 쌍을 비교 -> greedy clustering -> 서브그룹 반환 */
  verify(imagePaths: string[], threshold: number): Promise<string[][]>
  /** 기본 임계값 */
  readonly defaultThreshold: number
}
```

### 8.3 AlgorithmRegistry

순수 등록/조회만 담당합니다. 활성화 상태는 Settings(프리셋/커스텀)에서 관리합니다.

```typescript
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

// Singleton
export const algorithmRegistry = new AlgorithmRegistry()
```

**초기화 흐름**:
```
app.whenReady()
  -> initCqrs()
    -> algorithmRegistry.registerHash(phashAlgorithm)
    -> algorithmRegistry.registerHash(dhashAlgorithm)
    -> algorithmRegistry.registerVerify(ssimAlgorithm)
    -> algorithmRegistry.registerVerify(nmseAlgorithm)
    -> registerAllCqrsHandlers(...)
```

### 8.4 내장 알고리즘 목록

| 유형 | ID | 이름 | 기본 임계값 | 특성 |
|------|-----|------|-----------|------|
| **Hash** | `phash` | pHash (DCT) | 8 | DCT 기반, 리사이즈/압축에 강함 |
| **Hash** | `dhash` | dHash (Gradient) | 10 | 인접 픽셀 비교, 빠르고 밝기 변화에 강함 |
| **Verify** | `ssim` | SSIM | 0.82 | 구조적 유사도, 인간 시각 기반 |
| **Verify** | `nmse` | NMSE | 0.05 | 정규화 MSE, 빠른 픽셀 수준 검증 |

### 8.5 확장 가이드 (새 알고리즘 추가)

1. `src/main/engine/algorithms/` 아래에 새 파일 생성
2. `HashAlgorithm` 또는 `VerifyAlgorithm` 인터페이스 구현
3. `initCqrs()`에서 `algorithmRegistry.registerHash()` 또는 `registerVerify()` 호출
4. `shared/constants.ts`의 프리셋에 추가 (선택)
5. 끝 -- UI에 자동으로 나타남

```typescript
// 예시: 새 해시 알고리즘
export const myHashAlgorithm: HashAlgorithm = {
  id: 'myhash',
  name: 'My Custom Hash',
  description: '커스텀 해시 알고리즘',
  detailDescription: '상세 설명...',
  version: '1.0.0',
  defaultThreshold: 12,

  computeHash: myComputeHash,
  computeDistance: hammingDistance,
}

// 예시: 새 검증 알고리즘
export const myVerifyAlgorithm: VerifyAlgorithm = {
  id: 'myverify',
  name: 'My Custom Verify',
  description: '커스텀 검증 알고리즘',
  detailDescription: '상세 설명...',
  version: '1.0.0',
  defaultThreshold: 0.9,

  verify: myVerifyGroup,
}
```

---

## 9. ScanEngine 오케스트레이션

### 9.1 ScanEngine 설정

```typescript
/** Configuration options for the scan engine. */
export interface ScanEngineAlgorithmOptions {
  /** Stage 1: Hash algorithms to use. */
  hashAlgorithms: HashAlgorithm[]
  /** Thresholds per hash algorithm. */
  hashThresholds: Record<string, number>
  /** How to merge groups from multiple hash algorithms. */
  mergeStrategy: 'union' | 'intersection'
  /** Stage 2: Verify algorithms to apply sequentially. */
  verifyAlgorithms: VerifyAlgorithm[]
  /** Thresholds per verify algorithm. */
  verifyThresholds: Record<string, number>
  /** Number of files to process per batch (default: 100) */
  batchSize?: number
}
```

### 9.2 실행 흐름도

```
scanFiles(filePaths[], onProgress, signal?)
    │
    ├─ Stage 1: 다중 해시 계산 (배치 처리)
    │   for each 100 files:
    │     for each HashAlgorithm:
    │       └─ algo.computeHash(filePath) → hash
    │     └─ emit progress(processedFiles, groups=0)
    │
    ├─ Stage 1b: BK-Tree 그룹화 (알고리즘별) + 병합
    │   for each HashAlgorithm:
    │     └─ groupByDistance(items, threshold, algo.computeDistance)
    │        └─ groupSets[algoId]
    │   └─ mergeGroups(groupSets, allIds, mergeStrategy)
    │      └─ union: 하나라도 유사 → 포함
    │      └─ intersection: 모두 유사해야 포함
    │      └─ [candidateGroups]
    │
    └─ Stage 2: 순차 검증 파이프라인 + 품질 평가
        for each candidateGroup:
            ├─ 순차 검증: verifyAlgorithms를 순서대로 적용
            │   verifiedSubGroups = [candidatePaths]
            │   for each verifier in verifyAlgorithms:
            │     for each group in verifiedSubGroups:
            │       └─ verifier.verify(group, threshold) → newSubGroups
            │     verifiedSubGroups = newSubGroups
            │
            ├─ for each subGroup (2+ members):
            │   ├─ computeQualityScore(path) → score (0-100)
            │   ├─ getExifData(path) → metadata
            │   └─ 최고 품질 = masterId
            │
            └─ emit progress(processedFiles, groups++)

return ScanResult {
  groups: GroupResult[],
  totalFiles: number,
  processedFiles: number,
  elapsed: number,
  skippedFiles: SkippedFile[]
}
```

### 9.3 데이터 구조

```typescript
export interface PhotoResult {
  id: string                    // UUID
  path: string                  // 파일 경로
  phash: string                 // 16진수 해시 (첫 번째 해시 알고리즘)
  qualityScore: number          // 0-100
  ssimScores: Map<string, number> // 그룹 내 다른 사진과의 SSIM
  width: number
  height: number
  takenAt: string | null        // ISO 날짜
  cameraModel: string | null    // EXIF
  lensModel: string | null
  iso: number | null
  shutterSpeed: string | null   // e.g., "1/1000s"
  aperture: number | null       // e.g., 2.8
  focalLength: number | null    // e.g., 50
  latitude: number | null       // GPS
  longitude: number | null      // GPS
}

export interface GroupResult {
  id: string              // 그룹 UUID
  photos: PhotoResult[]   // 그룹 내 사진들
  masterId: string        // 최고 품질 사진의 ID
}

export interface SkippedFile {
  path: string
  reason: string
}

export interface ScanResult {
  groups: GroupResult[]
  totalFiles: number      // 입력 파일 수
  processedFiles: number  // 처리된 파일 수
  elapsed: number         // 소요 시간(초)
  skippedFiles: SkippedFile[]
}
```

---

## 10. 설정값 가이드

### 10.1 프리셋 비교표

OptiShot에서 제공하는 4가지 프리셋:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                            PRESET 비교표                                      │
├───────────────────────────────────────────────────────────────────────────────┤
│ 항목                │ Balanced     │ Fast         │ Conservative │ Precise    │
├───────────────────────────────────────────────────────────────────────────────┤
│ hashAlgorithms      │ phash, dhash │ dhash        │ phash        │ phash, dhash│
│ hashThresholds      │ 8, 8         │ 8            │ 6            │ 8, 8       │
│ mergeStrategy       │ union        │ union        │ union        │ intersection│
│ verifyAlgorithms    │ ssim         │ ssim         │ ssim         │ ssim, nmse │
│ verifyThresholds    │ 0.82         │ 0.75         │ 0.85         │ 0.82, 0.05 │
├───────────────────────────────────────────────────────────────────────────────┤
│ 거짓 양성율         │ 낮음         │ 중간         │ 매우 낮음    │ 매우 낮음  │
│ 거짓 음성율         │ 낮음         │ 낮음         │ 중간         │ 중간       │
│ 검사 시간           │ 중간         │ 짧음         │ 중간         │ 김          │
├───────────────────────────────────────────────────────────────────────────────┤
│ 추천 상황           │ 일반적       │ 빠른 정리    │ 중요한 사진  │ 정밀 분석  │
│                     │ 용도 (기본)  │ 대용량 처리  │ 파일 정리    │ 아카이브   │
└───────────────────────────────────────────────────────────────────────────────┘
```

#### 프리셋별 실제 테스트 결과

download2 폴더 (147개 이미지) 기준:

| 프리셋 | 감지 그룹 수 | 소요 시간 | 특징 |
|--------|------------|----------|------|
| **Balanced** | 2 groups | 17.8s | 2개 해시 + SSIM, 안정적 |
| **Fast** | 3 groups | 8.8s | dHash 단독, 2배 빠름 |
| **Conservative** | 1 group | 8.9s | pHash(6) + SSIM(0.85), 엄격 |
| **Precise** | 2 groups | 15.6s | intersection + SSIM+NMSE 이중 검증 |

#### 각 프리셋 설명

**Balanced (균형잡힌)** -- 기본값
- 2개 해시(pHash + dHash) union으로 넓은 후보 생성
- SSIM 0.82로 거짓 양성 제거
- 일반적인 사용자 시나리오, 버스트 모드 사진

**Fast (빠름)**
- dHash 단독 사용으로 해시 계산 시간 절약
- SSIM 0.75로 관대한 검증
- 대용량 사진 폴더 빠른 정리

**Conservative (보수적)**
- pHash 단독, threshold 6 (엄격한 1차 선별)
- SSIM 0.85로 높은 검증 기준
- 중요한 사진 — 실수로 삭제할 위험 최소화

**Precise (정밀)**
- 2개 해시 intersection으로 좁은 후보 (두 알고리즘 모두 유사하다고 판단해야 포함)
- SSIM + NMSE 순차 이중 검증
- 아카이브 정리, 최고 정밀도

### 10.2 hashThreshold 범위별 특성 (pHash 기준)

| 값 | 선택도 | 특징 | 사용 사례 |
|----|----|------|---------|
| 4 | 매우 높음 | 거의 동일한 이미지만 | 정확한 복제본 감지 |
| 6 | 높음 | 약간의 편집(노이즈, 압축) 감지 | conservative 프리셋 |
| 8 | 중간 (기본값) | 회전, 스케일 작은 변화 감지 | balanced/precise 프리셋 |
| 10 | 낮음 | 더 큰 편집 허용 | dHash 기본값 |
| 12 | 매우 낮음 | 같은 장면의 여러 각도 | 유사 사진 그룹화 |
| 16 | 극히 낮음 | 거의 모든 유사 사진 | 테스트/분석 용도 |

### 10.3 verifyThreshold 범위별 특성

#### SSIM (높을수록 엄격)

| 값 | 엄격도 | 사용 사례 |
|----|----|---------|
| 0.75 | 낮음 | fast 프리셋 |
| 0.82 | 높음 (기본) | balanced/precise 프리셋 |
| 0.85 | 매우 높음 | conservative 프리셋 |
| 0.90+ | 극히 높음 | 거의 동일한 이미지만 |

#### NMSE (낮을수록 엄격)

| 값 | 엄격도 | 사용 사례 |
|----|----|---------|
| 0.05 | 높음 (기본) | precise 프리셋 |
| 0.08 | 중간 | 약간의 편집 허용 |
| 0.10 | 낮음 | 관대한 검증 |

---

## 11. IPC 검증 및 설정

### 11.1 scan.start 스키마

```typescript
// src/main/cqrs/schemas.ts
'scan.start': z.object({
  mode: z.enum(['full', 'date_range', 'folder_only']),
  hashAlgorithms: z.array(z.string()).min(1),
  hashThresholds: z.record(z.string(), z.number()),
  mergeStrategy: z.enum(['union', 'intersection']),
  verifyAlgorithms: z.array(z.string()),
  verifyThresholds: z.record(z.string(), z.number()),
  timeWindowHours: z.number().min(0).max(24),
  parallelThreads: z.number().min(1).max(16),
  batchSize: z.number().optional(),
  // EXIF filters
  enableExifFilter: z.boolean().optional(),
  exifDateStart: z.string().nullable().optional(),
  exifDateEnd: z.string().nullable().optional(),
  exifCameraFilter: z.string().optional(),
  exifMinWidth: z.number().min(0).optional(),
  exifMinHeight: z.number().min(0).optional(),
  exifGpsFilter: z.enum(['all', 'with_gps', 'without_gps']).optional(),
}),
```

**필드 설명**:
- `hashAlgorithms`: 사용할 해시 알고리즘 ID 배열 (e.g., `['phash', 'dhash']`)
- `hashThresholds`: 알고리즘별 임계값 (e.g., `{ phash: 8, dhash: 8 }`)
- `mergeStrategy`: 다중 해시 결과 병합 전략 (`'union'` / `'intersection'`)
- `verifyAlgorithms`: 순차 적용할 검증 알고리즘 ID 배열 (e.g., `['ssim']`, `['ssim', 'nmse']`)
- `verifyThresholds`: 검증 알고리즘별 임계값 (e.g., `{ ssim: 0.82, nmse: 0.05 }`)
- `mode`: 스캔 모드 (전체/날짜범위/폴더만)
- `timeWindowHours`: 날짜 범위 모드에서 시간 창
- `parallelThreads`: 병렬 처리 스레드 수
- `batchSize`: 배치당 파일 수

### 11.2 Settings 타입

```typescript
// src/shared/constants.ts

export interface AlgorithmConfig {
  hashAlgorithms: string[]
  hashThresholds: Record<string, number>
  mergeStrategy: MergeStrategy
  verifyAlgorithms: string[]
  verifyThresholds: Record<string, number>
}

export interface ScanPresetConfig extends AlgorithmConfig {
  timeWindowHours: number
  parallelThreads: number
}

export type ScanPreset = 'balanced' | 'fast' | 'conservative' | 'precise' | 'custom'
```

---

## 12. 성능 고려사항

### 12.1 각 단계의 시간복잡도

| 단계 | 입력 | 시간복잡도 | 예상 시간 (200K) |
|------|------|----------|----------|
| **pHash 계산** | N파일 | O(N) | ~15-20분 |
| **dHash 계산** | N파일 | O(N) | ~5-10분 |
| **DCT (per image)** | 32x32 | O(N^2) = O(1024) | ~1ms/image |
| **BK-Tree 삽입** | N items | O(N log N) | ~5분 |
| **BK-Tree 쿼리** | N queries, K결과/쿼리 | O(N log N) 평균 | ~5분 |
| **Union-Find 병합** | G그룹 | O(G * alpha(N)) | ~0.1초 |
| **SSIM (per pair)** | 256x256, 8x8 window | O(W^2) = O(1024) | ~50ms/pair |
| **NMSE (per pair)** | 256x256 | O(N) | ~5ms/pair |
| **SSIM 검증** | M그룹, 그룹당 P쌍 | O(M * P^2) | ~1-5분 (M에 따라) |
| **품질 점수** | N파일 | O(N * 512^2) | ~5-10분 |
| **전체 파이프라인** | 200K파일 | O(N + M*P^2) | **< 30분** |

### 12.2 200K 이미지 최적화 전략

#### 병렬화

```typescript
// Stage 1: 배치 단위로 순차 처리 (IO 경합 방지)
for (let i = 0; i < filePaths.length; i += batchSize) {
  const batch = filePaths.slice(i, i + batchSize)
  // 100개씩 처리
}

// Stage 2: SSIM 쌍별 계산 병렬화
const promises: Array<Promise<void>> = []
for (let i = 0; i < imagePaths.length; i++) {
  for (let j = i + 1; j < imagePaths.length; j++) {
    promises.push(
      computeSsim(imagePaths[i], imagePaths[j]).then((score) => {
        scores.set(key, score)
      }),
    )
  }
}
await Promise.all(promises)
```

#### 메모리 최적화

- **이미지 캐싱 안 함**: 각 이미지는 필요할 때만 로드
- **버퍼 재사용**: Laplacian 계산 시 임시 배열 최소화
- **스트림 처리**: sharp의 streaming API 활용

#### I/O 최적화

- **배치 처리**: 100개 파일씩 처리 (기본값)
- **병렬 이미지 로드**: Promise.all()로 2개 이미지 동시 로드
- **디스크 캐시**: 운영체제 파일 캐시 활용

### 12.3 진행률 콜백

```typescript
export type ProgressCallback = (progress: ScanProgress) => void

interface ScanProgress {
  processedFiles: number          // 처리된 파일 수
  totalFiles: number              // 전체 파일 수
  discoveredGroups: number        // 발견된 그룹 수
  currentFile: string             // 현재 처리 파일
  elapsedSeconds: number          // 경과 시간
  estimatedRemainingSeconds: number // 예상 남은 시간
  scanSpeed: number               // 처리 속도 (files/sec)
  skippedCount: number            // 건너뛴 파일 수
}
```

### 12.4 중단 신호 (AbortSignal)

```typescript
const controller = new AbortController()

scanEngine.scanFiles(filePaths, onProgress, controller.signal)
  .catch(err => console.log('Aborted:', err.message))

// 사용자가 "취소" 클릭하면
controller.abort()
```

---

## 13. 실제 사용 예시

### 13.1 기본 사용법 (알고리즘 모드)

```typescript
import { ScanEngine } from '@main/engine/scan-engine'
import { algorithmRegistry } from '@main/engine/algorithm-registry'

// 알고리즘 기반 스캔 엔진 생성
const engine = new ScanEngine({
  hashAlgorithms: [
    algorithmRegistry.getHash('phash')!,
    algorithmRegistry.getHash('dhash')!,
  ],
  hashThresholds: { phash: 8, dhash: 8 },
  mergeStrategy: 'union',
  verifyAlgorithms: [
    algorithmRegistry.getVerify('ssim')!,
  ],
  verifyThresholds: { ssim: 0.82 },
  batchSize: 100,
})

// 파일 경로 배열 준비
const filePaths = [
  '/home/user/photos/photo1.jpg',
  '/home/user/photos/photo2.jpg',
  // ... 200K 파일
]

// 진행률 콜백
function onProgress(progress: ScanProgress) {
  console.log(`[${progress.processedFiles}/${progress.totalFiles}] ${progress.currentFile}`)
  console.log(`속도: ${progress.scanSpeed.toFixed(1)} files/sec`)
  console.log(`남은 시간: ${progress.estimatedRemainingSeconds.toFixed(0)}초`)
  console.log(`발견된 그룹: ${progress.discoveredGroups}`)
}

// 스캔 실행
const result = await engine.scanFiles(filePaths, onProgress)

console.log(`완료!`)
console.log(`총 ${result.groups.length}개 중복 그룹 발견`)
console.log(`소요 시간: ${result.elapsed.toFixed(1)}초`)
console.log(`건너뛴 파일: ${result.skippedFiles.length}개`)
```

### 13.2 프리셋 사용

```typescript
import { SCAN_PRESETS } from '@shared/constants'

const preset = SCAN_PRESETS.precise
// {
//   hashAlgorithms: ['phash', 'dhash'],
//   hashThresholds: { phash: 8, dhash: 8 },
//   mergeStrategy: 'intersection',
//   verifyAlgorithms: ['ssim', 'nmse'],
//   verifyThresholds: { ssim: 0.82, nmse: 0.05 },
// }
```

### 13.3 중단 처리

```typescript
const controller = new AbortController()

const scanPromise = engine.scanFiles(filePaths, onProgress, controller.signal)

// 사용자가 "취소" 버튼 클릭
setTimeout(() => {
  controller.abort()
}, 5000)

try {
  const result = await scanPromise
} catch (err) {
  console.log('스캔 중단됨:', err.message)
}
```

---

## 14. 참고 자료

### 학술 논문
- **pHash**: Zauner, C. (2010). "Implementation and Benchmarking of Perceptual Image Hash Functions"
- **SSIM**: Wang, Z., Bovik, A. C., Sheikh, H. R., & Simoncelli, E. P. (2004). "Image Quality Assessment: From Error Visibility to Structural Similarity"
- **BK-Tree**: Burkhard, W. A., & Keller, R. M. (1973). "Some approaches to best-match file searching"

### 외부 라이브러리
- **sharp**: Image processing (resizing, DCT, convolution)
- **exifr**: EXIF metadata extraction
- **zod**: Schema validation

### OptiShot 소스 파일
- `/src/main/engine/algorithm-registry.ts` - HashAlgorithm/VerifyAlgorithm 인터페이스 + AlgorithmRegistry
- `/src/main/engine/algorithms/phash.ts` - pHash HashAlgorithm 구현
- `/src/main/engine/algorithms/dhash.ts` - dHash HashAlgorithm 구현
- `/src/main/engine/algorithms/ssim.ts` - SSIM VerifyAlgorithm 구현
- `/src/main/engine/algorithms/nmse.ts` - NMSE VerifyAlgorithm 구현
- `/src/main/engine/hash-utils.ts` - 공유 hammingDistance 유틸리티
- `/src/main/engine/group-merger.ts` - Union-Find 그룹 병합 (union/intersection)
- `/src/main/engine/phash.ts` - pHash 계산 및 DCT
- `/src/main/engine/bk-tree.ts` - BK-Tree 구현 (distanceFn 주입)
- `/src/main/engine/ssim.ts` - SSIM 계산
- `/src/main/engine/quality.ts` - Laplacian variance 기반 품질 점수
- `/src/main/engine/scan-engine.ts` - 듀얼 모드 오케스트레이션 (레거시 + 알고리즘)
- `/src/shared/constants.ts` - SCAN_PRESETS, AlgorithmConfig, ScanPresetConfig
- `/src/main/cqrs/schemas.ts` - scan.start Zod 스키마

---

## 15. 트러블슈팅

### 문제: "거짓 양성이 많다" (실제 중복이 아닌데 탐지됨)

**원인**: 검증 임계값이 너무 관대함  
**해결**:
```
방법 1: 프리셋을 conservative 또는 precise로 변경
방법 2: 커스텀 설정에서 verifyThresholds 조정
  - SSIM: 0.82 → 0.85 (높일수록 엄격)
  - NMSE: 0.05 → 0.03 (낮출수록 엄격)
방법 3: mergeStrategy를 intersection으로 변경
```

### 문제: "거짓 음성이 많다" (실제 중복을 놓침)

**원인**: 해시 임계값이 너무 엄격하거나 mergeStrategy가 intersection  
**해결**:
```
방법 1: 프리셋을 balanced로 변경
방법 2: hashThresholds 증가 (phash: 8→10, dhash: 10→12)
방법 3: mergeStrategy를 union으로 변경
방법 4: 해시 알고리즘 추가 (phash + dhash 동시 사용)
```

### 문제: "메모리 부족" 오류

**원인**: 200K+ 이미지의 SSIM 쌍별 계산으로 메모리 초과  
**해결**:
```
방법 1: batchSize 감소 (100 → 50)
방법 2: hashThresholds 감소 (1차 그룹 크기 축소)
방법 3: fast 프리셋 사용 (dHash 단독)
```

### 문제: "스캔 시간이 길다" (30분 초과)

**원인**: 과도한 검증 계산 (큰 그룹 많음)  
**해결**:
```
방법 1: fast 프리셋 사용
방법 2: 해시 알고리즘 1개만 사용 (dHash 권장)
방법 3: verifyAlgorithms에서 NMSE 제거 (SSIM만 사용)
```

---

## 최종 정리

OptiShot의 감지 파이프라인은 **모듈러 알고리즘 아키텍처**로 설계됩니다:

1. **HashAlgorithm**: Stage 1 해시 계산 + 거리 메트릭 (pHash, dHash)
2. **VerifyAlgorithm**: Stage 2 그리디 클러스터링 검증 (SSIM, NMSE)
3. **AlgorithmRegistry**: 알고리즘 등록/조회 (싱글턴)
4. **Union-Find 그룹 병합**: 다중 해시 결과를 union/intersection으로 병합
5. **ScanEngine**: 알고리즘을 주입받아 2-Stage 파이프라인 실행 (듀얼 모드)
6. **품질 평가**: Laplacian variance 기반 (알고리즘 독립)
7. **4가지 프리셋**: balanced(기본), fast, conservative, precise

**핵심 조합 구조**:
- Stage 1: [pHash, dHash, ...] x [union, intersection] = 후보 그룹
- Stage 2: [SSIM] -> [NMSE] -> ... = 순차 검증 파이프라인
- 품질: Laplacian variance -> 마스터 선택

**성능 목표**:
- 200K 이미지: < 30분
- 거짓 양성/음성: 최소화
- 메모리 사용: ~ 500MB (SSIM 캐시)
