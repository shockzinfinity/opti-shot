# OptiShot 중복 감지 파이프라인 기술 문서

**작성일**: 2026-04-17  
**프로젝트**: OptiShot (Electron + React + TypeScript)  
**목적**: 2-Stage 이미지 해싱을 통한 중복/유사 사진 감지 알고리즘 완전 가이드

---

## 1. 파이프라인 개요

OptiShot의 중복 감지 시스템은 2단계 아키텍처로 설계되었습니다:

```
┌─────────────────────────────────────────────────────────────────────┐
│                   OptiShot 2-Stage 감지 파이프라인                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [입력: 이미지 파일 경로 배열]                                       │
│           │                                                        │
│           ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ STAGE 1: pHash 계산 및 BK-Tree 그룹화                      │    │
│  │  • 32x32 리사이즈 → DCT → 8x8 블록 추출                    │    │
│  │  • 64-bit 이진 해시 생성                                  │    │
│  │  • 해밍 거리(Hamming Distance) 계산                        │    │
│  │  • BK-Tree 자료구조로 효율적 그룹화                        │    │
│  │  • 기준: phashThreshold (기본값: 8)                        │    │
│  └──────────────────────────────────────────────────────────┘    │
│           │ [후보 그룹: 유사 사진들]                              │
│           ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ STAGE 2: SSIM 검증                                        │    │
│  │  • 256x256 리사이즈 → Greyscale                            │    │
│  │  • 8x8 윈도우 슬라이딩으로 SSIM 계산                       │    │
│  │  • 그리디 클러스터링: 모든 쌍이 임계값 초과 확인          │    │
│  │  • 기준: ssimThreshold (기본값: 0.82)                     │    │
│  └──────────────────────────────────────────────────────────┘    │
│           │ [최종 그룹: 검증된 중복]                              │
│           ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 품질 평가 및 마스터 선택                                  │    │
│  │  • Laplacian Variance로 각 사진 품질 점수 계산 (0-100)     │    │
│  │  • EXIF 메타데이터 추출                                   │    │
│  │  • 그룹 내 최고 품질 사진을 "마스터"로 설정              │    │
│  └──────────────────────────────────────────────────────────┘    │
│           │                                                        │
│           ▼                                                        │
│  [출력: GroupResult[] (id, photos[], masterId)]                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1 핵심 특징

- **2-Stage 설계**: 빠른 1차 선별(pHash) → 정확한 2차 검증(SSIM)
- **효율성**: BK-Tree 사용으로 O(log N) ~ O(N log N) 시간복잡도
- **정확성**: SSIM으로 거짓 양성(False Positive) 제거
- **메타데이터**: EXIF 기반 촬영 정보 유지
- **안전성**: Soft Delete 정책 (30일 휴지통)

---

## 2. Stage 1: Perceptual Hash (pHash)

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

  // Step 1: Resize to 32x32 greyscale
  const { data } = await sharp(imagePath)
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

두 해시 간 유사도를 측정하는 메트릭:

```typescript
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
    // Popcount for 4-bit value
    distance += popcount4(xor)
  }

  return distance
}

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
```

**예시**:
```
Hash A: a4f2d8c0f3e9b2a1
Hash B: a4f2d8c0f3e9b2a3
         ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ (마지막 a1 vs a3)
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
  distFn: DistanceFunction,  // v0.2: 플러그인에서 주입
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
| **전체 그룹화** (N개 항목) | O(N log N) | O(N log N) | O(N²) |

최악의 경우는 모든 항목이 임계값 내에 있을 때 발생합니다.

---

## 3. Stage 2: SSIM (Structural Similarity Index)

### 3.1 SSIM 개요

SSIM은 두 이미지의 **구조적 유사성**을 측정하는 지표입니다. 픽셀 차이가 아니라 인간이 지각하는 유사성에 기반합니다.

**논문**: Z. Wang et al. (2004) - "Image Quality Assessment: From Error Visibility to Structural Similarity"

### 3.2 SSIM 수학 공식

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

### 3.3 전체 이미지 SSIM (평균화)

256x256 이미지를 8x8 슬라이딩 윈도우로 분할하여 각 윈도우의 SSIM을 계산 후 평균:

$$\text{SSIM}(X,Y) = \frac{1}{M} \sum_{j=1}^{M} \text{SSIM}(x_j, y_j)$$

