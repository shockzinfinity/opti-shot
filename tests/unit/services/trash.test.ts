// @TASK P4-R2 - Trash service tests
// @TEST tests/unit/services/trash.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, type AppDatabase } from '@main/db'
import { photos, photoGroups, trashItems } from '@main/db/schema'
import { eq } from 'drizzle-orm'
import {
  moveToTrash,
  restoreFromTrash,
  permanentDelete,
  listTrash,
  getTrashSummary,
  emptyTrash,
  cleanupExpired,
} from '@main/services/trash'
import crypto from 'crypto'

// Mock settings service
vi.mock('@main/services/settings', () => ({
  getSettings: (section: string) => {
    if (section === 'data') {
      return { useSystemTrash: false, trashRetentionDays: 30, autoCacheCleanup: true }
    }
    return {}
  },
}))

describe('TrashService', () => {
  let db: AppDatabase
  let trashDir: string
  let sourceDir: string
  let testPhotoId: string
  let testPhotoPath: string

  /** Insert a photo group + photo record into DB, return the photo ID. */
  function seedPhoto(filename = 'photo.jpg', fileSize = 1024): string {
    const groupId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const filePath = join(sourceDir, filename)

    // Create actual file on disk
    writeFileSync(filePath, Buffer.alloc(fileSize, 0xab))

    // Insert group
    db.insert(photoGroups)
      .values({
        id: groupId,
        fileCount: 1,
        totalSize: fileSize,
        reclaimableSize: 0,
        reviewStatus: 'pending',
      })
      .run()

    // Insert photo
    db.insert(photos)
      .values({
        id: photoId,
        filename,
        path: filePath,
        fileSize,
        width: 100,
        height: 100,
        qualityScore: 80,
        phash: '0000000000000000',
        isMaster: false,
        groupId,
        thumbnailPath: '',
      })
      .run()

    return photoId
  }

  beforeEach(() => {
    db = createTestDb(':memory:')
    trashDir = mkdtempSync(join(tmpdir(), 'optishot-trash-test-'))
    sourceDir = mkdtempSync(join(tmpdir(), 'optishot-source-test-'))
    testPhotoId = seedPhoto()
    testPhotoPath = join(sourceDir, 'photo.jpg')
  })

  afterEach(() => {
    db.$client.close()
    rmSync(trashDir, { recursive: true, force: true })
    rmSync(sourceDir, { recursive: true, force: true })
  })

  // --- moveToTrash ---

  describe('moveToTrash', () => {
    it('should copy file to trash dir and create DB record', () => {
      const record = moveToTrash(db, testPhotoId, trashDir)

      // DB record created
      expect(record.id).toBeDefined()
      expect(record.photoId).toBe(testPhotoId)
      expect(record.originalPath).toBe(testPhotoPath)
      expect(record.filename).toBe('photo.jpg')
      expect(record.fileSize).toBe(1024)
      expect(record.status).toBe('trashed')
      expect(record.deletedAt).toBeDefined()
      expect(record.expiresAt).toBeDefined()

      // File copied to trash directory
      const trashFilePath = join(trashDir, record.id + '_photo.jpg')
      expect(existsSync(trashFilePath)).toBe(true)
    })

    it('should set expiresAt 30 days from now', () => {
      const before = new Date()
      const record = moveToTrash(db, testPhotoId, trashDir)
      const after = new Date()

      const expiresAt = new Date(record.expiresAt)
      const expectedMin = new Date(before.getTime() + 30 * 24 * 60 * 60 * 1000)
      const expectedMax = new Date(after.getTime() + 30 * 24 * 60 * 60 * 1000)

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000)
    })

    it('should delete the original file after copying to trash', () => {
      moveToTrash(db, testPhotoId, trashDir)

      // Original should be removed (backup is in trash)
      expect(existsSync(testPhotoPath)).toBe(false)
    })

    it('should throw for non-existent photo', () => {
      expect(() => moveToTrash(db, 'non-existent-id', trashDir)).toThrow(
        'Photo not found',
      )
    })

    it('should generate a valid UUID for the trash record id', () => {
      const record = moveToTrash(db, testPhotoId, trashDir)

      expect(record.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })
  })

  // --- restoreFromTrash ---

  describe('restoreFromTrash', () => {
    it('should copy file back to original path', () => {
      const record = moveToTrash(db, testPhotoId, trashDir)

      // Original is already deleted by moveToTrash
      expect(existsSync(testPhotoPath)).toBe(false)

      restoreFromTrash(db, record.id, trashDir)

      expect(existsSync(testPhotoPath)).toBe(true)
      // Verify content is the same
      const restored = readFileSync(testPhotoPath)
      expect(restored.length).toBe(1024)
    })

    it('should update status to restored', () => {
      const record = moveToTrash(db, testPhotoId, trashDir)
      restoreFromTrash(db, record.id, trashDir)

      // Verify in DB — listTrash only shows 'trashed', so query directly
      const result = listTrash(db)
      expect(result.items.find((i) => i.id === record.id)).toBeUndefined()
    })

    it('should set restoredAt timestamp', () => {
      const record = moveToTrash(db, testPhotoId, trashDir)
      const before = new Date().toISOString()
      restoreFromTrash(db, record.id, trashDir)
      const after = new Date().toISOString()

      // Query DB directly to check restoredAt
      const row = db.select().from(trashItems).where(eq(trashItems.id, record.id)).get()

      expect(row).toBeDefined()
      expect(row!.status).toBe('restored')
      expect(row!.restoredAt).toBeDefined()
      expect(row!.restoredAt! >= before).toBe(true)
      expect(row!.restoredAt! <= after).toBe(true)
    })

    it('should remove the copy from trash directory', () => {
      const record = moveToTrash(db, testPhotoId, trashDir)
      const trashFilePath = join(trashDir, record.id + '_photo.jpg')
      expect(existsSync(trashFilePath)).toBe(true)

      restoreFromTrash(db, record.id, trashDir)

      expect(existsSync(trashFilePath)).toBe(false)
    })

    it('should throw for non-existent trash record', () => {
      expect(() => restoreFromTrash(db, 'non-existent-id', trashDir)).toThrow(
        'Trash record not found',
      )
    })
  })

  // --- permanentDelete ---

  describe('permanentDelete', () => {
    it('should remove file from trash directory', async () => {
      const record = moveToTrash(db, testPhotoId, trashDir)
      const trashFilePath = join(trashDir, record.id + '_photo.jpg')
      expect(existsSync(trashFilePath)).toBe(true)

      await permanentDelete(db, record.id, trashDir)

      expect(existsSync(trashFilePath)).toBe(false)
    })

    it('should update status to purged', async () => {
      const record = moveToTrash(db, testPhotoId, trashDir)
      await permanentDelete(db, record.id, trashDir)

      const row = db.select().from(trashItems).where(eq(trashItems.id, record.id)).get()

      expect(row).toBeDefined()
      expect(row!.status).toBe('purged')
    })

    it('should throw for non-existent trash record', async () => {
      await expect(permanentDelete(db, 'non-existent-id', trashDir)).rejects.toThrow(
        'Trash record not found',
      )
    })
  })

  // --- listTrash ---

  describe('listTrash', () => {
    it('should return paginated results sorted by deletedAt DESC', () => {
      // Seed 3 photos
      const id1 = seedPhoto('a.jpg', 100)
      const id2 = seedPhoto('b.jpg', 200)
      const id3 = seedPhoto('c.jpg', 300)

      moveToTrash(db, id1, trashDir)
      moveToTrash(db, id2, trashDir)
      moveToTrash(db, id3, trashDir)

      const result = listTrash(db, { limit: 2 })

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(3)

      // Newest first
      const dates = result.items.map((i) => new Date(i.deletedAt).getTime())
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1])
    })

    it('should only return status=trashed items', async () => {
      const id1 = seedPhoto('x.jpg', 100)
      const id2 = seedPhoto('y.jpg', 200)

      const record1 = moveToTrash(db, id1, trashDir)
      moveToTrash(db, id2, trashDir)

      // Permanently delete one
      await permanentDelete(db, record1.id, trashDir)

      const result = listTrash(db)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].filename).toBe('y.jpg')
    })

    it('should return empty result when no trashed items', () => {
      const result = listTrash(db)

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })

    it('should support offset for pagination', () => {
      const id1 = seedPhoto('p1.jpg', 100)
      const id2 = seedPhoto('p2.jpg', 200)
      const id3 = seedPhoto('p3.jpg', 300)

      moveToTrash(db, id1, trashDir)
      moveToTrash(db, id2, trashDir)
      moveToTrash(db, id3, trashDir)

      const page2 = listTrash(db, { offset: 2, limit: 2 })

      expect(page2.items).toHaveLength(1)
      expect(page2.total).toBe(3)
    })
  })

  // --- getTrashSummary ---

  describe('getTrashSummary', () => {
    it('should return correct counts and sizes', () => {
      const id1 = seedPhoto('s1.jpg', 1000)
      const id2 = seedPhoto('s2.jpg', 2000)

      moveToTrash(db, id1, trashDir)
      moveToTrash(db, id2, trashDir)

      const summary = getTrashSummary(db)

      expect(summary.totalFiles).toBe(2)
      expect(summary.totalSize).toBe(3000)
      expect(summary.nextCleanup).toBeDefined()
    })

    it('should return zero values when trash is empty', () => {
      const summary = getTrashSummary(db)

      expect(summary.totalFiles).toBe(0)
      expect(summary.totalSize).toBe(0)
      expect(summary.nextCleanup).toBeNull()
    })

    it('should not count purged or restored items', async () => {
      const id1 = seedPhoto('q1.jpg', 500)
      const id2 = seedPhoto('q2.jpg', 700)

      const record1 = moveToTrash(db, id1, trashDir)
      moveToTrash(db, id2, trashDir)

      await permanentDelete(db, record1.id, trashDir)

      const summary = getTrashSummary(db)
      expect(summary.totalFiles).toBe(1)
      expect(summary.totalSize).toBe(700)
    })
  })

  // --- emptyTrash ---

  describe('emptyTrash', () => {
    it('should delete all trashed items and return count', async () => {
      const id1 = seedPhoto('e1.jpg', 100)
      const id2 = seedPhoto('e2.jpg', 200)
      const id3 = seedPhoto('e3.jpg', 300)

      moveToTrash(db, id1, trashDir)
      moveToTrash(db, id2, trashDir)
      moveToTrash(db, id3, trashDir)

      const count = await emptyTrash(db, trashDir)

      expect(count).toBe(3)

      const result = listTrash(db)
      expect(result.items).toHaveLength(0)
    })

    it('should return 0 when trash is already empty', async () => {
      const count = await emptyTrash(db, trashDir)
      expect(count).toBe(0)
    })
  })

  // --- cleanupExpired ---

  describe('cleanupExpired', () => {
    it('should only delete expired items', async () => {
      const id1 = seedPhoto('exp1.jpg', 100)
      const id2 = seedPhoto('exp2.jpg', 200)

      // Move both to trash
      moveToTrash(db, id1, trashDir)
      moveToTrash(db, id2, trashDir)

      // Manually set one item's expiresAt to the past
      const allItems = db.select().from(trashItems).all()
      const targetItem = allItems.find((i: { filename: string }) => i.filename === 'exp1.jpg')!

      db.update(trashItems)
        .set({ expiresAt: '2020-01-01T00:00:00.000Z' })
        .where(eq(trashItems.id, targetItem.id))
        .run()

      const count = await cleanupExpired(db, trashDir)

      expect(count).toBe(1)

      const result = listTrash(db)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].filename).toBe('exp2.jpg')
    })

    it('should return 0 when nothing is expired', async () => {
      const id1 = seedPhoto('fresh.jpg', 100)
      moveToTrash(db, id1, trashDir)

      const count = await cleanupExpired(db, trashDir)
      expect(count).toBe(0)
    })
  })
})
