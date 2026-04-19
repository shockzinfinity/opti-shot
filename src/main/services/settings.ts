// @TASK P1-R2 - Settings service (JSON file-based)
// @SPEC specs/domain/resources.yaml#settings_scan, settings_ui, settings_data

import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { ScanPreset } from '@shared/types'

// --- Interfaces ---

export interface ScanSettings {
  preset: ScanPreset
  phashThreshold: number
  ssimThreshold: number
  timeWindowHours: number
  parallelThreads: number
  batchSize: number
  enableCorrectionDetection: boolean
  enableExifFilter: boolean
  enableIncremental: boolean
}

export interface UiSettings {
  language: 'ko' | 'en' | 'ja'
  theme: 'light' | 'dark' | 'auto'
  use24HourClock: boolean
  notifyOnComplete: boolean
  minimizeToTray: boolean
  restoreWindowSize: boolean
}

export interface DataSettings {
  trashRetentionDays: number
  autoCacheCleanup: boolean
  useSystemTrash: boolean
}

export interface SettingsStore {
  scan: ScanSettings
  ui: UiSettings
  data: DataSettings
}

export type SettingsSection = keyof SettingsStore

// --- Defaults ---

const DEFAULT_SCAN: ScanSettings = {
  preset: 'balanced',
  phashThreshold: 8,
  ssimThreshold: 0.82,
  timeWindowHours: 1,
  parallelThreads: 8,
  batchSize: 100,
  enableCorrectionDetection: true,
  enableExifFilter: true,
  enableIncremental: true,
}

const DEFAULT_UI: UiSettings = {
  language: 'ko',
  theme: 'auto',
  use24HourClock: true,
  notifyOnComplete: true,
  minimizeToTray: true,
  restoreWindowSize: true,
}

const DEFAULT_DATA: DataSettings = {
  trashRetentionDays: 30,
  autoCacheCleanup: true,
  useSystemTrash: true,
}

const DEFAULTS: SettingsStore = {
  scan: { ...DEFAULT_SCAN },
  ui: { ...DEFAULT_UI },
  data: { ...DEFAULT_DATA },
}

// --- Service ---

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function loadStore(): SettingsStore {
  const filePath = getSettingsPath()

  if (!existsSync(filePath)) {
    return structuredClone(DEFAULTS)
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SettingsStore>

    // Merge with defaults so missing keys get filled in
    return {
      scan: { ...DEFAULTS.scan, ...parsed.scan },
      ui: { ...DEFAULTS.ui, ...parsed.ui },
      data: { ...DEFAULTS.data, ...parsed.data },
    }
  } catch {
    // Corrupted file — return defaults
    return structuredClone(DEFAULTS)
  }
}

function saveStore(store: SettingsStore): void {
  const filePath = getSettingsPath()
  const dir = join(filePath, '..')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

function isValidSection(section: string): section is SettingsSection {
  return section === 'scan' || section === 'ui' || section === 'data'
}

// --- Public API ---

export function getSettings<K extends SettingsSection>(section: K): SettingsStore[K] {
  if (!isValidSection(section)) {
    throw new Error(`Invalid settings section: ${section}`)
  }
  const store = loadStore()
  return store[section]
}

export function saveSettings<K extends SettingsSection>(
  section: K,
  data: Partial<SettingsStore[K]>,
): SettingsStore[K] {
  if (!isValidSection(section)) {
    throw new Error(`Invalid settings section: ${section}`)
  }
  const store = loadStore()
  store[section] = { ...store[section], ...data }
  saveStore(store)
  return store[section]
}

export function resetSettings<K extends SettingsSection>(section: K): SettingsStore[K] {
  if (!isValidSection(section)) {
    throw new Error(`Invalid settings section: ${section}`)
  }
  const store = loadStore()
  store[section] = structuredClone(DEFAULTS[section])
  saveStore(store)
  return store[section]
}

export function getDefaults(): SettingsStore {
  return structuredClone(DEFAULTS)
}

// Re-export for testing
export { DEFAULTS }
