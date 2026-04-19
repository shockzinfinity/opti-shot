// @TASK P1-R2 - Settings service tests
// @TEST tests/main/services/settings.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock electron's app.getPath before importing the service
const mockUserDataPath = mkdtempSync(join(tmpdir(), 'optishot-test-'))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mockUserDataPath),
  },
}))

// Import after mock setup
import {
  getSettings,
  saveSettings,
  resetSettings,
  getDefaults,
  DEFAULTS,
} from '@main/services/settings'

describe('SettingsService', () => {
  const settingsPath = join(mockUserDataPath, 'settings.json')

  beforeEach(() => {
    // Clean up settings file before each test
    if (existsSync(settingsPath)) {
      rmSync(settingsPath)
    }
  })

  afterEach(() => {
    if (existsSync(settingsPath)) {
      rmSync(settingsPath)
    }
  })

  describe('getSettings', () => {
    it('should return default scan settings when no file exists', () => {
      const scan = getSettings('scan')
      expect(scan).toEqual(DEFAULTS.scan)
    })

    it('should return default ui settings when no file exists', () => {
      const ui = getSettings('ui')
      expect(ui).toEqual(DEFAULTS.ui)
    })

    it('should return default data settings when no file exists', () => {
      const data = getSettings('data')
      expect(data).toEqual(DEFAULTS.data)
    })

    it('should throw on invalid section name', () => {
      // @ts-expect-error testing invalid input
      expect(() => getSettings('invalid')).toThrow('Invalid settings section')
    })

    it('should read from existing settings file', () => {
      const custom = {
        scan: { ...DEFAULTS.scan, preset: 'sensitive' as const },
        ui: { ...DEFAULTS.ui, language: 'en' as const },
        data: { ...DEFAULTS.data, trashRetentionDays: 7 },
      }
      writeFileSync(settingsPath, JSON.stringify(custom), 'utf-8')

      expect(getSettings('scan').preset).toBe('sensitive')
      expect(getSettings('ui').language).toBe('en')
      expect(getSettings('data').trashRetentionDays).toBe(7)
    })

    it('should fill missing keys with defaults', () => {
      // Partial settings file — only scan.preset
      writeFileSync(settingsPath, JSON.stringify({ scan: { preset: 'conservative' } }), 'utf-8')

      const scan = getSettings('scan')
      expect(scan.preset).toBe('conservative')
      expect(scan.phashThreshold).toBe(8) // filled from defaults
      expect(scan.ssimThreshold).toBe(0.82)
    })

    it('should return defaults on corrupted JSON', () => {
      writeFileSync(settingsPath, '{ broken json !!!', 'utf-8')

      const scan = getSettings('scan')
      expect(scan).toEqual(DEFAULTS.scan)
    })
  })

  describe('saveSettings', () => {
    it('should persist scan settings to file', () => {
      const saved = saveSettings('scan', { preset: 'sensitive' })

      expect(saved.preset).toBe('sensitive')
      // Other fields remain default
      expect(saved.phashThreshold).toBe(8)

      // Verify file was written
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(raw.scan.preset).toBe('sensitive')
    })

    it('should merge partial ui settings', () => {
      const saved = saveSettings('ui', { theme: 'dark' })

      expect(saved.theme).toBe('dark')
      expect(saved.language).toBe('ko') // default preserved
      expect(saved.notifyOnComplete).toBe(true) // default preserved
    })

    it('should merge partial data settings', () => {
      const saved = saveSettings('data', { trashRetentionDays: 60 })

      expect(saved.trashRetentionDays).toBe(60)
      expect(saved.autoCacheCleanup).toBe(true)
    })

    it('should preserve other sections when saving one', () => {
      saveSettings('scan', { preset: 'conservative' })
      saveSettings('ui', { theme: 'light' })

      // scan should still be conservative
      expect(getSettings('scan').preset).toBe('conservative')
      expect(getSettings('ui').theme).toBe('light')
    })

    it('should throw on invalid section', () => {
      // @ts-expect-error testing invalid input
      expect(() => saveSettings('nope', {})).toThrow('Invalid settings section')
    })

    it('should return the full updated section', () => {
      const result = saveSettings('scan', { batchSize: 200, parallelThreads: 4 })

      expect(result.batchSize).toBe(200)
      expect(result.parallelThreads).toBe(4)
      expect(result.preset).toBe('balanced') // untouched
    })
  })

  describe('resetSettings', () => {
    it('should restore scan to defaults', () => {
      saveSettings('scan', { preset: 'sensitive', phashThreshold: 16 })
      const reset = resetSettings('scan')

      expect(reset).toEqual(DEFAULTS.scan)
    })

    it('should restore ui to defaults', () => {
      saveSettings('ui', { theme: 'dark', language: 'en' })
      const reset = resetSettings('ui')

      expect(reset).toEqual(DEFAULTS.ui)
    })

    it('should restore data to defaults', () => {
      saveSettings('data', { trashRetentionDays: 90 })
      const reset = resetSettings('data')

      expect(reset).toEqual(DEFAULTS.data)
    })

    it('should preserve other sections when resetting one', () => {
      saveSettings('scan', { preset: 'sensitive' })
      saveSettings('ui', { theme: 'dark' })

      resetSettings('scan')

      expect(getSettings('scan').preset).toBe('balanced') // reset
      expect(getSettings('ui').theme).toBe('dark') // preserved
    })

    it('should throw on invalid section', () => {
      // @ts-expect-error testing invalid input
      expect(() => resetSettings('bogus')).toThrow('Invalid settings section')
    })
  })

  describe('getDefaults', () => {
    it('should return a deep copy of defaults', () => {
      const d = getDefaults()

      expect(d.scan).toEqual(DEFAULTS.scan)
      expect(d.ui).toEqual(DEFAULTS.ui)
      expect(d.data).toEqual(DEFAULTS.data)

      // Ensure it is a copy, not the same reference
      d.scan.preset = 'sensitive'
      expect(DEFAULTS.scan.preset).toBe('balanced')
    })
  })

  describe('default values match spec', () => {
    it('scan defaults match resources.yaml', () => {
      expect(DEFAULTS.scan.preset).toBe('balanced')
      expect(DEFAULTS.scan.phashThreshold).toBe(8)
      expect(DEFAULTS.scan.ssimThreshold).toBe(0.82)
      expect(DEFAULTS.scan.timeWindowHours).toBe(1)
      expect(DEFAULTS.scan.parallelThreads).toBe(8)
      expect(DEFAULTS.scan.batchSize).toBe(100)
      expect(DEFAULTS.scan.enableCorrectionDetection).toBe(true)
      expect(DEFAULTS.scan.enableExifFilter).toBe(true)
      expect(DEFAULTS.scan.enableIncremental).toBe(true)
    })

    it('ui defaults match resources.yaml', () => {
      expect(DEFAULTS.ui.language).toBe('ko')
      expect(DEFAULTS.ui.theme).toBe('auto')
      expect(DEFAULTS.ui.notifyOnComplete).toBe(true)
      expect(DEFAULTS.ui.minimizeToTray).toBe(true)
      expect(DEFAULTS.ui.restoreWindowSize).toBe(true)
    })

    it('data defaults match resources.yaml', () => {
      expect(DEFAULTS.data.trashRetentionDays).toBe(30)
      expect(DEFAULTS.data.autoCacheCleanup).toBe(true)
    })
  })
})
