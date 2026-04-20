// @TASK P4-R2 - Periodic trash cleanup scheduler
// @SPEC CLAUDE.md#Safety-Rules

import type { AppDatabase } from '@main/db'
import { cleanupExpired } from '@main/services/trash'
import { sendNotification } from '@main/services/notification'

const ONE_HOUR_MS = 3_600_000

/**
 * Start a periodic scheduler that cleans up expired trash items.
 * Default interval: 1 hour.
 *
 * Uses sendNotification directly (not CQRS middleware) because
 * this is a background scheduler, not a user-initiated command.
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
        sendNotification({
          level: 'info',
          category: 'trash',
          title: 'notification.trash.cleanup',
          message: `${count} expired items permanently deleted`,
        })
      }
    } catch (error) {
      console.error('[cleanup] Failed to cleanup expired trash:', error)
      sendNotification({
        level: 'error',
        category: 'trash',
        title: 'notification.trash.cleanupError',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, intervalMs)
}
