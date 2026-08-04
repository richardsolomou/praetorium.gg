import { expect, test } from '@playwright/test'

/**
 * Taking a list out and bringing it back in, in the format New Recruit,
 * BattleScribe and tournament organisers all read.
 *
 * A round trip through a real file is the only way to know the export is readable:
 * a unit test can round-trip a string, but not a browser download and upload.
 */
test('a list leaves as .ros and comes back', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage()

  await page.goto('/')
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()

  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Chaos - Death Guard' }).click()
  await page.getByRole('combobox', { name: 'Detachment' }).click()
  await page.getByRole('option', { name: /Death Lord/ }).click()
  await page.getByLabel('Add a unit').fill('Plague Marines')
  await page.getByRole('button', { name: 'Add Plague Marines', exact: true }).first().click()

  const total = page.locator('[data-stat="points"]')
  const priced = await total.innerText()

  // Out through the browser's own download, so this is the file a person gets.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()])
  const saved = await download.path()
  expect(download.suggestedFilename()).toMatch(/\.ros$/)

  // And back in, into a fresh battle.
  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByLabel('Bring a list from another tool').setInputFiles(saved)

  await expect(total).toHaveText(priced)
  await page
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()
  await expect(page.getByLabel('Plague Marines models')).toBeVisible()
})
