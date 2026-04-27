import { checkForUpdates, downloadUpdate, installUpdate } from '@main/services/updater'
import type { CommandBus } from '../commandBus'

export function registerUpdaterHandlers(cmd: CommandBus): void {
  cmd.register('updater.check', async () => {
    const version = await checkForUpdates()
    return { version }
  })

  cmd.register('updater.download', async () => {
    // Fire-and-forget; progress is emitted via EventBus
    void downloadUpdate()
  })

  cmd.register('updater.install', async () => {
    await installUpdate()
  })
}
