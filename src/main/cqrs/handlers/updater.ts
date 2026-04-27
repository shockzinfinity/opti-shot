import { net } from 'electron'
import { downloadUpdate, installUpdate } from '@main/services/updater'
import type { CommandBus } from '../commandBus'

const GITHUB_OWNER = 'shockzinfinity'
const GITHUB_REPO = 'opti-shot'

/**
 * Fetch latest release version from GitHub API.
 * Uses Electron's net module (works in both dev and production).
 * Returns version string (e.g. "0.2.9") or null on failure.
 */
async function fetchLatestVersion(): Promise<string | null> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

  return new Promise((resolve) => {
    try {
      const request = net.request({
        url,
        method: 'GET',
      })

      request.setHeader('Accept', 'application/vnd.github.v3+json')
      request.setHeader('User-Agent', 'OptiShot-Updater')

      let body = ''

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          try {
            const json = JSON.parse(body)
            // tag_name is like "v0.2.9" — strip the "v" prefix
            const tagName = json.tag_name as string | undefined
            const version = tagName?.startsWith('v') ? tagName.slice(1) : tagName
            console.log('[updater.check] GitHub latest version:', version)
            resolve(version ?? null)
          } catch {
            console.error('[updater.check] Failed to parse GitHub response')
            resolve(null)
          }
        })
      })

      request.on('error', (err) => {
        console.error('[updater.check] GitHub API error:', err.message)
        resolve(null)
      })

      request.end()
    } catch (err) {
      console.error('[updater.check] net.request failed:', err instanceof Error ? err.message : err)
      resolve(null)
    }
  })
}

export function registerUpdaterHandlers(cmd: CommandBus): void {
  cmd.register('updater.check', async () => {
    const version = await fetchLatestVersion()
    return { version }
  })

  cmd.register('updater.download', async () => {
    downloadUpdate()
  })

  cmd.register('updater.install', async () => {
    installUpdate()
    // If successful, app quits. If failed, error event fires asynchronously.
  })
}
