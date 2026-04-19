// @TASK P4-R2 - Periodic trash cleanup scheduler
// @SPEC CLAUDE.md#Safety-Rules

import type { AppDatabase } from '@main/db'
import { cleanupExpired } from '@main/services/trash'

const ONE_HOUR_MS = 3_600_000

/**
 * Start a periodic scheduler that cleans up expired trash items.
 * Default interval: 1 hour.
 *
 * @returns NodeJS.Timeout — call clearInterval() to stop.
 */
export function startCleanupScheduler(
  db: AppDatabase,
  intervalMs = ONE_HOUR_MS,
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const count = await cleanupExpired(db)
      if (count > 0) {
        console.log(`[cleanup] Purged ${count} expired trash items`)
      }
    } catch (error) {
      console.error('[cleanup] Failed to cleanup expired trash:', error)
    }
  }, intervalMs)
}
