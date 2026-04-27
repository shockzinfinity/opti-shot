import { test, expect } from './fixtures'

test('navigate from dashboard to folder selection', async ({ page }) => {
  // Dashboard renders the welcome heading
  await expect(page.getByRole('heading', { name: /사진 라이브러리 현황/i })).toBeVisible()

  // Click "스캔 시작" quick action → navigate to /folders
  await page.getByRole('button', { name: /스캔 시작/i }).first().click()

  await expect(page.getByRole('heading', { name: /스캔 폴더/i })).toBeVisible()
})

test('change language in settings updates UI strings', async ({ page }) => {
  // Click the gear icon to navigate to settings
  await page.getByRole('button', { name: 'Settings' }).click()

  // Settings page renders (default tab is scan; we go to UI tab)
  await page.getByRole('button', { name: 'UI', exact: true }).click()

  // Click English language button
  await page.getByRole('button', { name: 'English', exact: true }).click()

  // Switch back to dashboard via header logo
  await page.getByTestId('header-dashboard-button').click()

  // Dashboard heading should now be in English
  await expect(page.getByRole('heading', { name: /Photo Library Overview/i })).toBeVisible()
})
