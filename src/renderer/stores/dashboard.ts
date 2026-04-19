import { create } from 'zustand'

export interface DashboardStats {
  totalPhotos: number
  totalGroups: number
  reclaimableSize: number // bytes
  lastScanDate: string | null
  lastScanFiles: number
  lastScanGroups: number
  lastScanDuration: number // seconds
  lastScanStatus: string | null
}

export interface ScanHistoryItem {
  id: string
  status: string
  totalFiles: number
  discoveredGroups: number
  elapsedSeconds: number
  startedAt: string
  endedAt: string | null
  skippedFiles: number
  reviewedGroups: number
  totalGroupsForReview: number
}

interface DashboardState {
  stats: DashboardStats
  scanHistory: ScanHistoryItem[]
  loading: boolean
  loadStats: () => Promise<void>
}

const DEFAULT_STATS: DashboardStats = {
  totalPhotos: 0,
  totalGroups: 0,
  reclaimableSize: 0,
  lastScanDate: null,
  lastScanFiles: 0,
  lastScanGroups: 0,
  lastScanDuration: 0,
  lastScanStatus: null,
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: DEFAULT_STATS,
  scanHistory: [],
  loading: false,

  loadStats: async () => {
    set({ loading: true })
    try {
      const [statsResult, historyResult] = await Promise.all([
        window.electron.invoke('stats:get') as Promise<{
          success: boolean
          data?: {
            totalPhotos: number
            totalGroups: number
            reclaimableSize: number
            lastScan: {
              status: string
              totalFiles: number
              discoveredGroups: number
              elapsedSeconds: number
              startedAt: string
              endedAt: string | null
            } | null
          }
        }>,
        window.electron.invoke('scans:list') as Promise<{
          success: boolean
          data?: ScanHistoryItem[]
        }>,
      ])

      if (statsResult.success && statsResult.data) {
        const { totalPhotos, totalGroups, reclaimableSize, lastScan } = statsResult.data
        set({
          stats: {
            totalPhotos,
            totalGroups,
            reclaimableSize,
            lastScanDate: lastScan?.startedAt ?? null,
            lastScanFiles: lastScan?.totalFiles ?? 0,
            lastScanGroups: lastScan?.discoveredGroups ?? 0,
            lastScanDuration: lastScan?.elapsedSeconds ?? 0,
            lastScanStatus: lastScan?.status ?? null,
          },
        })
      }

      if (historyResult.success && historyResult.data) {
        set({ scanHistory: historyResult.data })
      }
    } finally {
      set({ loading: false })
    }
  },
}))
