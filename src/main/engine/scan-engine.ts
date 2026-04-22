// @TASK P2-R2 - ScanEngine orchestrator
// @SPEC CLAUDE.md#Architecture — 2-Stage pipeline

import { groupByDistance } from './bk-tree'
import { mergeGroups } from './group-merger'
import { computeQualityScore, getExifData } from './quality'
import { HashWorkerPool } from './hash-worker-pool'
import type { HashAlgorithm, VerifyAlgorithm } from './algorithm-registry'
import type { ScanProgress } from '@shared/types'
import { randomUUID } from 'crypto'

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
  /** Number of worker threads for parallel hash computation (default: 1 = sequential) */
  parallelThreads?: number
}

/** Result of a single photo in the scan. */
export interface PhotoResult {
  id: string
  path: string
  phash: string
  qualityScore: number
  ssimScores: Map<string, number>
  width: number
  height: number
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

/** A group of duplicate/near-duplicate photos. */
export interface GroupResult {
  id: string
  photos: PhotoResult[]
  masterId: string
}

/** A file that was skipped during scanning. */
export interface SkippedFile {
  path: string
  reason: string
}

/** Overall scan result. */
export interface ScanResult {
  groups: GroupResult[]
  totalFiles: number
  processedFiles: number
  elapsed: number
  skippedFiles: SkippedFile[]
}

/** Progress callback type. */
export type ProgressCallback = (progress: ScanProgress) => void

/**
 * ScanEngine: Orchestrates the 2-stage duplicate detection pipeline.
 *
 * Stage 1: Parallel hash computation (worker threads) + BK-Tree grouping + merge
 * Stage 2: Sequential verification pipeline
 * Quality scoring + master selection per group
 */
export class ScanEngine {
  private hashAlgorithms: HashAlgorithm[]
  private hashThresholds: Record<string, number>
  private mergeStrategy: 'union' | 'intersection'
  private verifyAlgorithms: VerifyAlgorithm[]
  private verifyThresholds: Record<string, number>
  private batchSize: number
  private parallelThreads: number

  constructor(options: ScanEngineAlgorithmOptions) {
    this.hashAlgorithms = options.hashAlgorithms
    this.hashThresholds = options.hashThresholds
    this.mergeStrategy = options.mergeStrategy
    this.verifyAlgorithms = options.verifyAlgorithms
    this.verifyThresholds = options.verifyThresholds
    this.batchSize = options.batchSize ?? 100
    this.parallelThreads = options.parallelThreads ?? 1
  }

