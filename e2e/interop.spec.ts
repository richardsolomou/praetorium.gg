import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  attachRoster,
  chooseBattlefield,
  createBattle,
  createRoster,
  desktopContext,
  PRACTICE_OPPONENT,
  retryUntilVisible,
  signUp,
  waitForRosterSave,
} from './account'

test('a list can be copied as Games Workshop text', async ({ browser }) => {
  const page = await (await browser.newContext({ ...desktopContext, permissions: ['clipboard-read', 'clipboard-write'] })).newPage()

  await signUp(page, 'Alice')

  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Overlord')
  await page.getByRole('button', { name: 'Add Overlord', exact: true }).first().click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Attach Overlord to unit' }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Immortals', exact: true }).click()
  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  for (let models = 6; models <= 10; models++) {
    await page.getByRole('button', { name: 'More models in Immortals' }).click()
    await expect(page.getByLabel('Immortals models')).toHaveText(String(models))
  }
  // Immortals take one weapon or the other for the whole squad, so the export has to
  // carry whichever was picked.
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'Select Tesla carbine' }).click()
  await expect(page.getByText('10x Tesla carbine')).toBeVisible()

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export text' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export roster' })
  const text = dialog.locator('pre')
  const body = dialog.locator('[data-slot="dialog-body"]')
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(dialog).toContainText('Necrons roster')
  await expect(dialog).toContainText('Awakened Dynasty')
  await expect(dialog).toContainText('Immortals')
  await expect(dialog).toContainText('10x Tesla carbine')
  await expect(dialog).toContainText('Overlord')
  await expect(dialog).toContainText('Leading: Immortals')
  await expect(dialog).toContainText('Leader: Overlord')
  await expect(text).toContainText(/Exported with Praetorium\.gg v\d+\.\d+\.\d+\s*\nRuleset: [a-z0-9-]+\s*$/)
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)
  await expect(dialog.getByRole('button', { name: 'Copy text' })).toBeInViewport()
  await expect(body).toHaveJSProperty('scrollTop', 0)
  await dialog.getByRole('button', { name: 'Copy text' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  const readable = await page.evaluate(() => navigator.clipboard.readText())
  expect(readable).toContain('• Models: 10')
  await dialog.screenshot({ path: 'test-results/gw-text-export-phone.png' })
  await page.setViewportSize({ width: 1440, height: 500 })
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeInViewport()
  await dialog.screenshot({ path: 'test-results/gw-text-export-desktop.png' })
  await page.setViewportSize({ width: 390, height: 500 })
  await body.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await dialog.screenshot({ path: 'test-results/gw-text-export-footer-phone.png' })
  await body.evaluate((element) => element.scrollTo({ top: 0 }))
  await dialog.getByRole('button', { name: 'Compact', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Copy text' })).toBeVisible()
  await expect(text).toContainText('10x Immortals')
  await dialog.getByRole('button', { name: 'Copy text' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  const compact = await page.evaluate(() => navigator.clipboard.readText())
  expect(compact).toContain('• 10x Tesla carbine')
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download text' }).click()
  const download = await downloaded
  expect(await readFile(await download.path(), 'utf8')).toBe(compact)
  for (const exportedText of [readable, compact]) {
    await page.goto('/rosters')
    await page.getByRole('button', { name: 'Import roster', exact: true }).click()
    const review = page.getByRole('dialog', { name: 'Import roster', exact: true })
    await review.getByLabel('Roster text').fill(exportedText)
    await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
    await expect(review).toContainText('2 of 2 matched entries')
    await expect(review).toContainText('Matched entries at selected rules:')
    await expect(review.getByRole('alert')).toHaveCount(0)
    await review.getByRole('button', { name: 'Import roster', exact: true }).click()
    await page.waitForURL(/\/rosters\/[^/]+$/)
    await page.reload()
    await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Roster actions' }).click()
    await page.getByRole('menuitem', { name: 'Export text' }).click()
    const saved = page.getByRole('dialog', { name: 'Export roster' })
    await expect(saved.locator('pre')).toContainText('• Models: 10')
    await expect(saved.locator('pre')).toContainText('• 10x Tesla carbine')
    await expect(saved.locator('pre')).toContainText('• Leading: Immortals')
  }
})

test('an imported roster with disagreeing dispositions asks for one before battle setup', async ({ page }) => {
  await signUp(page, 'Bob')

  await page.goto('/rosters')
  // The button answers only once the page has hydrated.
  await retryUntilVisible(page.getByLabel('Roster text'), () => page.getByRole('button', { name: 'Import roster' }).click())
  await page.getByLabel('Roster text').fill(`HLHOTD 2K - C'tan (1995 Points)

Necrons
Hypercrypt Legion and Hand of the Dynasty (3 Detachment Points)
Force Dispositions: Reconnaissance, Take and Hold
Strike Force (2,000 Points)

CHARACTER

Technomancer (70 Points)
  • Warlord

Exported with BattleBase, Data Version: v20260812`)
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await page.getByRole('button', { name: 'Import anyway', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)

  const notice = page.getByRole('alert').filter({ hasText: 'Pick a disposition.' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Choose one' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Take and Hold', exact: true }).click()
  await waitForRosterSave(page, () => setup.getByRole('button', { name: 'Save changes' }).click())
  await expect(notice).toHaveCount(0)
  await expect(page.getByText('Take and Hold', { exact: true })).toBeVisible()

  for (const disposition of ['Take and Hold', 'Reconnaissance']) {
    if (disposition === 'Reconnaissance') {
      await page.getByRole('button', { name: 'Roster actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
      await setup.getByRole('button', { name: disposition, exact: true }).click()
      await waitForRosterSave(page, () => setup.getByRole('button', { name: 'Save changes' }).click())
    }
    await page.reload()
    await expect(page.getByText(disposition, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Roster actions' }).click()
    await page.getByRole('menuitem', { name: 'Export text' }).click()
    const exported = page.getByRole('dialog', { name: 'Export roster' })
    await expect(exported.locator('pre')).toContainText(`Force Disposition: ${disposition}\n`)
    await expect(exported.locator('pre')).not.toContainText('Force Dispositions:')
    await exported.screenshot({ path: `test-results/selected-disposition-export-${disposition.toLowerCase()}.png` })
    await exported.getByRole('button', { name: 'Close' }).click()
  }

  await createBattle(page, { practice: true })
  await attachRoster(page, "HLHOTD 2K - C'tan")
  await attachRoster(page, "HLHOTD 2K - C'tan", { forPlayer: PRACTICE_OPPONENT })
  await chooseBattlefield(page)
})

for (const count of [0, 1, 3]) {
  test(`an account reviews and saves all ${count} source entries, and cancelling writes nothing`, async ({ page }) => {
    await signUp(page, `Entry count ${count}`)
    await page.goto('/rosters')
    const review = page.getByRole('dialog', { name: 'Import roster', exact: true })
    await retryUntilVisible(review.getByLabel('Roster text'), () =>
      page.getByRole('button', { name: 'Import roster', exact: true }).click(),
    )
    const text = `Saved entries (999 Points)\n\nNecrons\nAwakened Dynasty\nForce Disposition: Take and Hold\nStrike Force (2,000 Points)\n\nBATTLELINE\n\n${'Immortals (65 Points)\n • 5x Gauss blaster\n • 5x Close combat weapon\n • Models: 5\n\n'.repeat(count)}Exported with Praetorium.gg vtest\n`
    await review.getByLabel('Roster text').fill(text)
    await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
    await expect(review).toContainText(`${count} of ${count} matched ${count === 1 ? 'entry' : 'entries'}`)
    await review.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('[data-roster]')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('[data-roster]')).toHaveCount(0)
    await retryUntilVisible(review.getByLabel('Roster text'), () =>
      page.getByRole('button', { name: 'Import roster', exact: true }).click(),
    )
    await review.getByLabel('Roster text').fill(text)
    await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
    await review.getByRole('button', { name: 'Import roster', exact: true }).click()
    await page.waitForURL(/\/rosters\/[^/]+$/)
    await page.reload()
    await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(count)
    await page.goto('/rosters')
    await expect(page.locator('[data-roster]')).toHaveCount(1)
    await page.locator('[data-roster]').getByRole('button', { name: 'Actions for Saved entries' }).click()
    await page.getByRole('menuitem', { name: 'Export text', exact: true }).click()
    const exported = page.getByRole('dialog', { name: 'Export roster' })
    expect((await exported.locator('pre').innerText()).match(/• Models: 5/g) ?? []).toHaveLength(count)
    await exported.getByRole('button', { name: 'Compact', exact: true }).click()
    expect((await exported.locator('pre').innerText()).match(/5x Immortals/g) ?? []).toHaveLength(count)
    if (count === 1) {
      await page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('clipboard denied')) })
      })
      await exported.getByRole('button', { name: 'Copy text', exact: true }).click()
      await expect(exported.getByRole('alert')).toHaveText('Copy failed. Select the text to copy it.')
      await expect(exported.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0)
    }
  })
}
