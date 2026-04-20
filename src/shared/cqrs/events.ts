import type { ScanProgress, ExportProgress } from '../types'

export interface EventMap {
  'scan.progress': ScanProgress
  'export.progress': ExportProgress
  'updater.available': { version: string; releaseDate: string }
  'updater.progress': { percent: number; transferred: number; total: number }
  'updater.downloaded': void
}
