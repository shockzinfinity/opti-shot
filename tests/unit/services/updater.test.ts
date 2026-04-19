// @TASK P5-R1 - Auto-updater service tests
// @TEST tests/unit/services/updater.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron-updater before importing the module under test
const mockAutoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: false,
  on: vi.fn(),
  checkForUpdates: vi.fn().mockResolvedValue({
    updateInfo: { version: '2.0.0', releaseDate: '2026-04-17' },
  }),
  downloadUpdate: vi.fn().mockResolvedValue(undefined),
  quitAndInstall: vi.fn(),
}

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mockAutoUpdater },
  autoUpdater: mockAutoUpdater,
}))

// Mock electron BrowserWindow
const mockSend = vi.fn()
const mockGetAllWindows = vi.fn().mockReturnValue([
  { webContents: { send: mockSend } },
])

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: mockGetAllWindows },
  ipcMain: {
    handle: vi.fn(),
  },
}))

describe('UpdaterService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Reset module state between tests
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('module exports', () => {
    it('should export initAutoUpdater function', async () => {
      const mod = await import('@main/services/updater')
      expect(mod.initAutoUpdater).toBeDefined()
      expect(typeof mod.initAutoUpdater).toBe('function')
    })

    it('should export downloadUpdate function', async () => {
      const mod = await import('@main/services/updater')
      expect(mod.downloadUpdate).toBeDefined()
      expect(typeof mod.downloadUpdate).toBe('function')
    })

    it('should export installUpdate function', async () => {
      const mod = await import('@main/services/updater')
      expect(mod.installUpdate).toBeDefined()
      expect(typeof mod.installUpdate).toBe('function')
    })
  })

  describe('initAutoUpdater', () => {
    it('should skip initialization in development mode', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      // Should not register any event listeners
      expect(mockAutoUpdater.on).not.toHaveBeenCalled()

      process.env.NODE_ENV = origEnv
    })

    it('should configure autoDownload=false and autoInstallOnAppQuit=true', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      expect(mockAutoUpdater.autoDownload).toBe(false)
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)

      process.env.NODE_ENV = origEnv
    })

    it('should register update-available, download-progress, update-downloaded, and error events', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      const eventNames = mockAutoUpdater.on.mock.calls.map(
        (call: unknown[]) => call[0],
      )
      expect(eventNames).toContain('update-available')
      expect(eventNames).toContain('download-progress')
      expect(eventNames).toContain('update-downloaded')
      expect(eventNames).toContain('error')

      process.env.NODE_ENV = origEnv
    })

    it('should check for updates after 5-second delay', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      // Should not have checked yet
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()

      // Advance timer by 5 seconds
      vi.advanceTimersByTime(5000)

      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce()

      process.env.NODE_ENV = origEnv
    })

    it('should send updater:available to all windows when update available', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      // Find the update-available handler
      const updateAvailableCall = mockAutoUpdater.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'update-available',
      )
      expect(updateAvailableCall).toBeDefined()

      const handler = updateAvailableCall![1] as (info: {
        version: string
        releaseDate: string
      }) => void
      handler({ version: '2.0.0', releaseDate: '2026-04-17' })

      expect(mockSend).toHaveBeenCalledWith('updater:available', {
        version: '2.0.0',
        releaseDate: '2026-04-17',
      })

      process.env.NODE_ENV = origEnv
    })

    it('should send updater:progress to all windows during download', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      const progressCall = mockAutoUpdater.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'download-progress',
      )
      expect(progressCall).toBeDefined()

      const handler = progressCall![1] as (progress: {
        percent: number
        transferred: number
        total: number
      }) => void
      handler({ percent: 50, transferred: 5000000, total: 10000000 })

      expect(mockSend).toHaveBeenCalledWith('updater:progress', {
        percent: 50,
        transferred: 5000000,
        total: 10000000,
      })

      process.env.NODE_ENV = origEnv
    })

    it('should send updater:downloaded to all windows when download complete', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      const downloadedCall = mockAutoUpdater.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'update-downloaded',
      )
      expect(downloadedCall).toBeDefined()

      const handler = downloadedCall![1] as () => void
      handler()

      expect(mockSend).toHaveBeenCalledWith('updater:downloaded')

      process.env.NODE_ENV = origEnv
    })

    it('should handle error event without throwing', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { initAutoUpdater } = await import('@main/services/updater')
      initAutoUpdater()

      const errorCall = mockAutoUpdater.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'error',
      )
      expect(errorCall).toBeDefined()

      const handler = errorCall![1] as (err: Error) => void
      expect(() => handler(new Error('Network error'))).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(
        'Auto-update error:',
        'Network error',
      )

      consoleSpy.mockRestore()
      process.env.NODE_ENV = origEnv
    })
  })

  describe('downloadUpdate', () => {
    it('should call autoUpdater.downloadUpdate', async () => {
      const { downloadUpdate } = await import('@main/services/updater')
      downloadUpdate()
      expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledOnce()
    })
  })

  describe('installUpdate', () => {
    it('should call autoUpdater.quitAndInstall', async () => {
      const { installUpdate } = await import('@main/services/updater')
      installUpdate()
      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce()
    })
  })
})

