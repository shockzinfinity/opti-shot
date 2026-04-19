import { app, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'

export function registerAppInfoHandlers(): void {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: `${process.platform} ${process.arch}`,
  }))

  ipcMain.handle('shell:openPath', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { success: false, error: 'Invalid path' }
    }
    if (!existsSync(filePath)) {
      return { success: false, error: 'File not found' }
    }
    const result = await shell.openPath(filePath)
    if (result) {
      return { success: false, error: result }
    }
    return { success: true }
  })
}
