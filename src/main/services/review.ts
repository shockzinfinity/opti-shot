// @TASK P3-R2 - Review decision recording service
// @SPEC specs/domain/resources.yaml#review_decisions
// @TEST tests/unit/services/review.test.ts

import { eq, and, sql } from 'drizzle-orm'
import { photos, photoGroups, trashItems } from '@main/db/schema'
import type { AppDatabase } from '@main/db'
import { TRASH_STATUS } from '@shared/types'

// --- Service ---


/** Photos marked for deletion but not yet trashed. */
export interface PendingDeletionRecord {
  photoId: string
  filename: string
  fileSize: number
  groupId: string
}

/**
 * Reconstruct pending deletions from DB state.
 * Simple logic: non-master photos in groups with decision='duplicates_deleted',
 * excluding photos already in trash.
 * No dependency on reviewDecisions table.
 */
export function getPendingDeletions(db: AppDatabase): PendingDeletionRecord[] {
  const rows = db
    .select({
      photoId: photos.id,
      filename: photos.filename,
      fileSize: photos.fileSize,
      groupId: photos.groupId,
    })
    .from(photos)
    .innerJoin(photoGroups, eq(photos.groupId, photoGroups.id))
    .leftJoin(trashItems, eq(photos.id, trashItems.photoId))
    .where(
      and(
        eq(photoGroups.decision, 'duplicates_deleted'),
        eq(photos.isMaster, false),
        sql`(${trashItems.id} IS NULL OR ${trashItems.status} = ${TRASH_STATUS.RESTORED})`,
      ),
    )
    .all()

  return rows
}
