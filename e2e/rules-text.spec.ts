import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { signUp, uniqueName } from './account'
import { catalogue } from './stackEnv'
import { expect, replaceUpstreamFile, test } from './test'

// These tests start where a new device starts, before it has chosen any source.
test.use({ rulesText: false })

const coreRules = fs.readFileSync(path.join(catalogue, 'datacards', '11th', 'gdc', 'core', 'core_rules.json'), 'utf8')
const prose = 'The principles of movement are explained here.'
const ability = 'subtract 1 from that attack’s Damage characteristic'

const notice = (page: Page) => page.getByRole('complementary', { name: 'Rules text' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Load rules text from community sources' })

/** Turns on exactly these sources in the dialog a prompt opened, then loads them. */
async function loadFromDialog(page: Page, names: ('BSData' | 'Game Datacards')[]) {
  await expect(dialog(page)).toBeVisible()
  for (const name of names) await dialog(page).getByRole('switch', { name }).click()
  await dialog(page).getByRole('button', { name: 'Load selected' }).click()
  await expect(dialog(page)).toHaveCount(0)
}

/** Turns one source on or off from the data sources page. */
async function setSource(page: Page, name: 'BSData' | 'Game Datacards', on: boolean) {
  await page.goto('/sources')
  const toggle = page.getByRole('switch', { name })
  await expect(toggle).toBeEnabled()
  if ((await toggle.isChecked()) !== on) await toggle.click()
  await expect(toggle).toBeChecked({ checked: on })
}

test('a new device is asked where rules text comes from', async ({ page }) => {
  await page.goto('/')
  await expect(notice(page)).toContainText('Rules text loads in your browser from community sources you choose.')
})

test('a signed-in reader on a new device is asked the same way', async ({ page }) => {
  await signUp(page, uniqueName('Sources'))
  await page.goto('/factions')
  await expect(notice(page)).toBeVisible()
})

test('declining the question keeps it answered across a reload', async ({ page }) => {
  await page.goto('/factions')
  await notice(page).getByRole('button', { name: 'Not now' }).click()
  await expect(notice(page)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

test('choosing sources asks which external sources to load, with none turned on', async ({ page }) => {
  await page.goto('/factions')
  await notice(page).getByRole('button', { name: 'Choose sources' }).click()
  await expect(dialog(page)).toContainText('Praetorium doesn’t host or serve it.')
  await expect(dialog(page).getByRole('switch', { name: 'BSData' })).not.toBeChecked()
  await expect(dialog(page).getByRole('switch', { name: 'Game Datacards' })).not.toBeChecked()
  await expect(dialog(page).getByRole('button', { name: 'Load selected' })).toBeDisabled()
  await dialog(page).getByRole('button', { name: 'Select all' }).click()
  await expect(dialog(page).getByRole('switch', { name: 'BSData' })).toBeChecked()
  await expect(dialog(page).getByRole('switch', { name: 'Game Datacards' })).toBeChecked()
})

test('cancelling the dialog records nothing', async ({ page }) => {
  await page.goto('/factions')
  await notice(page).getByRole('button', { name: 'Choose sources' }).click()
  await dialog(page).getByRole('switch', { name: 'BSData' }).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await page.reload()
  await expect(notice(page)).toBeVisible()
})

test('a rules page carries no rules text until the reader loads it', async ({ page }) => {
  const response = await page.goto('/rules/core-rules/moving')
  expect(await response?.text()).not.toContain(prose)
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
  await page.getByRole('main').getByRole('button', { name: 'Choose sources' }).click()
  await loadFromDialog(page, ['Game Datacards'])
  await expect(page.getByText(prose)).toBeVisible()
  // Loaded text says nothing about where it came from; the data sources page does.
  await expect(page.getByRole('main').getByText('Game Datacards')).toHaveCount(0)
})

test('a source turned on holds across a reload until it is turned off', async ({ page }) => {
  await page.goto('/rules/core-rules/moving')
  await page.getByRole('main').getByRole('button', { name: 'Choose sources' }).click()
  await loadFromDialog(page, ['Game Datacards'])
  await expect(page.getByText(prose)).toBeVisible()
  await page.reload()
  await expect(page.getByText(prose)).toBeVisible()
  await setSource(page, 'Game Datacards', false)
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('a file that is not the pinned one is refused', async ({ page }) => {
  replaceUpstreamFile(page.context(), '/core_rules.json', coreRules.replace(prose, 'Models move however they like.'))
  await page.goto('/rules/core-rules/moving')
  await page.getByRole('main').getByRole('button', { name: 'Choose sources' }).click()
  await loadFromDialog(page, ['Game Datacards'])
  await expect(page.getByRole('alert')).toHaveText('Couldn’t load the rules text.')
  await expect(page.getByText('Models move however they like.')).toHaveCount(0)
})

test('a datasheet gap opens the dialog and loads only the source turned on', async ({ page }) => {
  const response = await page.goto('/factions/necrons/datasheets/overlord')
  expect(await response?.text()).not.toContain(ability)
  await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
  await expect(page.getByText(ability)).toHaveCount(0)
  await expect(page.getByText('Rules text isn’t loaded.').first()).toBeVisible()
  // One way to ask per page, however many rules are waiting on their text.
  const choose = page.getByRole('main').getByRole('button', { name: 'Choose sources' })
  await expect(choose).toHaveCount(1)
  await choose.click()
  await loadFromDialog(page, ['BSData'])
  await expect(page.getByText(ability)).toBeVisible()
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('BSData text loads while Game Datacards text stays unloaded', async ({ page }) => {
  await setSource(page, 'BSData', true)
  await page.goto('/factions/necrons/datasheets/overlord')
  await expect(page.getByText(ability)).toBeVisible()
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: 'Choose sources' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('Game Datacards text loads while BSData text stays unloaded', async ({ page }) => {
  await setSource(page, 'Game Datacards', true)
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByText(prose)).toBeVisible()
  await page.goto('/factions/necrons/datasheets/overlord')
  await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
  await expect(page.getByText('Rules text isn’t loaded.').first()).toBeVisible()
  await expect(page.getByText(ability)).toHaveCount(0)
})
