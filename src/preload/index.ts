import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'

// Build allowlist from IPC constant object
const ALLOWED_INVOKE: Set<string> = new Set(
  Object.values(IPC).flatMap((group) => Object.values(group))
)
// Add dialog channel used by folder picker
ALLOWED_INVOKE.add('dialog:openDirectory')
// Add updater channels
ALLOWED_INVOKE.add('updater:check')
ALLOWED_INVOKE.add('updater:download')
ALLOWED_INVOKE.add('updater:install')
// Add stats channels
ALLOWED_INVOKE.add('stats:get')
ALLOWED_INVOKE.add('scans:list')
// Add app info channel
ALLOWED_INVOKE.add('app:info')
// Add shell channel
ALLOWED_INVOKE.add('shell:openPath')
// Add photos:exif channel
ALLOWED_INVOKE.add('photos:exif')
// Add maintenance channels
ALLOWED_INVOKE.add('maintenance:clearCache')
ALLOWED_INVOKE.add('maintenance:clearScanHistory')
ALLOWED_INVOKE.add('maintenance:storageStats')

const ALLOWED_ON = new Set([
  IPC.SCAN.PROGRESS,
  IPC.EXPORT.PROGRESS,
  'updater:available',
  'updater:progress',
  'updater:downloaded',
])

const api = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_INVOKE.has(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_ON.has(channel)) {
      throw new Error(`IPC listen channel not allowed: ${channel}`)
    }
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api