여기서 M은 윈도우 개수:
- 256 / 8 = 32 행, 32 열
- M = 32 × 32 = 1024개 윈도우

### 3.4 구현 코드

```typescript
import sharp from 'sharp'

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

### 3.5 그리디 클러스터링 (Greedy Clustering)

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

**예시: 사진 37/38/39의 경우**

초기 임계값 0.85:
```
Hamming Distance (pHash):
  37 ↔ 38: distance=3  ✓ (< 8)
  37 ↔ 39: distance=5  ✓ (< 8)
  38 ↔ 39: distance=2  ✓ (< 8)
  → Stage 1에서 [37, 38, 39] 후보 그룹 생성

SSIM 점수 (임계값: 0.85):
  37 ↔ 38: 0.891 ✓
  37 ↔ 39: 0.901 ✓
  38 ↔ 39: 0.829 ✗ (0.85 미만)
  → 모든 쌍이 통과하지 못함 → 그룹 분할 필요

그리디 클러스터링 결과:
  Cluster 1: [37, 38] (37-38 SSIM=0.891)
  Cluster 2: [39]    (39는 38과 0.829로 부족)
  Cluster 3: [37, 39] (37-39 SSIM=0.901) → 새 클러스터

최종: [[37, 38], [39]] (또는 [37, 39]와 [38])
```

**조정 후 (임계값: 0.82)**:
```
SSIM 점수 (임계값: 0.82):
  37 ↔ 38: 0.891 ✓
  37 ↔ 39: 0.901 ✓
  38 ↔ 39: 0.829 ✓ (0.82 이상)
  → 모든 쌍이 통과 → [37, 38, 39] 최종 그룹 확정
```

---

## 4. 품질 평가 (Quality Scoring)

### 4.1 Laplacian Variance 알고리즘

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
   └─ score = 100 × (1 - e^(-variance / 500))
   
결과: 0-100 점수
```

### 4.2 구현 코드

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
  const { data, info } = await sharp(imagePath)
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

### 4.3 정규화 함수

$$\text{score} = 100 \times \left(1 - e^{-\frac{\text{variance}}{500}}\right)$$

**예시 값**:
| Variance | Score |
|----------|-------|
| 0 | 0.00 |
| 100 | 18.13 |
| 500 | 63.21 |
| 1000 | 86.47 |
| 2000 | 99.33 |

### 4.4 EXIF 메타데이터 추출

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
}

