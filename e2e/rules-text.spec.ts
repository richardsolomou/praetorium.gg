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

test('choosing sources leads to the data sources page', async ({ page }) => {
  await page.goto('/factions')
  await notice(page).getByRole('link', { name: 'Choose sources' }).click()
  await expect(page).toHaveURL(/\/sources$/)
  await expect(page.getByRole('switch', { name: 'BSData' })).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

test('a rules page carries no rules text until the reader loads it', async ({ page }) => {
  const response = await page.goto('/rules/core-rules/moving')
  expect(await response?.text()).not.toContain(prose)
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
  await page.getByRole('button', { name: 'Load Game Datacards text' }).click()
  await expect(page.getByText(prose)).toBeVisible()
})

test('a source turned on holds across a reload until it is turned off', async ({ page }) => {
  await page.goto('/rules/core-rules/moving')
  await page.getByRole('button', { name: 'Load Game Datacards text' }).click()
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
  await page.getByRole('button', { name: 'Load Game Datacards text' }).click()
  await expect(page.getByRole('alert')).toHaveText('Couldn’t load the rules text from Game Datacards.')
  await expect(page.getByText('Models move however they like.')).toHaveCount(0)
})

test('a datasheet names the source its missing text loads from', async ({ page }) => {
  const response = await page.goto('/factions/necrons/datasheets/overlord')
  expect(await response?.text()).not.toContain(ability)
  await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
  await expect(page.getByText(ability)).toHaveCount(0)
  await expect(page.getByText('BSData text isn’t loaded.').first()).toBeVisible()
  // One way to ask per page, however many rules are waiting on their text.
  const load = page.getByRole('main').getByRole('button', { name: 'Load', exact: true })
  await expect(load).toHaveCount(1)
  await load.click()
  await expect(page.getByText(ability)).toBeVisible()
})

test('BSData text loads while Game Datacards text stays unloaded', async ({ page }) => {
  await setSource(page, 'BSData', true)
  await page.goto('/factions/necrons/datasheets/overlord')
  await expect(page.getByText(ability)).toBeVisible()
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load Game Datacards text' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('Game Datacards text loads while BSData text stays unloaded', async ({ page }) => {
  await setSource(page, 'Game Datacards', true)
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByText(prose)).toBeVisible()
  await page.goto('/factions/necrons/datasheets/overlord')
  await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
  await expect(page.getByText('BSData text isn’t loaded.').first()).toBeVisible()
  await expect(page.getByText(ability)).toHaveCount(0)
})
