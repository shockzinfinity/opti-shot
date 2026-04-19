import { ipcMain, app } from 'electron'
import { join } from 'path'
import { rmSync, existsSync, statSync, readdirSync } from 'fs'
import { getDb } from '@main/db'
import { photos, photoGroups, reviewDecisions, scans, scanDiscoveries, trashItems } from '@main/db/schema'

export function registerMaintenanceHandlers(): void {
  // maintenance:clearCache — Delete thumbnail cache
  ipcMain.handle('maintenance:clearCache', () => {
    try {
      const cacheDir = join(app.getPath('userData'), 'cache')
      if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true })
      }
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // maintenance:clearScanHistory — Delete all scan data (groups, photos, reviews, scans)
  ipcMain.handle('maintenance:clearScanHistory', () => {
    try {
      const db = getDb()
      // Order matters: trashItems refs photos (no cascade), so delete first
      db.delete(trashItems).run()
      db.delete(reviewDecisions).run()
      db.delete(scanDiscoveries).run()
      db.delete(photos).run()
      db.delete(photoGroups).run()
      db.delete(scans).run()

      // Also clear thumbnail cache
      const cacheDir = join(app.getPath('userData'), 'cache')
      if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true })
      }

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // maintenance:storageStats — Get storage usage info
  ipcMain.handle('maintenance:storageStats', () => {
    try {
      const userData = app.getPath('userData')
      const dbPath = join(userData, 'optishot.db')
      const cacheDir = join(userData, 'cache')

      const dbSize = existsSync(dbPath) ? statSync(dbPath).size : 0
      const cacheSize = existsSync(cacheDir) ? getDirSize(cacheDir) : 0

      return {
        success: true,
        data: { dbSize, cacheSize },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}

function getDirSize(dir: string): number {
  let size = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isFile()) {
        size += statSync(fullPath).size
      } else if (entry.isDirectory()) {
        size += getDirSize(fullPath)
      }
    }
  } catch {
    // skip unreadable
  }
  return size
}
