import { create } from 'zustand'
import type { OrganizePreviewItem, OrganizeJob, OrganizeProgress } from '@shared/types'

type Phase = 'select' | 'previewing' | 'preview' | 'executing' | 'done'

interface OrganizeState {
  phase: Phase
  folder: string | null
  includeSubfolders: boolean
  previewItems: OrganizePreviewItem[]
  totalFiles: number
  renamedCount: number
  skippedCount: number
  progress: OrganizeProgress | null
  lastJob: OrganizeJob | null
  error: string | null

  setFolder: (path: string | null) => void
  setIncludeSubfolders: (v: boolean) => void
  loadLastJob: () => Promise<void>
  runPreview: () => Promise<void>
  runExecute: () => Promise<void>
  runUndo: () => Promise<void>
  reset: () => void
  startListening: () => () => void
}

export const useOrganizeStore = create<OrganizeState>((set, get) => ({
  phase: 'select',
  folder: null,
  includeSubfolders: true,
  previewItems: [],
  totalFiles: 0,
  renamedCount: 0,
  skippedCount: 0,
  progress: null,
  lastJob: null,
  error: null,

  setFolder: (path) => set({ folder: path }),
  setIncludeSubfolders: (v) => set({ includeSubfolders: v }),

  loadLastJob: async () => {
    try {
      const res = await window.electron.query('organize.lastJob') as { success: boolean; data?: OrganizeJob | null }
      if (res.success) set({ lastJob: res.data ?? null })
    } catch { /* ignore */ }
  },

  runPreview: async () => {
    const { folder, includeSubfolders } = get()
    if (!folder) return
    set({ phase: 'previewing', error: null, progress: null })
    try {
      const res = await window.electron.command('organize.preview', { folder, includeSubfolders }) as {
        success: boolean
        data?: { items: OrganizePreviewItem[]; totalFiles: number; renamedCount: number; skippedCount: number }
        error?: string
      }
      if (res.success && res.data) {
        set({
          phase: 'preview',
          previewItems: res.data.items,
          totalFiles: res.data.totalFiles,
          renamedCount: res.data.renamedCount,
          skippedCount: res.data.skippedCount,
        })
      } else {
        set({ phase: 'select', error: res.error ?? 'Preview failed' })
      }
    } catch (err) {
      set({ phase: 'select', error: String(err) })
    }
  },

  runExecute: async () => {
    const { folder, includeSubfolders } = get()
    if (!folder) return
    set({ phase: 'executing', error: null, progress: null })
    try {
      const res = await window.electron.command('organize.execute', { folder, includeSubfolders }) as {
        success: boolean
        data?: { jobId: string; renamedFiles: number; skippedFiles: number; totalFiles: number }
        error?: string
      }
      if (res.success && res.data) {
        set({
          phase: 'done',
          renamedCount: res.data.renamedFiles,
          skippedCount: res.data.skippedFiles,
          totalFiles: res.data.totalFiles,
          lastJob: {
            id: res.data.jobId,
            folder: folder!,
            includeSubfolders,
            totalFiles: res.data.totalFiles,
            renamedFiles: res.data.renamedFiles,
            skippedFiles: res.data.skippedFiles,
            status: 'completed',
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
          },
        })
      } else {
        set({ phase: 'preview', error: res.error ?? 'Execute failed' })
      }
    } catch (err) {
      set({ phase: 'preview', error: String(err) })
    }
  },

  runUndo: async () => {
    const { lastJob } = get()
    if (!lastJob) return
    try {
      const res = await window.electron.command('organize.undo', { jobId: lastJob.id }) as {
        success: boolean
        data?: { restoredCount: number }
      }
      if (res.success) {
        set({ lastJob: { ...lastJob, status: 'undone' }, previewItems: [] })
        // Reload
        get().loadLastJob()
      }
    } catch { /* ignore */ }
  },

  reset: () => set({
    phase: 'select',
    folder: null,
    includeSubfolders: true,
    previewItems: [],
    totalFiles: 0,
    renamedCount: 0,
    skippedCount: 0,
    progress: null,
    error: null,
  }),

  startListening: () => {
    const unsub = window.electron.subscribe('organize.progress', (data: OrganizeProgress) => {
      set({ progress: data })
    })
    return unsub
  },
}))
