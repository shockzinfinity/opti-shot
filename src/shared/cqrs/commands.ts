import type { ScanMode, ScanProgress, ExportProgress } from '../types'

// 리뷰 결정 타입 — 실제 핸들러 기준 (레거시 Decision과 구분)
export type ReviewDecision = 'kept_all' | 'duplicates_deleted'
export type SettingsSection = 'scan' | 'ui' | 'data'

export interface CommandMap {
  // Folder
  'folder.add': {
    input: { path: string; includeSubfolders?: boolean }
    result: { id: string; path: string; includeSubfolders: boolean; addedAt: string }
  }
  'folder.remove': { input: { id: string }; result: void }

  // Scan
  'scan.start': {
    input: {
      mode: ScanMode
      phashThreshold: number
      ssimThreshold: number
      timeWindowHours: number
      parallelThreads: number
      batchSize?: number
    }
    result: { processedFiles: number; groups: unknown[] }
  }
  'scan.pause': { input: void; result: void }
  'scan.cancel': { input: void; result: void }

  // Group
  'group.changeMaster': {
    input: { groupId: string; newMasterId: string }
    result: void
  }
  'group.markReviewed': {
    input: { groupId: string; decision?: ReviewDecision }
    result: void
  }

  // Export
  'export.start': {
    input: {
      targetPath: string
      action: 'copy' | 'move'
      conflictStrategy: 'skip' | 'rename' | 'overwrite'
      autoCreateFolder: boolean
    }
    result: { processedFiles: number; totalSize: number }
  }
  'export.pause': { input: void; result: void }
  'export.cancel': { input: void; result: void }

  // Trash
  'trash.move': { input: { photoId: string }; result: { trashId: string; timestamp: string } }
  'trash.restore': { input: { trashId: string }; result: void }
  'trash.restoreGroup': { input: { groupId: string }; result: { restoredCount: number } }
  'trash.delete': { input: { trashId: string }; result: void }
  'trash.empty': { input: void; result: { deletedCount: number } }

  // Settings — 갱신/초기화된 설정 객체를 반환
  'settings.save': {
    input: { section: SettingsSection; data: Record<string, unknown> }
    result: Record<string, unknown>
  }
  'settings.reset': {
    input: { section: SettingsSection }
    result: Record<string, unknown>
  }

  // Maintenance
  'maintenance.clearCache': { input: void; result: void }
  'maintenance.clearScanHistory': { input: void; result: void }

  // Dialog — OS 다이얼로그 부수효과
  'dialog.openDirectory': { input: void; result: string | null }

  // Shell
  'shell.openPath': { input: { filePath: string }; result: void }

  // Updater
  'updater.check': { input: void; result: unknown }
  'updater.download': { input: void; result: void }
  'updater.install': { input: void; result: void }
}
