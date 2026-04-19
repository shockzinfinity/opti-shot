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
