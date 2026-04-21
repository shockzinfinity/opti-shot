// @TASK P2-R2 - ScanEngine orchestrator
// @SPEC CLAUDE.md#Architecture — 2-Stage pipeline (plugin-based)

import { groupByDistance } from './bk-tree'
import { computeQualityScore, getExifData } from './quality'
import type { DetectionPlugin } from './plugin-registry'
import type { HashAlgorithm, VerifyAlgorithm } from './algorithm-registry'
import type { ScanProgress } from '@shared/types'
import { randomUUID } from 'crypto'

/** Configuration options for the scan engine (legacy plugin mode). */
export interface ScanEngineOptions {
  /** Detection plugin to use for hashing/verification. */
  plugin: DetectionPlugin
  /** Distance threshold for Stage 1 grouping (overrides plugin default). */
  hashThreshold?: number
  /** Threshold for Stage 2 verification (overrides plugin default). */
  verifyThreshold?: number
  /** Number of files to process per batch (default: 100) */
  batchSize?: number
}

/** Configuration options for the scan engine (new algorithm mode). */
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
 * Stage 1: pHash computation + BK-Tree grouping
 * Stage 2: SSIM verification of candidate groups
 * Quality scoring + master selection per group
 */
export class ScanEngine {
  private plugin: DetectionPlugin | null
  private hashAlgorithms: HashAlgorithm[]
  private hashThresholds: Record<string, number>
  private mergeStrategy: 'union' | 'intersection'
  private verifyAlgorithms: VerifyAlgorithm[]
  private verifyThresholds: Record<string, number>
  private batchSize: number

  // Legacy plugin mode
  private hashThreshold: number
  private verifyThreshold: number

  constructor(options: ScanEngineOptions | ScanEngineAlgorithmOptions) {
    if ('plugin' in options) {
      // Legacy plugin mode
      this.plugin = options.plugin
      this.hashAlgorithms = []
      this.hashThresholds = {}
      this.mergeStrategy = 'union'
      this.verifyAlgorithms = []
      this.verifyThresholds = {}
      this.hashThreshold = options.hashThreshold ?? options.plugin.defaultHashThreshold
      this.verifyThreshold = options.verifyThreshold ?? options.plugin.defaultVerifyThreshold ?? 0.82
    } else {
      // New algorithm mode
      this.plugin = null
      this.hashAlgorithms = options.hashAlgorithms
      this.hashThresholds = options.hashThresholds
      this.mergeStrategy = options.mergeStrategy
      this.verifyAlgorithms = options.verifyAlgorithms
      this.verifyThresholds = options.verifyThresholds
      this.hashThreshold = 0
      this.verifyThreshold = 0
    }
    this.batchSize = options.batchSize ?? 100
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

    // Determine which hash function to use for Stage 1
    const hashFn = this.plugin
      ? this.plugin.computeHash.bind(this.plugin)
      : this.hashAlgorithms[0].computeHash.bind(this.hashAlgorithms[0])

    // hashMap: path -> hash (primary hash for quality/display)
    const hashMap = new Map<string, string>()

    for (let i = 0; i < filePaths.length; i += this.batchSize) {
      this.checkAborted(signal)

      const batch = filePaths.slice(i, i + this.batchSize)
      for (const filePath of batch) {
        this.checkAborted(signal)

        try {
          const hash = await hashFn(filePath)
          const id = randomUUID()

          hashMap.set(filePath, hash)
          pathById.set(id, filePath)
          idByPath.set(filePath, id)
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Unknown error'
          skippedFiles.push({ path: filePath, reason })
        }

        processedFiles++
        emitProgress(filePath, 0)
      }
    }

    // --- Stage 1b: Group via BK-Tree ---
    this.checkAborted(signal)

    const validPaths = filePaths.filter((path) => idByPath.has(path))
    const items = validPaths.map((path) => ({
      id: idByPath.get(path)!,
      hash: hashMap.get(path)!,
    }))

    let candidateGroups: string[][]

    if (this.plugin) {
      // Legacy mode: single plugin
      candidateGroups = groupByDistance(
        items,
        this.hashThreshold,
        this.plugin.computeDistance,
      )
    } else {
      // New algorithm mode: use first hash algorithm (multi-hash in Step 3)
      const algo = this.hashAlgorithms[0]
      const threshold = this.hashThresholds[algo.id] ?? algo.defaultThreshold
      candidateGroups = groupByDistance(
        items,
        threshold,
        algo.computeDistance,
      )
    }

    // --- Stage 2: Verification for each candidate group ---
    const finalGroups: GroupResult[] = []

    for (const candidateIds of candidateGroups) {
      this.checkAborted(signal)

      const candidatePaths = candidateIds.map((id) => pathById.get(id)!)

      // Determine verification pipeline
      let verifiedSubGroups: string[][]

      if (this.plugin) {
        // Legacy mode
        verifiedSubGroups = this.plugin.verify
          ? await this.plugin.verify(candidatePaths, this.verifyThreshold)
          : [candidatePaths]
      } else if (this.verifyAlgorithms.length > 0) {
        // New algorithm mode: sequential pipeline
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
