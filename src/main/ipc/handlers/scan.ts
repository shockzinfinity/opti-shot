// @TASK P2-R3 - Scan IPC handlers
// @SPEC CLAUDE.md#Architecture — IPC channel bridge for scan operations
// @TEST tests/main/ipc/scan.test.ts

import { ipcMain, BrowserWindow, Notification, nativeImage } from 'electron'
import { getSettings } from '@main/services/settings'
import { IPC } from '@shared/types'
import { getDb } from '@main/db'
import {
  startScan,
  pauseScan,
  cancelScan,
  getScanStatus,
} from '@main/services/scan'
import { scanStartSchema } from '../validators'

export function registerScanHandlers(): void {
  // scan:start - Begin scanning with given options
  ipcMain.handle(IPC.SCAN.START, async (_event, options: unknown) => {
    try {
      const parsed = scanStartSchema.parse(options)
      const db = getDb()
      const result = await startScan(db, parsed, (progress) => {
        // Send throttled progress to all renderer windows
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send(IPC.SCAN.PROGRESS, progress)
        })
      })
      // System notification (if app not focused)
      const uiSettings = getSettings('ui')
      const focusedWin = BrowserWindow.getFocusedWindow()
      if (uiSettings.notifyOnComplete && !focusedWin) {
        new Notification({
          title: 'OptiShot',
          body: `스캔 완료: ${result.processedFiles}장 처리, ${result.groups.length}개 중복 그룹 발견`,
        }).show()
      }

      return { success: true, data: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // scan:pause - Pause the active scan
  ipcMain.handle(IPC.SCAN.PAUSE, () => {
    try {
      pauseScan()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // scan:cancel - Cancel the active scan
  ipcMain.handle(IPC.SCAN.CANCEL, () => {
    try {
      cancelScan()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // scan:status - Get current scan state
  ipcMain.handle(IPC.SCAN.STATUS, () => {
    try {
      return { success: true, data: getScanStatus() }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}
