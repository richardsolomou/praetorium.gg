import { expect, test } from './test'
import {
  addUnit,
  createRoster,
  retryUntilVisible,
  signIn,
  signUp,
  uniqueName,
  waitForRosterSave,
  expectNoPageOverflow,
  PHONE,
} from './account'
import { chooseCombatUnit, chooseRosterUnit, holdCombatCalculations, combatDamage } from './combat'
import { decodeSimulatorState } from '../src/contracts/simulatorState'

const pairing = 'Intercessor Squad + Captain + Lieutenant vs Lychguard + Overlord'
const history = '[aria-label="Recent simulations"]'

test(
  'an example is remembered only for a player after a result, reopens with its latest settings, and follows the account',
  { tag: '@catalogue' },
  async ({ page, context, browser }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Try an example', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Combined estimate' })).toHaveAttribute('aria-busy', 'false')
    await expect(page.locator(history)).toHaveCount(0)

    const account = await signUp(page, uniqueName('Recent simulations'))
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    const gate = await holdCombatCalculations(page)
    await page.getByRole('button', { name: 'Try an example', exact: true }).click()
    await gate.waitForStart()
    await expect(page.locator(history)).toHaveCount(0)
    await gate.release()
    const recent = page.getByRole('region', { name: 'Recent simulations', exact: true })
    await expect(recent.getByRole('link', { name: pairing, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Fewer attacker models', exact: true }).click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('9')
    await expect
      .poll(async () => {
        const url = new URL((await recent.getByRole('link', { name: pairing, exact: true }).getAttribute('href')) ?? '', 'http://localhost')
        return decodeSimulatorState(url.searchParams.get('s') ?? undefined)?.sides[0]?.pick.models
      })
      .toBe(9)
    await expect(recent.getByRole('link')).toHaveCount(1)
    await page.reload()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('9')
    await page.goto('/simulator')
    await recent.screenshot({ path: test.info().outputPath('recent-simulations-1440.png') })
    await retryUntilVisible(page.getByLabel('Attacker models', { exact: true }).filter({ hasText: '9' }), () =>
      recent.getByRole('link', { name: pairing, exact: true }).click(),
    )
    await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Lychguard')

    await page.setViewportSize(PHONE)
    await page.goto('/simulator')
    await expect(recent.getByRole('link', { name: pairing, exact: true })).toBeVisible()
    await expectNoPageOverflow(page)
    await recent.screenshot({ path: test.info().outputPath('recent-simulations-390.png') })
    await recent.getByRole('link', { name: pairing, exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Intercessor Squad')
    await expect(page.getByRole('region', { name: 'Combined estimate' })).toHaveAttribute('aria-busy', 'false')
    await page.screenshot({ path: test.info().outputPath('recent-simulations-simulator-390.png'), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 900 })

    const elsewhere = await (await browser.newContext()).newPage()
    await signIn(elsewhere, account.email, account.password)
    await elsewhere.waitForURL('/')
    await elsewhere.goto('/simulator')
    await expect(
      elsewhere.getByRole('region', { name: 'Recent simulations', exact: true }).getByRole('link', { name: pairing }),
    ).toBeVisible()

    const other = await context.newPage()
    await other.goto('/simulator')
    await expect(
      other.getByRole('region', { name: 'Recent simulations', exact: true }).getByRole('link', { name: pairing, exact: true }),
    ).toBeVisible()
    await other.getByRole('button', { name: `Remove ${pairing}`, exact: true }).click()
    await expect(recent).toHaveCount(0)
    await page.goto('/simulator')
    await page.reload()
    await expect(recent).toHaveCount(0)
    await elsewhere.reload()
    await expect(elsewhere.getByRole('button', { name: 'Try an example', exact: true })).toBeVisible()
    await expect(elsewhere.locator(history)).toHaveCount(0)
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
    await chooseRosterUnit(page, 'Attacker', 'Ankh Court', /^Overlord/)
    await expect(page.getByLabel('Attacker roster', { exact: true })).toContainText('Ankh Court')
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
    await page.goto('/simulator')
    await expect(rosterPairing).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('recent-simulations-roster.png') })
    await rosterPairing.click()
    await expect(page.getByLabel('Attacker roster', { exact: true })).toContainText('Ankh Court')
    await expect(enhanced).toBeVisible()
    await page.setViewportSize(PHONE)
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath('simulator-roster-unit-phone.png'), fullPage: true })
  },
)