export async function getExifData(imagePath: string): Promise<ExifData> {
  const metadata = await sharp(imagePath).metadata()
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

## 5. 설정값 가이드

### 5.1 phashThreshold (4-16)

**의미**: Hamming distance 기준값. 낮을수록 더 유사한 이미지만 선별.

#### 범위별 특성

| 값 | 선택도 | 특징 | 사용 사례 |
|----|----|------|---------|
| 4 | 매우 높음 | 거의 동일한 이미지만 | 정확한 복제본 감지 |
| 6 | 높음 | 약간의 편집(노이즈, 압축) 감지 | 카메라 버스트 모드 |
| 8 | 중간 (기본값) | 회전, 스케일 작은 변화 감지 | 일반적 중복 감지 |
| 10 | 낮음 | 더 큰 편집 허용 | 썸네일, 리사이즈 버전 |
| 12 | 매우 낮음 | 같은 장면의 여러 각도 | 유사 사진 그룹화 |
| 16 | 극히 낮음 | 거의 모든 유사 사진 | 테스트/분석 용도 |

**권장사항**: 기본값 8에서 시작하여 SSIM 임계값으로 미세 조정

### 5.2 ssimThreshold (0.5-0.95)

**의미**: SSIM 점수 기준값. Stage 2 검증에서 거짓 양성을 줄입니다.

#### 범위별 특성

| 값 | 엄격도 | 특징 | 사용 사례 |
|----|----|------|---------|
| 0.5 | 매우 낮음 | 광범위한 변형 허용 | 콘텐츠 기반 검색 |
| 0.65 | 낮음 | 상당한 편집/필터 허용 | 소셜 미디어 버전 |
| 0.75 | 중간 | 약간의 편집 허용 | 일반적 상황 |
| 0.82 | 높음 (권장) | 매우 유사한 이미지만 | 중복 감지 (안전) |
| 0.90 | 매우 높음 | 거의 동일 | 엄격한 중복 감지 |
| 0.95 | 극히 높음 | 완벽한 일치 | 테스트/검증 용도 |

**권장사항**: 카메라 버스트 또는 일반 사용자 시나리오에서는 0.82

### 5.3 프리셋 비교표

OptiShot에서 제공하는 3가지 프리셋 (활성 플러그인의 기본 임계값을 오버라이드):

```
┌─────────────────────────────────────────────────────────┐
│                   PRESET 비교표                          │
├─────────────────────────────────────────────────────────┤
│ 항목              │ Conservative │ Balanced  │ Sensitive │
├─────────────────────────────────────────────────────────┤
│ phashThreshold    │ 6            │ 8         │ 12        │
│ ssimThreshold     │ 0.90         │ 0.82      │ 0.70      │
├─────────────────────────────────────────────────────────┤
│ 거짓 양성율       │ 매우 낮음    │ 낮음      │ 중간      │
│ 거짓 음성율       │ 높음         │ 중간      │ 매우 낮음 │
│ 검사 시간         │ 짧음         │ 중간      │ 길음      │
├─────────────────────────────────────────────────────────┤
│ 추천 상황         │ 중요한 사진  │ 일반적   │ 아카이브  │
│                   │ 파일 정리    │ 용도     │ 정리      │
└─────────────────────────────────────────────────────────┘
```

#### 각 프리셋 설명

**Conservative (보수적)**
- 중요하고 고유한 사진이 많은 경우
- 실수로 삭제할 위험 최소화
- 일부 실제 중복을 놓칠 수 있음

**Balanced (균형잡힌)** ← 기본값
- 일반적인 사용자 시나리오
- 거짓 양성과 거짓 음성 사이의 균형
- 버스트 모드 사진, 카메라 설정 변화

**Sensitive (민감함)**
- 대규모 아카이브 정리
- 미세한 변형도 감지
- 수동 검토 필요 (거짓 양성 가능)

---

## 6. 플러그인 아키텍처

### 6.1 DetectionPlugin 인터페이스

v0.2부터 감지 알고리즘은 플러그인 구조로 설계됩니다. 각 플러그인은 완전한 감지 전략(Stage 1 해싱 + Stage 2 검증)을 캡슐화합니다.

```typescript
// src/main/engine/plugin-registry.ts

interface DetectionPlugin {
  readonly id: string            // 고유 식별자 (e.g., 'phash-ssim')
  readonly name: string          // 표시 이름 (e.g., 'pHash + SSIM')
  readonly description: string   // 설명
  readonly version: string       // 버전
  readonly builtIn: boolean      // 내장 플러그인 여부

  // Stage 1 (필수): 해시 계산 + 거리 메트릭
  computeHash(imagePath: string): Promise<string>
  computeDistance(hash1: string, hash2: string): number
  readonly defaultHashThreshold: number

  // Stage 2 (선택): 후보 그룹 검증
  verify?(imagePaths: string[], threshold: number): Promise<string[][]>
  readonly defaultVerifyThreshold?: number
}
```

**설계 원칙**:
- Stage 1은 필수 — 해시 계산과 거리 메트릭이 없으면 BK-Tree 그룹화 불가
- Stage 2는 선택 — verify가 없으면 Stage 1 그룹이 그대로 최종 결과
- 각 플러그인이 기본 임계값을 제공 — 사용자가 오버라이드 가능

### 6.2 PluginRegistry

```typescript
// src/main/engine/plugin-registry.ts

class PluginRegistry {
  register(plugin: DetectionPlugin): void     // 플러그인 등록
  get(id: string): DetectionPlugin | undefined
  getEnabled(): DetectionPlugin[]             // 활성화된 플러그인 목록
  setEnabled(id: string, enabled: boolean)    // on/off 토글
  list(): PluginInfo[]                        // UI용 정보 목록

  loadState(enabledPlugins: Record<string, boolean>): void  // 설정 복원
  exportState(): Record<string, boolean>                    // 설정 저장
}

// 싱글턴
export const pluginRegistry = new PluginRegistry()
```

**초기화 흐름**:
```
app.whenReady()
  → initCqrs()
    → pluginRegistry.register(phashSsimPlugin)   // 내장 플러그인 등록
    → pluginRegistry.loadState(settings.scan.enabledPlugins)  // 설정 복원
    → registerAllCqrsHandlers(...)
```

### 6.3 내장 플러그인: pHash + SSIM

```typescript
// src/main/engine/plugins/phash-ssim.ts

export const phashSsimPlugin: DetectionPlugin = {
  id: 'phash-ssim',
  name: 'pHash + SSIM',
  description: 'DCT 기반 지각 해시(Stage 1) + 구조적 유사도(Stage 2) 검증',
  version: '1.0.0',
  builtIn: true,
  defaultHashThreshold: 8,
  defaultVerifyThreshold: 0.82,

  computeHash: computePhash,        // 기존 phash.ts 재사용
  computeDistance: hammingDistance,  // 기존 phash.ts 재사용
  verify: verifySsimGroup,          // 기존 ssim.ts 재사용
}
```

기존 알고리즘 코드(phash.ts, ssim.ts, bk-tree.ts)는 변경 없이 그대로 유지됩니다. 플러그인은 이들을 조합하는 **어댑터** 역할만 합니다.

### 6.4 CQRS 연동

```
Renderer                              Main
  │                                    │
  ├─ query('plugin.list') ──────────►  PluginRegistry.list() → PluginInfo[]
  ├─ command('plugin.toggle', {       
  │     pluginId, enabled }) ────────►  PluginRegistry.setEnabled()
  │                                    + saveSettings('scan', { enabledPlugins })
  └─ command('scan.start', opts) ───►  pluginRegistry.getEnabled()[0]
                                       → new ScanEngine({ plugin, ... })
```

### 6.5 확장 가이드 (새 플러그인 추가)

향후 ORB, dHash, 딥러닝 등 새 알고리즘을 추가하려면:

1. `src/main/engine/plugins/` 아래에 새 파일 생성
2. `DetectionPlugin` 인터페이스 구현
3. `initCqrs()`에서 `pluginRegistry.register()` 호출
4. 끝 — UI에 자동으로 나타남 (Settings > 스캔 > 감지 알고리즘)

```typescript
// 예시: dHash + MSE 플러그인
export const dhashMsePlugin: DetectionPlugin = {
  id: 'dhash-mse',
  name: 'dHash + MSE',
  description: '차이 해시(Stage 1) + 평균 제곱 오차(Stage 2) 검증',
  version: '1.0.0',
  builtIn: true,
  defaultHashThreshold: 10,
  defaultVerifyThreshold: 0.05,

  computeHash: computeDhash,
  computeDistance: hammingDistance,
  verify: verifyMseGroup,
}
```

## 7. ScanEngine 오케스트레이션

### 7.1 전체 플로우

```typescript
/**
 * ScanEngine: Orchestrates the 2-stage duplicate detection pipeline.
 * v0.2: Plugin-based — 알고리즘을 DetectionPlugin으로 주입받음
 *
 * Stage 1: plugin.computeHash() + BK-Tree grouping (plugin.computeDistance)
 * Stage 2: plugin.verify() (선택, 없으면 Stage 1 그룹 그대로 사용)
 * Quality scoring + master selection per group (품질 평가는 플러그인 독립)
 */
export class ScanEngine {
  private plugin: DetectionPlugin
  private hashThreshold: number
  private verifyThreshold: number
  private batchSize: number

  constructor(options: ScanEngineOptions) {
    this.plugin = options.plugin
    this.hashThreshold = options.hashThreshold ?? options.plugin.defaultHashThreshold
    this.verifyThreshold = options.verifyThreshold ?? options.plugin.defaultVerifyThreshold ?? 0.82
    this.batchSize = options.batchSize ?? 100
  }
}
```

### 7.2 실행 흐름도

```
scanFiles(filePaths[], onProgress, signal?)
    │
    ├─ Stage 1: 해시 계산 (배치 처리)
    │   for each 100 files:
    │     └─ plugin.computeHash(filePath) → hash
    │        └─ emit progress(processedFiles, groups=0)
    │
    ├─ Stage 1b: BK-Tree 그룹화
    │   └─ groupByDistance(items, hashThreshold, plugin.computeDistance)
    │      └─ [candidateIds[], ...]
    │
    └─ Stage 2: 검증 + 품질 평가
        for each candidateGroup:
            ├─ plugin.verify?.(paths[], verifyThreshold)
            │   └─ 없으면 [candidatePaths] 그대로 사용
            │
            ├─ for each subGroup:
            │   ├─ computeQualityScore(path) → score (0-100)
            │   ├─ getExifData(path) → metadata
            │   └─ 최고 품질 = masterId
            │
            └─ emit progress(processedFiles, groups++)

return ScanResult {
  groups: GroupResult[],
  totalFiles: number,
  processedFiles: number,
  elapsed: number
}
```

### 6.3 데이터 구조

```typescript
export interface PhotoResult {
  id: string                    // UUID
  path: string                  // 파일 경로
  phash: string                 // 16진수 해시
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
}

export interface GroupResult {
  id: string              // 그룹 UUID
  photos: PhotoResult[]   // 그룹 내 사진들
  masterId: string        // 최고 품질 사진의 ID
}

export interface ScanResult {
  groups: GroupResult[]
  totalFiles: number      // 입력 파일 수
  processedFiles: number  // 처리된 파일 수
  elapsed: number         // 소요 시간(초)
}
```

---

## 7. 성능 고려사항

### 7.1 각 단계의 시간복잡도

| 단계 | 입력 | 시간복잡도 | 예상 시간 (200K) |
|------|------|----------|----------|
| **pHash 계산** | N파일 | O(N) | ~15-20분 |
| **DCT (per image)** | 32x32 | O(N²) = O(1024) | ~1ms/image |
| **BK-Tree 삽입** | N items | O(N log N) | ~5분 |
| **BK-Tree 쿼리** | N queries, K결과/쿼리 | O(N log N) 평균 | ~5분 |
| **SSIM (per pair)** | 256x256, 8x8 window | O(W²) = O(1024) | ~50ms/pair |
| **SSIM 검증** | M그룹, 그룹당 P쌍 | O(M × P²) | ~1-5분 (M에 따라) |
| **품질 점수** | N파일 | O(N × 512²) | ~5-10분 |
| **전체 파이프라인** | 200K파일 | O(N + M×P²) | **< 30분** |

### 7.2 200K 이미지 최적화 전략

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

### 7.3 진행률 콜백

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
}
```

### 7.4 중단 신호 (AbortSignal)

```typescript
const controller = new AbortController()

