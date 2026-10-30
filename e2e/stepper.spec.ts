import { expect, type Page, test } from './test'
import { visitorSetup, chooseFaction } from './account'
import { add } from './builder.harness'

async function openImmortals(page: Page) {
  const setup = await visitorSetup(page)
  await chooseFaction(setup, 'Necrons')
  await setup.getByRole('button', { name: /^Select (?:Awakened Dynasty)$/ }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
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
