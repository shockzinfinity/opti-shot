// @TASK P4-R2 - Trash service (soft delete, restore, cleanup)
// @SPEC CLAUDE.md#Safety-Rules
// @TEST tests/unit/services/trash.test.ts

import { existsSync, copyFileSync, mkdirSync, unlinkSync, renameSync } from 'fs'
import { join, dirname, basename } from 'path'
import { shell } from 'electron'
import { eq, and, sql, lt } from 'drizzle-orm'
import { trashItems, photos } from '@main/db/schema'
import type { AppDatabase } from '@main/db'
import crypto from 'crypto'
import { TRASH_STATUS } from '@shared/types'
import { getSettings } from '@main/services/settings'

// --- Types ---

export interface TrashRecord {
  id: string
  photoId: string
  originalPath: string
  filename: string
  fileSize: number
  status: 'trashed' | 'restored' | 'purged'
  deletedAt: string
  expiresAt: string
  restoredAt: string | null
}

export interface TrashItem {
  id: string
  photoId: string
  originalPath: string
  filename: string
  fileSize: number
  status: 'trashed'
  deletedAt: string
  expiresAt: string
}

export interface TrashSummary {
  totalFiles: number
  totalSize: number
  nextCleanup: string | null
}

// --- Helpers ---

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// Windows doesn't hide folders with dot prefix; use platform-specific names
export const TRASH_FOLDER_NAME = process.platform === 'win32' ? 'OptiShot Trash' : '.optishot-trash'

/**
 * Get trash directory for a given file path.
 * Creates .optishot-trash/ in the same directory as the original file.
 * For tests, trashDir parameter overrides this.
 */
