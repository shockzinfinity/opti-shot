// @TASK P3-R2 - Photo service unit tests
// @TEST tests/unit/services/photo.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import sharp from 'sharp'
import { createTestDb, type AppDatabase } from '@main/db'
import { photos, photoGroups } from '@main/db/schema'
import { getPhotoInfo, generateThumbnail, getThumbnail } from '@main/services/photo'
import crypto from 'crypto'

// --- Helpers ---

async function generateTestImage(filePath: string, width = 640, height = 480): Promise<void> {
  await sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg({ quality: 80 })
    .toFile(filePath)
}

function seedPhotoRecord(
  db: AppDatabase,
  overrides: Partial<{
    id: string
    filename: string
    path: string
    fileSize: number
    width: number
    height: number
    qualityScore: number
    takenAt: string | null
    cameraModel: string | null
    lensModel: string | null
    phash: string
    isMaster: boolean
    groupId: string
    thumbnailPath: string
  }> = {},
) {
  const groupId = overrides.groupId ?? 'group-1'

  // Ensure group exists
  const existingGroup = db.select().from(photoGroups).all().find((g) => g.id === groupId)
  if (!existingGroup) {
    db.insert(photoGroups).values({
      id: groupId,
      fileCount: 2,
      totalSize: 10000,
      reclaimableSize: 5000,
      masterId: null,
      reviewStatus: 'pending',
    }).run()
  }

  const defaults = {
    id: crypto.randomUUID(),
    filename: 'test-photo.jpg',
    path: '/tmp/test-photo.jpg',
    fileSize: 5000,
    width: 640,
    height: 480,
    qualityScore: 85.0,
    takenAt: '2024-01-15T10:30:00.000Z',
    cameraModel: 'Canon EOS R5',
    lensModel: 'RF 50mm f/1.2L',
    phash: 'abcdef1234567890',
    isMaster: false,
    groupId,
    thumbnailPath: '',
  }

  const record = { ...defaults, ...overrides }
  db.insert(photos).values(record).run()
  return record
}

// --- Tests ---

describe('PhotoService', () => {
  let db: AppDatabase
  let tempDir: string
  let cacheDir: string

  beforeEach(() => {
    db = createTestDb(':memory:')
    tempDir = mkdtempSync(join(tmpdir(), 'optishot-photo-test-'))
    cacheDir = join(tempDir, 'cache', 'thumbs')
    mkdirSync(cacheDir, { recursive: true })
  })

  afterEach(() => {
    db.$client.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  // --- getPhotoInfo ---

  describe('getPhotoInfo', () => {
    it('should return correct data for an existing photo', () => {
      const seeded = seedPhotoRecord(db, {
        id: 'photo-abc',
        filename: 'sunset.jpg',
        path: '/photos/sunset.jpg',
        fileSize: 12345,
        width: 1920,
        height: 1080,
        qualityScore: 92.5,
        cameraModel: 'Sony A7IV',
        lensModel: 'FE 24-70mm f/2.8',
        phash: 'deadbeef',
        isMaster: true,
      })

      const info = getPhotoInfo(db, 'photo-abc')

      expect(info.id).toBe('photo-abc')
      expect(info.filename).toBe('sunset.jpg')
      expect(info.path).toBe('/photos/sunset.jpg')
      expect(info.fileSize).toBe(12345)
      expect(info.width).toBe(1920)
      expect(info.height).toBe(1080)
      expect(info.qualityScore).toBe(92.5)
      expect(info.cameraModel).toBe('Sony A7IV')
      expect(info.lensModel).toBe('FE 24-70mm f/2.8')
      expect(info.phash).toBe('deadbeef')
      expect(info.isMaster).toBe(true)
      expect(info.groupId).toBe(seeded.groupId)
    })

    it('should throw for non-existent photo ID', () => {
      expect(() => getPhotoInfo(db, 'nonexistent-id')).toThrow('Photo not found')
    })
  })

  // --- generateThumbnail ---

  describe('generateThumbnail', () => {
    it('should create a thumbnail file and return its path', async () => {
      const imagePath = join(tempDir, 'original.jpg')
      await generateTestImage(imagePath, 1920, 1080)

      const thumbPath = await generateThumbnail(imagePath, cacheDir)

      expect(thumbPath).toBeTruthy()
      expect(existsSync(thumbPath)).toBe(true)
      expect(thumbPath.endsWith('.jpg')).toBe(true)

      // Verify thumbnail dimensions
      const meta = await sharp(thumbPath).metadata()
      expect(meta.width).toBeLessThanOrEqual(200)
      expect(meta.height).toBeLessThanOrEqual(200)
    })

    it('should skip generation if cache already exists', async () => {
      const imagePath = join(tempDir, 'cached.jpg')
      await generateTestImage(imagePath)

      // First call generates
      const path1 = await generateThumbnail(imagePath, cacheDir)
      expect(existsSync(path1)).toBe(true)

      // Second call should return the same path without regenerating
      const path2 = await generateThumbnail(imagePath, cacheDir)
      expect(path2).toBe(path1)
    })

    it('should return empty string for unprocessable image', async () => {
      const badPath = join(tempDir, 'corrupt.jpg')
      // Write non-image data
      const { writeFileSync } = await import('fs')
      writeFileSync(badPath, 'this is not an image')

      const result = await generateThumbnail(badPath, cacheDir)
      expect(result).toBe('')
    })
  })

  // --- getThumbnail ---

  describe('getThumbnail', () => {
    it('should generate thumbnail and update DB record', async () => {
      const imagePath = join(tempDir, 'dbphoto.jpg')
      await generateTestImage(imagePath)

      const seeded = seedPhotoRecord(db, {
        id: 'photo-thumb-1',
        path: imagePath,
        thumbnailPath: '',
      })

      const dataUrl = await getThumbnail(db, 'photo-thumb-1', cacheDir)

      expect(dataUrl).toBeTruthy()
      expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)

      // Verify DB was updated with file path (not data URL)
      const updated = db.select().from(photos).all().find((p) => p.id === 'photo-thumb-1')
      expect(updated?.thumbnailPath).toBeTruthy()
      expect(existsSync(updated!.thumbnailPath)).toBe(true)
    })

    it('should return existing thumbnail if already in DB and file exists', async () => {
      const imagePath = join(tempDir, 'existing.jpg')
      await generateTestImage(imagePath)

      // Pre-generate a thumbnail
      const preThumbPath = await generateThumbnail(imagePath, cacheDir)

      seedPhotoRecord(db, {
        id: 'photo-cached',
        path: imagePath,
        thumbnailPath: preThumbPath,
      })

      const result = await getThumbnail(db, 'photo-cached', cacheDir)

      // Should return data URL of the cached thumbnail
      expect(result.startsWith('data:image/jpeg;base64,')).toBe(true)
    })

    it('should throw for non-existent photo ID', async () => {
      await expect(getThumbnail(db, 'no-such-id', cacheDir)).rejects.toThrow('Photo not found')
    })
  })
})
