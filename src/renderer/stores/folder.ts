import { create } from 'zustand'
import type { ScanMode, ScanPreset, MergeStrategy } from '@shared/types'
import type { ScanSettings } from '@main/services/settings'
import { SCAN_PRESETS, DEFAULT_SCAN_SETTINGS } from '@shared/constants'

export interface FolderEntry {
  id: string
  path: string
  includeSubfolders: boolean
  isAccessible: boolean
}

export type ExifGpsFilter = 'all' | 'with_gps' | 'without_gps'

export interface ScanOptions {
  mode: ScanMode
  preset: ScanPreset
  dateStart: string | null
  dateEnd: string | null
  hashAlgorithms: string[]
  hashThresholds: Record<string, number>
  mergeStrategy: MergeStrategy
  verifyAlgorithms: string[]
  verifyThresholds: Record<string, number>
  timeWindowHours: number
  parallelThreads: number
  enableCorrectionDetection: boolean
  // EXIF filters
  enableExifFilter: boolean
  exifDateStart: string | null
  exifDateEnd: string | null
  exifCameraFilter: string
  exifMinWidth: number
  exifMinHeight: number
  exifGpsFilter: ExifGpsFilter
}

export type ScanPresetId = ScanPreset

interface FolderState {
  folders: FolderEntry[]
  options: ScanOptions
  advancedOpen: boolean
  addFolder: () => Promise<void>
  removeFolder: (id: string) => void
  commitFolders: () => Promise<void>
  reset: () => void
  loadDefaults: () => Promise<void>
  setMode: (mode: ScanMode) => void
  setOption: <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => void
  applyPreset: (preset: ScanPresetId) => void
  toggleAdvanced: () => void
}

/** Fallback defaults — derived from shared constants, used until Settings loads */
const FALLBACK_OPTIONS: ScanOptions = {
  mode: 'full',
  preset: DEFAULT_SCAN_SETTINGS.preset,
  dateStart: null,
  dateEnd: null,
  hashAlgorithms: [...DEFAULT_SCAN_SETTINGS.hashAlgorithms],
  hashThresholds: { ...DEFAULT_SCAN_SETTINGS.hashThresholds },
  mergeStrategy: DEFAULT_SCAN_SETTINGS.mergeStrategy,
  verifyAlgorithms: [...DEFAULT_SCAN_SETTINGS.verifyAlgorithms],
  verifyThresholds: { ...DEFAULT_SCAN_SETTINGS.verifyThresholds },
  timeWindowHours: DEFAULT_SCAN_SETTINGS.timeWindowHours,
  parallelThreads: DEFAULT_SCAN_SETTINGS.parallelThreads,
  enableCorrectionDetection: DEFAULT_SCAN_SETTINGS.enableCorrectionDetection,
  enableExifFilter: DEFAULT_SCAN_SETTINGS.enableExifFilter,
  exifDateStart: null,
  exifDateEnd: null,
  exifCameraFilter: '',
  exifMinWidth: DEFAULT_SCAN_SETTINGS.exifMinWidth,
  exifMinHeight: DEFAULT_SCAN_SETTINGS.exifMinHeight,
  exifGpsFilter: DEFAULT_SCAN_SETTINGS.exifGpsFilter,
}

let nextLocalId = 1

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  options: FALLBACK_OPTIONS,
  advancedOpen: false,

  addFolder: async () => {
    const dialogResult = await window.electron.command('dialog.openDirectory')
    if (!dialogResult.success || !dialogResult.data) return

    const path = dialogResult.data as string

    // Prevent duplicates
    if (get().folders.some((f) => f.path === path)) return

    // Add to local state only (not DB)
    const entry: FolderEntry = {
      id: `local-${nextLocalId++}`,
      path,
      includeSubfolders: true,
      isAccessible: true,
    }
    set((state) => ({ folders: [...state.folders, entry] }))
  },

  removeFolder: (id: string) => {
    set((state) => ({ folders: state.folders.filter((f) => f.id !== id) }))
  },

  commitFolders: async () => {
    const { folders } = get()

    // Clear existing DB folders and save current selection
    const listResult = await window.electron.query('folder.list')
    if (listResult.success) {
      for (const existing of (listResult.data as unknown as FolderEntry[])) {
        await window.electron.command('folder.remove', { id: existing.id })
      }
    }

    for (const folder of folders) {
      await window.electron.command('folder.add', { path: folder.path })
    }
  },

  reset: () => {
    set({ folders: [], options: FALLBACK_OPTIONS, advancedOpen: false })
    // Re-load from Settings so defaults match user's saved preferences
    get().loadDefaults()
  },

  loadDefaults: async () => {
    try {
      const res = await window.electron.query('settings.get', { section: 'scan' }) as unknown as { success: boolean; data: ScanSettings }
      if (res.success) {
        const s = res.data
        set((state) => ({
          options: {
            ...state.options,
            hashAlgorithms: s.hashAlgorithms ?? FALLBACK_OPTIONS.hashAlgorithms,
            hashThresholds: s.hashThresholds ?? FALLBACK_OPTIONS.hashThresholds,
            mergeStrategy: s.mergeStrategy ?? FALLBACK_OPTIONS.mergeStrategy,
            verifyAlgorithms: s.verifyAlgorithms ?? FALLBACK_OPTIONS.verifyAlgorithms,
            verifyThresholds: s.verifyThresholds ?? FALLBACK_OPTIONS.verifyThresholds,
            timeWindowHours: s.timeWindowHours,
            parallelThreads: s.parallelThreads,
            enableCorrectionDetection: s.enableCorrectionDetection,
            enableExifFilter: s.enableExifFilter,
            exifMinWidth: s.exifMinWidth,
            exifMinHeight: s.exifMinHeight,
            exifGpsFilter: s.exifGpsFilter,
          },
        }))
      }
    } catch {
      // Keep fallback values
    }
  },

  setMode: (mode: ScanMode) => {
    set((state) => ({ options: { ...state.options, mode } }))
  },

  setOption: <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => {
    set((state) => ({ options: { ...state.options, [key]: value } }))
  },

  applyPreset: (preset: ScanPresetId) => {
    if (preset === 'custom') {
      set((state) => ({ options: { ...state.options, preset: 'custom' } }))
      return
    }
    const values = SCAN_PRESETS[preset]
    set((state) => ({
      options: {
        ...state.options,
        preset,
        hashAlgorithms: [...values.hashAlgorithms],
        hashThresholds: { ...values.hashThresholds },
        mergeStrategy: values.mergeStrategy,
        verifyAlgorithms: [...values.verifyAlgorithms],
        verifyThresholds: { ...values.verifyThresholds },
        timeWindowHours: values.timeWindowHours,
        parallelThreads: values.parallelThreads,
      },
    }))
  },

  toggleAdvanced: () => {
    set((state) => ({ advancedOpen: !state.advancedOpen }))
  },
}))
