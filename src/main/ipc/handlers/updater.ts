// @TASK P5-R1 - Updater IPC handlers
// @SPEC CLAUDE.md#Architecture
// @TEST tests/unit/services/updater.test.ts

import { ipcMain } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { downloadUpdate, installUpdate } from '@main/services/updater'

/**
 * Register IPC handlers for the auto-updater.
 * Channels: updater:check, updater:download, updater:install
 */
export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, data: result?.updateInfo }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('updater:download', () => {
    downloadUpdate()
    return { success: true }
  })

  ipcMain.handle('updater:install', () => {
    installUpdate()
    return { success: true }
  })
}
