// @TASK P1-R1 - Settings IPC handlers
// @SPEC specs/domain/resources.yaml#settings_scan, settings_ui, settings_data
// @TEST tests/main/ipc/settings.test.ts

import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { getSettings, saveSettings, resetSettings } from '@main/services/settings'
import type { SettingsSection } from '@main/services/settings'
import { validateStringId } from '../validators'

const VALID_SECTIONS = new Set<string>(['scan', 'ui', 'data'])

function validateSection(section: unknown): SettingsSection {
  const value = validateStringId(section)
  if (!VALID_SECTIONS.has(value)) {
    throw new Error(`Invalid settings section: ${value}`)
  }
  return value as SettingsSection
}

export function registerSettingsHandlers(): void {
  // settings:get — Return settings for a given section
  ipcMain.handle(IPC.SETTINGS.GET, (_event, section: unknown) => {
    try {
      const validSection = validateSection(section)
      return { success: true, data: getSettings(validSection) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // settings:save — Merge and persist settings for a section
  ipcMain.handle(
    IPC.SETTINGS.SAVE,
    (_event, section: unknown, data: Record<string, unknown>) => {
      try {
        const validSection = validateSection(section)
        const updated = saveSettings(validSection, data)
        return { success: true, data: updated }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
      }
    },
  )

  // settings:reset — Restore defaults for a section
  ipcMain.handle(IPC.SETTINGS.RESET, (_event, section: unknown) => {
    try {
      const validSection = validateSection(section)
      const defaults = resetSettings(validSection)
      return { success: true, data: defaults }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })
}
