import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

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
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Awakened Dynasty/ }).click()
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Overlord')
  await page.getByRole('button', { name: 'Add Overlord', exact: true }).first().click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  // eslint-disable-next-line no-await-in-loop
  for (let grown = 0; grown < 5; grown++) await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  // eslint-disable-next-line no-await-in-loop
  for (let swapped = 0; swapped < 3; swapped++) await loadout.getByRole('button', { name: 'More Tesla carbine' }).click()

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
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()
  await expect(page.getByLabel('Immortals models')).toHaveText('10')
  await expect(page.getByText('Awakened Dynasty', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('7x Gauss blaster')).toBeVisible()
  await expect(page.getByText('3x Tesla carbine')).toBeVisible()
  await expect(page.getByText('Leading')).toBeVisible()

  // External tools can write more than one force. Build that corpus at test time
  // from the real export so no game data or private roster is committed here.
  const xml = await readFile(saved, 'utf8')
  const force = xml.match(/<force\b[\s\S]*?<\/force>/)?.[0]
  expect(force).toBeTruthy()
  const alliedForce = force!.replace('catalogueId="', 'catalogueId="allied-').replace('id="', 'id="allied-')
  const alliedXml = xml.replace('</forces>', `${alliedForce}</forces>`)

  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page
    .getByLabel('Bring a list from another tool')
    .setInputFiles({ name: 'allies.ros', mimeType: 'application/xml', buffer: Buffer.from(alliedXml) })
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(2)
  await expect(page.locator('[data-unit="Overlord"]')).toHaveCount(2)

  const [alliedDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()])
  const alliedSaved = await alliedDownload.path()
  const roundTripped = await readFile(alliedSaved, 'utf8')
  expect(roundTripped.match(/<force /g)).toHaveLength(2)
  expect(roundTripped).toContain('catalogueId="allied-')
})
