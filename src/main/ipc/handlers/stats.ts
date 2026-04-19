// @TASK P2-S1 - Stats IPC handler for Dashboard live data
// @SPEC CLAUDE.md#Architecture

import { ipcMain } from 'electron'
import { getDb } from '@main/db'
import { photos, photoGroups, scans } from '@main/db/schema'
import { sql, desc, eq } from 'drizzle-orm'

export function registerStatsHandlers(): void {
  ipcMain.handle('stats:get', async () => {
    try {
      const db = getDb()

      const photoCount = db
        .select({ count: sql<number>`count(*)` })
        .from(photos)
        .get()

      const groupCount = db
        .select({ count: sql<number>`count(*)` })
        .from(photoGroups)
        .get()

      const reclaimable = db
        .select({ total: sql<number>`coalesce(sum(reclaimable_size), 0)` })
        .from(photoGroups)
        .get()

      const lastScan = db
        .select()
        .from(scans)
        .orderBy(desc(scans.startedAt))
        .limit(1)
        .get()

      return {
        success: true,
        data: {
          totalPhotos: photoCount?.count ?? 0,
          totalGroups: groupCount?.count ?? 0,
          reclaimableSize: reclaimable?.total ?? 0,
          lastScan: lastScan ?? null,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // scans:list — Recent scan history with review progress
  ipcMain.handle('scans:list', () => {
    try {
      const db = getDb()

      const recentScans = db
        .select()
        .from(scans)
        .orderBy(desc(scans.startedAt))
        .limit(10)
        .all()

      // Review progress: count reviewed groups vs total
      const totalGroups = db
        .select({ count: sql<number>`count(*)` })
        .from(photoGroups)
        .get()

      const reviewedGroups = db
        .select({ count: sql<number>`count(*)` })
        .from(photoGroups)
        .where(eq(photoGroups.reviewStatus, 'reviewed'))
        .get()

      const enriched = recentScans.map((scan) => ({
        ...scan,
        // Review progress is only meaningful for the latest completed scan
        reviewedGroups: reviewedGroups?.count ?? 0,
        totalGroupsForReview: totalGroups?.count ?? 0,
      }))

      return { success: true, data: enriched }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })
}
