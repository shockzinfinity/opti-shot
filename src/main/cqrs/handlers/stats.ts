import { getDb } from '@main/db'
import { photos, photoGroups, scans } from '@main/db/schema'
import { sql, desc, eq } from 'drizzle-orm'
import type { QueryBus } from '../queryBus'

export function registerStatsHandlers(qry: QueryBus): void {
  qry.register('stats.dashboard', async () => {
    const db = getDb()
    const photoCount = db.select({ count: sql<number>`count(*)` }).from(photos).get()
    const groupCount = db.select({ count: sql<number>`count(*)` }).from(photoGroups).get()
    const reclaimable = db.select({ total: sql<number>`coalesce(sum(reclaimable_size), 0)` }).from(photoGroups).get()
    const lastScan = db.select().from(scans).orderBy(desc(scans.startedAt)).limit(1).get()

    return {
      totalPhotos: photoCount?.count ?? 0,
      totalGroups: groupCount?.count ?? 0,
      reclaimableSize: reclaimable?.total ?? 0,
      lastScan: lastScan ?? null,
    }
  })

  qry.register('stats.scanHistory', async () => {
    const db = getDb()
    const recentScans = db.select().from(scans).orderBy(desc(scans.startedAt)).limit(10).all()
    const totalGroups = db.select({ count: sql<number>`count(*)` }).from(photoGroups).get()
    const reviewedGroups = db.select({ count: sql<number>`count(*)` }).from(photoGroups).where(eq(photoGroups.reviewStatus, 'reviewed')).get()

    return recentScans.map((scan) => ({
      ...scan,
      reviewedGroups: reviewedGroups?.count ?? 0,
      totalGroupsForReview: totalGroups?.count ?? 0,
    }))
  })
}
