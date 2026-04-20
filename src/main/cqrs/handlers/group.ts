import { getDb } from '@main/db'
import { listGroups, getGroupDetail, changeMaster, markReviewed } from '@main/services/group'
import type { ReviewStatus } from '@shared/types'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

export function registerGroupHandlers(cmd: CommandBus, qry: QueryBus): void {
  cmd.register('group.changeMaster', async (input: { groupId: string; newMasterId: string }) => {
    const db = getDb()
    changeMaster(db, input.groupId, input.newMasterId)
  })

  cmd.register('group.markReviewed', async (input: { groupId: string; decision?: string }) => {
    const db = getDb()
    const validDecision = typeof input.decision === 'string' && ['kept_all', 'duplicates_deleted'].includes(input.decision)
      ? input.decision as 'kept_all' | 'duplicates_deleted'
      : undefined
    markReviewed(db, input.groupId, validDecision)
  })

  qry.register('group.list', async (input: { offset?: number; limit?: number; search?: string; status?: string }) => {
    const db = getDb()
    return listGroups(db, { ...input, status: input?.status as ReviewStatus | undefined })
  })

  qry.register('group.detail', async (input: { groupId: string }) => {
    const db = getDb()
    return getGroupDetail(db, input.groupId)
  })
}
