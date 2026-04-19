// @TASK P4-R2 - Trash IPC handlers
// @SPEC CLAUDE.md#Safety-Rules
// @TEST tests/unit/services/trash.test.ts

import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { getDb } from '@main/db'
import {
  moveToTrash,
  restoreFromTrash,
  permanentDelete,
  listTrash,
  getTrashSummary,
  emptyTrash,
  restoreGroupFromTrash,
} from '@main/services/trash'
import { validateStringId } from '../validators'

export function registerTrashHandlers(): void {
  // trash:list — List trashed items with pagination
  ipcMain.handle(
    IPC.TRASH.LIST,
    (_event, options?: { offset?: number; limit?: number }) => {
      try {
        const db = getDb()
        return { success: true, data: listTrash(db, options) }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
      }
    },
  )

  // trash:summary — Get trash summary (total files, size, next cleanup)
  ipcMain.handle(IPC.TRASH.SUMMARY, () => {
    try {
      const db = getDb()
      return { success: true, data: getTrashSummary(db) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // trash:move — Move a photo to trash (soft delete)
  ipcMain.handle(IPC.TRASH.MOVE, (_event, photoId: unknown) => {
    try {
      const validId = validateStringId(photoId)
      const db = getDb()
      return { success: true, data: moveToTrash(db, validId) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // trash:restore — Restore a file from trash
  ipcMain.handle(IPC.TRASH.RESTORE, (_event, trashId: unknown) => {
    try {
      const validId = validateStringId(trashId)
      const db = getDb()
      restoreFromTrash(db, validId)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // trash:delete — Permanently delete a trash item
  ipcMain.handle(IPC.TRASH.DELETE, async (_event, trashId: unknown) => {
    try {
      const validId = validateStringId(trashId)
      const db = getDb()
      await permanentDelete(db, validId)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // trash:restoreGroup — Restore all trashed photos in a group
  ipcMain.handle(IPC.TRASH.RESTORE_GROUP, (_event, groupId: unknown) => {
    try {
      const validId = validateStringId(groupId)
      const db = getDb()
      const count = restoreGroupFromTrash(db, validId)
      return { success: true, data: { restoredCount: count } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // trash:empty — Empty all trashed items
  ipcMain.handle(IPC.TRASH.EMPTY, async () => {
    try {
      const db = getDb()
      const count = await emptyTrash(db)
      return { success: true, data: { deletedCount: count } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}
