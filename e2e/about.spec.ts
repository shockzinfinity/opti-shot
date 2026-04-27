import { test, expect } from './fixtures'

test('About modal does not auto-open on launch', async ({ page }) => {
  await page.waitForTimeout(500)
  await expect(page.getByTestId('about-modal')).toBeHidden()
})

test('open About OptiShot from Info tab and navigate sections', async ({ page }) => {
  await page.getByRole('button', { name: 'Info' }).click()
  await page.getByTestId('info-open-about').click()

  const modal = page.getByTestId('about-modal')
  await expect(modal).toBeVisible()

  await expect(page.getByTestId('about-nav')).toBeVisible()

  // Sidebar deep section navigation
  await page.getByTestId('about-nav-soft-delete').click()
  await expect(page.getByRole('heading', { name: 'Soft Delete (휴지통)' })).toBeVisible()
})

test('close About modal via X button', async ({ page }) => {
  await page.getByRole('button', { name: 'Info' }).click()
  await page.getByTestId('info-open-about').click()

  const modal = page.getByTestId('about-modal')
  await expect(modal).toBeVisible()

  await page.getByTestId('about-close').click()
  await expect(modal).toBeHidden()
})
