import { expect, test } from '@playwright/test'

/**
 * Building a list from the real catalogue data, in a browser, and getting a price
 * for it. Nothing about this can be proved by a unit test: the catalogue is loaded
 * by the server on first use and the price comes back over the wire.
 */
test('a list is built from the catalogue and priced', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Open a battle' }).click()

  await page.getByRole('button', { name: 'Build from the catalogue' }).click()

  await page.getByRole('combobox', { name: 'Army' }).click()
  await page.getByRole('option', { name: 'Chaos - Death Guard' }).click()

  await page.getByLabel('Add a unit').fill('Plague Marines')
  await page
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()

  const total = page.locator('[data-stat="points"]')
  await expect(total).toBeVisible()
  expect(Number.parseInt(await total.innerText(), 10)).toBeGreaterThan(0)

  // The default version of a datasheet is the legal minimum, so nothing should be
  // wrong with a freshly added unit.
  await expect(page.getByText('Nothing illegal about it.')).toBeVisible()

  // Sizing: a Plague Marines squad is 5 or 10, so growing it must change the price.
  const before = Number.parseInt(await total.innerText(), 10)
  await page.getByRole('button', { name: /More models in Plague Marines/ }).click()
  await expect(page.getByLabel('Plague Marines models')).toHaveText('6')
  await page.getByRole('button', { name: /More models in Plague Marines/ }).click()
  await page.getByRole('button', { name: /More models in Plague Marines/ }).click()
  await page.getByRole('button', { name: /More models in Plague Marines/ }).click()
  await page.getByRole('button', { name: /More models in Plague Marines/ }).click()
  await expect(page.getByLabel('Plague Marines models')).toHaveText('10')
  expect(Number.parseInt(await total.innerText(), 10)).toBeGreaterThan(before)

  await page.getByLabel('Name this army').fill('Death Guard strike force')
  await page.screenshot({ path: 'test-results/builder.png', fullPage: true })

  await page.getByRole('button', { name: 'Attach this list' }).click()
  await expect(page.getByRole('button', { name: 'Replace my list' })).toBeVisible()
})
