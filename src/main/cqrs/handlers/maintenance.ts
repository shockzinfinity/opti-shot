import { app } from 'electron'
import { join } from 'path'
import { rmSync, existsSync, statSync, readdirSync } from 'fs'
import { getDb } from '@main/db'
import { photos, photoGroups, reviewDecisions, scans, scanDiscoveries, trashItems } from '@main/db/schema'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

function getDirSize(dir: string): number {
  let size = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isFile()) size += statSync(fullPath).size
      else if (entry.isDirectory()) size += getDirSize(fullPath)
    }
  } catch { /* skip unreadable */ }
  return size
}

export function registerMaintenanceHandlers(cmd: CommandBus, qry: QueryBus): void {
  cmd.register('maintenance.clearCache', async () => {
    const cacheDir = join(app.getPath('userData'), 'cache')
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true })
  })

  cmd.register('maintenance.clearScanHistory', async () => {
    const db = getDb()
    db.delete(trashItems).run()
    db.delete(reviewDecisions).run()
    db.delete(scanDiscoveries).run()
    db.delete(photos).run()
    db.delete(photoGroups).run()
    db.delete(scans).run()

    const cacheDir = join(app.getPath('userData'), 'cache')
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true })
  })

  qry.register('maintenance.storageStats', async () => {
    const userData = app.getPath('userData')
    const dbPath = join(userData, 'optishot.db')
    const cacheDir = join(userData, 'cache')
    return {
      dbSize: existsSync(dbPath) ? statSync(dbPath).size : 0,
      cacheSize: existsSync(cacheDir) ? getDirSize(cacheDir) : 0,
    }
  })
}