export function getTrashDirForFile(filePath: string): string {
  const dir = join(dirname(filePath), TRASH_FOLDER_NAME)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Legacy: get centralized trash dir (for tests only) */
export function getTrashDir(): string {
  if (process.env.OPTISHOT_TRASH_DIR) {
    return process.env.OPTISHOT_TRASH_DIR
  }
  const dir = join(process.cwd(), 'trash')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Build the trash file path: trashDir/<trashId>_<filename> */
function trashFilePath(trashDir: string, trashId: string, filename: string): string {
  return join(trashDir, `${trashId}_${filename}`)
}

// --- Service ---

/**
 * Move a photo to trash (soft delete).
 * Creates .optishot-trash/ in the same directory as the original file.
 * Uses rename (same disk = instant) with fallback to copy+delete.
 * Skips if the file is already trashed.
 */
export function moveToTrash(
  db: AppDatabase,
  photoId: string,
  trashDir?: string,
): TrashRecord {
  // Layer 1: Get photo from DB
  const photo = db.select().from(photos).where(eq(photos.id, photoId)).get()

  if (!photo) {
    throw new Error(`Photo not found: ${photoId}`)
  }

  // Skip if already trashed
  const existing = db.select().from(trashItems)
    .where(and(eq(trashItems.photoId, photoId), eq(trashItems.status, TRASH_STATUS.TRASHED)))
    .get()
  if (existing) {
    return existing as TrashRecord
  }

  // Determine trash directory (per-folder or override for tests)
  const dir = trashDir ?? getTrashDirForFile(photo.path)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Skip if original doesn't exist (already deleted)
  if (!existsSync(photo.path)) {
    throw new Error(`Original file not found: ${photo.path}`)
  }

  // Layer 2: Move file to trash (rename for same-disk, fallback to copy+delete)
  const trashId = crypto.randomUUID()
  const destPath = trashFilePath(dir, trashId, photo.filename)
  try {
    renameSync(photo.path, destPath)
  } catch {
    // Cross-disk fallback
    copyFileSync(photo.path, destPath)
    unlinkSync(photo.path)
  }

  // Layer 3: Insert trash record into DB
  const now = new Date()
  const deletedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString()

  const record: TrashRecord = {
    id: trashId,
    photoId,
    originalPath: photo.path,
    filename: photo.filename,
    fileSize: photo.fileSize,
    status: TRASH_STATUS.TRASHED,
    deletedAt,
    expiresAt,
    restoredAt: null,
  }

  db.insert(trashItems)
    .values({
      id: record.id,
      photoId: record.photoId,
      originalPath: record.originalPath,
      filename: record.filename,
      fileSize: record.fileSize,
      status: record.status,
      deletedAt: record.deletedAt,
      expiresAt: record.expiresAt,
    })
    .run()

  return record
}

/**
 * Restore a file from trash to its original path.
 * Copies file back and removes trash copy.
 */
export function restoreFromTrash(
  db: AppDatabase,
  trashId: string,
  trashDir?: string,
): void {

  // Layer 1: Get trash record
  const record = db
    .select()
    .from(trashItems)
    .where(eq(trashItems.id, trashId))
    .get()

  if (!record) {
    throw new Error(`Trash record not found: ${trashId}`)
  }

  // Determine trash directory from original path
  const dir = trashDir ?? join(dirname(record.originalPath), TRASH_FOLDER_NAME)

  // Layer 2: Move file back to original path
  const srcPath = trashFilePath(dir, record.id, record.filename)
  if (!existsSync(srcPath)) {
    throw new Error(`Trash file not found on disk: ${srcPath}`)
  }

  // Ensure target directory exists
  const targetDir = join(record.originalPath, '..')
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  copyFileSync(srcPath, record.originalPath)

  // Layer 3: Remove trash copy
  unlinkSync(srcPath)

  // Layer 4: Update DB record
  db.update(trashItems)
    .set({
      status: 'restored',
      restoredAt: new Date().toISOString(),
    })
    .where(eq(trashItems.id, trashId))
    .run()
}

/**
 * Restore all trashed photos belonging to a specific group.
 * Used when user changes decision from 'duplicates_deleted' to 'kept_all'.
 */
export function restoreGroupFromTrash(db: AppDatabase, groupId: string): number {
  // Find trashed photos in this group
  const trashedInGroup = db
    .select({ trashId: trashItems.id })
    .from(trashItems)
    .innerJoin(photos, eq(trashItems.photoId, photos.id))
    .where(
      and(
        eq(photos.groupId, groupId),
        eq(trashItems.status, TRASH_STATUS.TRASHED),
      ),
    )
    .all()

  for (const item of trashedInGroup) {
    try {
      restoreFromTrash(db, item.trashId)
    } catch {
      // Skip files that can't be restored (e.g., disk removed)
    }
  }

  return trashedInGroup.length
}

/**
 * Permanently delete a file from trash.
 * Removes the file from trash directory and marks as purged.
 */
export async function permanentDelete(
  db: AppDatabase,
  trashId: string,
  trashDir?: string,
): Promise<void> {
  // Get trash record
  const record = db
    .select()
    .from(trashItems)
    .where(eq(trashItems.id, trashId))
    .get()

  if (!record) {
    throw new Error(`Trash record not found: ${trashId}`)
  }

  const dir = trashDir ?? join(dirname(record.originalPath), TRASH_FOLDER_NAME)

  // Delete file from trash directory
  const filePath = trashFilePath(dir, record.id, record.filename)
  if (existsSync(filePath)) {
    const dataSettings = getSettings('data')
    if (dataSettings.useSystemTrash) {
      await shell.trashItem(filePath)
    } else {
      unlinkSync(filePath)
    }
  }

  // Delete thumbnail cache for this photo
  const photo = db.select().from(photos).where(eq(photos.id, record.photoId)).get()
  if (photo?.thumbnailPath && existsSync(photo.thumbnailPath)) {
    try { unlinkSync(photo.thumbnailPath) } catch { /* ignore */ }
  }

  // Update status to purged
  db.update(trashItems)
    .set({ status: 'purged' })
    .where(eq(trashItems.id, trashId))
    .run()
}

/**
 * List trashed items with pagination.
 * Returns only items with status='trashed', ordered by deletedAt DESC.
 */
export function listTrash(
  db: AppDatabase,
  options?: { offset?: number; limit?: number },
): { items: TrashItem[]; total: number } {
  const offset = options?.offset ?? 0
  const limit = options?.limit ?? 50

  // Count total trashed items
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(trashItems)
    .where(eq(trashItems.status, 'trashed'))
    .get()

  const total = countResult?.count ?? 0

  // Fetch paginated results
  const rows = db
    .select()
    .from(trashItems)
    .where(eq(trashItems.status, 'trashed'))
    .orderBy(sql`${trashItems.deletedAt} DESC`)
    .limit(limit)
    .offset(offset)
    .all()

  const items: TrashItem[] = rows.map((row) => ({
    id: row.id,
    photoId: row.photoId,
    originalPath: row.originalPath,
    filename: row.filename,
    fileSize: row.fileSize,
    status: 'trashed' as const,
    deletedAt: row.deletedAt,
    expiresAt: row.expiresAt,
  }))

  return { items, total }
}

/**
 * Get trash summary: total files, total size, next cleanup date.
 */
export function getTrashSummary(db: AppDatabase): TrashSummary {
  const result = db
    .select({
      totalFiles: sql<number>`count(*)`,
      totalSize: sql<number>`coalesce(sum(${trashItems.fileSize}), 0)`,
      nextCleanup: sql<string | null>`min(${trashItems.expiresAt})`,
    })
    .from(trashItems)
    .where(eq(trashItems.status, 'trashed'))
    .get()

  return {
    totalFiles: result?.totalFiles ?? 0,
    totalSize: result?.totalSize ?? 0,
    nextCleanup: result?.nextCleanup ?? null,
  }
}

/**
 * Empty all trashed items (permanent delete all).
 * Returns the count of deleted items.
 */
export async function emptyTrash(db: AppDatabase, trashDir?: string): Promise<number> {
  const items = db
    .select()
    .from(trashItems)
    .where(eq(trashItems.status, 'trashed'))
    .all()

  const dataSettings = getSettings('data')

  for (const item of items) {
    const dir = trashDir ?? join(dirname(item.originalPath), TRASH_FOLDER_NAME)
    const filePath = trashFilePath(dir, item.id, item.filename)
    if (existsSync(filePath)) {
      if (dataSettings.useSystemTrash) {
        await shell.trashItem(filePath)
      } else {
        unlinkSync(filePath)
      }
    }

    // Delete thumbnail cache
    const photo = db.select().from(photos).where(eq(photos.id, item.photoId)).get()
    if (photo?.thumbnailPath && existsSync(photo.thumbnailPath)) {
      try { unlinkSync(photo.thumbnailPath) } catch { /* ignore */ }
    }

    db.update(trashItems)
      .set({ status: 'purged' })
      .where(eq(trashItems.id, item.id))
      .run()
  }

  return items.length
}

/**
 * Cleanup expired trash items (expiresAt < now).
 * Returns the count of cleaned-up items.
 */
export async function cleanupExpired(db: AppDatabase, trashDir?: string): Promise<number> {
  const now = new Date().toISOString()

  const expired = db
    .select()
    .from(trashItems)
    .where(
      and(
        eq(trashItems.status, 'trashed'),
        lt(trashItems.expiresAt, now),
      ),
    )
    .all()

  const dataSettings = getSettings('data')

  for (const item of expired) {
    const dir = trashDir ?? join(dirname(item.originalPath), TRASH_FOLDER_NAME)
    const filePath = trashFilePath(dir, item.id, item.filename)
    if (existsSync(filePath)) {
      if (dataSettings.useSystemTrash) {
        await shell.trashItem(filePath)
      } else {
        unlinkSync(filePath)
      }
    }

    db.update(trashItems)
      .set({ status: 'purged' })
      .where(eq(trashItems.id, item.id))
      .run()
  }

  return expired.length
}
