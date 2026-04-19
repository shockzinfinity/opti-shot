import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import exifr from 'exifr'
import { getDb } from '@main/db'
import { getPhotoInfo, getThumbnail } from '@main/services/photo'
import { getPendingDeletions } from '@main/services/review'
import type { QueryBus } from '../queryBus'

export function registerPhotoHandlers(qry: QueryBus): void {
  qry.register('photo.info', async (input) => {
    const db = getDb()
    return getPhotoInfo(db, input.photoId)
  })

  qry.register('photo.thumbnail', async (input) => {
    const db = getDb()
    const cacheDir = join(app.getPath('userData'), 'cache', 'thumbs')
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }
    return await getThumbnail(db, input.photoId, cacheDir)
  })

  qry.register('photo.exif', async (input) => {
    const db = getDb()
    const info = getPhotoInfo(db, input.photoId)
    let exifData: Record<string, unknown> = {}
    try {
      const raw = await exifr.parse(info.path, { translateValues: true, mergeOutput: true })
      if (raw) {
        for (const [key, value] of Object.entries(raw)) {
          exifData[key] = value instanceof Date ? value.toISOString() : value
        }
      }
    } catch {
      // EXIF not available
    }
    return { path: info.path, exif: exifData }
  })

  qry.register('review.getPending', async () => {
    const db = getDb()
    return getPendingDeletions(db)
  })
}
