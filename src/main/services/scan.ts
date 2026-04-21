// @TASK P2-R3 - Scan service orchestrator
// @SPEC CLAUDE.md#Architecture — ties Folder Service + ScanEngine via IPC
// @TEST tests/unit/services/scan.test.ts

import { ScanEngine, clearHeicCache } from '@main/engine'
import type { ScanResult } from '@main/engine'
import exifr from 'exifr'
import { sharpFromPath } from '@main/engine/heic'
import { algorithmRegistry } from '@main/engine/algorithm-registry'
import { listFolders } from '@main/services/folder'
import type { FolderRecord } from '@main/services/folder'
import type { AppDatabase } from '@main/db'
import { scans, photos, photoGroups, trashItems } from '@main/db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { readdirSync, statSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import type { ScanProgress } from '@shared/types'
import { TRASH_FOLDER_NAME } from '@main/services/trash'
import { SCAN_STATUS } from '@shared/types'
import { IMAGE_EXTENSIONS } from '@shared/constants'

// --- Active scan state ---

let activeScan: {
  scanId: string
  abortController: AbortController
  paused: boolean
} | null = null

// --- Types ---

export interface ScanOptions {
  mode: string   // 'full' | 'date_range' | 'folder_only'
  hashAlgorithms: string[]
  hashThresholds: Record<string, number>
  mergeStrategy: 'union' | 'intersection'
  verifyAlgorithms: string[]
  verifyThresholds: Record<string, number>
  timeWindowHours: number
  parallelThreads: number
  batchSize?: number
  // EXIF filters
  enableExifFilter?: boolean
  exifDateStart?: string | null   // ISO date
  exifDateEnd?: string | null     // ISO date
  exifCameraFilter?: string       // comma-separated camera model names (include)
  exifMinWidth?: number           // 0 = disabled
  exifMinHeight?: number          // 0 = disabled
  exifGpsFilter?: string          // 'all' | 'with_gps' | 'without_gps'
}

// --- EXIF Filtering ---

/** EXIF fields to pick per filter type. */
const EXIF_PICK = {
  date: ['DateTimeOriginal'],
  camera: ['Make', 'Model'],
  gps: ['GPSLatitude'],
  dims: ['ExifImageWidth', 'ExifImageHeight', 'ImageWidth', 'ImageHeight'],
} as const

/**
 * Check if a single file passes the active EXIF filters.
 * Returns true if the file should be included in the scan.
 */
async function checkFileExif(
  filePath: string,
  pickList: string[],
  filters: {
    needDate: boolean; dateStart: Date | null; dateEnd: Date | null
    needCamera: boolean; cameraKeywords: string[]
    needGps: boolean; gpsFilter: string
    needDimensions: boolean; minW: number; minH: number
  },
): Promise<boolean> {
  try {
    const exif = pickList.length > 0 ? await exifr.parse(filePath, { pick: pickList }) : null

    if (filters.needDate && exif?.DateTimeOriginal instanceof Date) {
      if (filters.dateStart && exif.DateTimeOriginal < filters.dateStart) return false
      if (filters.dateEnd && exif.DateTimeOriginal > filters.dateEnd) return false
    }

    if (filters.needCamera) {
      const model = [exif?.Make, exif?.Model].filter(Boolean).join(' ').toLowerCase()
      if (!model || !filters.cameraKeywords.some((kw) => model.includes(kw))) return false
    }

    if (filters.needGps) {
      const hasGps = exif?.GPSLatitude != null
      if (filters.gpsFilter === 'with_gps' && !hasGps) return false
      if (filters.gpsFilter === 'without_gps' && hasGps) return false
    }

    if (filters.needDimensions) {
      let w = exif?.ExifImageWidth ?? exif?.ImageWidth ?? 0
      let h = exif?.ExifImageHeight ?? exif?.ImageHeight ?? 0
      if (w === 0 || h === 0) {
        try {
          const meta = await (await sharpFromPath(filePath)).metadata()
          w = meta.width ?? 0
          h = meta.height ?? 0
        } catch { /* include on failure */ }
      }
      if (filters.minW > 0 && w > 0 && w < filters.minW) return false
      if (filters.minH > 0 && h > 0 && h < filters.minH) return false
    }

    return true
  } catch {
    // EXIF unreadable → treat as no-EXIF file
    if (filters.needCamera) return false
    if (filters.needGps && filters.gpsFilter === 'with_gps') return false
    return true
  }
}

