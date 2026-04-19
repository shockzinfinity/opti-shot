// @TASK P4-R1 - Export IPC handlers
// @SPEC CLAUDE.md#Architecture -- IPC channel bridge for export operations
// @TEST tests/unit/services/export.test.ts

import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import { getDb } from '@main/db'
import {
  startExport,
  pauseExport,
  cancelExport,
} from '@main/services/export'
import { exportStartSchema } from '../validators'

export function registerExportHandlers(): void {
  // export:start - Begin exporting selected photos
  ipcMain.handle(IPC.EXPORT.START, async (_event, options: unknown) => {
    try {
      const parsed = exportStartSchema.parse(options)
      const db = getDb()
      const result = await startExport(db, parsed, (progress) => {
        // Send progress to all renderer windows
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send(IPC.EXPORT.PROGRESS, progress)
        })
      })
      return { success: true, data: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // export:pause - Pause the active export
  ipcMain.handle(IPC.EXPORT.PAUSE, () => {
    try {
      pauseExport()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // export:cancel - Cancel the active export
  ipcMain.handle(IPC.EXPORT.CANCEL, () => {
    try {
      cancelExport()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}
