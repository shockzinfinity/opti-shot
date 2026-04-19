import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import { ALL_COMMAND_TYPES, ALL_QUERY_TYPES, ALL_EVENT_TYPES } from '@shared/cqrs/bus'

// ── Legacy allowlists (Phase 3에서 제거) ──
const ALLOWED_INVOKE: Set<string> = new Set(
  Object.values(IPC).flatMap((group) => Object.values(group))
)
ALLOWED_INVOKE.add('dialog:openDirectory')
ALLOWED_INVOKE.add('updater:check')
ALLOWED_INVOKE.add('updater:download')
ALLOWED_INVOKE.add('updater:install')
ALLOWED_INVOKE.add('stats:get')
ALLOWED_INVOKE.add('scans:list')
ALLOWED_INVOKE.add('app:info')
ALLOWED_INVOKE.add('shell:openPath')
ALLOWED_INVOKE.add('photos:exif')
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

// ── CQRS allowlists ──
const ALLOWED_COMMANDS: Set<string> = new Set(ALL_COMMAND_TYPES)
const ALLOWED_QUERIES: Set<string> = new Set(ALL_QUERY_TYPES)
const ALLOWED_EVENTS: Set<string> = new Set(ALL_EVENT_TYPES)

const api = {
  // ── Legacy API (Phase 3에서 제거) ──
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

  // ── CQRS API ──
  command: (type: string, payload?: unknown) => {
    if (!ALLOWED_COMMANDS.has(type)) throw new Error(`Command not allowed: ${type}`)
    return ipcRenderer.invoke('cqrs:cmd', type, payload ?? null)
  },
  query: (type: string, payload?: unknown) => {
    if (!ALLOWED_QUERIES.has(type)) throw new Error(`Query not allowed: ${type}`)
    return ipcRenderer.invoke('cqrs:qry', type, payload ?? null)
  },
  subscribe: (type: string, callback: (payload: unknown) => void) => {
    if (!ALLOWED_EVENTS.has(type)) throw new Error(`Event not allowed: ${type}`)
    const channel = `cqrs:evt:${type}`
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api
