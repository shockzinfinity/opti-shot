// @TASK P3-R1 - Group management service (listing, search, master selection, review)
// @SPEC specs/domain/resources.yaml#photo_groups
// @TEST tests/unit/services/group.test.ts

import { eq, like, and, desc, sql, count as drizzleCount } from 'drizzle-orm'
import { photoGroups, photos, trashItems } from '@main/db/schema'
import type { AppDatabase } from '@main/db'
import type { ReviewStatus } from '@shared/types'
import { REVIEW_STATUS } from '@shared/types'

// --- Types ---

export interface GroupListItem {
  id: string
  fileCount: number
  totalSize: number
  reclaimableSize: number
  reviewStatus: string
  decision: string | null
  hasPurged: boolean
  masterFilename: string
}

export interface GroupDetail {
  id: string
  fileCount: number
  totalSize: number
  reclaimableSize: number
  masterId: string | null
  reviewStatus: string
  reviewedAt: string | null
  photos: PhotoItem[]
}

export interface PhotoItem {
  id: string
  filename: string
  path: string
  fileSize: number
  width: number
  height: number
  qualityScore: number
  phash: string
  isMaster: boolean
  thumbnailPath: string
  takenAt: string | null
  cameraModel: string | null
  lensModel: string | null
  iso: number | null
  shutterSpeed: string | null
  aperture: number | null
  focalLength: number | null
  trashStatus: string | null // null=not trashed, 'trashed', 'restored', 'purged'
}

export interface ListGroupsOptions {
  offset?: number
  limit?: number
  search?: string
  status?: ReviewStatus
}

// --- Service ---

/**
 * List groups with pagination, optional search by filename, and optional status filter.
 * Returns groups array + total count for pagination.
 */
export function listGroups(
  db: AppDatabase,
  options: ListGroupsOptions,
): { groups: GroupListItem[]; total: number } {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = []

  if (options.status) {
    conditions.push(eq(photoGroups.reviewStatus, options.status))
  }

  // When search is provided, we need to find groups that have at least one photo
  // matching the search term, so we get the distinct group IDs first.
  let matchingGroupIds: string[] | null = null
  if (options.search) {
    const searchPattern = `%${options.search}%`
    const matchingPhotos = db
      .select({ groupId: photos.groupId })
      .from(photos)
      .where(like(photos.filename, searchPattern))
      .all()

    matchingGroupIds = [...new Set(matchingPhotos.map((p) => p.groupId))]

    // If no photos match, return empty immediately
    if (matchingGroupIds.length === 0) {
      return { groups: [], total: 0 }
    }
  }

  // Build base query with conditions
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Get all groups (filtered by status if needed)
  let allGroups = db.select().from(photoGroups).where(whereClause).all()

  // Further filter by matching group IDs from search
  if (matchingGroupIds !== null) {
    const idSet = new Set(matchingGroupIds)
    allGroups = allGroups.filter((g) => idSet.has(g.id))
  }

  const total = allGroups.length

  // Apply pagination
  const paginatedGroups = allGroups.slice(offset, offset + limit)

  // Enrich with masterFilename
  const groups: GroupListItem[] = paginatedGroups.map((group) => {
    // Find the master photo's filename
    const masterPhoto = db
      .select({ filename: photos.filename })
      .from(photos)
      .where(and(eq(photos.groupId, group.id), eq(photos.isMaster, true)))
      .get()

    // Check if any photos in this group have been permanently deleted
    const purgedCount = db
      .select({ count: sql<number>`count(*)` })
      .from(trashItems)
      .innerJoin(photos, eq(trashItems.photoId, photos.id))
      .where(and(eq(photos.groupId, group.id), eq(trashItems.status, 'purged')))
      .get()

    return {
      id: group.id,
      fileCount: group.fileCount,
      totalSize: group.totalSize,
      reclaimableSize: group.reclaimableSize,
      reviewStatus: group.reviewStatus,
      decision: group.decision ?? null,
      hasPurged: (purgedCount?.count ?? 0) > 0,
      masterFilename: masterPhoto?.filename ?? '',
    }
  })

  return { groups, total }
}

/**
 * Get detailed info for a single group including all photos.
 * Photos are ordered by qualityScore DESC.
 * Throws if group not found.
 */
