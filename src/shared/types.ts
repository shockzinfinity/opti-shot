// Shared types between Main and Renderer processes

export type UUID = string

// IPC Response wrapper — all IPC handlers return this shape
export interface IpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// Enums
export type ScanMode = 'full' | 'date_range' | 'folder_only' | 'incremental'
export type ScanStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type ReviewStatus = 'pending' | 'reviewed' | 'exported'
export type Decision = 'keep' | 'delete'
export type ExportStatus = 'ready' | 'running' | 'paused' | 'completed' | 'failed'
export type ExportAction = 'copy' | 'move'
export type ConflictStrategy = 'skip' | 'rename' | 'overwrite'
export type TrashStatus = 'trashed' | 'restored' | 'purged'
export type ScanPreset = 'balanced' | 'conservative' | 'sensitive'

// IPC Channel names
export const IPC = {
  FOLDERS: { ADD: 'folders:add', REMOVE: 'folders:remove', LIST: 'folders:list', VALIDATE: 'folders:validate' },
  SCAN: { START: 'scan:start', PAUSE: 'scan:pause', CANCEL: 'scan:cancel', PROGRESS: 'scan:progress', STATUS: 'scan:status' },
  GROUPS: { LIST: 'groups:list', DETAIL: 'groups:detail', CHANGE_MASTER: 'groups:changeMaster', MARK_REVIEWED: 'groups:markReviewed' },
  PHOTOS: { INFO: 'photos:info', THUMBNAIL: 'photos:thumbnail' },
  REVIEWS: { GET_PENDING: 'reviews:getPending' },
  EXPORT: { START: 'export:start', PAUSE: 'export:pause', CANCEL: 'export:cancel', PROGRESS: 'export:progress' },
  TRASH: { LIST: 'trash:list', SUMMARY: 'trash:summary', MOVE: 'trash:move', RESTORE: 'trash:restore', RESTORE_GROUP: 'trash:restoreGroup', DELETE: 'trash:delete', EMPTY: 'trash:empty' },
  SETTINGS: { GET: 'settings:get', SAVE: 'settings:save', RESET: 'settings:reset' },
} as const

// Status & Decision Constants
export const SCAN_STATUS = {
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export const REVIEW_STATUS = {
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  EXPORTED: 'exported',
} as const

export const DECISION = {
  KEEP: 'keep',
  DELETE: 'delete',
} as const

export const TRASH_STATUS = {
  TRASHED: 'trashed',
  RESTORED: 'restored',
  PURGED: 'purged',
} as const

export const EXPORT_STATUS = {
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

// Progress event types
export interface ScanProgress {
  processedFiles: number
  totalFiles: number
  discoveredGroups: number
  currentFile: string
  elapsedSeconds: number
  estimatedRemainingSeconds: number
  scanSpeed: number
  skippedCount: number
}

export interface ExportProgress {
  processedFiles: number
  totalFiles: number
  transferredSize: number
  totalSize: number
  speed: number
  currentFile: string
}
