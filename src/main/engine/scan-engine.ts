// @TASK P2-R2 - ScanEngine orchestrator
// @SPEC CLAUDE.md#Architecture — 2-Stage pipeline (plugin-based)

import { groupByDistance } from './bk-tree'
import { computeQualityScore, getExifData } from './quality'
import type { DetectionPlugin } from './plugin-registry'
import type { ScanProgress } from '@shared/types'
import { randomUUID } from 'crypto'

/** Configuration options for the scan engine. */
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

    // --- Stage 1: Compute pHash for all files ---
    this.checkAborted(signal)

    const hashMap = new Map<string, string>() // path -> hash
    const pathById = new Map<string, string>() // id -> path
    const idByPath = new Map<string, string>() // path -> id

    for (let i = 0; i < filePaths.length; i += this.batchSize) {
      this.checkAborted(signal)

      const batch = filePaths.slice(i, i + this.batchSize)
      for (const filePath of batch) {
        this.checkAborted(signal)

        try {
          const hash = await this.plugin.computeHash(filePath)
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

    const items = filePaths
      .filter((path) => idByPath.has(path))
      .map((path) => ({
        id: idByPath.get(path)!,
        hash: hashMap.get(path)!,
      }))

    const candidateGroups = groupByDistance(
      items,
      this.hashThreshold,
      this.plugin.computeDistance,
    )

    // --- Stage 2: Verification for each candidate group ---
    const finalGroups: GroupResult[] = []

    for (const candidateIds of candidateGroups) {
      this.checkAborted(signal)

      const candidatePaths = candidateIds.map((id) => pathById.get(id)!)

      // Use plugin verification if available, otherwise treat entire group as verified
      const verifiedSubGroups = this.plugin.verify
        ? await this.plugin.verify(candidatePaths, this.verifyThreshold)
        : [candidatePaths]

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
