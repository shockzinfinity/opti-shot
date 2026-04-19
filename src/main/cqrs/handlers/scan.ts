import { BrowserWindow, Notification } from 'electron'
import { getDb } from '@main/db'
import { getSettings } from '@main/services/settings'
import { startScan, pauseScan, cancelScan, getScanStatus } from '@main/services/scan'
import type { CommandBus } from '../commandBus'
import type { QueryBus } from '../queryBus'
import type { EventBus } from '../eventBus'

export function registerScanHandlers(cmd: CommandBus, qry: QueryBus, evt: EventBus): void {
  cmd.register('scan.start', async (input) => {
    const db = getDb()
    const result = await startScan(db, input, (progress) => {
      evt.publish('scan.progress', progress)
    })

    // System notification (if app not focused)
    const uiSettings = getSettings('ui')
    const focusedWin = BrowserWindow.getFocusedWindow()
    if (uiSettings.notifyOnComplete && !focusedWin) {
      new Notification({
        title: 'OptiShot',
        body: `스캔 완료: ${result.processedFiles}장 처리, ${result.groups.length}개 중복 그룹 발견`,
      }).show()
    }

    return result
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
