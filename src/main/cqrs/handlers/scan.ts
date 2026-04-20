import { getDb } from '@main/db'
import { startScan, pauseScan, cancelScan, getScanStatus } from '@main/services/scan'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'
import type { EventBus } from '../eventBus'

export function registerScanHandlers(cmd: CommandBus, qry: QueryBus, evt: EventBus): void {
  cmd.register('scan.start', async (input) => {
    const db = getDb()
    return await startScan(db, input, (progress) => {
      evt.publish('scan.progress', progress)
    })
  })

  cmd.register('scan.pause', async () => {
    pauseScan()
  })

  cmd.register('scan.cancel', async () => {
    cancelScan()
  })

  qry.register('scan.status', async () => {
    return getScanStatus()
  })
}
