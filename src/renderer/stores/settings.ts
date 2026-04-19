import { create } from 'zustand'
import type { ScanSettings, UiSettings, DataSettings } from '@main/services/settings'
import { IPC } from '@shared/types'

export type { ScanSettings, UiSettings, DataSettings }

type TabId = 'ui' | 'data' | 'info'

interface SettingsState {
  scan: ScanSettings
  ui: UiSettings
  data: DataSettings
  activeTab: TabId
  loading: boolean

  loadSettings: () => Promise<void>
  setTab: (tab: TabId) => void
  updateScan: (key: keyof ScanSettings, value: unknown) => void
  updateUi: (key: keyof UiSettings, value: unknown) => void
  updateData: (key: keyof DataSettings, value: unknown) => void
  applyPreset: (preset: 'balanced' | 'conservative' | 'sensitive') => void
  resetSection: (section: 'scan' | 'ui' | 'data') => Promise<void>
}

const DEFAULT_SCAN: ScanSettings = {
  preset: 'balanced',
  phashThreshold: 8,
  ssimThreshold: 0.82,
  timeWindowHours: 1,
  parallelThreads: 8,
  batchSize: 100,
  enableCorrectionDetection: true,
  enableExifFilter: true,
  enableIncremental: true,
}

const DEFAULT_UI: UiSettings = {
  language: 'ko',
  theme: 'auto',
  use24HourClock: true,
  notifyOnComplete: true,
  minimizeToTray: true,
  restoreWindowSize: true,
}

const DEFAULT_DATA: DataSettings = {
  trashRetentionDays: 30,
  autoCacheCleanup: true,
  useSystemTrash: true,
}

const PRESET_VALUES: Record<'balanced' | 'conservative' | 'sensitive', Partial<ScanSettings>> = {
  balanced: { phashThreshold: 8, ssimThreshold: 0.82, timeWindowHours: 1, parallelThreads: 8 },
  conservative: { phashThreshold: 6, ssimThreshold: 0.9, timeWindowHours: 2, parallelThreads: 4 },
  sensitive: { phashThreshold: 10, ssimThreshold: 0.8, timeWindowHours: 0, parallelThreads: 16 },
}

/** Save a single settings section to disk via IPC */
async function persistSection(section: 'scan' | 'ui' | 'data', data: unknown): Promise<void> {
  try {
    await window.electron.invoke(IPC.SETTINGS.SAVE, section, data)
  } catch (err) {
    console.error(`Failed to save ${section} settings:`, err)
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  scan: { ...DEFAULT_SCAN },
  ui: { ...DEFAULT_UI },
  data: { ...DEFAULT_DATA },
  activeTab: 'ui',
  loading: false,

  loadSettings: async () => {
    set({ loading: true })
    try {
      const [scanRes, uiRes, dataRes] = await Promise.all([
        window.electron.invoke(IPC.SETTINGS.GET, 'scan') as Promise<{ success: boolean; data: ScanSettings }>,
        window.electron.invoke(IPC.SETTINGS.GET, 'ui') as Promise<{ success: boolean; data: UiSettings }>,
        window.electron.invoke(IPC.SETTINGS.GET, 'data') as Promise<{ success: boolean; data: DataSettings }>,
      ])
      if (scanRes.success && uiRes.success && dataRes.success) {
        set({ scan: scanRes.data, ui: uiRes.data, data: dataRes.data })
      }
    } catch {
      // Keep defaults if IPC fails
    } finally {
      set({ loading: false })
    }
  },

  setTab: (tab) => set({ activeTab: tab }),

  updateScan: (key, value) => {
    const scan = { ...get().scan, [key]: value }
    set({ scan })
    persistSection('scan', scan)
  },

  updateUi: (key, value) => {
    const ui = { ...get().ui, [key]: value }
    set({ ui })
    persistSection('ui', ui)
  },

  updateData: (key, value) => {
    const data = { ...get().data, [key]: value }
    set({ data })
    persistSection('data', data)
  },

  applyPreset: (preset) => {
    const presetValues = PRESET_VALUES[preset]
    const scan = { ...get().scan, preset, ...presetValues }
    set({ scan })
    persistSection('scan', scan)
  },

  resetSection: async (section) => {
    const result = await window.electron.invoke(IPC.SETTINGS.RESET, section) as { success: boolean; data: unknown }
    if (result.success) {
      set({ [section]: result.data })
    }
  },
}))
