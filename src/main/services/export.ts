// @TASK P4-R1 - Export service: copy/move reviewed photos with conflict handling
// @SPEC specs/domain/resources.yaml#export_jobs
// @TEST tests/unit/services/export.test.ts

import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { join, basename, dirname, extname } from 'path'
import { reviewDecisions, photos, exportJobs, exportItems } from '@main/db/schema'
import { moveToTrash } from '@main/services/trash'
import type { AppDatabase } from '@main/db'
import type { ExportProgress, ConflictStrategy, ExportAction } from '@shared/types'

// --- Types ---

export interface ExportOptions {
  targetPath: string
  action: ExportAction           // 'copy' | 'move'
  conflictStrategy: ConflictStrategy  // 'skip' | 'rename' | 'overwrite'
  autoCreateFolder: boolean
}

export interface ExportResult {
  processedFiles: number
  totalFiles: number
  failedCount: number
  skippedCount: number
}

// --- Active export state ---

let activeExport: {
  abortController: AbortController
  paused: boolean
} | null = null

/**
 * Reset active export state. Exposed for testing only.
 * @internal
 */
export function _resetActiveExport(): void {
  activeExport = null
}

// --- Core functions ---

/**
 * Resolve a file path conflict based on the chosen strategy.
 *
 * @param targetPath - The desired target file path
 * @param strategy - How to handle conflicts: 'skip' | 'rename' | 'overwrite'
 * @returns Final file path to use, or empty string if file should be skipped
 */
export function resolveConflict(
  targetPath: string,
  strategy: ConflictStrategy,
): string {
  if (!existsSync(targetPath)) {
    return targetPath
  }

  switch (strategy) {
    case 'skip':
      return '' // Signal to skip this file

    case 'overwrite':
      return targetPath

    case 'rename': {
      const dir = dirname(targetPath)
      const ext = extname(targetPath)
      const nameWithoutExt = basename(targetPath, ext)

      let counter = 1
      let candidate: string
      do {
        candidate = join(dir, `${nameWithoutExt}_${counter}${ext}`)
        counter++
      } while (existsSync(candidate))

      return candidate
    }

    default:
      return targetPath
  }
}

/**
 * Start exporting selected photos to the target directory.
 *
 * 1. Queries reviewDecisions where isExportSelected=true, joined with photos
 * 2. Creates exportJobs record in DB (status='running')
 * 3. Creates target directory if autoCreateFolder
 * 4. For each file: resolve conflicts, copy/move, update progress
 * 5. Updates exportJobs status on completion
 *
 * @param db - Database instance
 * @param options - Export configuration
 * @param onProgress - Progress callback (throttled internally)
 * @returns Export result summary
 */
