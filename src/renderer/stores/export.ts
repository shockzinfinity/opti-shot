import { create } from 'zustand'
import type { ExportProgress } from '@shared/types'

interface ExportState {
  targetPath: string
  action: 'copy' | 'move'
  conflictStrategy: 'skip' | 'rename' | 'overwrite'
  autoCreateFolder: boolean
  totalFiles: number
  totalSize: number
  isRunning: boolean
  isComplete: boolean
  progress: ExportProgress | null
  // actions
  loadSummary: () => Promise<void>
  setTargetPath: (path: string) => void
  browseFolder: () => Promise<void>
  setAction: (action: 'copy' | 'move') => void
  setConflictStrategy: (s: 'skip' | 'rename' | 'overwrite') => void
  setAutoCreateFolder: (v: boolean) => void
  startExport: () => Promise<void>
  cancelExport: () => Promise<void>
  reset: () => void
  startListening: () => () => void
}

export const useExportStore = create<ExportState>((set, get) => ({
  targetPath: '',
  action: 'copy',
  conflictStrategy: 'skip',
  autoCreateFolder: true,
  totalFiles: 0,
  totalSize: 0,
  isRunning: false,
  isComplete: false,
  progress: null,

  loadSummary: async () => {
    try {
      const result = await window.electron.query('stats.dashboard')
      if (result.success && result.data) {
        const data = result.data as { totalPhotos: number; totalGroups: number; reclaimableSize: number }
        set({
          totalFiles: data.totalPhotos,
          totalSize: data.reclaimableSize,
        })
      }
    } catch (err) {
      console.error('Failed to load export summary:', err)
    }
  },

  setTargetPath: (path: string) => set({ targetPath: path }),

  browseFolder: async () => {
    try {
      const response = await window.electron.command('dialog.openDirectory')
      if (response.success && response.data) {
        set({ targetPath: response.data as string })
      }
    } catch (err) {
      console.error('Failed to open directory dialog:', err)
    }
  },

  setAction: (action: 'copy' | 'move') => set({ action }),

  setConflictStrategy: (conflictStrategy: 'skip' | 'rename' | 'overwrite') =>
    set({ conflictStrategy }),

  setAutoCreateFolder: (autoCreateFolder: boolean) => set({ autoCreateFolder }),

  startExport: async () => {
    const { targetPath, action, conflictStrategy, autoCreateFolder } = get()
    set({ isRunning: true, isComplete: false, progress: null })
    try {
      const response = await window.electron.command('export.start', {
        targetPath,
        action,
        conflictStrategy,
        autoCreateFolder,
      })
      if (!response.success) {
        console.error('Failed to start export:', response.error)
        set({ isRunning: false })
      }
    } catch (err) {
      console.error('Failed to start export:', err)
      set({ isRunning: false })
    }
  },

  cancelExport: async () => {
    try {
      const response = await window.electron.command('export.cancel')
      if (!response.success) console.error('Failed to cancel export:', response.error)
    } catch (err) {
      console.error('Failed to cancel export:', err)
    } finally {
      set({ isRunning: false })
    }
  },

  reset: () => {
    set({
      isRunning: false,
      isComplete: false,
      progress: null,
    })
  },

  startListening: () => {
    const handler = (...args: unknown[]) => {
      const progress = args[0] as ExportProgress

      set({ progress })

      // Detect completion
      if (progress.totalFiles > 0 && progress.processedFiles >= progress.totalFiles) {
        set({ isComplete: true, isRunning: false })
      }
    }

    const unsubscribe = window.electron.subscribe('export.progress', handler as (p: unknown) => void)
    return unsubscribe
  },
}))