/** Concurrency limit for parallel EXIF reads. */
const EXIF_CONCURRENCY = 32

/**
 * Apply EXIF-based filters to file list before scanning.
 * Runs checks in parallel batches (32 concurrent) for speed.
 * Only reads the minimal EXIF fields needed by active filters.
 */
async function applyExifFilters(
  filePaths: string[],
  options: ScanOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<{ filtered: string[]; excludedCount: number }> {
  if (!options.enableExifFilter) {
    return { filtered: filePaths, excludedCount: 0 }
  }

  const dateStart = options.exifDateStart ? new Date(options.exifDateStart) : null
  const dateEnd = options.exifDateEnd ? new Date(options.exifDateEnd) : null
  const cameraKeywords = (options.exifCameraFilter ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const minW = options.exifMinWidth ?? 0
  const minH = options.exifMinHeight ?? 0
  const gpsFilter = options.exifGpsFilter ?? 'all'

  const needDate = !!(dateStart || dateEnd)
  const needCamera = cameraKeywords.length > 0
  const needGps = gpsFilter !== 'all'
  const needDimensions = minW > 0 || minH > 0

  if (!needDate && !needCamera && !needGps && !needDimensions) {
    return { filtered: filePaths, excludedCount: 0 }
  }

  // Build minimal pick list
  const pickList: string[] = [
    ...(needDate ? EXIF_PICK.date : []),
    ...(needCamera ? EXIF_PICK.camera : []),
    ...(needGps ? EXIF_PICK.gps : []),
    ...(needDimensions ? EXIF_PICK.dims : []),
  ]

  const filters = { needDate, dateStart, dateEnd, needCamera, cameraKeywords, needGps, gpsFilter, needDimensions, minW, minH }

  // Process in parallel batches
  const result: string[] = []
  for (let i = 0; i < filePaths.length; i += EXIF_CONCURRENCY) {
    const batch = filePaths.slice(i, i + EXIF_CONCURRENCY)
    const checks = await Promise.all(
      batch.map((fp) => checkFileExif(fp, pickList, filters)),
    )
    for (let j = 0; j < batch.length; j++) {
      if (checks[j]) result.push(batch[j])
    }
    onProgress?.(Math.min(i + EXIF_CONCURRENCY, filePaths.length), filePaths.length)
  }

  return { filtered: result, excludedCount: filePaths.length - result.length }
}

// --- Exports ---

/**
 * Reset active scan state. Exposed for testing only.
 * @internal
 */
export function _resetActiveScan(): void {
  activeScan = null
}

/**
 * Create a throttled version of the progress callback.
 * Emits at most once per intervalMs to avoid flooding the renderer.
 */
export function createThrottledProgress(
  callback: (progress: ScanProgress) => void,
  intervalMs = 200,
): (progress: ScanProgress) => void {
  let lastEmit = 0
  return (progress: ScanProgress) => {
    const now = Date.now()
    if (now - lastEmit >= intervalMs) {
      callback(progress)
      lastEmit = now
    }
  }
}

/**
 * Collect all image files from registered folder paths.
 * Respects includeSubfolders flag per folder.
 * Silently skips folders that don't exist or aren't accessible.
 */
export function collectImageFiles(folders: FolderRecord[]): string[] {
  const files: string[] = []

  for (const folder of folders) {
    if (!existsSync(folder.path)) continue

    walkDirectory(folder.path, folder.includeSubfolders, files)
  }

  return files
}

/**
 * Walk a directory collecting image files.
 * @param dirPath - Directory to scan
 * @param recursive - Whether to descend into subdirectories
 * @param result - Array to accumulate file paths into
 */
function walkDirectory(dirPath: string, recursive: boolean, result: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dirPath)
  } catch {
    // Directory not readable — skip silently
    return
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      // Cannot stat — skip
      continue
    }

    if (stat.isFile()) {
      const ext = extname(entry).toLowerCase()
      if (IMAGE_EXTENSIONS.has(ext)) {
        result.push(fullPath)
      }
    } else if (stat.isDirectory() && recursive) {
      // Skip trash directories
      if (entry === TRASH_FOLDER_NAME) continue
      walkDirectory(fullPath, true, result)
    }
  }
}

