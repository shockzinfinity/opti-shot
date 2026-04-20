import { app, BrowserWindow, nativeImage, Tray, Menu, shell } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { initCqrs } from './cqrs'
import { initAutoUpdater } from './services/updater'
import { getSettings } from './services/settings'

// --- Global error handlers (prevent crash on unhandled errors) ---

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

// --- Window bounds persistence ---

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

function getBoundsPath(): string {
  return join(app.getPath('userData'), 'window-bounds.json')
}

function loadBounds(): WindowBounds | null {
  const filePath = getBoundsPath()
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function saveBounds(win: BrowserWindow): void {
  const bounds: WindowBounds = {
    ...win.getBounds(),
    isMaximized: win.isMaximized(),
  }
  try {
    writeFileSync(getBoundsPath(), JSON.stringify(bounds))
  } catch { /* ignore */ }
}

// --- Icon ---

function getIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icon.png')
  }
  return join(__dirname, '../../build/icon.png')
}

// --- App state ---

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  const icon = nativeImage.createFromPath(getIconPath())
  const uiSettings = getSettings('ui')

  // Restore window bounds if enabled
  const savedBounds = uiSettings.restoreWindowSize ? loadBounds() : null

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1280,
    height: savedBounds?.height ?? 1280,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon,
    show: false,
  })

  if (savedBounds?.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Save bounds on resize/move
  mainWindow.on('resize', () => saveBounds(mainWindow!))
  mainWindow.on('move', () => saveBounds(mainWindow!))

  // Minimize to tray on close (if enabled)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      const currentSettings = getSettings('ui')
      if (currentSettings.minimizeToTray) {
        e.preventDefault()
        mainWindow!.hide()
      }
    }
  })

  // Security: block navigation to unexpected origins
  const allowedOrigin = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).origin
    : null

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const { protocol, origin } = new URL(url)
    if (protocol === 'file:') return
    if (allowedOrigin && origin === allowedOrigin) return
    event.preventDefault()
  })

  // Security: open external links in default browser instead of Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const TRAY_LABELS: Record<string, { open: string; quit: string }> = {
  ko: { open: 'OptiShot 열기', quit: '종료' },
  en: { open: 'Open OptiShot', quit: 'Quit' },
  ja: { open: 'OptiShot を開く', quit: '終了' },
}

function createTray(): void {
  const iconPath = getIconPath()
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('OptiShot')

  const lang = getSettings('ui').language ?? 'ko'
  const labels = TRAY_LABELS[lang] ?? TRAY_LABELS.ko

  const contextMenu = Menu.buildFromTemplate([
    {
      label: labels.open,
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: labels.quit,
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// --- App lifecycle ---

app.setName('OptiShot')

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(getIconPath()))
  }

  initCqrs()
  createWindow()
  createTray()
  initAutoUpdater()

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
