// @TASK P3-R2 - Photo metadata + thumbnail management service
// @SPEC specs/domain/resources.yaml#photos
// @TEST tests/unit/services/photo.test.ts

import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { eq } from 'drizzle-orm'
import { sharpFromPath } from '@main/engine/heic'
import { photos } from '@main/db/schema'
import type { AppDatabase } from '@main/db'

// --- Types ---

export interface PhotoInfo {
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
}

// --- Constants ---

const THUMB_WIDTH = 200
const THUMB_HEIGHT = 200
const THUMB_QUALITY = 80

// --- Service ---

/**
 * Fetch photo record from DB by ID.
 * Throws if the photo is not found.
 */
export function getPhotoInfo(db: AppDatabase, photoId: string): PhotoInfo {
  const row = db.select().from(photos).where(eq(photos.id, photoId)).get()

  if (!row) {
    throw new Error(`Photo not found: ${photoId}`)
  }

  return {
    id: row.id,
    filename: row.filename,
    path: row.path,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    qualityScore: row.qualityScore,
    takenAt: row.takenAt,
    cameraModel: row.cameraModel,
    lensModel: row.lensModel,
    phash: row.phash,
    isMaster: row.isMaster,
    groupId: row.groupId,
    thumbnailPath: row.thumbnailPath,
  }
}

/**
 * Generate a 200x200 JPEG thumbnail for the given image.
 * Saves to cacheDir/<md5-of-path>.jpg.
 * Returns the thumbnail file path, or empty string if processing fails.
 * Skips generation if cached thumbnail already exists.
 */
export async function generateThumbnail(
  photoPath: string,
  cacheDir: string,
): Promise<string> {
  // Deterministic filename from source path
  const hash = createHash('md5').update(photoPath).digest('hex')
  const thumbPath = join(cacheDir, `${hash}.jpg`)

  // Cache hit — skip generation
  if (existsSync(thumbPath)) {
    return thumbPath
  }

  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }

  try {
    const sharpInstance = await sharpFromPath(photoPath)
    await sharpInstance
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toFile(thumbPath)

    return thumbPath
  } catch {
    // Image can't be processed — return empty string
    return ''
  }
}

/**
 * Get (or generate) a thumbnail for the given photo ID.
 * Checks DB record for existing thumbnailPath first.
 * If missing or file doesn't exist, generates a new thumbnail and updates DB.
 * Throws if photo not found.
 */
export async function getThumbnail(
  db: AppDatabase,
  photoId: string,
  cacheDir: string,
): Promise<string> {
  const row = db.select().from(photos).where(eq(photos.id, photoId)).get()

  if (!row) {
    throw new Error(`Photo not found: ${photoId}`)
  }

  // Check if thumbnail already exists in DB and on disk
  if (row.thumbnailPath && existsSync(row.thumbnailPath)) {
    return thumbPathToDataUrl(row.thumbnailPath)
  }

  // Generate new thumbnail
  const thumbPath = await generateThumbnail(row.path, cacheDir)

  // Update DB record with the new thumbnail path
  if (thumbPath) {
    db.update(photos)
      .set({ thumbnailPath: thumbPath })
      .where(eq(photos.id, photoId))
      .run()
  }

  // Return as data URL (renderer can't access file:// in sandbox)
  return thumbPathToDataUrl(thumbPath)
}

/**
 * Convert a thumbnail file path to a base64 data URL.
 * Returns empty string if file doesn't exist.
 */
export function thumbPathToDataUrl(thumbPath: string): string {
  if (!thumbPath || !existsSync(thumbPath)) return ''
  const data = readFileSync(thumbPath)
  return `data:image/jpeg;base64,${data.toString('base64')}`
}
