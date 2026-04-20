import { BrowserWindow, Notification } from 'electron'
import type { CommandBus } from './commandBus'
import { sendNotification } from '@main/services/notification'
import {
  COMMAND_NOTIFICATION_POLICY,
  LEVEL_BEHAVIOR,
  formatTemplate,
  isAbortError,
} from '@main/services/notification-policy'

/**
 * Safely send a notification — never throws.
 * Notification failures must never crash the app or mask the original error.
 */
function safeSendNotification(...args: Parameters<typeof sendNotification>): void {
  try {
    sendNotification(...args)
  } catch (e) {
    console.error('[notification] Failed to send notification:', e)
  }
}

/**
 * Wrap CommandBus.execute with automatic notification dispatch.
 *
 * Intercepts command results/errors and generates notifications
 * based on the policy defined in notification-policy.ts.
 * Commands without a policy entry are silent (no notifications).
 */
export function applyNotificationMiddleware(commandBus: CommandBus): void {
  const originalExecute = commandBus.execute.bind(commandBus)

  commandBus.execute = async (type: string, input: unknown): Promise<unknown> => {
    const policy = COMMAND_NOTIFICATION_POLICY[type]

    // No policy → execute silently
    if (!policy) {
      return originalExecute(type, input)
    }

    try {
      const result = await originalExecute(type, input)

      // Success notification
      if (policy.onSuccess) {
        const resultData = (typeof result === 'object' && result !== null) ? result as Record<string, unknown> : {}
        if ('groups' in resultData && Array.isArray(resultData.groups)) {
          resultData.groupCount = resultData.groups.length
        }
        const message = formatTemplate(policy.onSuccess.message, resultData)
        const level = policy.onSuccess.level
        const behavior = LEVEL_BEHAVIOR[level]

        if (behavior.log || behavior.notify) {
          safeSendNotification({
            level,
            category: policy.category,
            title: `notification.${policy.category}.complete`,
            message,
          })
        }

        if (behavior.systemNotify) {
          try {
            const focusedWin = BrowserWindow.getFocusedWindow()
            if (!focusedWin) {
              new Notification({ title: 'OptiShot', body: message }).show()
            }
          } catch { /* system notification failure is non-critical */ }
        }
      }

      return result
    } catch (err) {
      // Abort notification
      if (isAbortError(err) && policy.onAbort) {
        safeSendNotification({
          level: policy.onAbort.level,
          category: policy.category,
          title: `notification.${policy.category}.cancelled`,
          message: policy.onAbort.message,
        })
        throw err
      }

      // Error notification
      if (policy.onError) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        const message = formatTemplate(policy.onError.message, { error: errorMsg })
        safeSendNotification({
          level: policy.onError.level,
          category: policy.category,
          title: `notification.${policy.category}.failed`,
          message,
        })
      }

      throw err
    }
  }
}
