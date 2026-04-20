// @TASK P5-R1 - Auto-updater service
// @SPEC CLAUDE.md#Architecture

import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { BrowserWindow } from 'electron'
import { sendNotification } from '@main/services/notification'

/**
 * Initialize the auto-updater.
 * Skips initialization in development mode.
 * Registers event handlers for update lifecycle and
 * schedules an update check after 5 seconds.
 */
export function initAutoUpdater(): void {
  // Don't check in dev mode
  if (process.env.NODE_ENV === 'development') return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: { version: string; releaseDate: string }) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('updater:available', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    })
    sendNotification({
      level: 'info',
      category: 'system',
      title: 'notification.system.updateAvailable',
      message: `Version ${info.version} is available`,
    })
  })

  autoUpdater.on('download-progress', (progress: { percent: number; transferred: number; total: number }) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('updater:progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      })
    })
  })

  autoUpdater.on('update-downloaded', () => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('updater:downloaded')
    })
  })

  autoUpdater.on('error', (error: Error) => {
    console.error('Auto-update error:', error.message)
    sendNotification({
      level: 'error',
      category: 'system',
      title: 'notification.system.updateError',
      message: error.message,
    })
  })

  // Check for updates after 5 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)
}

/** Trigger update download. */
export function downloadUpdate(): void {
  autoUpdater.downloadUpdate()
}

/** Quit and install the downloaded update. */
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
