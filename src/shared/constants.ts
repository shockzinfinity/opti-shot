import type { ScanPreset } from './types'

// ─── Scan Preset Values ───

export interface ScanPresetConfig {
  phashThreshold: number
  ssimThreshold: number
  timeWindowHours: number
  parallelThreads: number
}

export const SCAN_PRESETS: Record<ScanPreset, ScanPresetConfig> = {
  balanced: { phashThreshold: 8, ssimThreshold: 0.82, timeWindowHours: 1, parallelThreads: 8 },
  conservative: { phashThreshold: 6, ssimThreshold: 0.9, timeWindowHours: 2, parallelThreads: 4 },
  sensitive: { phashThreshold: 10, ssimThreshold: 0.8, timeWindowHours: 0, parallelThreads: 16 },
} as const

// ─── Scan Default Settings ───

export const DEFAULT_SCAN_SETTINGS = {
  preset: 'balanced' as ScanPreset,
  ...SCAN_PRESETS.balanced,
  batchSize: 100,
  enableCorrectionDetection: true,
  enableExifFilter: true,
  enableIncremental: true,
  enabledPlugins: { 'phash-ssim': true } as Record<string, boolean>,
} as const

export const DEFAULT_UI_SETTINGS = {
  language: 'ko' as 'ko' | 'en' | 'ja',
  theme: 'auto' as 'light' | 'dark' | 'auto',
  use24HourClock: true,
  notifyOnComplete: true,
  minimizeToTray: true,
  restoreWindowSize: true,
} as const

export const DEFAULT_DATA_SETTINGS = {
  trashRetentionDays: 30,
  autoCacheCleanup: true,
  useSystemTrash: true,
} as const

// ─── Scan Modes ───

export const SCAN_MODE_KEYS = ['full', 'date_range', 'folder_only', 'incremental'] as const

// ─── Image Processing ───

export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp', '.gif',
  '.heic', '.heif',
])

export const THUMBNAIL_SIZE = { width: 200, height: 200, quality: 80 } as const
export const HEIC_CONVERT_QUALITY = 0.92

// ─── Helpers ───

/** Detect which preset matches given thresholds, or null if custom */
export function detectPreset(phashThreshold: number, ssimThreshold: number): ScanPreset | null {
  for (const [id, values] of Object.entries(SCAN_PRESETS)) {
    if (values.phashThreshold === phashThreshold && values.ssimThreshold === ssimThreshold) {
      return id as ScanPreset
    }
  }
  return null
}
