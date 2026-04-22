import type { CommandMap } from './commands'
import type { QueryMap } from './queries'
import type { EventMap } from './events'

// Key types
export type CommandType = keyof CommandMap
export type QueryType = keyof QueryMap
export type EventType = keyof EventMap

// Input/Result extractors
export type CommandInput<K extends CommandType> = CommandMap[K]['input']
export type CommandResult<K extends CommandType> = CommandMap[K]['result']
export type QueryInput<K extends QueryType> = QueryMap[K]['input']
export type QueryResult<K extends QueryType> = QueryMap[K]['result']
export type EventPayload<K extends EventType> = EventMap[K]

// Handler signatures
export type CommandHandler<K extends CommandType = CommandType> =
  (input: CommandInput<K>) => Promise<CommandResult<K>>

export type QueryHandler<K extends QueryType = QueryType> =
  (input: QueryInput<K>) => Promise<QueryResult<K>>

// All valid types for allowlists
export const ALL_COMMAND_TYPES: CommandType[] = [
  'folder.add', 'folder.remove',
  'scan.start', 'scan.pause', 'scan.cancel',
  'group.changeMaster', 'group.markReviewed',
  'trash.move', 'trash.restore', 'trash.restoreGroup', 'trash.delete', 'trash.empty',
  'organize.preview', 'organize.execute', 'organize.undo',
  'settings.save', 'settings.reset',
  'maintenance.clearCache', 'maintenance.clearScanHistory', 'maintenance.clearOrganizeHistory',
  'notification.markRead', 'notification.clear',
  'dialog.openDirectory', 'shell.openPath',
  'updater.check', 'updater.download', 'updater.install',
]

export const ALL_QUERY_TYPES: QueryType[] = [
  'folder.list', 'folder.validate',
  'scan.status',
  'group.list', 'group.detail',
  'photo.info', 'photo.thumbnail', 'photo.exif',
  'review.getPending',
  'trash.list', 'trash.summary',
  'organize.lastJob',
  'algorithm.list',
  'notification.list',
  'settings.get',
  'stats.dashboard', 'stats.scanHistory',
  'maintenance.storageStats',
  'app.info',
]

export const ALL_EVENT_TYPES: EventType[] = [
  'scan.progress',
  'organize.progress',
  'updater.available', 'updater.progress', 'updater.downloaded', 'updater.installFailed',
  'notification.new',
]
