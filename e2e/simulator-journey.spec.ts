import { expect, test } from './test'
import {
  addUnit,
  createRoster,
  retryUntilVisible,
  signIn,
  signInAsPreview,
  signUp,
  uniqueName,
  waitForRosterSave,
  expectNoPageOverflow,
  PHONE,
} from './account'
import { chooseCombatUnit, holdCombatCalculations, combatDamage } from './combat'
import { decodeSimulatorState } from '../src/contracts/simulatorState'

const pairing = 'Intercessor Squad vs Necron Warriors'
const history = '[aria-label="Recent simulations"]'

test(
  'an editable example is remembered only after a result and reopens with its latest settings',
  { tag: '@catalogue' },
  async ({ page, context }) => {
    await signUp(page, uniqueName('Recent simulations'))
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    const gate = await holdCombatCalculations(page)
    await page.getByRole('button', { name: 'Try an example', exact: true }).click()
    await gate.waitForStart()
    await expect(page.locator(history)).toHaveCount(0)
    await gate.release()
    const recent = page.getByRole('region', { name: 'Recent simulations', exact: true })
    await expect(recent.getByRole('link', { name: pairing, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'More attacker models', exact: true }).click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('6')
    await expect
      .poll(async () => {
        const url = new URL((await recent.getByRole('link', { name: pairing, exact: true }).getAttribute('href')) ?? '', 'http://localhost')
        return decodeSimulatorState(url.searchParams.get('s') ?? undefined)?.sides[0]?.pick.models
      })
      .toBe(6)
    await expect(recent.getByRole('link')).toHaveCount(1)
    await page.getByRole('tab', { name: 'Rosters', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('6')
    await page.reload()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('6')
    await page.goto('/simulator')
    await retryUntilVisible(page.getByLabel('Attacker models', { exact: true }).filter({ hasText: '6' }), () =>
      recent.getByRole('link', { name: pairing, exact: true }).click(),
    )
    await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Necron Warriors')
    const other = await context.newPage()
    await other.goto('/')
    await expect(
      other.getByRole('region', { name: 'Recent simulations', exact: true }).getByRole('link', { name: pairing, exact: true }),
    ).toBeVisible()
    await other.getByRole('button', { name: `Remove ${pairing}`, exact: true }).click()
    await expect(recent).toHaveCount(0)
    await page.goto('/simulator')
    await page.reload()
    await expect(recent).toHaveCount(0)
  },
)

test('recent simulations are accessible from signed-in home at desktop and phone widths', { tag: '@catalogue' }, async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/simulator')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Try an example', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Recent simulations', exact: true })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const recent = page.getByRole('region', { name: 'Recent simulations', exact: true })
    await expect(recent.getByRole('link', { name: pairing, exact: true })).toBeVisible()
    await expectNoPageOverflow(page)
    await recent.screenshot({ path: test.info().outputPath(`recent-simulations-home-${width}.png`) })
    await recent.getByRole('link', { name: pairing, exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Intercessor Squad')
    await expect(page.getByRole('region', { name: 'Combined estimate' })).toHaveAttribute('aria-busy', 'false')
    await page.screenshot({ path: test.info().outputPath(`recent-simulations-simulator-${width}.png`), fullPage: true })
  }
})

test(
  'a guest keeps no matchups, and a player’s follow their account to another device',
  { tag: '@catalogue' },
  async ({ page, browser }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Try an example', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Combined estimate' })).toHaveAttribute('aria-busy', 'false')
    await expect(page.locator(history)).toHaveCount(0)
    const account = await signUp(page, uniqueName('Matchups'))
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Try an example', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Recent simulations', exact: true }).getByRole('link', { name: pairing })).toBeVisible()
    const elsewhere = await (await browser.newContext()).newPage()
    await signIn(elsewhere, account.email, account.password)
    await elsewhere.waitForURL('/')
    await elsewhere.goto('/simulator')
    await expect(
      elsewhere.getByRole('region', { name: 'Recent simulations', exact: true }).getByRole('link', { name: pairing }),
    ).toBeVisible()
    await elsewhere.getByRole('button', { name: `Remove ${pairing}`, exact: true }).click()
    await expect(elsewhere.locator(history)).toHaveCount(0)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Combat simulator', exact: true, level: 1 })).toHaveCount(0)
    await expect(page.locator(history)).toHaveCount(0)
  },
)

test('an invalid shared link leaves the simulator usable', async ({ page }) => {
  await page.goto('/simulator?s=invalid')
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeEnabled()
  await expect(page.locator(history)).toHaveCount(0)
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('simulator-example-phone.png'), fullPage: true })
})

test(
  'a unit from a saved roster keeps its enhancement against any unit and reopens from recent simulations',
  { tag: '@catalogue' },
  async ({ page }) => {
    await signUp(page, uniqueName('Roster unit'))
    await createRoster(page, { faction: 'Necrons', detachment: /Cursed Legion/, name: 'Ankh Court' })
    await addUnit(page, 'Overlord')
    const lord = page.locator('[data-unit="Overlord"]')
    await lord.getByRole('button', { name: 'Overlord', exact: true }).click()
    await waitForRosterSave(page, () =>
      page.locator('aside[aria-label="Loadout"]').getByRole('button', { name: 'Select Destroyer Ankh', exact: true }).click(),
    )
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    const option = page.getByRole('option', { name: 'Ankh Court', exact: true })
    await retryUntilVisible(option, () => page.getByRole('combobox', { name: 'First roster', exact: true }).click())
    await option.click()
    await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Overlord')
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    const melee = page.getByRole('region', { name: 'Melee results' })
    const enhanced = melee.getByRole('button', { name: 'A 6, modified from 4 by Destroyer Ankh', exact: true })
    await expect(enhanced).toBeVisible()
    await expect(await combatDamage(page, 'Melee')).toHaveText(/^\d+\.\d+$/)
    const recent = page.getByRole('region', { name: 'Recent simulations', exact: true })
    const rosterPairing = recent.getByRole('link', { name: 'Overlord · Ankh Court vs Intercessor Squad', exact: true })
    await expect(rosterPairing).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('simulator-roster-unit-desktop.png'), fullPage: true })
    await page.goto('/')
    const home = page.getByRole('region', { name: 'Recent simulations', exact: true })
    await expect(home.getByRole('link', { name: 'Overlord · Ankh Court vs Intercessor Squad' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('recent-simulations-home-roster.png') })
    await home.getByRole('link', { name: 'Overlord · Ankh Court vs Intercessor Squad' }).click()
    await expect(page.getByRole('combobox', { name: 'First roster', exact: true })).toContainText('Ankh Court')
    await expect(enhanced).toBeVisible()
    await page.setViewportSize(PHONE)
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath('simulator-roster-unit-phone.png'), fullPage: true })
  },
)