export function getGroupDetail(db: AppDatabase, groupId: string): GroupDetail {
  const group = db
    .select()
    .from(photoGroups)
    .where(eq(photoGroups.id, groupId))
    .get()

  if (!group) {
    throw new Error(`Group not found: ${groupId}`)
  }

  const groupPhotos = db
    .select({
      id: photos.id,
      filename: photos.filename,
      path: photos.path,
      fileSize: photos.fileSize,
      width: photos.width,
      height: photos.height,
      qualityScore: photos.qualityScore,
      phash: photos.phash,
      isMaster: photos.isMaster,
      thumbnailPath: photos.thumbnailPath,
      takenAt: photos.takenAt,
      cameraModel: photos.cameraModel,
      lensModel: photos.lensModel,
      iso: photos.iso,
      shutterSpeed: photos.shutterSpeed,
      aperture: photos.aperture,
      focalLength: photos.focalLength,
      trashStatus: trashItems.status,
    })
    .from(photos)
    .leftJoin(trashItems, eq(photos.id, trashItems.photoId))
    .where(eq(photos.groupId, groupId))
    .orderBy(desc(photos.qualityScore))
    .all()

  const photoItems: PhotoItem[] = groupPhotos.map((p) => ({
    id: p.id,
    filename: p.filename,
    path: p.path,
    fileSize: p.fileSize,
    width: p.width,
    height: p.height,
    qualityScore: p.qualityScore,
    phash: p.phash,
    isMaster: p.isMaster,
    thumbnailPath: p.thumbnailPath,
    takenAt: p.takenAt,
    cameraModel: p.cameraModel,
    lensModel: p.lensModel,
    iso: p.iso,
    shutterSpeed: p.shutterSpeed,
    aperture: p.aperture,
    focalLength: p.focalLength,
    trashStatus: p.trashStatus ?? null,
  }))

  return {
    id: group.id,
    fileCount: group.fileCount,
    totalSize: group.totalSize,
    reclaimableSize: group.reclaimableSize,
    masterId: group.masterId,
    reviewStatus: group.reviewStatus,
    reviewedAt: group.reviewedAt,
    photos: photoItems,
  }
}

/**
 * Change the master photo in a group.
 * Updates isMaster flags on photos, sets group.masterId,
 * and recalculates reclaimableSize.
 * Throws if group or photo not found.
 */
export function changeMaster(
  db: AppDatabase,
  groupId: string,
  newMasterId: string,
): void {
  // Validate group exists
  const group = db
    .select()
    .from(photoGroups)
    .where(eq(photoGroups.id, groupId))
    .get()

  if (!group) {
    throw new Error(`Group not found: ${groupId}`)
  }

  // Validate new master photo exists in this group
  const newMasterPhoto = db
    .select()
    .from(photos)
    .where(and(eq(photos.id, newMasterId), eq(photos.groupId, groupId)))
    .get()

  if (!newMasterPhoto) {
    throw new Error(`Photo not found in group: ${newMasterId}`)
  }

  // Clear old master(s) in this group
  db.update(photos)
    .set({ isMaster: false })
    .where(and(eq(photos.groupId, groupId), eq(photos.isMaster, true)))
    .run()

  // Set new master
  db.update(photos)
    .set({ isMaster: true })
    .where(eq(photos.id, newMasterId))
    .run()

  // Recalculate reclaimableSize: totalSize - new master's fileSize
  const reclaimableSize = group.totalSize - newMasterPhoto.fileSize

  // Update group record
  db.update(photoGroups)
    .set({
      masterId: newMasterId,
      reclaimableSize,
    })
    .where(eq(photoGroups.id, groupId))
    .run()
}

/**
 * Mark a group as reviewed.
 * Sets reviewStatus to 'reviewed' and records the current timestamp.
 * Throws if group not found.
 */
export function markReviewed(
  db: AppDatabase,
  groupId: string,
  decision?: 'kept_all' | 'duplicates_deleted',
): void {
  const group = db
    .select()
    .from(photoGroups)
    .where(eq(photoGroups.id, groupId))
    .get()

  if (!group) {
    throw new Error(`Group not found: ${groupId}`)
  }

  const now = new Date().toISOString()
  db.update(photoGroups)
    .set({
      reviewStatus: REVIEW_STATUS.REVIEWED,
      reviewedAt: now,
      decision: decision ?? null,
      decidedAt: decision ? now : null,
    })
    .where(eq(photoGroups.id, groupId))
    .run()
}
