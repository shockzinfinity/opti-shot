import { getDb } from '@main/db'
import {
  previewOrganize,
  executeOrganize,
  undoOrganize,
  getLastOrganizeJob,
} from '@main/services/organize'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'
import type { EventBus } from '../eventBus'

export function registerOrganizeHandlers(cmd: CommandBus, qry: QueryBus, evt: EventBus): void {
  cmd.register('organize.preview', async (input) => {
    const result = await previewOrganize(
      input.folder,
      input.includeSubfolders,
      (processed, total, file) => {
        evt.publish('organize.progress', { processedFiles: processed, totalFiles: total, currentFile: file })
      },
    )
    return {
      items: result.items,
      totalFiles: result.totalFiles,
      renamedCount: result.renamedCount,
      skippedCount: result.skippedCount,
    }
  })

  cmd.register('organize.execute', async (input) => {
    const db = getDb()
    return executeOrganize(
      db,
      input.folder,
      input.includeSubfolders,
      (processed, total, file) => {
        evt.publish('organize.progress', { processedFiles: processed, totalFiles: total, currentFile: file })
      },
    )
  })

  cmd.register('organize.undo', async (input) => {
    const db = getDb()
    return undoOrganize(db, input.jobId)
  })

  qry.register('organize.lastJob', async () => {
    const db = getDb()
    return getLastOrganizeJob(db)
  })
}
