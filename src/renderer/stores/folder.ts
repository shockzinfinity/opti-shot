import { create } from 'zustand'
import type { ScanMode } from '@shared/types'

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

interface FolderState {
  folders: FolderEntry[]
  options: ScanOptions
  advancedOpen: boolean
  addFolder: () => Promise<void>
  removeFolder: (id: string) => void
  commitFolders: () => Promise<void>
  reset: () => void
  setMode: (mode: ScanMode) => void
  setOption: <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => void
  toggleAdvanced: () => void
}

const DEFAULT_OPTIONS: ScanOptions = {
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
  options: DEFAULT_OPTIONS,
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
    set({ folders: [], options: DEFAULT_OPTIONS, advancedOpen: false })
  },

  setMode: (mode: ScanMode) => {
    set((state) => ({ options: { ...state.options, mode } }))
  },

  setOption: <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => {
    set((state) => ({ options: { ...state.options, [key]: value } }))
  },

  toggleAdvanced: () => {
    set((state) => ({ advancedOpen: !state.advancedOpen }))
  },
}))
