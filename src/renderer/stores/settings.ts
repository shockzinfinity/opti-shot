import { create } from 'zustand'
import type { ScanPreset } from '@shared/types'
import type { ScanSettings, UiSettings, DataSettings } from '@main/services/settings'
import { SCAN_PRESETS, DEFAULT_SCAN_SETTINGS, DEFAULT_UI_SETTINGS, DEFAULT_DATA_SETTINGS } from '@shared/constants'

export type { ScanSettings, UiSettings, DataSettings }

type TabId = 'scan' | 'ui' | 'data' | 'info'

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
  applyPreset: (preset: Exclude<ScanPreset, 'custom'>) => void
  resetSection: (section: 'scan' | 'ui' | 'data') => Promise<void>
}

const DEFAULT_SCAN: ScanSettings = { ...DEFAULT_SCAN_SETTINGS }
const DEFAULT_UI: UiSettings = { ...DEFAULT_UI_SETTINGS }
const DEFAULT_DATA: DataSettings = { ...DEFAULT_DATA_SETTINGS }

/** Save a single settings section to disk via IPC */
async function persistSection(section: 'scan' | 'ui' | 'data', data: unknown): Promise<void> {
  try {
    await window.electron.command('settings.save', { section, data: data as Record<string, unknown> })
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
        window.electron.query('settings.get', { section: 'scan' }) as unknown as Promise<{ success: boolean; data: ScanSettings }>,
        window.electron.query('settings.get', { section: 'ui' }) as unknown as Promise<{ success: boolean; data: UiSettings }>,
        window.electron.query('settings.get', { section: 'data' }) as unknown as Promise<{ success: boolean; data: DataSettings }>,
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

  applyPreset: (preset: Exclude<ScanPreset, 'custom'>) => {
    const presetValues = SCAN_PRESETS[preset]
    const scan = { ...get().scan, preset, ...presetValues }
    set({ scan })
    persistSection('scan', scan)
  },

  resetSection: async (section) => {
    const result = await window.electron.command('settings.reset', { section }) as { success: boolean; data: unknown }
    if (result.success) {
      set({ [section]: result.data })
    }
  },
}))