/**
 * Save scan results (groups + photos) to the database.
 * Updates the scan record with discoveredGroups count.
 */
export function saveScanResults(
  db: AppDatabase,
  scanId: string,
  result: ScanResult,
): void {
  // Clear previous scan results (respect FK order: children → parents)
  db.delete(trashItems).run()
  db.delete(photos).run()
  db.delete(photoGroups).run()

  for (const group of result.groups) {
    // Calculate total file size for the group
    let totalSize = 0
    for (const photo of group.photos) {
      try {
        const stat = statSync(photo.path)
        totalSize += stat.size
      } catch {
        // File may have been moved/deleted during scan — use 0
      }
    }

    // Calculate reclaimable size (total - master file size)
    let masterSize = 0
    const masterPhoto = group.photos.find((p) => p.id === group.masterId)
    if (masterPhoto) {
      try {
        masterSize = statSync(masterPhoto.path).size
      } catch {
        // Use 0 if master not accessible
      }
    }
    const reclaimableSize = totalSize - masterSize

    // Insert photo group
    db.insert(photoGroups).values({
      id: group.id,
      fileCount: group.photos.length,
      totalSize,
      reclaimableSize,
      masterId: group.masterId,
      reviewStatus: 'pending',
    }).run()

    // Insert individual photos
    for (const photo of group.photos) {
      let fileSize = 0
      try {
        fileSize = statSync(photo.path).size
      } catch {
        // Use 0 if not accessible
      }

      db.insert(photos).values({
        id: photo.id,
        filename: basename(photo.path),
        path: photo.path,
        fileSize,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        phash: photo.phash,
        qualityScore: photo.qualityScore,
        takenAt: photo.takenAt ?? null,
        cameraModel: photo.cameraModel ?? null,
        lensModel: photo.lensModel ?? null,
        iso: photo.iso ?? null,
        shutterSpeed: photo.shutterSpeed ?? null,
        aperture: photo.aperture ?? null,
        focalLength: photo.focalLength ?? null,
        latitude: photo.latitude ?? null,
        longitude: photo.longitude ?? null,
        isMaster: photo.id === group.masterId,
        groupId: group.id,
      }).run()
    }
  }

  // Update scan record with discovered groups count
  db.update(scans)
    .set({ discoveredGroups: result.groups.length })
    .where(eq(scans.id, scanId))
    .run()
}

/**
 * Start a new scan session.
 *
 * 1. Validates no active scan is running
 * 2. Collects image files from registered folders
 * 3. Creates a scan record in DB
 * 4. Runs ScanEngine with throttled progress
 * 5. Saves results to DB on completion
 *
 * @param db - Database instance (injectable for testing)
 * @param options - Scan configuration
 * @param onProgress - Callback for progress updates
 * @returns Scan result with groups and photos
 */
