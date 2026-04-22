import type { ScanProgress, OrganizeProgress, NotificationEntry } from '../types'

export interface EventMap {
  'scan.progress': ScanProgress
  'organize.progress': OrganizeProgress
  'updater.available': { version: string; releaseDate: string }
  'updater.progress': { percent: number; transferred: number; total: number }
  'updater.downloaded': void
  'updater.installFailed': { message: string }
  'notification.new': NotificationEntry
}
