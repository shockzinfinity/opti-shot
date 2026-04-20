import { getDb } from '@main/db'
import { startExport, pauseExport, cancelExport } from '@main/services/export'
import type { CommandBus } from '../commandBus'
import type { EventBus } from '../eventBus'

export function registerExportHandlers(cmd: CommandBus, evt: EventBus): void {
  cmd.register('export.start', async (input) => {
    const db = getDb()
    return await startExport(db, input, (progress) => {
      evt.publish('export.progress', progress)
    })
  })

  cmd.register('export.pause', async () => {
    pauseExport()
  })

  cmd.register('export.cancel', async () => {
    cancelExport()
  })
}
