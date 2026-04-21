/** Stage 1: 해시 생성 + 거리 계산 (BK-Tree 그룹핑용) */
export interface HashAlgorithm {
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
export interface VerifyAlgorithm {
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

/**
 * AlgorithmRegistry: 알고리즘 등록소.
 * 순수 등록/조회만 담당. 활성화 상태는 Settings에서 관리.
 */
export class AlgorithmRegistry {
  private hashAlgorithms = new Map<string, HashAlgorithm>()
  private verifyAlgorithms = new Map<string, VerifyAlgorithm>()

  registerHash(algo: HashAlgorithm): void {
    this.hashAlgorithms.set(algo.id, algo)
  }

  registerVerify(algo: VerifyAlgorithm): void {
    this.verifyAlgorithms.set(algo.id, algo)
  }

  getHash(id: string): HashAlgorithm | undefined {
    return this.hashAlgorithms.get(id)
  }

  getVerify(id: string): VerifyAlgorithm | undefined {
    return this.verifyAlgorithms.get(id)
  }

  listHash(): HashAlgorithm[] {
    return Array.from(this.hashAlgorithms.values())
  }

  listVerify(): VerifyAlgorithm[] {
    return Array.from(this.verifyAlgorithms.values())
  }
}

/** Singleton registry instance. */
export const algorithmRegistry = new AlgorithmRegistry()
