import { expect, type Page, test } from './test'
import { startVisitorRoster } from './account'
import { add } from './builder.harness'

async function openImmortals(page: Page) {
  await startVisitorRoster(page)
  await add(page, 'Immortals')
  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  await expect(page.getByLabel('Immortals models')).toHaveText('5')
}

test.describe('count steppers', () => {
  test('holding More keeps stepping to the largest size', async ({ page }) => {
    await openImmortals(page)
    await page.getByRole('button', { name: 'More models in Immortals', exact: true }).hover()
    await page.mouse.down()
    await expect(page.getByLabel('Immortals models')).toHaveText('10')
    await page.mouse.up()
    await expect(page.getByRole('button', { name: 'More models in Immortals', exact: true })).toBeDisabled()
  })
})
