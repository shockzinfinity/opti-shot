import { create } from 'zustand'
import type { ScanMode } from '@shared/types'
import type { ScanSettings } from '@main/services/settings'

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

export type ScanPresetId = 'balanced' | 'conservative' | 'sensitive'

export const SCAN_PRESET_VALUES: Record<ScanPresetId, Partial<ScanOptions>> = {
  balanced: { phashThreshold: 8, ssimThreshold: 0.82, timeWindowHours: 1, parallelThreads: 8 },
  conservative: { phashThreshold: 6, ssimThreshold: 0.9, timeWindowHours: 2, parallelThreads: 4 },
  sensitive: { phashThreshold: 10, ssimThreshold: 0.8, timeWindowHours: 0, parallelThreads: 16 },
}

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

/** Fallback defaults — only used until Settings loads */
const FALLBACK_OPTIONS: ScanOptions = {
  mode: 'full',
  dateStart: null,
  dateEnd: null,
  phashThreshold: 8,
  ssimThreshold: 0.82,
  timeWindowHours: 1,
  parallelThreads: 8,
  enableCorrectionDetection: true,
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
    const values = SCAN_PRESET_VALUES[preset]
    set((state) => ({ options: { ...state.options, ...values } }))
  },

  toggleAdvanced: () => {
    set((state) => ({ advancedOpen: !state.advancedOpen }))
  },
}))
