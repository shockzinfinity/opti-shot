import { test, expect } from './fixtures'

test('app launches and renders header', async ({ page }) => {
  await expect(page.getByTestId('header-dashboard-button')).toBeVisible()
})
