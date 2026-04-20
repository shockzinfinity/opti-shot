import type { NotificationLevel, NotificationCategory } from '@shared/types'

// --- Level behavior: what each level triggers ---

export interface LevelBehavior {
  log: boolean           // Write to log file
  notify: boolean        // Push to Renderer (bell icon)
  systemNotify: boolean  // OS-level notification (when app not focused)
}

export const LEVEL_BEHAVIOR: Record<NotificationLevel, LevelBehavior> = {
  info:    { log: true, notify: true,  systemNotify: false },
  success: { log: true, notify: true,  systemNotify: false },
  warning: { log: true, notify: true,  systemNotify: false },
  error:   { log: true, notify: true,  systemNotify: false },
}

// --- Command notification policy ---

export interface CommandNotificationRule {
  category: NotificationCategory
  onSuccess?: {
    level: NotificationLevel
    message: string  // Template with {key} placeholders replaced from result
  }
  onError?: {
    level: NotificationLevel
    message: string  // {error} is replaced with error message
  }
  onAbort?: {
    level: NotificationLevel
    message: string
  }
}

/**
 * Notification policy for CQRS commands.
 *
 * Commands not listed here produce no notifications (silent by default).
 * Template placeholders: {key} is replaced from command result object.
 * Special: {error} is replaced with the error message on failure.
 */
export const COMMAND_NOTIFICATION_POLICY: Record<string, CommandNotificationRule> = {
  // --- Scan ---
  'scan.start': {
    category: 'scan',
    onSuccess: {
      level: 'success',
      message: '{processedFiles} files processed, {groupCount} groups found',
    },
    onError: {
      level: 'error',
      message: 'Scan failed: {error}',
    },
    onAbort: {
      level: 'info',
      message: 'Scan cancelled by user',
    },
  },

  // --- Trash ---
  'trash.empty': {
    category: 'trash',
    onSuccess: {
      level: 'info',
      message: 'Trash emptied: {deletedCount} items permanently deleted',
    },
    onError: {
      level: 'error',
      message: 'Failed to empty trash: {error}',
    },
  },
}

/**
 * Replace {key} placeholders in a template string with values from data object.
 */
export function formatTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = data[key]
    return val != null ? String(val) : `{${key}}`
  })
}

/**
 * Check if an error is an abort/cancellation signal.
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message === 'Scan aborted' || err.message.includes('aborted')
  }
  return false
}
