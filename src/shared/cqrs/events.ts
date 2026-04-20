import type { ScanProgress, NotificationEntry } from '../types'

export interface EventMap {
  'scan.progress': ScanProgress
  'updater.available': { version: string; releaseDate: string }
  'updater.progress': { percent: number; transferred: number; total: number }
  'updater.downloaded': void
  'notification.new': NotificationEntry
}
