import { contextBridge, ipcRenderer } from 'electron'
import { ALL_COMMAND_TYPES, ALL_QUERY_TYPES, ALL_EVENT_TYPES } from '@shared/cqrs/bus'

const ALLOWED_COMMANDS: Set<string> = new Set(ALL_COMMAND_TYPES)
const ALLOWED_QUERIES: Set<string> = new Set(ALL_QUERY_TYPES)
const ALLOWED_EVENTS: Set<string> = new Set(ALL_EVENT_TYPES)

const api = {
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
