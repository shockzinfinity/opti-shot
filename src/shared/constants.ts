import type { ScanPreset, MergeStrategy } from './types'

// ─── Algorithm Config ───

export interface AlgorithmConfig {
  hashAlgorithms: string[]
  hashThresholds: Record<string, number>
  mergeStrategy: MergeStrategy
  verifyAlgorithms: string[]
  verifyThresholds: Record<string, number>
}

// ─── Scan Preset Values ───

export interface ScanPresetConfig extends AlgorithmConfig {
  timeWindowHours: number
  parallelThreads: number
}

export const SCAN_PRESETS: Record<Exclude<ScanPreset, 'custom'>, ScanPresetConfig> = {
  balanced: {
    hashAlgorithms: ['phash', 'dhash'],
    hashThresholds: { phash: 8, dhash: 8 },
    mergeStrategy: 'union',
    verifyAlgorithms: ['ssim'],
    verifyThresholds: { ssim: 0.82 },
    timeWindowHours: 1,
    parallelThreads: 8,
  },
  fast: {
    hashAlgorithms: ['dhash'],
    hashThresholds: { dhash: 8 },
    mergeStrategy: 'union',
    verifyAlgorithms: ['ssim'],
    verifyThresholds: { ssim: 0.75 },
    timeWindowHours: 0,
    parallelThreads: 16,
  },
  conservative: {
    hashAlgorithms: ['phash'],
    hashThresholds: { phash: 6 },
    mergeStrategy: 'union',
    verifyAlgorithms: ['ssim'],
    verifyThresholds: { ssim: 0.85 },
    timeWindowHours: 2,
    parallelThreads: 4,
  },
  precise: {
    hashAlgorithms: ['phash', 'dhash'],
    hashThresholds: { phash: 8, dhash: 8 },
    mergeStrategy: 'intersection',
    verifyAlgorithms: ['ssim', 'nmse'],
    verifyThresholds: { ssim: 0.82, nmse: 0.05 },
    timeWindowHours: 1,
    parallelThreads: 8,
  },
}

// ─── Scan Default Settings ───

export type ExifGpsFilter = 'all' | 'with_gps' | 'without_gps'

export const DEFAULT_SCAN_SETTINGS = {
  preset: 'balanced' as ScanPreset,
  ...SCAN_PRESETS.balanced,
  batchSize: 100,
  enableCorrectionDetection: true,
  enableExifFilter: false,
  enableIncremental: true,
  exifMinWidth: 0,
  exifMinHeight: 0,
  exifGpsFilter: 'all' as ExifGpsFilter,
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

export const SCAN_MODE_KEYS = ['full', 'date_range', 'folder_only'] as const

// ─── Image Processing ───

export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp', '.gif',
  '.heic', '.heif',
])

export const THUMBNAIL_SIZE = { width: 200, height: 200, quality: 80 } as const
export const HEIC_CONVERT_QUALITY = 0.92

// ─── Helpers ───

/** Detect which preset matches given algorithm config, or 'custom' */
export function detectPreset(config: AlgorithmConfig): ScanPreset {
  for (const [id, preset] of Object.entries(SCAN_PRESETS)) {
    if (
      JSON.stringify(config.hashAlgorithms) === JSON.stringify(preset.hashAlgorithms) &&
      JSON.stringify(config.hashThresholds) === JSON.stringify(preset.hashThresholds) &&
      config.mergeStrategy === preset.mergeStrategy &&
      JSON.stringify(config.verifyAlgorithms) === JSON.stringify(preset.verifyAlgorithms) &&
      JSON.stringify(config.verifyThresholds) === JSON.stringify(preset.verifyThresholds)
    ) {
      return id as ScanPreset
    }
  }
  return 'custom'
}