  /**
   * Scan files for duplicates using the 2-stage pipeline.
   *
   * @param filePaths - Array of absolute image file paths
   * @param onProgress - Progress callback
   * @param signal - Optional AbortSignal for cancellation
   * @returns Scan results with groups, photos, and master selections
   */
  async scanFiles(
    filePaths: string[],
    onProgress: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<ScanResult> {
    const startTime = Date.now()
    let processedFiles = 0
    const skippedFiles: SkippedFile[] = []

    const emitProgress = (currentFile: string, groups: number): void => {
      const elapsed = (Date.now() - startTime) / 1000
      const speed =
        elapsed > 0 ? processedFiles / elapsed : 0
      const remaining =
        speed > 0
          ? (filePaths.length - processedFiles) / speed
          : 0

      onProgress({
        processedFiles,
        totalFiles: filePaths.length,
        discoveredGroups: groups,
        currentFile,
        elapsedSeconds: elapsed,
        estimatedRemainingSeconds: remaining,
        scanSpeed: speed,
        skippedCount: skippedFiles.length,
      })
    }

    // --- Stage 1: Compute hashes for all files ---
    this.checkAborted(signal)

    const pathById = new Map<string, string>() // id -> path
    const idByPath = new Map<string, string>() // path -> id

    // Per-algorithm hash maps: algoId -> Map<path, hash>
    const algoHashMaps = new Map<string, Map<string, string>>()
    for (const algo of this.hashAlgorithms) {
      algoHashMaps.set(algo.id, new Map())
    }

    // Primary hash map for display (first algorithm)
    const hashMap = new Map<string, string>()

    // Use worker pool for parallel hash computation (≥2 threads)
    const useWorkers = this.parallelThreads >= 2
    let pool: HashWorkerPool | null = null

    try {
      if (useWorkers) {
        pool = new HashWorkerPool(this.parallelThreads)
      }

      // Process in batches for progress reporting
      for (let i = 0; i < filePaths.length; i += this.batchSize) {
        this.checkAborted(signal)

        const batch = filePaths.slice(i, i + this.batchSize)

        if (useWorkers && pool) {
          // --- Parallel mode: dispatch batch to worker pool per algorithm ---
          for (const algo of this.hashAlgorithms) {
            this.checkAborted(signal)
            const { hashes, errors } = await pool.computeBatch(algo.id, batch, signal)

            const algoMap = algoHashMaps.get(algo.id)!
            for (const [fp, hash] of hashes) {
              algoMap.set(fp, hash)
            }
            for (const [fp, reason] of errors) {
              // Only record skip once per file (first algo that fails)
              if (!skippedFiles.some((s) => s.path === fp)) {
                skippedFiles.push({ path: fp, reason })
              }
            }
          }

          // Register IDs and primary hash for successful files
          for (const filePath of batch) {
            const firstAlgoMap = algoHashMaps.get(this.hashAlgorithms[0].id)!
            if (firstAlgoMap.has(filePath)) {
              if (!idByPath.has(filePath)) {
                const id = randomUUID()
                pathById.set(id, filePath)
                idByPath.set(filePath, id)
              }
              hashMap.set(filePath, firstAlgoMap.get(filePath)!)
            }
          }

          processedFiles += batch.length
          emitProgress(batch[batch.length - 1], 0)
        } else {
          // --- Sequential mode (1 thread / test fallback) ---
          for (const filePath of batch) {
            this.checkAborted(signal)

            try {
              for (const algo of this.hashAlgorithms) {
                const hash = await algo.computeHash(filePath)
                algoHashMaps.get(algo.id)!.set(filePath, hash)
              }

              if (!idByPath.has(filePath)) {
                const id = randomUUID()
                pathById.set(id, filePath)
                idByPath.set(filePath, id)
              }

              hashMap.set(filePath, algoHashMaps.get(this.hashAlgorithms[0].id)!.get(filePath)!)
            } catch (err) {
              const reason = err instanceof Error ? err.message : 'Unknown error'
              skippedFiles.push({ path: filePath, reason })
            }

            processedFiles++
            emitProgress(filePath, 0)
          }
        }
      }
    } finally {
      // Always terminate worker pool
      if (pool) {
        await pool.terminate()
      }
    }

    // --- Stage 1b: Group via BK-Tree (per algorithm) + merge ---
    this.checkAborted(signal)

    const validPaths = filePaths.filter((path) => idByPath.has(path))
    const allIds = validPaths.map((path) => idByPath.get(path)!)
    const groupSets: string[][][] = []

    for (const algo of this.hashAlgorithms) {
      const algoHashes = algoHashMaps.get(algo.id)!
      const items = validPaths.map((path) => ({
        id: idByPath.get(path)!,
        hash: algoHashes.get(path)!,
      }))
      const threshold = this.hashThresholds[algo.id] ?? algo.defaultThreshold
      const groups = groupByDistance(items, threshold, algo.computeDistance)
      groupSets.push(groups)
    }

    const candidateGroups = groupSets.length === 1
      ? groupSets[0].filter((g) => g.length >= 2)
      : mergeGroups(groupSets, allIds, this.mergeStrategy)

    // --- Stage 2: Verification for each candidate group ---
    const finalGroups: GroupResult[] = []

    for (const candidateIds of candidateGroups) {
      this.checkAborted(signal)

      const candidatePaths = candidateIds.map((id) => pathById.get(id)!)

      // Sequential verification pipeline
      let verifiedSubGroups: string[][]

      if (this.verifyAlgorithms.length > 0) {
        verifiedSubGroups = [candidatePaths]
        for (const verifier of this.verifyAlgorithms) {
          const threshold = this.verifyThresholds[verifier.id] ?? verifier.defaultThreshold
          const nextGroups: string[][] = []
          for (const group of verifiedSubGroups) {
            if (group.length < 2) continue
            const subGroups = await verifier.verify(group, threshold)
            nextGroups.push(...subGroups)
          }
          verifiedSubGroups = nextGroups
        }
      } else {
        verifiedSubGroups = [candidatePaths]
      }

      for (const subGroupPaths of verifiedSubGroups) {
        if (subGroupPaths.length < 2) continue

        // --- Compute quality scores ---
        const photos: PhotoResult[] = []

        for (const path of subGroupPaths) {
          this.checkAborted(signal)

          let qualityScore = 0
          let exifData: Awaited<ReturnType<typeof getExifData>> | null = null
          try {
            const [score, exif] = await Promise.all([
              computeQualityScore(path),
              getExifData(path),
            ])
            qualityScore = score
            exifData = exif
          } catch {
            // Default to 0 if quality/exif computation fails
          }
          photos.push({
            id: idByPath.get(path)!,
            path,
            phash: hashMap.get(path)!,
            qualityScore,
            ssimScores: new Map(),
            width: exifData?.width ?? 0,
            height: exifData?.height ?? 0,
            takenAt: exifData?.takenAt ?? null,
            cameraModel: exifData?.cameraModel ?? null,
            lensModel: exifData?.lensModel ?? null,
            iso: exifData?.iso ?? null,
            shutterSpeed: exifData?.shutterSpeed ?? null,
            aperture: exifData?.aperture ?? null,
            focalLength: exifData?.focalLength ?? null,
            latitude: exifData?.latitude ?? null,
            longitude: exifData?.longitude ?? null,
          })
        }

        // Select master: highest quality score
        const master = photos.reduce((best, p) =>
          p.qualityScore > best.qualityScore ? p : best,
        )

        finalGroups.push({
          id: randomUUID(),
          photos,
          masterId: master.id,
        })
      }
    }

    const elapsed = (Date.now() - startTime) / 1000

    // Final progress
    emitProgress('', finalGroups.length)

    return {
      groups: finalGroups,
      totalFiles: filePaths.length,
      processedFiles,
      elapsed,
      skippedFiles,
    }
  }

  /** Check if the operation was aborted and throw if so. */
  private checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('Scan aborted')
    }
  }
}