export async function startScan(
  db: AppDatabase,
  options: ScanOptions,
  onProgress: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  // Layer 1: Guard — only one scan at a time
  if (activeScan) {
    throw new Error('A scan is already running')
  }

  // Layer 2: Get registered folders
  const folders = listFolders(db)
  if (folders.length === 0) {
    throw new Error('No folders registered for scanning')
  }

  // Collect all image file paths
  const allFiles = collectImageFiles(folders)
  if (allFiles.length === 0) {
    throw new Error('No image files found in registered folders')
  }

  // Apply EXIF filters (with progress feedback)
  const { filtered: filePaths, excludedCount: filteredCount } = await applyExifFilters(
    allFiles,
    options,
    (current, total) => {
      onProgress({
        processedFiles: 0,
        totalFiles: total,
        discoveredGroups: 0,
        currentFile: `EXIF filtering... (${current}/${total})`,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: 0,
        scanSpeed: 0,
        skippedCount: 0,
      })
    },
  )
  if (filePaths.length === 0) {
    throw new Error('All files were excluded by EXIF filters')
  }

  // Create scan record in DB
  const scanId = randomUUID()
  const now = new Date().toISOString()

  db.insert(scans).values({
    id: scanId,
    status: SCAN_STATUS.RUNNING,
    totalFiles: filePaths.length,
    processedFiles: 0,
    optionMode: options.mode as 'full' | 'date_range' | 'folder_only',
    optionPhashThreshold: options.hashThresholds['phash'] ?? 0,
    optionSsimThreshold: options.verifyThresholds['ssim'] ?? 0,
    optionTimeWindowHours: options.timeWindowHours,
    optionParallelThreads: options.parallelThreads,
    optionEnableExifFilter: options.enableExifFilter ?? false,
    optionAlgorithmConfig: JSON.stringify({
      hashAlgorithms: options.hashAlgorithms,
      hashThresholds: options.hashThresholds,
      mergeStrategy: options.mergeStrategy,
      verifyAlgorithms: options.verifyAlgorithms,
      verifyThresholds: options.verifyThresholds,
    }),
    filteredFiles: filteredCount,
    startedAt: now,
  }).run()

  // Set up active scan state with AbortController
  const abortController = new AbortController()
  activeScan = {
    scanId,
    abortController,
    paused: false,
  }

  // Resolve algorithm instances from registry

  const hashAlgos = options.hashAlgorithms
    .map((id) => algorithmRegistry.getHash(id))
    .filter((a): a is NonNullable<typeof a> => a != null)

  if (hashAlgos.length === 0) {
    throw new Error('No hash algorithm found')
  }

  const verifyAlgos = options.verifyAlgorithms
    .map((id) => algorithmRegistry.getVerify(id))
    .filter((a): a is NonNullable<typeof a> => a != null)

  // Create engine with new algorithm mode
  const engine = new ScanEngine({
    hashAlgorithms: hashAlgos,
    hashThresholds: options.hashThresholds,
    mergeStrategy: options.mergeStrategy,
    verifyAlgorithms: verifyAlgos,
    verifyThresholds: options.verifyThresholds,
    batchSize: options.batchSize,
  })

  // Throttle progress to avoid flooding the renderer
  const throttledProgress = createThrottledProgress(onProgress, 200)

  try {
    // Run scan
    const result = await engine.scanFiles(
      filePaths,
      throttledProgress,
      abortController.signal,
    )

    // Save results to DB
    saveScanResults(db, scanId, result)

    // Mark scan as completed
    db.update(scans)
      .set({
        status: SCAN_STATUS.COMPLETED,
        processedFiles: result.processedFiles,
        skippedFiles: result.skippedFiles.length,
        elapsedSeconds: result.elapsed,
        progressPercent: 100,
        endedAt: new Date().toISOString(),
      })
      .where(eq(scans.id, scanId))
      .run()

    return result
  } catch (error) {
    // Determine final status
    const isAborted = abortController.signal.aborted
    const status = isAborted
      ? (activeScan?.paused ? SCAN_STATUS.PAUSED : SCAN_STATUS.CANCELLED)
      : SCAN_STATUS.FAILED

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    db.update(scans)
      .set({
        status,
        errorMessage: isAborted ? undefined : errorMessage,
        endedAt: new Date().toISOString(),
      })
      .where(eq(scans.id, scanId))
      .run()

    throw error
  } finally {
    activeScan = null
    clearHeicCache()
  }
}

/**
 * Pause the active scan.
 * Aborts the engine and marks the scan as 'paused' in DB.
 * (ScanEngine doesn't natively support pause — we abort and record state.)
 */
export function pauseScan(): void {
  if (!activeScan) {
    return // Already finished — nothing to pause
  }

  activeScan.paused = true
  activeScan.abortController.abort()
}

/**
 * Cancel the active scan.
 * Aborts the engine and marks the scan as 'cancelled' in DB.
 */
export function cancelScan(): void {
  if (!activeScan) {
    return // Already finished — nothing to cancel
  }

  activeScan.abortController.abort()
}

/**
 * Get the current scan status.
 * Returns state (running/paused/idle) and scan ID if active.
 */
export function getScanStatus(): { state: string; scanId: string | null } {
  if (!activeScan) {
    return { state: 'idle', scanId: null }
  }

  return {
    state: activeScan.paused ? 'paused' : 'running',
    scanId: activeScan.scanId,
  }
}
