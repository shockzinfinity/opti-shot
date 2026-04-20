import { create } from 'zustand'
import type { ScanProgress } from '@shared/types'
import type { ScanOptions } from './folder'

export interface Discovery {
  groupNumber: number
  fileCount: number
  totalSize: string
  masterFilename: string
  timestamp: string
}

interface ScanState {
  isScanning: boolean
  isPaused: boolean
  isComplete: boolean
  isCancelled: boolean
  errorMessage: string | null
  progress: ScanProgress | null
  discoveries: Discovery[]
  // actions
  startListening: () => () => void
  startScan: (options: ScanOptions) => Promise<void>
  cancelScan: () => Promise<void>
  reset: () => void
}

export const useScanStore = create<ScanState>((set, get) => ({
  isScanning: false,
  isPaused: false,
  isComplete: false,
  isCancelled: false,
  errorMessage: null,
  progress: null,
  discoveries: [],

  startListening: () => {
    const handler = (...args: unknown[]) => {
      const progress = args[0] as ScanProgress
      const current = get().progress
      const prevGroups = current?.discoveredGroups ?? 0

      set({ progress })

      // Add a discovery entry when group count increases
      if (progress.discoveredGroups > prevGroups) {
        const newGroupNumber = progress.discoveredGroups
        const discovery: Discovery = {
          groupNumber: newGroupNumber,
          fileCount: 2, // minimum group size
          totalSize: '—',
          masterFilename: progress.currentFile
            ? progress.currentFile.split('/').pop() ?? progress.currentFile
            : 'unknown',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
        set((state) => ({ discoveries: [...state.discoveries, discovery] }))
      }

    }

    const unsubscribe = window.electron.subscribe('scan.progress', handler as (p: unknown) => void)
    return unsubscribe
  },

  startScan: async (options: ScanOptions) => {
    set({ isScanning: true, isPaused: false, isComplete: false, isCancelled: false, errorMessage: null, progress: null, discoveries: [] })
    try {
      const response = await window.electron.command('scan.start', options)
      if (response.success) {
        set({ isComplete: true, isScanning: false })
      } else {
        const error = response.error ?? 'Scan failed'
        // Abort/cancel errors are not failures — treat as cancellation
        if (error === 'Scan aborted') {
          set({ isScanning: false, isCancelled: true })
        } else {
          console.error('Scan failed:', error)
          set({ isScanning: false, errorMessage: error })
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown scan error'
      if (msg === 'Scan aborted') {
        set({ isScanning: false, isCancelled: true })
      } else {
        console.error('Scan error:', err)
        set({ isScanning: false, errorMessage: msg })
      }
    }
  },

  cancelScan: async () => {
    try {
      await window.electron.command('scan.cancel')
    } catch {
      // Scan may already be finished — ignore
    }
    set({ isScanning: false, isCancelled: true })
  },

  reset: () => {
    set({
      isScanning: false,
      isPaused: false,
      isComplete: false,
      isCancelled: false,
      errorMessage: null,
      progress: null,
      discoveries: [],
    })
  },
}))
