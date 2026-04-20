// @TASK P2-R3 - Scan service orchestrator
// @SPEC CLAUDE.md#Architecture — ties Folder Service + ScanEngine via IPC
// @TEST tests/unit/services/scan.test.ts

import { ScanEngine, clearHeicCache } from '@main/engine'
import type { ScanResult } from '@main/engine'
import { pluginRegistry } from '@main/engine/plugin-registry'
import { listFolders } from '@main/services/folder'
import type { FolderRecord } from '@main/services/folder'
import type { AppDatabase } from '@main/db'
import { scans, photos, photoGroups, trashItems, exportItems, exportJobs } from '@main/db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { readdirSync, statSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import type { ScanProgress } from '@shared/types'
import { TRASH_FOLDER_NAME } from '@main/services/trash'
import { SCAN_STATUS } from '@shared/types'

// --- Constants ---

/** Supported image file extensions for scanning. */
const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp', '.gif',
  '.heic', '.heif',
])

// --- Active scan state ---

let activeScan: {
  scanId: string
  abortController: AbortController
  paused: boolean
} | null = null

// --- Types ---

export interface ScanOptions {
  mode: string   // 'full' | 'date_range' | 'folder_only' | 'incremental'
  phashThreshold: number
  ssimThreshold: number
  timeWindowHours: number
  parallelThreads: number
  batchSize?: number
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
  db.delete(exportItems).run()
  db.delete(exportJobs).run()
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
  const filePaths = collectImageFiles(folders)
  if (filePaths.length === 0) {
    throw new Error('No image files found in registered folders')
  }

  // Create scan record in DB
  const scanId = randomUUID()
  const now = new Date().toISOString()

  db.insert(scans).values({
    id: scanId,
    status: SCAN_STATUS.RUNNING,
    totalFiles: filePaths.length,
    processedFiles: 0,
    optionMode: options.mode as 'full' | 'date_range' | 'folder_only' | 'incremental',
    optionPhashThreshold: options.phashThreshold,
    optionSsimThreshold: options.ssimThreshold,
    optionTimeWindowHours: options.timeWindowHours,
    optionParallelThreads: options.parallelThreads,
    startedAt: now,
  }).run()

  // Set up active scan state with AbortController
  const abortController = new AbortController()
  activeScan = {
    scanId,
    abortController,
    paused: false,
  }

  // Get active detection plugin
  const enabledPlugins = pluginRegistry.getEnabled()
  if (enabledPlugins.length === 0) {
    throw new Error('No detection plugin enabled')
  }
  const activePlugin = enabledPlugins[0]

  // Create engine with plugin + user options
  const engine = new ScanEngine({
    plugin: activePlugin,
    hashThreshold: options.phashThreshold,
    verifyThreshold: options.ssimThreshold,
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
    throw new Error('No active scan to pause')
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
    throw new Error('No active scan to cancel')
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
