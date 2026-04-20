// @TASK P4-R1 - Export service unit tests
// @TEST tests/unit/services/export.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type AppDatabase } from '@main/db'
import { photos, photoGroups, exportJobs } from '@main/db/schema'
import {
  startExport,
  pauseExport,
  cancelExport,
  resolveConflict,
  _resetActiveExport,
} from '@main/services/export'
import type { ExportOptions, ExportResult } from '@main/services/export'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// --- Helpers ---

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'optishot-export-test-'))
}

function seedExportData(
  db: AppDatabase,
  sourceDir: string,
  fileNames: string[],
  opts?: { isMaster?: boolean[] },
): { groupId: string; photoIds: string[] } {
  const groupId = 'group-1'
  const photoIds = fileNames.map((_, i) => `photo-${i + 1}`)

  // Create group (reviewed = eligible for export)
  db.insert(photoGroups).values({
    id: groupId,
    fileCount: fileNames.length,
    totalSize: fileNames.length * 1000,
    reclaimableSize: 1000,
    masterId: photoIds[0] ?? null,
    reviewStatus: 'reviewed',
  }).run()

  // Create photos and source files
  for (let i = 0; i < fileNames.length; i++) {
    const filePath = join(sourceDir, fileNames[i])
    writeFileSync(filePath, `content-of-${fileNames[i]}`)

    const isMaster = opts?.isMaster?.[i] ?? (i === 0)
    db.insert(photos).values({
      id: photoIds[i],
      filename: fileNames[i],
      path: filePath,
      fileSize: 1000,
      width: 640,
      height: 480,
      qualityScore: 80,
      phash: `hash-${photoIds[i]}`,
      isMaster,
      groupId,
      thumbnailPath: '',
    }).run()
  }

  return { groupId, photoIds }
}

// --- Tests ---

