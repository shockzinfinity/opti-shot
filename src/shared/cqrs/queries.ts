import type { SettingsSection } from './commands'
import type { PluginInfo } from '../plugins'
import type { NotificationEntry } from '../types'

export interface QueryMap {
  // Folder
  'folder.list': { input: void; result: Array<{ id: string; path: string; includeSubfolders: boolean; addedAt: string }> }
  'folder.validate': { input: { path: string }; result: { isValid: boolean; isReadable: boolean; hasSubfolders: boolean } }

  // Scan
  'scan.status': { input: void; result: { state: string; scanId: string | null } }

  // Group
  'group.list': {
    input: { offset?: number; limit?: number; search?: string; status?: string }
    result: Array<{
      id: string
      photoCount: number
      totalSize: number
      masterFilename: string
      decision: string | null
      createdAt: string
    }>
  }
  'group.detail': {
    input: { groupId: string }
    result: {
      id: string
      photos: Array<{ id: string; path: string; isMaster: boolean; width: number; height: number; size: number }>
      reclaimableSize: number
    }
  }

  // Photo
  'photo.info': {
    input: { photoId: string }
    result: { id: string; path: string; width: number; height: number; size: number; format: string }
  }
  'photo.thumbnail': { input: { photoId: string }; result: string }
  'photo.exif': {
    input: { photoId: string }
    result: { path: string; exif: Record<string, unknown> }
  }

  // Review
  'review.getPending': { input: void; result: Array<{ photoId: string; groupId: string; path: string }> }

  // Trash
  'trash.list': {
    input: { offset?: number; limit?: number }
    result: Array<{ id: string; photoId: string; originalPath: string; trashedAt: string; size: number }>
  }
  'trash.summary': {
    input: void
    result: { count: number; totalSize: number; oldestDate: string | null }
  }

  // Settings
  'settings.get': { input: { section: SettingsSection }; result: Record<string, unknown> }

  // Stats
  'stats.dashboard': {
    input: void
    result: { totalPhotos: number; totalGroups: number; reclaimableSize: number; lastScan: Record<string, unknown> | null }
  }
  'stats.scanHistory': { input: void; result: Array<Record<string, unknown>> }

  // Maintenance
  'maintenance.storageStats': { input: void; result: { dbSize: number; cacheSize: number } }

  // Organize
  'organize.lastJob': {
    input: void
    result: {
      id: string; folder: string; includeSubfolders: boolean
      totalFiles: number; renamedFiles: number; skippedFiles: number
      status: string; startedAt: string; endedAt: string | null
    } | null
  }

  // Plugin
  'plugin.list': { input: void; result: PluginInfo[] }

  // Notification
  'notification.list': {
    input: { limit?: number }
    result: Array<NotificationEntry & { isRead: boolean }>
  }

  // App
  'app.info': {
    input: void
    result: { version: string; electron: string; node: string; chrome: string; platform: string }
  }
}
