// @TASK P1-R1 - Settings IPC handler tests
// @TEST tests/main/ipc/settings.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
  app: {
    getPath: vi.fn(() => '/tmp/optishot-ipc-test'),
  },
}))

// Mock the settings service
vi.mock('@main/services/settings', () => ({
  getSettings: vi.fn((section: string) => {
    if (section === 'scan') return { preset: 'balanced', phashThreshold: 8 }
    if (section === 'ui') return { language: 'ko', theme: 'auto' }
    if (section === 'data') return { trashRetentionDays: 30 }
    throw new Error(`Invalid settings section: ${section}`)
  }),
  saveSettings: vi.fn((section: string, data: Record<string, unknown>) => {
    if (section === 'scan') return { preset: 'balanced', phashThreshold: 8, ...data }
    throw new Error(`Invalid settings section: ${section}`)
  }),
  resetSettings: vi.fn((section: string) => {
    if (section === 'scan') return { preset: 'balanced', phashThreshold: 8 }
    throw new Error(`Invalid settings section: ${section}`)
  }),
}))

// Import after mocking
import { registerSettingsHandlers } from '@main/ipc/handlers/settings'
import { IPC } from '@shared/types'

describe('Settings IPC Handlers', () => {
  beforeEach(() => {
    handlers.clear()
    registerSettingsHandlers()
  })

  it('should register all 3 settings handlers', () => {
    expect(handlers.has(IPC.SETTINGS.GET)).toBe(true)
    expect(handlers.has(IPC.SETTINGS.SAVE)).toBe(true)
    expect(handlers.has(IPC.SETTINGS.RESET)).toBe(true)
  })

  describe('settings:get', () => {
    it('should return scan settings', async () => {
      const handler = handlers.get(IPC.SETTINGS.GET)!
      const result = await handler({}, 'scan')

      expect(result).toEqual({
        success: true,
        data: { preset: 'balanced', phashThreshold: 8 },
      })
    })

    it('should return ui settings', async () => {
      const handler = handlers.get(IPC.SETTINGS.GET)!
      const result = await handler({}, 'ui')

      expect(result).toEqual({
        success: true,
        data: { language: 'ko', theme: 'auto' },
      })
    })

    it('should return error for invalid section', async () => {
      const handler = handlers.get(IPC.SETTINGS.GET)!
      const result = await handler({}, 'invalid')

      expect(result).toEqual({
        success: false,
        error: 'Invalid settings section: invalid',
      })
    })
  })

  describe('settings:save', () => {
    it('should save and return updated settings', async () => {
      const handler = handlers.get(IPC.SETTINGS.SAVE)!
      const result = await handler({}, 'scan', { preset: 'sensitive' })

      expect(result).toEqual({
        success: true,
        data: { preset: 'sensitive', phashThreshold: 8 },
      })
    })

    it('should return error on failure', async () => {
      const handler = handlers.get(IPC.SETTINGS.SAVE)!
      const result = await handler({}, 'invalid', {})

      expect(result).toEqual({
        success: false,
        error: 'Invalid settings section: invalid',
      })
    })
  })

  describe('settings:reset', () => {
    it('should reset and return default settings', async () => {
      const handler = handlers.get(IPC.SETTINGS.RESET)!
      const result = await handler({}, 'scan')

      expect(result).toEqual({
        success: true,
        data: { preset: 'balanced', phashThreshold: 8 },
      })
    })

    it('should return error on failure', async () => {
      const handler = handlers.get(IPC.SETTINGS.RESET)!
      const result = await handler({}, 'invalid')

      expect(result).toEqual({
        success: false,
        error: 'Invalid settings section: invalid',
      })
    })
  })
})
