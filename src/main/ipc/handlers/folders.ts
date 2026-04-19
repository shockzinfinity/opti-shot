// @TASK P2-R1 - Folder IPC handlers
// @SPEC specs/domain/resources.yaml#scan_folders
// @TEST tests/main/ipc/folders.test.ts

import { ipcMain, dialog } from 'electron'
import { IPC, SCAN_STATUS } from '@shared/types'
import { getDb } from '@main/db'
import { addFolder, removeFolder, listFolders, validateFolder } from '@main/services/folder'
import { validateStringId } from '../validators'

export function registerFolderHandlers(): void {
  // dialog:openDirectory — Show native folder picker dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return { success: false, error: SCAN_STATUS.CANCELLED }
    return { success: true, data: result.filePaths[0] }
  })

  // folders:add — Add a folder path to scan targets
  ipcMain.handle(
    IPC.FOLDERS.ADD,
    (_event, path: unknown, includeSubfolders?: boolean) => {
      try {
        const validPath = validateStringId(path)
        const db = getDb()
        return { success: true, data: addFolder(db, validPath, includeSubfolders) }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
      }
    },
  )

  // folders:remove — Remove a folder by ID
  ipcMain.handle(IPC.FOLDERS.REMOVE, (_event, id: unknown) => {
    try {
      const validId = validateStringId(id)
      const db = getDb()
      removeFolder(db, validId)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // folders:list — List all registered folders
  ipcMain.handle(IPC.FOLDERS.LIST, () => {
    try {
      const db = getDb()
      return { success: true, data: listFolders(db) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // folders:validate — Check if a path is valid and accessible
  ipcMain.handle(IPC.FOLDERS.VALIDATE, (_event, path: unknown) => {
    try {
      const validPath = validateStringId(path)
      return { success: true, data: validateFolder(validPath) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}
