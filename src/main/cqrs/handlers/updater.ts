import { downloadUpdate, installUpdate } from '@main/services/updater'
import type { CommandBus } from '../commandBus'

export function registerUpdaterHandlers(cmd: CommandBus): void {
  cmd.register('updater.check', async () => {
    // Auto-updater checks are triggered via initAutoUpdater()
    // This command triggers a manual check
    const pkg = await import('electron-updater')
    const result = await pkg.autoUpdater.checkForUpdates()
    return result?.updateInfo ?? null
  })

  cmd.register('updater.download', async () => {
    downloadUpdate()
  })

  cmd.register('updater.install', async () => {
    installUpdate()
  })
}
