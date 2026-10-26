import { waitForOfflineApp } from './offline'
import {
  confirmRosterSetup,
  retryUntilVisible,
  visitorSetup,
  addUnit,
  chooseRosterAction,
  chooseFaction,
  chooseOption,
  chooseLibraryAction,
  chooseRulesVersion,
  PHONE,
  desktopContext,
  signUp,
  createRoster,
  waitForRosterSave,
} from './account'
import { expect, test, type Locator, type Page } from './test'
import { add, expectNoHorizontalOverflow } from './builder.harness'
import { lastPathSegment, productOperator } from './storage'

const phone = { width: 390, height: 900 }

test('Custodes codex presentation', async ({ page, context }) => {
  test.setTimeout(240_000)
  await page.setViewportSize(desktopContext.viewport)
  const setup = await visitorSetup(page)
  await chooseFaction(setup, 'Adeptus Custodes')
  await expect(setup.getByRole('combobox', { name: 'Rules version' })).toHaveCount(0)
  await expectSetup(setup)
  await setup.getByRole('button', { name: 'Select Aquilan Shield', exact: true }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    if (viewport === phone) await expectSetup(setup)
    await setup.getByRole('combobox', { name: 'Faction' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`custodes-setup-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktopContext.viewport)
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  const builder = page.url()
  await add(page, 'Allarus Custodians')
  await page.getByRole('button', { name: 'Allarus Custodians', exact: true }).click()
  await expectLoadout(page)
  await page.getByRole('button', { name: 'More Castellan Axe', exact: true }).click()
  await page.getByRole('button', { name: 'More Castellan Axe', exact: true }).click()
  await page.getByRole('button', { name: 'More models in Allarus Custodians', exact: true }).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('3x Castellan Axe')
  await page.getByRole('button', { name: 'Fewer models in Allarus Custodians', exact: true }).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('2x Castellan Axe')
  await page.getByRole('button', { name: 'Select Vexilla', exact: true }).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('1x Vexilla')
  await expect(page.locator('[data-characteristic="OC"] .readout')).toHaveText('3')
  await expectNoHorizontalOverflow(page.locator('body'))
  await page.locator('[data-slot="unit-profile"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath(`custodes-loadout-${desktopContext.viewport.width}.png`) })

  await page.setViewportSize(phone)
  await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add Allarus Custodians', exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Allarus Custodians', exact: true }).click()
  await expectLoadout(page)
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('2x Castellan Axe')
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('1x Vexilla')
  await page.getByRole('button', { name: 'More models in Allarus Custodians', exact: true }).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('3x Castellan Axe')
  await page.getByRole('button', { name: 'Fewer models in Allarus Custodians', exact: true }).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('2x Castellan Axe')
  await expect(page.locator('[data-characteristic="OC"] .readout')).toHaveText('3')
  await expectNoHorizontalOverflow(page.locator('body'))
  await page.locator('[data-slot="unit-profile"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath(`custodes-loadout-${phone.width}.png`) })
  await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
  await page.setViewportSize(desktopContext.viewport)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('praetorium.guest-draft') ?? 'null')?.draft.picks[0]?.models))
    .toBe(2)

  await page.reload()
  await expect(page.locator('[data-rules-version]')).toHaveCount(0)
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('1x Vexilla')
  await page.goto('/factions/adeptus-custodes')
  await expect(page).toHaveURL(/\/factions\/adeptus-custodes\/rules\/mfm-1-6$/)
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Current MFM 1.6')
    await expect(page.locator('[data-faction-mark]')).toHaveCSS('background-color', 'rgb(191, 155, 48)')
    await expect(page.locator('main header [data-rules-version]')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`custodes-reference-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktopContext.viewport)
  await chooseOption(page, 'Rules version', 'MFM 1.5 · Archived')
  await expect(page).toHaveURL(/\/factions\/adeptus-custodes\/rules\/space-marines-points-2026-10-13$/)
  await chooseOption(page, 'Rules version', 'Custodes codex · 17 Oct 2026 · Archived')
  await expect(page).toHaveURL(/\/factions\/adeptus-custodes\/rules\/custodes-codex-2026-10-17$/)
  await page.goto('/factions/adeptus-custodes/rules/mfm-1-6/datasheets/allarus-custodians')
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('[data-rules-version]')).toHaveCount(0)
    await expect(page.locator('[data-faction-mark]')).toHaveCSS('background-color', 'rgb(191, 155, 48)')
    await expectNoHorizontalOverflow(page.locator('body'))
    await page.screenshot({ path: test.info().outputPath(`custodes-datasheet-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktopContext.viewport)
  await waitForOfflineApp(page)
  await context.setOffline(true)
  await page.goto(builder)
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('2x Castellan Axe')
  await page.getByRole('button', { name: 'Allarus Custodians', exact: true }).click()
  await page.getByRole('button', { name: 'More models in Allarus Custodians', exact: true }).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('3x Castellan Axe')
  const storedModels = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('praetorium.guest-draft') ?? 'null')?.draft.picks[0]?.models)
  await expect.poll(storedModels).toBe(3)
  await page.getByRole('button', { name: 'Fewer models in Allarus Custodians', exact: true }).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('2x Castellan Axe')
  await expect(page.locator('[data-characteristic="OC"] .readout')).toHaveText('3')
  await expect(page.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await expect.poll(storedModels).toBe(2)
  await page.reload()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('2x Castellan Axe')
  await context.setOffline(false)
})

async function expectSetup(setup: Locator) {
  await expect(setup.locator('[data-faction-mark]')).toHaveCSS('background-color', 'rgb(191, 155, 48)')
}

async function expectLoadout(page: Page) {
  await expect(page.locator('[data-rules-version]')).toHaveCount(0)
  await expect(page.locator('[data-faction-mark]').first()).toHaveCSS('background-color', 'rgb(191, 155, 48)')
  await expect(page.getByRole('button', { name: 'Select 3 models', exact: true })).toHaveCount(0)
  await expect(page.getByText('Invulnerable save', { exact: true })).toBeVisible()
}

test('converts the saved roster in place and restores its current choices', async ({ page }) => {
  await signUp(page, 'Rules conversion')
  await createRoster(page, { faction: 'Adeptus Custodes', detachment: /Aquilan Shield/, name: 'Conversion roster' })
  const id = lastPathSegment(page.url())
  const operator = await productOperator()
  async function destination(label: string, detachment: string) {
    const dialog = page.getByRole('dialog', { name: 'Edit roster setup' })
    await chooseRulesVersion(dialog, label, detachment)
    await expect(dialog.getByRole('button', { name: 'Review changes', exact: true })).toBeEnabled()
    return dialog
  }
  await addUnit(page, 'Allarus Custodians')
  await page.getByRole('button', { name: 'Allarus Custodians', exact: true }).click()
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'More Castellan Axe', exact: true }).click())
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'More Castellan Axe', exact: true }).click())
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Select Vexilla', exact: true }).click())
  const original = (await operator.roster(id))!
  await page.goto('/rosters')
  const row = page.locator('[data-roster="Conversion roster"]')
  await expect(row).toContainText('180/2000')
  await expect(row.locator('[data-rules-version]')).toHaveCount(0)
  await chooseLibraryAction(page, 'Conversion roster', 'Edit roster setup')
  const versions = page.getByRole('dialog', { name: 'Edit roster setup' }).getByRole('combobox', { name: 'Rules version' })
  await versions.click()
  await expect(page.getByRole('option', { name: 'MFM 1.5 · Archived', exact: true })).toBeVisible()
  // The preview folded into the codex, so a roster saved on it would read as current rules.
  await expect(page.getByRole('option', { name: 'Custodes codex · 17 Oct 2026 · Archived', exact: true })).toHaveCount(0)
  await versions.click()
  await expect(page.getByRole('option')).toHaveCount(0)
  let dialog = await destination('MFM 1.5 · Archived', 'Shield Host')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await operator.roster(id))?.catalogueId).toBe(original.catalogueId)
  await chooseLibraryAction(page, 'Conversion roster', 'Edit roster setup')
  dialog = await destination('MFM 1.5 · Archived', 'Shield Host')
  await dialog.screenshot({ path: test.info().outputPath('custodes-convert-dialog.png') })
  await confirmRosterSetup(dialog)
  await expect.poll(async () => (await operator.roster(id))?.catalogueId).toContain('marine-points-1013~')
  const converted = (await operator.roster(id))!
  const originalPicks = JSON.parse(original.picks)
  const convertedPicks = JSON.parse(converted.picks)
  expect(convertedPicks[0].catalogueId).toBe(converted.catalogueId)
  expect(convertedPicks.map((pick: Record<string, unknown>) => ({ ...pick, catalogueId: originalPicks[0].catalogueId }))).toEqual(
    originalPicks,
  )
  expect(converted.name).toBe(original.name)
  expect(converted.visibility).toBe(original.visibility)
  expect(converted.prep).toBe(original.prep)
  await page.goto(`/rosters/${id}`)
  await expect(page.getByLabel('List name')).toHaveValue('Conversion roster')
  await expect(page.locator('[data-rules-version]')).toHaveAttribute('aria-label', 'Rules version: MFM 1.5 · Archived')
  await chooseRosterAction(page, 'Edit roster setup')
  dialog = await destination('MFM 1.6 · Current', 'Aquilan Shield')
  await confirmRosterSetup(dialog)
  await expect(dialog).not.toBeVisible()
  await expect.poll(async () => (await operator.roster(id))?.catalogueId).not.toContain('marine-points-1013~')
  await page.reload()
  const restored = JSON.parse((await operator.roster(id))!.picks)
  expect(restored.map((pick: Record<string, unknown>) => ({ ...pick, catalogueId: originalPicks[0].catalogueId }))).toEqual(originalPicks)
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('2x Castellan Axe')
  await page.getByRole('button', { name: 'Allarus Custodians', exact: true }).click()
  await expect(page.locator('[data-characteristic="OC"] .readout')).toHaveText('3')
  await expect(page.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('custodes-converted-roster.png') })
})

test('faction index cards and logo tooltips work with touch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto('/factions')
  const row = page.locator('[data-faction="Adeptus Custodes"]')
  await row.scrollIntoViewIfNeeded()
  await expect(row).toContainText('3 rules versions')
  await row.getByRole('link').first().tap()
  await expect(page).toHaveURL(/\/factions\/adeptus-custodes\/rules\/mfm-1-6$/)
  await retryUntilVisible(page.getByRole('option').first(), () => page.getByRole('combobox', { name: 'Rules version' }).tap())
  await page.screenshot({ path: test.info().outputPath('custodes-faction-versions-phone.png') })
  await page.getByRole('option', { name: /Custodes codex · 17 Oct 2026/ }).tap()
  await expect(page).toHaveURL(/\/factions\/adeptus-custodes\/rules\/custodes-codex-2026-10-17$/)
  await page.locator('[data-rules-version]').tap()
  await expect(page.getByRole('tooltip')).toContainText('Archived Custodes codex · 17 Oct 2026')
  await expect(page.getByRole('tooltip').locator('[data-rules-status="archived"]')).toHaveCSS('width', '72px')
  await page.screenshot({ path: test.info().outputPath('custodes-touch-tooltip.png') })
  await expectNoHorizontalOverflow(page.locator('body'))
  await page.goto('/factions/adeptus-custodes/rules/unknown-version')
  await expect(page.getByRole('heading', { name: 'Nothing here', exact: true })).toBeVisible()
  await context.close()
})
