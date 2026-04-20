import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { NotificationEntry, NotificationLevel, NotificationCategory } from '@shared/types'

// --- Log file (JSON Lines) ---

function getLogDir(): string {
  return app.getPath('logs')
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return join(getLogDir(), `optishot-${date}.log`)
}

function ensureLogDir(): void {
  const dir = getLogDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function writeLogEntry(entry: NotificationEntry): void {
  ensureLogDir()
  const line = JSON.stringify(entry) + '\n'
  appendFileSync(getLogFilePath(), line, 'utf-8')
}

function readRecentEntries(limit: number): NotificationEntry[] {
  const dir = getLogDir()
  if (!existsSync(dir)) return []

  // Get log files sorted by date descending
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('optishot-') && f.endsWith('.log'))
    .sort()
    .reverse()

  const entries: NotificationEntry[] = []

  for (const file of files) {
    if (entries.length >= limit) break

    try {
      const content = readFileSync(join(dir, file), 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean).reverse()

      for (const line of lines) {
        if (entries.length >= limit) break
        try {
          entries.push(JSON.parse(line) as NotificationEntry)
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return entries
}

// --- Read state (JSON file) ---

interface NotificationReadState {
  readIds: string[]
  lastReadAt: string
  clearedAt: string
}

function getStatePath(): string {
  return join(app.getPath('userData'), 'notification-state.json')
}

function loadReadState(): NotificationReadState {
  const filePath = getStatePath()
  if (!existsSync(filePath)) {
    return { readIds: [], lastReadAt: '', clearedAt: '' }
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    return { readIds: [], lastReadAt: '', clearedAt: '', ...parsed }
  } catch {
    return { readIds: [], lastReadAt: '', clearedAt: '' }
  }
}

function saveReadState(state: NotificationReadState): void {
  writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8')
}

// --- Public API ---

/**
 * Initialize notification state for new session.
 * Clears previous session's notifications by setting clearedAt to now.
 * Call once at app startup.
 */
export function initNotificationSession(): void {
  const state = loadReadState()
  saveReadState({
    ...state,
    readIds: [],
    clearedAt: new Date().toISOString(),
  })
}

/** EventBus emit callback — set by CQRS handler registration. */
let emitNotification: ((entry: NotificationEntry) => void) | null = null

export function setNotificationEmitter(emitter: (entry: NotificationEntry) => void): void {
  emitNotification = emitter
}

/**
 * Send a notification: writes to log file + emits to Renderer via EventBus.
 */
export function sendNotification(params: {
  level: NotificationLevel
  category: NotificationCategory
  title: string
  message: string
  details?: string
}): void {
  const entry: NotificationEntry = {
    id: `noti_${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    ...params,
  }

  // 1. Log file (permanent) — failure is non-critical
  try {
    writeLogEntry(entry)
  } catch (e) {
    console.error('[notification] Log write failed:', e)
  }

  // 2. EventBus push (real-time) — failure is non-critical
  try {
    emitNotification?.(entry)
  } catch (e) {
    console.error('[notification] EventBus emit failed:', e)
  }
}

/**
 * List recent notifications merged with read state.
 */
export function listNotifications(limit = 50): Array<NotificationEntry & { isRead: boolean }> {
  const entries = readRecentEntries(limit)
  const state = loadReadState()
  const readSet = new Set(state.readIds)

  // Filter out entries before the last clear
  const clearedAt = state.clearedAt ? new Date(state.clearedAt).getTime() : 0
  const visible = clearedAt > 0
    ? entries.filter((e) => new Date(e.timestamp).getTime() > clearedAt)
    : entries

  return visible.map((e) => ({
    ...e,
    isRead: readSet.has(e.id),
  }))
}

/**
 * Mark specific notifications as read.
 */
export function markNotificationsRead(ids: string[]): void {
  const state = loadReadState()
  const readSet = new Set(state.readIds)
  for (const id of ids) readSet.add(id)
  saveReadState({
    ...state,
    readIds: Array.from(readSet),
    lastReadAt: new Date().toISOString(),
  })
}

/**
 * Clear all read state (mark everything as unread).
 */
export function clearNotificationState(): void {
  saveReadState({ readIds: [], lastReadAt: '', clearedAt: new Date().toISOString() })
}
