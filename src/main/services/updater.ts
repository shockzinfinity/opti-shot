// @TASK P5-R1 - Auto-updater service (GitHub Releases direct download)
// @SPEC CLAUDE.md#Architecture

import { app, net, shell } from 'electron'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getEventBus } from '@main/cqrs'
import { sendNotification } from '@main/services/notification'

const GITHUB_OWNER = 'shockzinfinity'
const GITHUB_REPO = 'opti-shot'

/** Periodic check interval: 4 hours */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let checkTimer: ReturnType<typeof setInterval> | null = null

/** Last detected remote version (cached for download asset selection) */
let cachedRemoteVersion: string | null = null

/** Last downloaded file path (for "open in Finder" on install) */
let lastDownloadedPath: string | null = null

/** Download in progress flag */
let downloading = false

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface ReleaseInfo {
  tag_name: string
  assets: ReleaseAsset[]
}

/** Fetch latest release info from GitHub API. */
async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

  return new Promise((resolve) => {
    try {
      const request = net.request({ url, method: 'GET' })
      request.setHeader('Accept', 'application/vnd.github.v3+json')
      request.setHeader('User-Agent', 'OptiShot-Updater')

      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => { body += chunk.toString() })
        response.on('end', () => {
          try {
            resolve(JSON.parse(body) as ReleaseInfo)
          } catch {
            console.error('[updater] Failed to parse GitHub response')
            resolve(null)
          }
        })
      })
      request.on('error', (err) => {
        console.error('[updater] GitHub API error:', err.message)
        resolve(null)
      })
      request.end()
    } catch (err) {
      console.error('[updater] net.request failed:', err instanceof Error ? err.message : err)
      resolve(null)
    }
  })
}

/** Pick the right asset for the current platform/arch. */
function pickAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
  const platform = process.platform
  const arch = process.arch // 'arm64' | 'x64'

  if (platform === 'darwin') {
    // Prefer .dmg matching arch
    const dmg = assets.find((a) => a.name.endsWith('.dmg') && a.name.includes(arch))
    if (dmg) return dmg
    // Fallback: any .dmg
    return assets.find((a) => a.name.endsWith('.dmg')) ?? null
  }
  if (platform === 'win32') {
    // Prefer Setup .exe (NSIS installer)
    const setup = assets.find((a) => /Setup.*\.exe$/i.test(a.name))
    if (setup) return setup
    return assets.find((a) => a.name.endsWith('.exe')) ?? null
  }
  if (platform === 'linux') {
    return (
      assets.find((a) => a.name.endsWith('.AppImage')) ??
      assets.find((a) => a.name.endsWith('.deb')) ??
      null
    )
  }
  return null
}

/**
 * Check for updates and emit events.
 * Returns the remote version string (or null).
 */
export async function checkForUpdates(): Promise<string | null> {
  const release = await fetchLatestRelease()
  if (!release || !release.tag_name) {
    console.log('[updater] No release info')
    return null
  }
  const tagName = release.tag_name
  const version = tagName.startsWith('v') ? tagName.slice(1) : tagName
  cachedRemoteVersion = version

  const currentVersion = app.getVersion()
  console.log(`[updater] current=${currentVersion}, remote=${version}`)

  if (version !== currentVersion) {
    getEventBus().publish('updater.available', {
      version,
      releaseDate: new Date().toISOString(),
    })
    sendNotification({
      level: 'info',
      category: 'system',
      title: 'notification.system.updateAvailable',
      message: `Version ${version} is available`,
    })
  } else {
    getEventBus().publish('updater.notAvailable', undefined as never)
  }
  return version
}

/**
 * Download the update asset to ~/Downloads.
 * Emits updater.progress and updater.downloaded events.
 */
export async function downloadUpdate(): Promise<void> {
  if (downloading) {
    console.log('[updater] Download already in progress')
    return
  }

  const release = await fetchLatestRelease()
  if (!release) {
    sendNotification({
      level: 'error',
      category: 'system',
      title: 'notification.system.updateError',
      message: 'Failed to fetch release info',
    })
    return
  }

  const asset = pickAsset(release.assets)
  if (!asset) {
    sendNotification({
      level: 'error',
      category: 'system',
      title: 'notification.system.updateError',
      message: 'No suitable installer found for this platform',
    })
    return
  }

  // Use ~/Downloads folder
  const downloadsDir = app.getPath('downloads')
  if (!existsSync(downloadsDir)) {
    mkdirSync(downloadsDir, { recursive: true })
  }
  const targetPath = join(downloadsDir, asset.name)

  console.log(`[updater] Downloading ${asset.name} (${asset.size} bytes) to ${targetPath}`)
  downloading = true

  try {
    await new Promise<void>((resolve, reject) => {
      const request = net.request({ url: asset.browser_download_url, method: 'GET', redirect: 'follow' })
      request.setHeader('User-Agent', 'OptiShot-Updater')

      request.on('response', (response) => {
        const total = asset.size
        let transferred = 0
        const writeStream = createWriteStream(targetPath)

        response.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          writeStream.write(chunk)
          const percent = total > 0 ? (transferred / total) * 100 : 0
          getEventBus().publish('updater.progress', { percent, transferred, total })
        })
        response.on('end', () => {
          writeStream.end()
          writeStream.on('finish', () => {
            lastDownloadedPath = targetPath
            getEventBus().publish('updater.downloaded', undefined as never)
            console.log(`[updater] Download complete: ${targetPath}`)
            resolve()
          })
          writeStream.on('error', reject)
        })
        response.on('error', reject)
      })
      request.on('error', reject)
      request.end()
    })
  } catch (err) {
    console.error('[updater] Download failed:', err instanceof Error ? err.message : err)
    sendNotification({
      level: 'error',
      category: 'system',
      title: 'notification.system.updateError',
      message: 'Download failed',
    })
  } finally {
    downloading = false
  }
}

/**
 * Open the downloaded file (or its containing folder) for manual install.
 * Code signing is not configured, so auto-install is not feasible.
 */
export async function installUpdate(): Promise<void> {
  if (lastDownloadedPath && existsSync(lastDownloadedPath)) {
    // Reveal in Finder/Explorer
    shell.showItemInFolder(lastDownloadedPath)
    sendNotification({
      level: 'info',
      category: 'system',
      title: 'updater.installFailed',
      message: `Please install the downloaded file manually: ${lastDownloadedPath}`,
    })
  } else {
    // Fallback: open Downloads folder
    shell.openPath(app.getPath('downloads'))
  }
}

/**
 * Initialize updater — schedule initial + periodic checks.
 * Skips initialization in development mode.
 */
export function initAutoUpdater(): void {
  if (process.env.NODE_ENV === 'development') return

  // Initial check after 5 seconds
  setTimeout(() => {
    checkForUpdates().catch(() => {})
  }, 5000)

  // Periodic check every 4 hours
  checkTimer = setInterval(() => {
    checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)
}

/** Clean up interval timer (for app quit). */
export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

/** Get cached remote version (set by last check). */
export function getCachedRemoteVersion(): string | null {
  return cachedRemoteVersion
}