describe('UpdaterIpcHandlers', () => {
  let mockHandle: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const electron = await import('electron')
    mockHandle = vi.mocked(electron.ipcMain.handle) as ReturnType<typeof vi.fn>
  })

  it('should register updater:check, updater:download, and updater:install handlers', async () => {
    const { registerUpdaterHandlers } = await import(
      '@main/ipc/handlers/updater'
    )
    registerUpdaterHandlers()

    const registeredChannels = mockHandle.mock.calls.map(
      (call: unknown[]) => call[0],
    )
    expect(registeredChannels).toContain('updater:check')
    expect(registeredChannels).toContain('updater:download')
    expect(registeredChannels).toContain('updater:install')
  })

  it('updater:check should return update info on success', async () => {
    const { registerUpdaterHandlers } = await import(
      '@main/ipc/handlers/updater'
    )
    registerUpdaterHandlers()

    const checkCall = mockHandle.mock.calls.find(
      (call: unknown[]) => call[0] === 'updater:check',
    )
    expect(checkCall).toBeDefined()

    const handler = checkCall![1] as () => Promise<{
      success: boolean
      data?: unknown
      error?: string
    }>
    const result = await handler()
    expect(result).toEqual({
      success: true,
      data: { version: '2.0.0', releaseDate: '2026-04-17' },
    })
  })

  it('updater:check should return error on failure', async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(
      new Error('No internet'),
    )

    const { registerUpdaterHandlers } = await import(
      '@main/ipc/handlers/updater'
    )
    registerUpdaterHandlers()

    const checkCall = mockHandle.mock.calls.find(
      (call: unknown[]) => call[0] === 'updater:check',
    )
    const handler = checkCall![1] as () => Promise<{
      success: boolean
      error?: string
    }>
    const result = await handler()
    expect(result).toEqual({ success: false, error: 'No internet' })
  })

  it('updater:download should delegate to downloadUpdate', async () => {
    const { registerUpdaterHandlers } = await import(
      '@main/ipc/handlers/updater'
    )
    registerUpdaterHandlers()

    const downloadCall = mockHandle.mock.calls.find(
      (call: unknown[]) => call[0] === 'updater:download',
    )
    const handler = downloadCall![1] as () => { success: boolean }
    const result = handler()
    expect(result).toEqual({ success: true })
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('updater:install should delegate to installUpdate', async () => {
    const { registerUpdaterHandlers } = await import(
      '@main/ipc/handlers/updater'
    )
    registerUpdaterHandlers()

    const installCall = mockHandle.mock.calls.find(
      (call: unknown[]) => call[0] === 'updater:install',
    )
    const handler = installCall![1] as () => { success: boolean }
    const result = handler()
    expect(result).toEqual({ success: true })
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })
})
