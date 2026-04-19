// @TASK P3-R1 - Group service unit tests
// @TEST tests/unit/services/group.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, type AppDatabase } from '@main/db'
import { photoGroups, photos } from '@main/db/schema'
import {
  listGroups,
  getGroupDetail,
  changeMaster,
  markReviewed,
} from '@main/services/group'

// --- Helpers ---

function seedGroup(
  db: AppDatabase,
  groupId: string,
  opts: {
    reviewStatus?: 'pending' | 'reviewed' | 'exported'
    photosData?: Array<{
      id: string
      filename: string
      path: string
      fileSize: number
      qualityScore: number
      isMaster: boolean
    }>
  } = {},
) {
  const status = opts.reviewStatus ?? 'pending'
  const photosData = opts.photosData ?? [
    { id: `${groupId}-p1`, filename: 'photo1.jpg', path: `/img/${groupId}/photo1.jpg`, fileSize: 5000, qualityScore: 90, isMaster: true },
    { id: `${groupId}-p2`, filename: 'photo2.jpg', path: `/img/${groupId}/photo2.jpg`, fileSize: 3000, qualityScore: 70, isMaster: false },
  ]

  const totalSize = photosData.reduce((sum, p) => sum + p.fileSize, 0)
  const masterPhoto = photosData.find((p) => p.isMaster)
  const reclaimableSize = totalSize - (masterPhoto?.fileSize ?? 0)

  db.insert(photoGroups).values({
    id: groupId,
    fileCount: photosData.length,
    totalSize,
    reclaimableSize,
    masterId: masterPhoto?.id ?? photosData[0].id,
    reviewStatus: status,
  }).run()

  for (const photo of photosData) {
    db.insert(photos).values({
      id: photo.id,
      filename: photo.filename,
      path: photo.path,
      fileSize: photo.fileSize,
      width: 1920,
      height: 1080,
      qualityScore: photo.qualityScore,
      phash: `hash-${photo.id}`,
      isMaster: photo.isMaster,
      groupId,
      thumbnailPath: `/thumbs/${photo.id}.webp`,
    }).run()
  }
}

// --- Tests ---

