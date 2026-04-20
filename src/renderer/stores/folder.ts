import { create } from 'zustand'
import type { ScanMode, ScanPreset } from '@shared/types'
import type { ScanSettings } from '@main/services/settings'
import { SCAN_PRESETS, DEFAULT_SCAN_SETTINGS, detectPreset } from '@shared/constants'
import type { ScanPresetConfig } from '@shared/constants'

export interface FolderEntry {
  id: string
  path: string
  includeSubfolders: boolean
  isAccessible: boolean
}

export interface ScanOptions {
  mode: ScanMode
  dateStart: string | null
  dateEnd: string | null
  phashThreshold: number
  ssimThreshold: number
  timeWindowHours: number
  parallelThreads: number
  enableCorrectionDetection: boolean
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
  dateStart: null,
  dateEnd: null,
  phashThreshold: DEFAULT_SCAN_SETTINGS.phashThreshold,
  ssimThreshold: DEFAULT_SCAN_SETTINGS.ssimThreshold,
  timeWindowHours: DEFAULT_SCAN_SETTINGS.timeWindowHours,
  parallelThreads: DEFAULT_SCAN_SETTINGS.parallelThreads,
  enableCorrectionDetection: DEFAULT_SCAN_SETTINGS.enableCorrectionDetection,
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
            phashThreshold: s.phashThreshold,
            ssimThreshold: s.ssimThreshold,
            timeWindowHours: s.timeWindowHours,
            parallelThreads: s.parallelThreads,
            enableCorrectionDetection: s.enableCorrectionDetection,
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
    const values = SCAN_PRESETS[preset]
    set((state) => ({ options: { ...state.options, ...values } }))
  },

  toggleAdvanced: () => {
    set((state) => ({ advancedOpen: !state.advancedOpen }))
  },
}))
