import { downloadUpdate, installUpdate } from '@main/services/updater'
import type { CommandBus } from '../commandBus'

export function registerUpdaterHandlers(cmd: CommandBus): void {
  cmd.register('updater.check', async () => {
    if (process.env.NODE_ENV === 'development') return null
    try {
      const pkg = await import('electron-updater')
      const result = await pkg.autoUpdater.checkForUpdates()
      return result?.updateInfo ?? null
    } catch {
      return null
    }
  })

  cmd.register('updater.download', async () => {
    downloadUpdate()
  })

  cmd.register('updater.install', async () => {
    const success = installUpdate()
    if (!success) {
      throw new Error('Auto-install failed: app is not code-signed')
    }
  })
}
