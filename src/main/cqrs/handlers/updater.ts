import { downloadUpdate, installUpdate } from '@main/services/updater'
import type { CommandBus } from '../commandBus'

export function registerUpdaterHandlers(cmd: CommandBus): void {
  cmd.register('updater.check', async () => {
    if (process.env.NODE_ENV === 'development') return { version: null }
    try {
      const pkg = await import('electron-updater')
      const result = await pkg.autoUpdater.checkForUpdates()
      // Return only serializable plain object — updateInfo may contain non-serializable data
      const version = result?.updateInfo?.version ?? null
      console.log('[updater.check] remote version:', version)
      return { version }
    } catch (err) {
      console.error('[updater.check] failed:', err instanceof Error ? err.message : err)
      return { version: null }
    }
  })

  cmd.register('updater.download', async () => {
    downloadUpdate()
  })

  cmd.register('updater.install', async () => {
    installUpdate()
    // If successful, app quits. If failed, error event fires asynchronously.
  })
}