describe('ExportService', () => {
  let db: AppDatabase
  let sourceDir: string
  let targetDir: string

  beforeEach(() => {
    db = createTestDb(':memory:')
    sourceDir = createTempDir()
    targetDir = createTempDir()
    _resetActiveExport()
  })

  afterEach(() => {
    db.$client.close()
    // Clean up temp dirs
    try { rmSync(sourceDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(targetDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  // --- resolveConflict ---

  describe('resolveConflict', () => {
    it('should return original path when no conflict exists', () => {
      const result = resolveConflict(join(targetDir, 'photo.jpg'), 'skip')
      expect(result).toBe(join(targetDir, 'photo.jpg'))
    })

    it('should return empty string when strategy is skip and file exists', () => {
      const filePath = join(targetDir, 'photo.jpg')
      writeFileSync(filePath, 'existing')

      const result = resolveConflict(filePath, 'skip')
      expect(result).toBe('')
    })

    it('should return original path when strategy is overwrite and file exists', () => {
      const filePath = join(targetDir, 'photo.jpg')
      writeFileSync(filePath, 'existing')

      const result = resolveConflict(filePath, 'overwrite')
      expect(result).toBe(filePath)
    })

    it('should append _1 when strategy is rename and file exists', () => {
      const filePath = join(targetDir, 'photo.jpg')
      writeFileSync(filePath, 'existing')

      const result = resolveConflict(filePath, 'rename')
      expect(result).toBe(join(targetDir, 'photo_1.jpg'))
    })

    it('should increment suffix when renamed file also exists', () => {
      const filePath = join(targetDir, 'photo.jpg')
      writeFileSync(filePath, 'existing')
      writeFileSync(join(targetDir, 'photo_1.jpg'), 'existing')
      writeFileSync(join(targetDir, 'photo_2.jpg'), 'existing')

      const result = resolveConflict(filePath, 'rename')
      expect(result).toBe(join(targetDir, 'photo_3.jpg'))
    })
  })

  // --- startExport: copy ---

  describe('startExport - copy', () => {
    it('should copy master photos to target directory', async () => {
      seedExportData(db, sourceDir, ['a.jpg', 'b.jpg'], {
        isMaster: [true, true],
      })
      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      const result = await startExport(db, options, vi.fn())

      expect(result.totalFiles).toBe(2)
      expect(result.processedFiles).toBe(2)
      expect(result.failedCount).toBe(0)
      expect(existsSync(join(targetDir, 'a.jpg'))).toBe(true)
      expect(existsSync(join(targetDir, 'b.jpg'))).toBe(true)
      // Originals still exist (copy, not move)
      expect(existsSync(join(sourceDir, 'a.jpg'))).toBe(true)
      expect(existsSync(join(sourceDir, 'b.jpg'))).toBe(true)
    })

    it('should only export master photos (isMaster=true)', async () => {
      seedExportData(db, sourceDir, ['a.jpg', 'b.jpg', 'c.jpg'], {
        isMaster: [true, false, true],
      })
      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      const result = await startExport(db, options, vi.fn())

      expect(result.totalFiles).toBe(2) // only a.jpg and c.jpg (masters)
      expect(existsSync(join(targetDir, 'a.jpg'))).toBe(true)
      expect(existsSync(join(targetDir, 'b.jpg'))).toBe(false)
      expect(existsSync(join(targetDir, 'c.jpg'))).toBe(true)
    })
  })

  // --- startExport: move ---

  describe('startExport - move', () => {
    it('should move files (copy to target + soft-delete source via trash)', async () => {
      seedExportData(db, sourceDir, ['a.jpg', 'b.jpg'], { isMaster: [true, true] })
      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'move',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      const result = await startExport(db, options, vi.fn())

      expect(result.totalFiles).toBe(2)
      expect(result.processedFiles).toBe(2)
      // Files copied to target
      expect(existsSync(join(targetDir, 'a.jpg'))).toBe(true)
      expect(existsSync(join(targetDir, 'b.jpg'))).toBe(true)
      // Originals removed (trash has backup for restoration)
      expect(existsSync(join(sourceDir, 'a.jpg'))).toBe(false)
      expect(existsSync(join(sourceDir, 'b.jpg'))).toBe(false)
    })
  })

  // --- Conflict strategies ---

  describe('conflict strategies', () => {
    it('should skip files on conflict with skip strategy', async () => {
      seedExportData(db, sourceDir, ['a.jpg'])
      // Pre-place conflicting file at target
      writeFileSync(join(targetDir, 'a.jpg'), 'existing-content')

      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      const result = await startExport(db, options, vi.fn())

      expect(result.processedFiles).toBe(1)
      expect(result.skippedCount).toBe(1)
      // Original file at target should not be overwritten
      expect(readFileSync(join(targetDir, 'a.jpg'), 'utf-8')).toBe('existing-content')
    })

    it('should rename files on conflict with rename strategy', async () => {
      seedExportData(db, sourceDir, ['a.jpg'])
      // Pre-place conflicting file at target
      writeFileSync(join(targetDir, 'a.jpg'), 'existing-content')

      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'rename',
        autoCreateFolder: false,
      }

      const result = await startExport(db, options, vi.fn())

      expect(result.processedFiles).toBe(1)
      expect(result.failedCount).toBe(0)
      // Original file untouched
      expect(readFileSync(join(targetDir, 'a.jpg'), 'utf-8')).toBe('existing-content')
      // Renamed copy exists
      expect(existsSync(join(targetDir, 'a_1.jpg'))).toBe(true)
    })

    it('should overwrite files on conflict with overwrite strategy', async () => {
      seedExportData(db, sourceDir, ['a.jpg'])
      writeFileSync(join(targetDir, 'a.jpg'), 'existing-content')

      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'overwrite',
        autoCreateFolder: false,
      }

      const result = await startExport(db, options, vi.fn())

      expect(result.processedFiles).toBe(1)
      // File should be overwritten with new content
      expect(readFileSync(join(targetDir, 'a.jpg'), 'utf-8')).toBe('content-of-a.jpg')
    })
  })

  // --- autoCreateFolder ---

  describe('autoCreateFolder', () => {
    it('should create target directory when autoCreateFolder=true', async () => {
      seedExportData(db, sourceDir, ['a.jpg'])
      const newTarget = join(targetDir, 'exports', 'batch1')

      const options: ExportOptions = {
        targetPath: newTarget,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: true,
      }

      const result = await startExport(db, options, vi.fn())

      expect(result.processedFiles).toBe(1)
      expect(existsSync(join(newTarget, 'a.jpg'))).toBe(true)
    })

    it('should throw when target does not exist and autoCreateFolder=false', async () => {
      seedExportData(db, sourceDir, ['a.jpg'])
      const newTarget = join(targetDir, 'nonexistent')

      const options: ExportOptions = {
        targetPath: newTarget,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      await expect(startExport(db, options, vi.fn())).rejects.toThrow('Target directory does not exist')
    })
  })

  // --- Progress callback ---

  describe('progress callback', () => {
    it('should fire progress callbacks during export', async () => {
      seedExportData(db, sourceDir, ['a.jpg', 'b.jpg', 'c.jpg'], { isMaster: [true, true, true] })
      const onProgress = vi.fn()

      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      await startExport(db, options, onProgress)

      expect(onProgress).toHaveBeenCalled()
      // Last progress should show all files processed
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0]
      expect(lastCall.processedFiles).toBe(3)
      expect(lastCall.totalFiles).toBe(3)
    })
  })

  // --- Cancel ---

  describe('cancel', () => {
    it('should abort export when cancel is called', async () => {
      // Seed many files to give time to cancel
      const fileNames = Array.from({ length: 20 }, (_, i) => `photo-${i}.jpg`)
      seedExportData(db, sourceDir, fileNames, { isMaster: fileNames.map(() => true) })

      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      // Start export and cancel after first progress
      const onProgress = vi.fn().mockImplementation(() => {
        cancelExport()
      })

      const result = await startExport(db, options, onProgress)

      // Should have processed some but not all files (cancelled mid-way)
      // OR it may process all if they're very fast; at minimum, cancel should not throw
      expect(result.processedFiles).toBeLessThanOrEqual(result.totalFiles)

      // Export job should be marked as failed in DB (schema has no 'cancelled' enum)
      const jobs = db.select().from(exportJobs).all()
      expect(jobs).toHaveLength(1)
      expect(jobs[0].status).toBe('failed')
    })
  })

  // --- DB record ---

  describe('export job DB record', () => {
    it('should create exportJobs record with status=completed', async () => {
      seedExportData(db, sourceDir, ['a.jpg'])
      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      await startExport(db, options, vi.fn())

      const jobs = db.select().from(exportJobs).all()
      expect(jobs).toHaveLength(1)
      expect(jobs[0].status).toBe('completed')
      expect(jobs[0].totalFiles).toBe(1)
      expect(jobs[0].processedFiles).toBe(1)
      expect(jobs[0].action).toBe('copy')
      expect(jobs[0].targetPath).toBe(targetDir)
      expect(jobs[0].conflictStrategy).toBe('skip')
    })
  })

  // --- No selected files ---

  describe('edge cases', () => {
    it('should throw when no master photos exist for export', async () => {
      seedExportData(db, sourceDir, ['a.jpg', 'b.jpg'], {
        isMaster: [false, false],
      })

      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      await expect(startExport(db, options, vi.fn())).rejects.toThrow('No files selected for export')
    })

    it('should prevent concurrent exports', async () => {
      // Seed enough files so the export takes measurable time
      const fileNames = Array.from({ length: 5 }, (_, i) => `file-${i}.jpg`)
      seedExportData(db, sourceDir, fileNames, { isMaster: fileNames.map(() => true) })
      const options: ExportOptions = {
        targetPath: targetDir,
        action: 'copy',
        conflictStrategy: 'skip',
        autoCreateFolder: false,
      }

      // Start first export and immediately pause it so it stays active
      const promise1 = startExport(db, options, () => {
        // Pause on first progress to keep activeExport alive
        try { pauseExport() } catch { /* already paused */ }
      })

      // Give event loop one tick for the export to start and pause
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Second export should fail because first is paused (still active)
      await expect(startExport(db, options, vi.fn())).rejects.toThrow('An export is already running')

      // Cancel the first export so it can finish
      cancelExport()
      await promise1
    })
  })
})