scanEngine.scanFiles(filePaths, onProgress, controller.signal)
  .catch(err => console.log('Aborted:', err.message))

// 사용자가 "취소" 클릭하면
controller.abort()
```

---

## 8. IPC 검증 및 설정

### 8.1 설정 스키마 (validators.ts)

```typescript
export const scanStartSchema = z.object({
  mode: z.enum(['full', 'date_range', 'folder_only', 'incremental']),
  phashThreshold: z.number().min(4).max(16),
  ssimThreshold: z.number().min(0.5).max(0.95),
  timeWindowHours: z.number().min(0).max(24),
  parallelThreads: z.number().min(1).max(16),
  batchSize: z.number().optional(),
})
```

**필드 설명**:
- `phashThreshold`: 4-16 범위의 Hamming 거리 임계값
- `ssimThreshold`: 0.5-0.95 범위의 SSIM 점수 임계값
- `mode`: 스캔 모드 (전체/날짜범위/폴더만/증분)
- `timeWindowHours`: 날짜 범위 모드에서 시간 창
- `parallelThreads`: 병렬 처리 스레드 수
- `batchSize`: 배치당 파일 수

---

## 9. 실제 사용 예시

### 9.1 기본 사용법

```typescript
import { ScanEngine } from '@main/engine/scan-engine'
import { phashSsimPlugin } from '@main/engine/plugins/phash-ssim'

