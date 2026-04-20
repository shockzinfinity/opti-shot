import { create } from 'zustand'
import type { NotificationEntry } from '@shared/types'

export interface NotificationItem extends NotificationEntry {
  isRead: boolean
}

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  isOpen: boolean
  // actions
  loadInitial: () => Promise<void>
  startListening: () => () => void
  markRead: (ids: string[]) => Promise<void>
  markAllRead: () => Promise<void>
  clearAll: () => Promise<void>
  toggle: () => void
  close: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,

  loadInitial: async () => {
    try {
      const res = await window.electron.query('notification.list', { limit: 50 })
      if (res.success) {
        const items = res.data as NotificationItem[]
        set({
          notifications: items,
          unreadCount: items.filter((n) => !n.isRead).length,
        })
      }
    } catch {
      // Ignore
    }
  },

  startListening: () => {
    const handler = (...args: unknown[]) => {
      const entry = args[0] as NotificationEntry
      const item: NotificationItem = { ...entry, isRead: false }
      set((state) => {
        // Deduplicate by ID
        if (state.notifications.some((n) => n.id === item.id)) return state
        return {
          notifications: [item, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }
      })
    }

    return window.electron.subscribe('notification.new', handler as (p: unknown) => void)
  },

  markRead: async (ids: string[]) => {
    try {
      await window.electron.command('notification.markRead', { ids })
      set((state) => {
        const updated = state.notifications.map((n) =>
          ids.includes(n.id) ? { ...n, isRead: true } : n,
        )
        return {
          notifications: updated,
          unreadCount: updated.filter((n) => !n.isRead).length,
        }
      })
    } catch {
      // Ignore
    }
  },

  markAllRead: async () => {
    const ids = get().notifications.filter((n) => !n.isRead).map((n) => n.id)
    if (ids.length === 0) return
    await get().markRead(ids)
  },

  clearAll: async () => {
    try {
      await window.electron.command('notification.clear')
      set({ notifications: [], unreadCount: 0 })
    } catch {
      // Ignore
    }
  },

  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
}))
