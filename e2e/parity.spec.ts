import { expect, test } from '@playwright/test'
import {
  advance,
  attachRoster,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  recordFirstTurn,
  setupStep,
  signUp,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
} from './account'

test('roster visibility controls search indexing and public URL variants', async ({ page }) => {
  await signUp(page, uniqueName('Search roster'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Search roster' })
  const path = new URL(page.url()).pathname

  const setAccess = async (name: string, value: string) => {
    await page.getByRole('button', { name: 'Roster actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
    const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
    await setup.getByRole('combobox', { name: 'Access' }).click()
    await page.getByRole('option', { name }).click()
    const saved = page.waitForResponse((response) => response.ok() && Boolean(response.request().postData()?.includes(`"${value}"`)))
    await waitForRosterSave(page, () => setup.getByRole('button', { name: 'Save changes' }).click())
    await saved
  }

  await setAccess('Unlisted — anyone with the link', 'unlisted')
  await page.reload()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')

  await setAccess('Public — listed on your profile', 'public')
  await page.goto(`${path}?print=true`)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(path, page.url()).href)
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('a practice battle played out opens as its replay', async ({ page }) => {
  const player = uniqueName('Practice')
  await signUp(page, player)
  const firstRoster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'First roster' })
  await page.getByLabel('Add a unit').fill('Immortals')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())
  await createBattle(page, { practice: true })
  await attachRoster(page, firstRoster)
  await attachRoster(page, firstRoster, { forPlayer: PRACTICE_OPPONENT })
  await setupStep(page, 'Battlefield')
  await page.getByRole('button', { name: 'Select layout A: Tipping Point' }).click()
  await expect(page.getByRole('button', { name: 'Selected layout A: Tipping Point' })).toBeVisible()
  await recordFirstTurn(page)
  await page.getByRole('button', { name: 'Start battle' }).click()
  await takeTheTurn(page)
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()

  // The round count follows the mission pack, so this runs the battle out rather than
  // assuming how many phases that is.
  const result = page.getByRole('heading', { name: /Drawn at|win/ })
  for (let step = 0; step < 80 && !(await result.isVisible().catch(() => false)); step++) await advance(page)
  await expect(result).toBeVisible()
  await expect(page.getByRole('region', { name: 'Battle scoreboard' })).not.toContainText('Result')
  await expect(page.getByRole('navigation', { name: 'Battle replay timeline' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Battle options' })).toHaveCount(0)
})

test('a private roster can be shared and made private again', async ({ browser }) => {
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await signUp(page, uniqueName('Sharer'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Shareable roster' })
  await page.goto('/rosters')

  // Scoped to the row, because 'Unlisted' and 'Private' also appear in the menu
  // items that change them and would otherwise match before the change lands, and
  // to the visible label, because a phone reads it in the row's details line instead.
  const row = page.locator('[data-roster="Shareable roster"]')

  await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
  await page.getByRole('menuitem', { name: 'Share link' }).click()
  await expect(row.getByText('Unlisted').filter({ visible: true })).toBeVisible()
  // Polled, because the link is copied only once the visibility change comes back.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/rosters\/[^/]+$/)
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText())

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(sharedUrl)
  await page.evaluate(() => {
    window.PraetoriumNative = { bridgeVersion: 3, capabilities: ['share'] }
    window.ReactNativeWebView = {
      postMessage: (message) => document.documentElement.setAttribute('data-native-message', message),
    }
  })
  await page.getByRole('button', { name: 'Roster actions' }).click()
  const rosterShare = page.getByRole('menuitem', { name: 'Share link' })
  await expect(rosterShare).toBeEnabled()
  await rosterShare.click()
  await expect
    .poll(() => page.locator('html').getAttribute('data-native-message'))
    .toBe(JSON.stringify({ version: 3, type: 'native-share', url: sharedUrl, title: 'Shareable roster' }))

  const anonymous = await (await browser.newContext()).newPage()
  await anonymous.goto(sharedUrl)
  await expect(anonymous.getByRole('textbox', { name: 'List name' })).toHaveValue('Shareable roster')

  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
  await page.getByRole('menuitem', { name: 'Make private' }).click()
  await expect(row.getByText('Private').filter({ visible: true })).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
  await anonymous.screenshot({ path: test.info().outputPath('revoked-roster.png') })
})

test('editable detail waits for public access to save before sharing', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signUp(page, uniqueName('Detail sharer'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Detail share' })
  const sharedUrl = page.url()
  await page.evaluate(() => {
    window.PraetoriumNative = { bridgeVersion: 3, capabilities: ['share'] }
    window.ReactNativeWebView = {
      postMessage: (message) => document.documentElement.setAttribute('data-native-message', message),
    }
  })

  let releaseSave: () => void = () => undefined
  const saveHeld = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  let markSaveStarted: () => void = () => undefined
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    const body = route.request().postData()
    if (route.request().method() === 'POST' && body?.includes('"unlisted"') && body.includes('"picks"')) {
      markSaveStarted()
      await saveHeld
    }
    await route.continue()
  })

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name: 'Unlisted — anyone with the link' }).click()
  await setup.getByRole('button', { name: 'Save changes' }).click()
  await saveStarted

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Share link' }).click()
  await page.waitForTimeout(250)
  const sharedBeforeSave = await page.locator('html').getAttribute('data-native-message')
  releaseSave()
  expect(sharedBeforeSave).toBeNull()
  await expect.poll(() => page.locator('html').getAttribute('data-native-message')).toContain('"type":"native-share"')

  const anonymous = await (await browser.newContext()).newPage()
  await anonymous.goto(sharedUrl)
  await expect(anonymous.getByLabel('List name')).toHaveValue('Detail share')
})
