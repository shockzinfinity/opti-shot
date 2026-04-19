// @TASK P2-R3 - Scan service unit tests
// @TEST tests/unit/services/scan.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import sharp from 'sharp'
import { createTestDb, type AppDatabase } from '@main/db'
import { addFolder } from '@main/services/folder'
import { scans, photos, photoGroups } from '@main/db/schema'
import { eq } from 'drizzle-orm'
import {
  collectImageFiles,
  saveScanResults,
  startScan,
  cancelScan,
  getScanStatus,
  createThrottledProgress,
  _resetActiveScan,
} from '@main/services/scan'
import type { ScanResult, GroupResult, PhotoResult } from '@main/engine'

// --- Helpers ---

async function generateTestPng(filePath: string, color = { r: 255, g: 0, b: 0 }): Promise<void> {
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: color },
  })
    .png()
    .toFile(filePath)
}

function createMockScanResult(filePaths: string[]): ScanResult {
  const photo1: PhotoResult = {
    id: 'photo-1',
    path: filePaths[0] ?? '/fake/photo1.jpg',
    phash: 'abc123',
    qualityScore: 85,
    ssimScores: new Map(),
  }
  const photo2: PhotoResult = {
    id: 'photo-2',
    path: filePaths[1] ?? '/fake/photo2.jpg',
    phash: 'abc124',
    qualityScore: 72,
    ssimScores: new Map(),
  }

  const group: GroupResult = {
    id: 'group-1',
    photos: [photo1, photo2],
    masterId: 'photo-1',
  }

  return {
    groups: [group],
    totalFiles: filePaths.length,
    processedFiles: filePaths.length,
    elapsed: 1.5,
    skippedFiles: [],
  }
}

// --- Tests ---

