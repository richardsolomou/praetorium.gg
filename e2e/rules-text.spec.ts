import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { catalogue } from './stackEnv'
import { expect, replaceUpstreamFile, test } from './test'

// These tests start where a new device starts, before it has chosen any source.
test.use({ rulesText: false })

const coreRules = fs.readFileSync(path.join(catalogue, 'datacards', '11th', 'gdc', 'core', 'core_rules.json'), 'utf8')
const prose = 'The principles of movement are explained here.'
const ability = 'subtract 1 from that attack’s Damage characteristic'

const rulesPage = '/rules/core-rules/moving'
const ask = (page: Page) => page.getByRole('main').getByRole('button', { name: 'Choose sources' }).first()
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

test('choosing sources asks which external sources to load, with none turned on', async ({ page }) => {
  await page.goto(rulesPage)
  await ask(page).click()
  await expect(dialog(page)).toContainText('Praetorium doesn’t host or serve it.')
  await expect(dialog(page).getByRole('switch', { name: 'BSData' })).not.toBeChecked()
  await expect(dialog(page).getByRole('switch', { name: 'Game Datacards' })).not.toBeChecked()
  await expect(dialog(page).getByRole('button', { name: 'Load selected' })).toBeDisabled()
  await dialog(page).getByRole('button', { name: 'Select all' }).click()
  await expect(dialog(page).getByRole('switch', { name: 'BSData' })).toBeChecked()
  await expect(dialog(page).getByRole('switch', { name: 'Game Datacards' })).toBeChecked()
})

test('cancelling the dialog records nothing', async ({ page }) => {
  await page.goto(rulesPage)
  await ask(page).click()
  await dialog(page).getByRole('switch', { name: 'BSData' }).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await page.reload()
  await expect(ask(page)).toBeVisible()
})

test('a rules page carries no rules text until the reader loads it', async ({ page }) => {
  const response = await page.goto(rulesPage)
  expect(await response?.text()).not.toContain(prose)
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
  await ask(page).click()
  await loadFromDialog(page, ['Game Datacards'])
  await expect(page.getByText(prose)).toBeVisible()
  // Loaded text says nothing about where it came from; the data sources page does.
  await expect(page.getByRole('main').getByText('Game Datacards')).toHaveCount(0)
})

test('a new device is asked for text by every rule on a rules page and nowhere else', async ({ page }) => {
  await page.goto(rulesPage)
  const rules = page.getByRole('main').getByRole('article')
  await expect(rules.first()).toBeVisible()
  await expect(page.getByRole('main').getByText('Rules text isn’t loaded.')).toHaveCount(await rules.count())
  await expect(page.getByRole('complementary', { name: 'Rules text' })).toHaveCount(0)
})