// 플러그인 기반 스캔 엔진 생성
const engine = new ScanEngine({
  plugin: phashSsimPlugin,
  // hashThreshold, verifyThreshold는 플러그인 기본값 사용 (8, 0.82)
  batchSize: 100
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

// 결과 분석
for (const group of result.groups) {
  console.log(`\n그룹 ${group.id}:`)
  console.log(`  마스터: ${group.photos.find(p => p.id === group.masterId)?.path}`)
  console.log(`  품질 점수: ${group.photos.map(p => p.qualityScore).join(', ')}`)
  console.log(`  중복: ${group.photos.length}개`)
}
```

### 9.2 커스텀 설정 (보수적)

```typescript
const engine = new ScanEngine({
  plugin: phashSsimPlugin,
  hashThreshold: 6,      // 플러그인 기본값(8) 오버라이드
  verifyThreshold: 0.90, // 플러그인 기본값(0.82) 오버라이드
  batchSize: 50
})
```

### 9.3 중단 처리

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

## 10. 참고 자료

### 학술 논문
- **pHash**: Zauner, C. (2010). "Implementation and Benchmarking of Perceptual Image Hash Functions"
- **SSIM**: Wang, Z., Bovik, A. C., Sheikh, H. R., & Simoncelli, E. P. (2004). "Image Quality Assessment: From Error Visibility to Structural Similarity"
- **BK-Tree**: Burkhard, W. A., & Keller, R. M. (1973). "Some approaches to best-match file searching"

### 외부 라이브러리
- **sharp**: Image processing (resizing, DCT, convolution)
- **exifr**: EXIF metadata extraction
- **zod**: Schema validation

### OptiShot 소스 파일
- `/src/main/engine/plugin-registry.ts` - DetectionPlugin 인터페이스 + PluginRegistry
- `/src/main/engine/plugins/phash-ssim.ts` - 내장 pHash+SSIM 플러그인
- `/src/main/engine/phash.ts` - pHash 계산 및 DCT
- `/src/main/engine/bk-tree.ts` - BK-Tree 구현 (distanceFn 주입)
- `/src/main/engine/ssim.ts` - SSIM 계산
- `/src/main/engine/quality.ts` - Laplacian variance 기반 품질 점수
- `/src/main/engine/scan-engine.ts` - 플러그인 기반 오케스트레이션
- `/src/main/cqrs/handlers/plugin.ts` - plugin.list / plugin.toggle CQRS 핸들러
- `/src/shared/plugins.ts` - PluginInfo UI 타입

---

## 11. 트러블슈팅

### 문제: "거짓 양성이 많다" (실제 중복이 아닌데 탐지됨)

**원인**: ssimThreshold가 너무 낮음  
**해결**:
```typescript
// 기본값에서 증가
ssimThreshold: 0.85  // 0.82에서 올림
```

### 문제: "거짓 음성이 많다" (실제 중복을 놓침)

**원인**: phashThreshold가 너무 높거나 ssimThreshold가 너무 높음  
**해결**:
```typescript
// phashThreshold 감소
phashThreshold: 6    // 8에서 내림

// 또는 ssimThreshold 감소
ssimThreshold: 0.80  // 0.82에서 내림
```

### 문제: "메모리 부족" 오류

**원인**: 200K+ 이미지의 SSIM 쌍별 계산으로 메모리 초과  
**해결**:
```typescript
// 배치 크기 감소
batchSize: 50    // 100에서 내림

// 또는 phashThreshold 증가 (1차 그룹 감소)
phashThreshold: 10  // 8에서 올림
```

### 문제: "스캔 시간이 길다" (30분 초과)

**원인**: 과도한 SSIM 계산 (큰 그룹 많음)  
**해결**:
```typescript
// 1차 필터 강화
phashThreshold: 10

// 또는 SSIM 임계값 증가
ssimThreshold: 0.88
```

---

## 최종 정리

OptiShot의 감지 파이프라인은 v0.2부터 **플러그인 아키텍처**로 설계됩니다:

1. **DetectionPlugin**: 감지 알고리즘을 캡슐화 (Stage 1 해싱 + Stage 2 검증)
2. **PluginRegistry**: 플러그인 등록/활성화/상태 관리 (싱글턴)
3. **ScanEngine**: 플러그인을 주입받아 2-Stage 파이프라인 실행
4. **품질 평가**: Laplacian variance 기반 (플러그인 독립)
5. **설정 UI**: Settings > 스캔 탭에서 알고리즘 on/off 토글

**내장 플러그인** (phash-ssim):
- Stage 1: DCT 기반 pHash + Hamming distance + BK-Tree 그룹화
- Stage 2: SSIM + Greedy Clustering 검증
- 기본값: hashThreshold=8, verifyThreshold=0.82

**성능 목표**:
- 200K 이미지: < 30분
- 거짓 양성/음성: 최소화
- 메모리 사용: ~ 500MB (SSIM 캐시)
