import { create } from 'zustand'

export interface TrashItem {
  id: string
  photoId: string
  originalPath: string
  filename: string
  fileSize: number
  status: string
  deletedAt: string
  expiresAt: string
}

export interface TrashSummary {
  totalFiles: number
  totalSize: number
  nextCleanup: string | null
}

interface TrashState {
  items: TrashItem[]
  total: number
  summary: TrashSummary | null
  selectedIds: Set<string>
  loading: boolean
  // actions
  loadItems: () => Promise<void>
  loadSummary: () => Promise<void>
  toggleSelect: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  restoreSelected: () => Promise<void>
  deleteSelected: () => Promise<void>
  emptyTrash: () => Promise<void>
}

export const useTrashStore = create<TrashState>((set, get) => ({
  items: [],
  total: 0,
  summary: null,
  selectedIds: new Set(),
  loading: false,

  loadItems: async () => {
    set({ loading: true })
    try {
      const response = await window.electron.query('trash.list', {
        offset: 0,
        limit: 200,
      })
      const result = response.success ? (response.data as unknown as { items: TrashItem[]; total: number }) : undefined
      if (result) {
        set({ items: result.items, total: result.total })
      }
    } catch (err) {
      console.error('Failed to load trash items:', err)
    } finally {
      set({ loading: false })
    }
  },

  loadSummary: async () => {
    try {
      const response = await window.electron.query('trash.summary')
      const summary = response.success ? (response.data as unknown as TrashSummary) : undefined
      if (summary) {
        set({ summary })
      }
    } catch (err) {
      console.error('Failed to load trash summary:', err)
    }
  },

  toggleSelect: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedIds: next }
    })
  },

  selectAll: () => {
    set((state) => ({ selectedIds: new Set(state.items.map((i) => i.id)) }))
  },

  deselectAll: () => {
    set({ selectedIds: new Set() })
  },

  restoreSelected: async () => {
    const { selectedIds, items } = get()
    const ids = Array.from(selectedIds)
    try {
      for (const id of ids) {
        const response = await window.electron.command('trash.restore', { trashId: id })
        if (!response.success) console.error('Failed to restore:', id, response.error)
      }
      set((state) => ({
        items: state.items.filter((i) => !state.selectedIds.has(i.id)),
        total: state.total - ids.length,
        selectedIds: new Set(),
      }))
      await get().loadSummary()
    } catch (err) {
      console.error('Failed to restore items:', err)
    }
  },

  deleteSelected: async () => {
    const { selectedIds } = get()
    const ids = Array.from(selectedIds)
    try {
      for (const id of ids) {
        const response = await window.electron.command('trash.delete', { trashId: id })
        if (!response.success) console.error('Failed to delete:', id, response.error)
      }
      set((state) => ({
        items: state.items.filter((i) => !state.selectedIds.has(i.id)),
        total: state.total - ids.length,
        selectedIds: new Set(),
      }))
      await get().loadSummary()
    } catch (err) {
      console.error('Failed to delete items:', err)
    }
  },

  emptyTrash: async () => {
    try {
      const response = await window.electron.command('trash.empty')
      if (!response.success) return
      set({ items: [], total: 0, selectedIds: new Set() })
      await get().loadSummary()
    } catch (err) {
      console.error('Failed to empty trash:', err)
    }
  },
}))
