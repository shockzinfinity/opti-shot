import { getDb } from '@main/db'
import {
  moveToTrash, restoreFromTrash, permanentDelete,
  listTrash, getTrashSummary, emptyTrash, restoreGroupFromTrash,
} from '@main/services/trash'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'

export function registerTrashHandlers(cmd: CommandBus, qry: QueryBus): void {
  cmd.register('trash.move', async (input) => {
    const db = getDb()
    return moveToTrash(db, input.photoId)
  })

  cmd.register('trash.restore', async (input) => {
    const db = getDb()
    restoreFromTrash(db, input.trashId)
  })

  cmd.register('trash.restoreGroup', async (input) => {
    const db = getDb()
    const count = restoreGroupFromTrash(db, input.groupId)
    return { restoredCount: count }
  })

  cmd.register('trash.delete', async (input) => {
    const db = getDb()
    await permanentDelete(db, input.trashId)
  })

  cmd.register('trash.empty', async () => {
    const db = getDb()
    const count = await emptyTrash(db)
    return { deletedCount: count }
  })

  qry.register('trash.list', async (input) => {
    const db = getDb()
    return listTrash(db, input)
  })

  qry.register('trash.summary', async () => {
    const db = getDb()
    return getTrashSummary(db)
  })
}