describe('ScanService', () => {
  let db: AppDatabase
  let tempDir: string
  let subDir: string

  beforeEach(async () => {
    db = createTestDb(':memory:')
    tempDir = mkdtempSync(join(tmpdir(), 'optishot-scan-test-'))
    subDir = join(tempDir, 'sub')
    mkdirSync(subDir, { recursive: true })

    // Generate test image files
    await generateTestPng(join(tempDir, 'photo1.jpg'), { r: 255, g: 0, b: 0 })
    await generateTestPng(join(tempDir, 'photo2.png'), { r: 0, g: 255, b: 0 })
    await generateTestPng(join(subDir, 'photo3.jpeg'), { r: 0, g: 0, b: 255 })
    // Non-image file
    writeFileSync(join(tempDir, 'readme.txt'), 'not an image')
    writeFileSync(join(tempDir, 'data.csv'), 'col1,col2')

    // Reset active scan state between tests
    _resetActiveScan()
  })

  afterEach(() => {
    db.$client.close()
    rmSync(tempDir, { recursive: true, force: true })
    _resetActiveScan()
  })

  // --- collectImageFiles ---

  describe('collectImageFiles', () => {
    it('should return image files from given folder paths', () => {
      const folders = [
        { id: '1', path: tempDir, includeSubfolders: true, isAccessible: true, addedAt: '' },
      ]
      const files = collectImageFiles(folders)

      // Should find photo1.jpg, photo2.png in tempDir + photo3.jpeg in subDir
      expect(files.length).toBe(3)
      expect(files.some((f) => f.endsWith('photo1.jpg'))).toBe(true)
      expect(files.some((f) => f.endsWith('photo2.png'))).toBe(true)
      expect(files.some((f) => f.endsWith('photo3.jpeg'))).toBe(true)
    })

    it('should respect includeSubfolders=false', () => {
      const folders = [
        { id: '1', path: tempDir, includeSubfolders: false, isAccessible: true, addedAt: '' },
      ]
      const files = collectImageFiles(folders)

      // Should only find photo1.jpg, photo2.png (no subfolder traversal)
      expect(files.length).toBe(2)
      expect(files.some((f) => f.endsWith('photo3.jpeg'))).toBe(false)
    })

    it('should filter by IMAGE_EXTENSIONS only', () => {
      const folders = [
        { id: '1', path: tempDir, includeSubfolders: false, isAccessible: true, addedAt: '' },
      ]
      const files = collectImageFiles(folders)

      // readme.txt and data.csv should be excluded
      expect(files.every((f) => !f.endsWith('.txt') && !f.endsWith('.csv'))).toBe(true)
    })

    it('should handle empty directories gracefully', () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'optishot-empty-'))
      try {
        const folders = [
          { id: '1', path: emptyDir, includeSubfolders: true, isAccessible: true, addedAt: '' },
        ]
        const files = collectImageFiles(folders)
        expect(files).toEqual([])
      } finally {
        rmSync(emptyDir, { recursive: true, force: true })
      }
    })

    it('should collect files from multiple folders', () => {
      const secondDir = mkdtempSync(join(tmpdir(), 'optishot-scan-test2-'))
      try {
        writeFileSync(join(secondDir, 'extra.webp'), Buffer.alloc(10))
        const folders = [
          { id: '1', path: tempDir, includeSubfolders: false, isAccessible: true, addedAt: '' },
          { id: '2', path: secondDir, includeSubfolders: true, isAccessible: true, addedAt: '' },
        ]
        const files = collectImageFiles(folders)
        expect(files.some((f) => f.endsWith('extra.webp'))).toBe(true)
      } finally {
        rmSync(secondDir, { recursive: true, force: true })
      }
    })

    it('should skip inaccessible folders', () => {
      const folders = [
        { id: '1', path: '/nonexistent/path', includeSubfolders: true, isAccessible: true, addedAt: '' },
      ]
      // Should not throw, just return empty
      const files = collectImageFiles(folders)
      expect(files).toEqual([])
    })
  })

  // --- saveScanResults ---

  describe('saveScanResults', () => {
    it('should write groups and photos to DB correctly', () => {
      const scanId = 'scan-001'
      // Insert a scan record first
      db.insert(scans).values({
        id: scanId,
        status: 'running',
        startedAt: new Date().toISOString(),
      }).run()

      const filePaths = [join(tempDir, 'photo1.jpg'), join(tempDir, 'photo2.png')]
      const result = createMockScanResult(filePaths)

      saveScanResults(db, scanId, result)

      // Check photoGroups
      const groups = db.select().from(photoGroups).all()
      expect(groups).toHaveLength(1)
      expect(groups[0].id).toBe('group-1')
      expect(groups[0].fileCount).toBe(2)
      expect(groups[0].masterId).toBe('photo-1')

      // Check photos
      const allPhotos = db.select().from(photos).all()
      expect(allPhotos).toHaveLength(2)

      const master = allPhotos.find((p) => p.id === 'photo-1')
      expect(master?.isMaster).toBe(true)
      expect(master?.phash).toBe('abc123')
      expect(master?.qualityScore).toBe(85)
      expect(master?.groupId).toBe('group-1')

      const nonMaster = allPhotos.find((p) => p.id === 'photo-2')
      expect(nonMaster?.isMaster).toBe(false)

      // Check scan record updated
      const scan = db.select().from(scans).where(eq(scans.id, scanId)).get()
      expect(scan?.discoveredGroups).toBe(1)
    })

    it('should handle empty scan results', () => {
      const scanId = 'scan-empty'
      db.insert(scans).values({
        id: scanId,
        status: 'running',
        startedAt: new Date().toISOString(),
      }).run()

      const emptyResult: ScanResult = {
        groups: [],
        totalFiles: 0,
        processedFiles: 0,
        elapsed: 0.1,
        skippedFiles: [],
      }

      saveScanResults(db, scanId, emptyResult)

      const groups = db.select().from(photoGroups).all()
      expect(groups).toHaveLength(0)

      const scan = db.select().from(scans).where(eq(scans.id, scanId)).get()
      expect(scan?.discoveredGroups).toBe(0)
    })
  })

  // --- startScan ---

  describe('startScan', () => {
    it('should throw when no folders registered', async () => {
      const options = {
        mode: 'full' as const,
        phashThreshold: 8,
        ssimThreshold: 0.9,
        timeWindowHours: 1,
        parallelThreads: 4,
      }

      await expect(startScan(db, options, vi.fn())).rejects.toThrow('No folders registered')
    })

    it('should throw when scan already running', async () => {
      // Register a folder
      addFolder(db, tempDir)

      const options = {
        mode: 'full' as const,
        phashThreshold: 8,
        ssimThreshold: 0.9,
        timeWindowHours: 1,
        parallelThreads: 4,
      }

      // Simulate an already-running scan by starting one without awaiting
      const promise1 = startScan(db, options, vi.fn())

      // The second call should reject immediately
      await expect(startScan(db, options, vi.fn())).rejects.toThrow('already running')

      // Cancel the first so it doesn't hang
      cancelScan()
      // Catch the abort error from the first scan
      await promise1.catch(() => {})
    })
  })

  // --- cancelScan ---

  describe('cancelScan', () => {
    it('should throw when no scan is running', () => {
      expect(() => cancelScan()).toThrow('No active scan')
    })
  })

  // --- getScanStatus ---

  describe('getScanStatus', () => {
    it('should return idle when no scan is running', () => {
      const status = getScanStatus()

      expect(status.state).toBe('idle')
      expect(status.scanId).toBeNull()
    })
  })

  // --- createThrottledProgress ---

  describe('createThrottledProgress', () => {
    it('should throttle callbacks to the given interval', () => {
      const callback = vi.fn()
      const throttled = createThrottledProgress(callback, 100)

      const progress = {
        processedFiles: 1,
        totalFiles: 10,
        discoveredGroups: 0,
        currentFile: 'test.jpg',
        elapsedSeconds: 1,
        estimatedRemainingSeconds: 9,
        scanSpeed: 1,
      }

      // First call should go through immediately
      throttled(progress)
      expect(callback).toHaveBeenCalledTimes(1)

      // Rapid subsequent calls should be throttled
      throttled({ ...progress, processedFiles: 2 })
      throttled({ ...progress, processedFiles: 3 })
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should pass through after interval expires', async () => {
      const callback = vi.fn()
      const throttled = createThrottledProgress(callback, 50)

      const progress = {
        processedFiles: 1,
        totalFiles: 10,
        discoveredGroups: 0,
        currentFile: 'test.jpg',
        elapsedSeconds: 1,
        estimatedRemainingSeconds: 9,
        scanSpeed: 1,
      }

      throttled(progress)
      expect(callback).toHaveBeenCalledTimes(1)

      // Wait for interval to expire
      await new Promise((r) => setTimeout(r, 60))

      throttled({ ...progress, processedFiles: 5 })
      expect(callback).toHaveBeenCalledTimes(2)
    })
  })
})