test('a source turned on holds across a reload until it is turned off', async ({ page }) => {
  await page.goto(rulesPage)
  await ask(page).click()
  await loadFromDialog(page, ['Game Datacards'])
  await expect(page.getByText(prose)).toBeVisible()
  await page.reload()
  await expect(page.getByText(prose)).toBeVisible()
  await setSource(page, 'Game Datacards', false)
  await page.goto(rulesPage)
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('a file that is not the pinned one is refused', async ({ page }) => {
  replaceUpstreamFile(page.context(), '/core_rules.json', coreRules.replace(prose, 'Models move however they like.'))
  await page.goto(rulesPage)
  await ask(page).click()
  await loadFromDialog(page, ['Game Datacards'])
  await expect(page.getByRole('alert')).toHaveText('Couldn’t load the rules text.')
  await expect(page.getByText('Models move however they like.')).toHaveCount(0)
})

test('a datasheet gap opens the dialog and loads only the source turned on', async ({ page }) => {
  const response = await page.goto('/factions/necrons/datasheets/overlord')
  expect(await response?.text()).not.toContain(ability)
  await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
  await expect(page.getByText(ability)).toHaveCount(0)
  const gaps = page.getByRole('main').getByText('Rules text isn’t loaded.')
  await expect(gaps.first()).toBeVisible()
  // Every gap asks, so a reader who skipped the first still finds a way where they are reading.
  const choose = page.getByRole('main').getByRole('button', { name: 'Choose sources' })
  expect(await gaps.count()).toBeGreaterThan(1)
  await expect(choose).toHaveCount(await gaps.count())
  await choose.last().click()
  await loadFromDialog(page, ['BSData'])
  await expect(page.getByText(ability)).toBeVisible()
  await page.goto(rulesPage)
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('a source file that fails to load says so and loads when tried again', async ({ page }) => {
  const necrons = fs.readFileSync(path.join(catalogue, 'definitions', 'Necrons.json'), 'utf8')
  replaceUpstreamFile(page.context(), '/Necrons.json', 'Not the file')
  await setSource(page, 'BSData', true)
  await page.goto('/factions/necrons/datasheets/overlord')
  const failures = page.getByRole('main').getByText('Couldn’t load the rules text.')
  await expect(failures.first()).toBeVisible()
  replaceUpstreamFile(page.context(), '/Necrons.json', necrons)
  await page.getByRole('main').getByRole('button', { name: 'Try again' }).first().click()
  await expect(page.getByText(ability)).toBeVisible()
  await expect(failures).toHaveCount(0)
})

test('Game Datacards text loads while BSData text stays unloaded', async ({ page }) => {
  await setSource(page, 'Game Datacards', true)
  await page.goto(rulesPage)
  await expect(page.getByText(prose)).toBeVisible()
  await page.goto('/factions/necrons/datasheets/overlord')
  await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
  await expect(page.getByText('Rules text isn’t loaded.').first()).toBeVisible()
  await expect(page.getByText(ability)).toHaveCount(0)
})

/** Opens `route` as the server and head script draw it, with no application script to hydrate it, for a device that stored `stored`. */
async function firstFrame(page: Page, route: string, stored: string | null) {
  await page.addInitScript((value) => {
    if (value === null) localStorage.removeItem('praetorium-text-sources')
    else localStorage.setItem('praetorium-text-sources', value)
  }, stored)
  await page.route('**/*', (handler) => (handler.request().resourceType() === 'script' ? handler.abort() : handler.continue()))
  await page.goto(route, { waitUntil: 'domcontentloaded' })
}

// The first frame holds both sides of every gap, so only the side the document's choice shows counts.
const gapAsk = (page: Page) => page.getByRole('main').getByText('Rules text isn’t loaded.').filter({ visible: true })
const gapWait = (page: Page) => page.getByRole('main').getByRole('status', { name: 'Loading rules text' })

test.describe('the first frame draws the device’s own choice', () => {
  test('an undecided device is asked from the first frame', async ({ page }) => {
    await firstFrame(page, '/factions/necrons/datasheets/overlord', null)
    await expect(gapAsk(page).first()).toBeVisible()
    await expect(gapWait(page)).toHaveCount(0)
  })

  test('a device that chose none still sees what its gaps ask', async ({ page }) => {
    await firstFrame(page, '/factions/necrons/datasheets/overlord', '')
    await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
    await expect(gapAsk(page).first()).toBeVisible()
  })

  test('a device that chose its sources waits for the words without being asked', async ({ page }) => {
    await firstFrame(page, '/factions/necrons/datasheets/overlord', 'bsdata,game-datacards')
    await expect(page.getByRole('heading', { name: 'Implacable Resilience' })).toBeVisible()
    await expect(gapWait(page).first()).toBeVisible()
    await expect(gapAsk(page)).toHaveCount(0)
  })

  test('a rules page waits for a chosen source without asking', async ({ page }) => {
    await firstFrame(page, rulesPage, 'game-datacards')
    await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
    await expect(gapWait(page).first()).toBeVisible()
    await expect(gapAsk(page)).toHaveCount(0)
  })

  test('a rules page asks a device that chose only the other source', async ({ page }) => {
    await firstFrame(page, rulesPage, 'bsdata')
    await expect(gapAsk(page).first()).toBeVisible()
    await expect(gapWait(page)).toHaveCount(0)
  })
})
