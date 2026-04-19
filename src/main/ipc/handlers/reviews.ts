// @TASK P3-R2 - Photo + Review IPC handlers
// @SPEC specs/domain/resources.yaml#photos, review_decisions
// @TEST tests/unit/services/photo.test.ts, tests/unit/services/review.test.ts

import { ipcMain, app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import exifr from 'exifr'
import { IPC } from '@shared/types'
import { getDb } from '@main/db'
import { getPhotoInfo, getThumbnail } from '@main/services/photo'
import { getPendingDeletions } from '@main/services/review'
import { validateStringId } from '../validators'

/**
 * Register IPC handlers for photos and review decisions.
 */
export function registerPhotoAndReviewHandlers(): void {
  // photos:info — Fetch photo metadata by ID
  ipcMain.handle(IPC.PHOTOS.INFO, (_event, photoId: unknown) => {
    try {
      const validId = validateStringId(photoId)
      const db = getDb()
      return { success: true, data: getPhotoInfo(db, validId) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // photos:thumbnail — Get or generate thumbnail for a photo
  ipcMain.handle(IPC.PHOTOS.THUMBNAIL, async (_event, photoId: unknown) => {
    try {
      const validId = validateStringId(photoId)
      const db = getDb()
      const cacheDir = join(app.getPath('userData'), 'cache', 'thumbs')

      // Ensure cache directory exists
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true })
      }

      const thumbPath = await getThumbnail(db, validId, cacheDir)
      return { success: true, data: thumbPath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // photos:exif — Get full EXIF metadata from image file
  ipcMain.handle('photos:exif', async (_event, photoId: unknown) => {
    try {
      const validId = validateStringId(photoId)
      const db = getDb()
      const info = getPhotoInfo(db, validId)

      let exifData: Record<string, unknown> = {}
      try {
        const raw = await exifr.parse(info.path, { translateValues: true, mergeOutput: true })
        if (raw) {
          // Convert Date objects to ISO strings for serialization
          for (const [key, value] of Object.entries(raw)) {
            exifData[key] = value instanceof Date ? value.toISOString() : value
          }
        }
      } catch {
        // EXIF not available
      }

      return { success: true, data: { path: info.path, exif: exifData } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // reviews:getPending — Reconstruct pending deletions from DB
  ipcMain.handle(IPC.REVIEWS.GET_PENDING, () => {
    try {
      const db = getDb()
      const pending = getPendingDeletions(db)
      return { success: true, data: pending }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}