describe('GroupService', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createTestDb(':memory:')
  })

  afterEach(() => {
    db.$client.close()
  })

  // --- listGroups ---

  describe('listGroups', () => {
    it('should return paginated results with defaults', () => {
      seedGroup(db, 'g1')
      seedGroup(db, 'g2')
      seedGroup(db, 'g3')

      const result = listGroups(db, {})

      expect(result.groups).toHaveLength(3)
      expect(result.total).toBe(3)
      // Each item should have expected shape
      const item = result.groups[0]
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('fileCount')
      expect(item).toHaveProperty('totalSize')
      expect(item).toHaveProperty('reclaimableSize')
      expect(item).toHaveProperty('reviewStatus')
      expect(item).toHaveProperty('masterFilename')
    })

    it('should respect limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        seedGroup(db, `g${i}`)
      }

      const page1 = listGroups(db, { limit: 2, offset: 0 })
      expect(page1.groups).toHaveLength(2)
      expect(page1.total).toBe(5)

      const page2 = listGroups(db, { limit: 2, offset: 2 })
      expect(page2.groups).toHaveLength(2)
      expect(page2.total).toBe(5)

      const page3 = listGroups(db, { limit: 2, offset: 4 })
      expect(page3.groups).toHaveLength(1)
      expect(page3.total).toBe(5)
    })

    it('should filter by filename search', () => {
      seedGroup(db, 'g-search', {
        photosData: [
          { id: 'sp1', filename: 'sunset_beach.jpg', path: '/img/sunset_beach.jpg', fileSize: 4000, qualityScore: 85, isMaster: true },
          { id: 'sp2', filename: 'sunset_mountain.jpg', path: '/img/sunset_mountain.jpg', fileSize: 3500, qualityScore: 75, isMaster: false },
        ],
      })
      seedGroup(db, 'g-other', {
        photosData: [
          { id: 'op1', filename: 'cat_portrait.jpg', path: '/img/cat_portrait.jpg', fileSize: 2000, qualityScore: 60, isMaster: true },
          { id: 'op2', filename: 'cat_sleeping.jpg', path: '/img/cat_sleeping.jpg', fileSize: 1800, qualityScore: 55, isMaster: false },
        ],
      })

      const result = listGroups(db, { search: 'sunset' })

      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].id).toBe('g-search')
      expect(result.total).toBe(1)
    })

    it('should filter by review status', () => {
      seedGroup(db, 'g-pending', { reviewStatus: 'pending' })
      seedGroup(db, 'g-reviewed', { reviewStatus: 'reviewed' })
      seedGroup(db, 'g-exported', { reviewStatus: 'exported' })

      const pending = listGroups(db, { status: 'pending' })
      expect(pending.groups).toHaveLength(1)
      expect(pending.groups[0].id).toBe('g-pending')
      expect(pending.total).toBe(1)

      const reviewed = listGroups(db, { status: 'reviewed' })
      expect(reviewed.groups).toHaveLength(1)
      expect(reviewed.groups[0].id).toBe('g-reviewed')
    })

    it('should return correct total count independent of pagination', () => {
      for (let i = 0; i < 10; i++) {
        seedGroup(db, `g${i}`)
      }

      const result = listGroups(db, { limit: 3, offset: 0 })
      expect(result.groups).toHaveLength(3)
      expect(result.total).toBe(10)
    })

    it('should include masterFilename from joined photos', () => {
      seedGroup(db, 'g-master', {
        photosData: [
          { id: 'mp1', filename: 'best_photo.jpg', path: '/img/best_photo.jpg', fileSize: 5000, qualityScore: 95, isMaster: true },
          { id: 'mp2', filename: 'other.jpg', path: '/img/other.jpg', fileSize: 3000, qualityScore: 70, isMaster: false },
        ],
      })

      const result = listGroups(db, {})
      expect(result.groups[0].masterFilename).toBe('best_photo.jpg')
    })

    it('should return empty result when no groups exist', () => {
      const result = listGroups(db, {})
      expect(result.groups).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  // --- getGroupDetail ---

  describe('getGroupDetail', () => {
    it('should return group info with photos ordered by qualityScore', () => {
      seedGroup(db, 'g-detail', {
        photosData: [
          { id: 'dp1', filename: 'low.jpg', path: '/img/low.jpg', fileSize: 2000, qualityScore: 40, isMaster: false },
          { id: 'dp2', filename: 'high.jpg', path: '/img/high.jpg', fileSize: 5000, qualityScore: 95, isMaster: true },
          { id: 'dp3', filename: 'mid.jpg', path: '/img/mid.jpg', fileSize: 3000, qualityScore: 70, isMaster: false },
        ],
      })

      const detail = getGroupDetail(db, 'g-detail')

      // Group fields
      expect(detail.id).toBe('g-detail')
      expect(detail.fileCount).toBe(3)
      expect(detail.reviewStatus).toBe('pending')

      // Photos ordered by qualityScore DESC
      expect(detail.photos).toHaveLength(3)
      expect(detail.photos[0].qualityScore).toBe(95)
      expect(detail.photos[1].qualityScore).toBe(70)
      expect(detail.photos[2].qualityScore).toBe(40)

      // Photo fields
      const photo = detail.photos[0]
      expect(photo).toHaveProperty('id')
      expect(photo).toHaveProperty('filename')
      expect(photo).toHaveProperty('path')
      expect(photo).toHaveProperty('fileSize')
      expect(photo).toHaveProperty('width')
      expect(photo).toHaveProperty('height')
      expect(photo).toHaveProperty('qualityScore')
      expect(photo).toHaveProperty('phash')
      expect(photo).toHaveProperty('isMaster')
      expect(photo).toHaveProperty('thumbnailPath')
    })

    it('should throw for non-existent group', () => {
      expect(() => getGroupDetail(db, 'nonexistent')).toThrow('Group not found')
    })
  })

  // --- changeMaster ---

  describe('changeMaster', () => {
    it('should update isMaster flags correctly', () => {
      seedGroup(db, 'g-cm', {
        photosData: [
          { id: 'cm1', filename: 'old_master.jpg', path: '/img/old_master.jpg', fileSize: 5000, qualityScore: 90, isMaster: true },
          { id: 'cm2', filename: 'new_master.jpg', path: '/img/new_master.jpg', fileSize: 3000, qualityScore: 80, isMaster: false },
        ],
      })

      changeMaster(db, 'g-cm', 'cm2')

      // Verify photo flags
      const allPhotos = db.select().from(photos).all()
      const oldMaster = allPhotos.find((p) => p.id === 'cm1')
      const newMaster = allPhotos.find((p) => p.id === 'cm2')
      expect(oldMaster?.isMaster).toBe(false)
      expect(newMaster?.isMaster).toBe(true)

      // Verify group masterId
      const group = db.select().from(photoGroups).all().find((g) => g.id === 'g-cm')
      expect(group?.masterId).toBe('cm2')
    })

    it('should recalculate reclaimableSize after master change', () => {
      seedGroup(db, 'g-recalc', {
        photosData: [
          { id: 'rc1', filename: 'big.jpg', path: '/img/big.jpg', fileSize: 10000, qualityScore: 90, isMaster: true },
          { id: 'rc2', filename: 'small.jpg', path: '/img/small.jpg', fileSize: 2000, qualityScore: 80, isMaster: false },
        ],
      })

      // Before: reclaimableSize = 12000 - 10000 = 2000
      const before = db.select().from(photoGroups).all().find((g) => g.id === 'g-recalc')
      expect(before?.reclaimableSize).toBe(2000)

      changeMaster(db, 'g-recalc', 'rc2')

      // After: reclaimableSize = 12000 - 2000 = 10000
      const after = db.select().from(photoGroups).all().find((g) => g.id === 'g-recalc')
      expect(after?.reclaimableSize).toBe(10000)
    })

    it('should throw for non-existent group', () => {
      expect(() => changeMaster(db, 'nonexistent', 'photo1')).toThrow('Group not found')
    })

    it('should throw for non-existent photo', () => {
      seedGroup(db, 'g-nophoto')

      expect(() => changeMaster(db, 'g-nophoto', 'nonexistent-photo')).toThrow('Photo not found')
    })
  })

  // --- markReviewed ---

  describe('markReviewed', () => {
    it('should update status and timestamp', () => {
      seedGroup(db, 'g-review', { reviewStatus: 'pending' })

      markReviewed(db, 'g-review')

      const group = db.select().from(photoGroups).all().find((g) => g.id === 'g-review')
      expect(group?.reviewStatus).toBe('reviewed')
      expect(group?.reviewedAt).toBeTruthy()
      // Verify it's a valid ISO date
      expect(() => new Date(group!.reviewedAt!)).not.toThrow()
    })

    it('should throw for non-existent group', () => {
      expect(() => markReviewed(db, 'nonexistent')).toThrow('Group not found')
    })
  })
})
