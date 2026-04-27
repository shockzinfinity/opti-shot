import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(__dirname, '..')

interface AppFixtures {
  app: ElectronApplication
  page: Page
  userDataDir: string
}

export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'optishot-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  app: async ({ userDataDir }, use) => {
    const app = await electron.launch({
      args: [
        join(repoRoot, 'out/main/index.js'),
        `--user-data-dir=${userDataDir}`,
      ],
      cwd: repoRoot,
      env: {
        ...process.env,
        OPTISHOT_E2E: '1',
        ELECTRON_DISABLE_GPU: '1',
      },
    })
    await use(app)
    await app.close()
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect } from '@playwright/test'
