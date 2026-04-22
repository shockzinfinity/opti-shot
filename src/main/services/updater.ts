// @TASK P5-R1 - Auto-updater service
// @SPEC CLAUDE.md#Architecture

import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { getEventBus } from '@main/cqrs'
import { sendNotification } from '@main/services/notification'

/** Check interval: 4 hours */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let checkTimer: ReturnType<typeof setInterval> | null = null

/** Track if install was just attempted — to distinguish install errors from other errors */
let installAttempted = false

/** Detect code signature related errors */
function isCodeSignatureError(message: string): boolean {
  return message.includes('Code signature') || message.includes('code sign') || message.includes('not pass validation')
}

/**
 * Initialize the auto-updater.
 * Skips initialization in development mode.
 * Registers event handlers for update lifecycle,
 * checks after 5 seconds, then every 4 hours.
 */
export function initAutoUpdater(): void {
  // Don't check in dev mode
  if (process.env.NODE_ENV === 'development') return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: { version: string; releaseDate: string }) => {
    getEventBus().publish('updater.available', {
      version: info.version,
      releaseDate: info.releaseDate,
    })
    sendNotification({
      level: 'info',
      category: 'system',
      title: 'notification.system.updateAvailable',
      message: `Version ${info.version} is available`,
    })
  })

  autoUpdater.on('update-not-available', () => {
    getEventBus().publish('updater.notAvailable', undefined as never)
  })

  autoUpdater.on('download-progress', (progress: { percent: number; transferred: number; total: number }) => {
    getEventBus().publish('updater.progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    getEventBus().publish('updater.downloaded', undefined as never)
  })

  autoUpdater.on('error', (error: Error) => {
    console.error('Auto-update error:', error.message)

    if (installAttempted && isCodeSignatureError(error.message)) {
      // Code signature failure during install — send friendly event + notification
      installAttempted = false
      getEventBus().publish('updater.installFailed', {
        message: error.message,
      })
      sendNotification({
        level: 'warning',
        category: 'system',
        title: 'updater.installFailed',
        message: 'Auto-install unavailable (unsigned app). Please remove the current app and install the downloaded version manually.',
      })
    } else {
      sendNotification({
        level: 'error',
        category: 'system',
        title: 'notification.system.updateError',
        message: error.message,
      })
    }
  })

  // Initial check after 5 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)

  // Periodic check every 4 hours
  checkTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)
}

/** Trigger update download. */
export function downloadUpdate(): void {
  autoUpdater.downloadUpdate()
}

/** Quit and install the downloaded update. */
export function installUpdate(): void {
  installAttempted = true
  autoUpdater.quitAndInstall()
  // If quitAndInstall succeeds, app exits — never reaches here
  // If it fails, autoUpdater.on('error') fires asynchronously
}

/** Clean up interval timer (for app quit). */
export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