export async function startExport(
  db: AppDatabase,
  options: ExportOptions,
  onProgress: (progress: ExportProgress) => void,
): Promise<ExportResult> {
  // Layer 1: Guard -- only one export at a time
  if (activeExport) {
    throw new Error('An export is already running')
  }

  // Layer 2: Validate target directory
  if (!options.autoCreateFolder && !existsSync(options.targetPath)) {
    throw new Error(`Target directory does not exist: ${options.targetPath}`)
  }

  if (options.autoCreateFolder && !existsSync(options.targetPath)) {
    mkdirSync(options.targetPath, { recursive: true })
  }

  // Layer 3: Query export-selected files
  const selectedFiles = db
    .select({
      decisionId: reviewDecisions.id,
      photoId: reviewDecisions.photoId,
      groupId: reviewDecisions.groupId,
      filename: photos.filename,
      path: photos.path,
      fileSize: photos.fileSize,
    })
    .from(reviewDecisions)
    .innerJoin(photos, eq(reviewDecisions.photoId, photos.id))
    .where(eq(reviewDecisions.isExportSelected, true))
    .all()

  if (selectedFiles.length === 0) {
    throw new Error('No files selected for export')
  }

  // Calculate total size
  let totalSize = 0
  for (const file of selectedFiles) {
    totalSize += file.fileSize
  }

  // Create export job record
  const jobId = randomUUID()
  db.insert(exportJobs).values({
    id: jobId,
    status: 'running',
    action: options.action,
    targetPath: options.targetPath,
    totalFiles: selectedFiles.length,
    processedFiles: 0,
    totalSize,
    transferredSize: 0,
    transferSpeed: 0,
    conflictStrategy: options.conflictStrategy,
    autoCreateFolder: options.autoCreateFolder,
    failedCount: 0,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: 0,
  }).run()

  // Create export items
  for (const file of selectedFiles) {
    db.insert(exportItems).values({
      exportId: jobId,
      photoId: file.photoId,
      groupId: file.groupId,
    }).run()
  }

  // Set up active export state
  const abortController = new AbortController()
  activeExport = {
    abortController,
    paused: false,
  }

  const startTime = Date.now()
  let processedFiles = 0
  let failedCount = 0
  let skippedCount = 0
  let transferredSize = 0

  try {
    for (const file of selectedFiles) {
      // Check for cancellation
      if (abortController.signal.aborted) {
        break
      }

      // Check for pause (busy-wait with yield)
      while (activeExport?.paused && !abortController.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      if (abortController.signal.aborted) {
        break
      }

      try {
        const targetFilePath = join(options.targetPath, file.filename)
        const resolvedPath = resolveConflict(targetFilePath, options.conflictStrategy)

        if (resolvedPath === '') {
          // Skip this file
          skippedCount++
          processedFiles++
        } else {
          // Copy file to target
          copyFileSync(file.path, resolvedPath)

          // If move action, soft-delete original via trash service (never hard delete)
          if (options.action === 'move') {
            moveToTrash(db, file.photoId)
          }

          // Track transferred size
          try {
            const stat = statSync(resolvedPath)
            transferredSize += stat.size
          } catch {
            transferredSize += file.fileSize
          }

          processedFiles++
        }
      } catch {
        failedCount++
        processedFiles++
      }

      // Emit progress
      const elapsed = (Date.now() - startTime) / 1000
      const speed = elapsed > 0 ? transferredSize / elapsed : 0

      onProgress({
        processedFiles,
        totalFiles: selectedFiles.length,
        transferredSize,
        totalSize,
        speed,
        currentFile: file.filename,
      })
    }

    // Determine final status
    // Note: Schema enum is ['ready','running','paused','completed','failed'].
    // Aborted exports map to 'failed' since 'cancelled' is not in the enum.
    const finalStatus = abortController.signal.aborted ? 'failed' : 'completed'
    const elapsedSeconds = (Date.now() - startTime) / 1000

    // Update export job record
    db.update(exportJobs)
      .set({
        status: finalStatus,
        processedFiles,
        transferredSize,
        transferSpeed: elapsedSeconds > 0 ? transferredSize / elapsedSeconds : 0,
        failedCount,
        elapsedSeconds,
        estimatedRemainingSeconds: 0,
      })
      .where(eq(exportJobs.id, jobId))
      .run()

    return {
      processedFiles,
      totalFiles: selectedFiles.length,
      failedCount,
      skippedCount,
    }
  } catch (error) {
    // Update job as failed
    db.update(exportJobs)
      .set({
        status: 'failed',
        processedFiles,
        failedCount,
        elapsedSeconds: (Date.now() - startTime) / 1000,
      })
      .where(eq(exportJobs.id, jobId))
      .run()

    throw error
  } finally {
    activeExport = null
  }
}

/**
 * Pause the active export.
 * The export loop will wait until resumed or cancelled.
 */
export function pauseExport(): void {
  if (!activeExport) {
    throw new Error('No active export to pause')
  }
  activeExport.paused = true
}

/**
 * Cancel the active export.
 * Aborts the export loop via AbortController.
 */
export function cancelExport(): void {
  if (!activeExport) {
    throw new Error('No active export to cancel')
  }
  activeExport.abortController.abort()
}
