// @TASK P3-R1 - Group IPC handlers
// @SPEC specs/domain/resources.yaml#photo_groups
// @TEST tests/unit/services/group.test.ts

import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import type { ReviewStatus } from '@shared/types'
import { getDb } from '@main/db'
import { listGroups, getGroupDetail, changeMaster, markReviewed } from '@main/services/group'
import { validateStringId } from '../validators'

export function registerGroupHandlers(): void {
  // groups:list -- List groups with pagination, search, and status filter
  ipcMain.handle(
    IPC.GROUPS.LIST,
    (_event, options?: { offset?: number; limit?: number; search?: string; status?: ReviewStatus }) => {
      try {
        const db = getDb()
        return { success: true, data: listGroups(db, options ?? {}) }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
      }
    },
  )

  // groups:detail -- Get group detail with all photos
  ipcMain.handle(IPC.GROUPS.DETAIL, (_event, groupId: unknown) => {
    try {
      const validId = validateStringId(groupId)
      const db = getDb()
      return { success: true, data: getGroupDetail(db, validId) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // groups:changeMaster -- Change master photo in a group
  ipcMain.handle(
    IPC.GROUPS.CHANGE_MASTER,
    (_event, groupId: unknown, newMasterId: unknown) => {
      try {
        const validGroupId = validateStringId(groupId)
        const validMasterId = validateStringId(newMasterId)
        const db = getDb()
        changeMaster(db, validGroupId, validMasterId)
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
      }
    },
  )

  // groups:markReviewed -- Mark a group as reviewed with optional decision type
  ipcMain.handle(IPC.GROUPS.MARK_REVIEWED, (_event, groupId: unknown, decision?: unknown) => {
    try {
      const validId = validateStringId(groupId)
      const validDecision = typeof decision === 'string' && ['kept_all', 'duplicates_deleted'].includes(decision)
        ? decision as 'kept_all' | 'duplicates_deleted'
        : undefined
      const db = getDb()
      markReviewed(db, validId, validDecision)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}
