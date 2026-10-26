import { expect, test, type Locator, type Page } from './test'
import {
  chooseUnit,
  confirmRosterSetup,
  retryUntilVisible,
  signUp,
  waitForRosterSave,
  expectNoPageOverflow,
  openRosterSetup,
  chooseFaction,
  visitorSetup,
  chooseOption,
  desktopContext,
} from './account'
import { decodeSimulatorState } from '../src/contracts/simulatorState'
import { simulatorState } from './combat'

const phone = { width: 390, height: 900 }

test('the prepared reference API includes Brood Brother Auxilia', { tag: '@catalogue' }, async ({ page, request }, testInfo) => {
  const response = await request.get('/api/reference/v1/detachments/genestealer-cults/brood-brother-auxilia')
  expect(response.status()).toBe(200)
  const { data } = await response.json()
  expect({ name: data.name, rules: data.rules.length, stratagems: data.stratagems.length, enhancements: data.enhancements.length }).toEqual(
    {
      name: 'Brood Brother Auxilia',
      rules: 2,
      stratagems: 6,
      enhancements: 4,
    },
  )
  await page.goto('/factions/genestealer-cults/detachments/brood-brother-auxilia')
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.getByRole('heading', { level: 1, name: 'Brood Brother Auxilia', exact: true })).toBeVisible()
    await expectNoPageOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`prepared-detachment-${viewport.width}.png`), fullPage: true })
  }
})

test('faction search explains structured matches', async ({ page }) => {
  await page.setViewportSize(desktopContext.viewport)
  await page.goto('/factions/necrons/datasheets')
  const search = page.getByRole('textbox', { name: 'Find a datasheet' })
  const technomancer = page.locator('[data-datasheet="Technomancer"]')

  await retryUntilVisible(technomancer.getByText('Matches Cryptek keyword · Staff of light weapon'), async () => {
    await search.fill('')
    await search.fill('cryptek staff')
  })
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(technomancer).toContainText('Matches Cryptek keyword · Staff of light weapon')
    await expect(technomancer.locator('mark')).toHaveText(['Cryptek', 'Staff'])
    await page.screenshot({ path: test.info().outputPath(`reference-search-${viewport.width}.png`), fullPage: true })
    await expectNoPageOverflow(page)
  }

  for (const viewport of [phone, desktopContext.viewport]) {
    await page.setViewportSize(viewport)
    await search.fill('Rites of Reanimation')
    await expect(technomancer).toContainText('Matches Rites of Reanimation ability')
    await search.fill('Technomancer')
    await expect(technomancer).toBeVisible()
    await expect(technomancer).not.toContainText('Matches')
    await search.fill('NoSuchDatasheet')
    await expect(page.getByRole('heading', { name: 'No datasheets match' })).toBeVisible()
    await page.getByRole('button', { name: 'Empty the datasheet filter' }).click()
    await expect(technomancer).toBeVisible()
    await expect(technomancer).not.toContainText('Matches')
  }

  await technomancer.getByRole('link', { name: /^Technomancer/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Technomancer', exact: true })).toBeVisible()
  await page.reload()
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.getByRole('heading', { level: 1, name: 'Technomancer', exact: true })).toBeVisible()
  }
})

test('archived reference identities remain visible in the simulator', async ({ page }) => {
  for (const source of [
    {
      path: 'adeptus-custodes/rules/custodes-codex-2026-10-17/datasheets/allarus-custodians',
      name: 'Allarus Custodians',
      edition: 'custodes-11e',
    },
    { path: 'dark-angels/rules/mfm-1-4-2026-09-30/datasheets/deathwing-knights', name: 'Deathwing Knights', edition: 'legacy-rosters' },
  ]) {
    await page.goto(`/factions/${source.path}`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await page.getByRole('menuitem', { name: 'As defender', exact: true }).click()
    const selected = page.getByRole('combobox', { name: 'Defender unit', exact: true })
    await expect(selected).toHaveAttribute('aria-busy', 'false')
    await expect(selected).toContainText(source.name)
    await expect(selected.locator(`[data-rules-version="${source.edition}"]`)).toBeVisible()
    const state = new URL(page.url()).searchParams.get('s')
    expect(decodeSimulatorState(state ?? undefined)?.sides[1]?.catalogueId).toMatch(new RegExp(`^${source.edition}~`))
    await page.reload()
    for (const viewport of [desktopContext.viewport, phone]) {
      await page.setViewportSize(viewport)
      await expect(selected).toContainText(source.name)
      await expect(selected.locator(`[data-rules-version="${source.edition}"]`)).toBeVisible()
      expect(new URL(page.url()).searchParams.get('s')).toBe(state)
      await expectNoPageOverflow(page)
      await page.screenshot({ path: test.info().outputPath(`reference-simulator-${source.edition}-${viewport.width}.png`), fullPage: true })
    }
    await page.setViewportSize(desktopContext.viewport)
    await chooseUnit(page, 'Defender', source.edition === 'custodes-11e' ? 'Adeptus Custodes' : 'Dark Angels', source.name)
    await expect(selected).toHaveAttribute('aria-busy', 'false')
    await expect(selected).toContainText(source.name)
    await expect(selected.locator(`[data-rules-version="${source.edition}"]`)).toHaveCount(0)
    expect(simulatorState(page)?.sides[1]?.catalogueId).not.toMatch(new RegExp(`^${source.edition}~`))
  }
})

async function custodesRoster(page: Page, archived?: string) {
  const dialog = await visitorSetup(page)
  await chooseFaction(dialog, 'Adeptus Custodes')
  await chooseDetachment(dialog, 'Aquilan Shield')
  await dialog.getByRole('button', { name: 'Create roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Same Custodes roster'), 'Same Custodes roster')
  if (archived) {
    // Retired versions are offered only when changing an existing roster.
    const conversion = await openRosterSetup(page)
    await chooseOption(page, 'Rules version', archived)
    await chooseDetachment(conversion, 'Shield Host')
    await confirmRosterSetup(conversion)
    await expect(conversion).not.toBeVisible()
  }
  return new URL(page.url()).pathname
}

async function chooseDetachment(dialog: Locator, detachment: string) {
  await expect(dialog.getByRole('button', { name: `Select ${detachment}`, exact: true, pressed: false })).toBeVisible()
  const unavailable = dialog.getByRole('button', { name: 'Remove unavailable', exact: true })
  if (await unavailable.isVisible()) await unavailable.click()
  await dialog.getByRole('button', { name: `Select ${detachment}`, exact: true, pressed: false }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
}

test('reference roster choices distinguish saved rules versions', async ({ page }) => {
  await signUp(page, 'Rules chooser')
  const current = await custodesRoster(page)
  const archived = await custodesRoster(page, 'MFM 1.5 · Archived')
  await page.goto('/factions/adeptus-custodes/rules/mfm-1-6/datasheets/allarus-custodians')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add to roster', exact: true }).click()
  const chooser = page.getByRole('dialog', { name: 'Add Allarus Custodians to a roster', exact: true })
  const archivedChoice = chooser.locator(`a[href^="${archived}?"]`)
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(chooser.getByRole('link')).toHaveCount(2)
    await expect(chooser.locator(`a[href^="${current}?"]`)).toContainText('MFM 1.6 · Current')
    await expect(archivedChoice).toContainText('MFM 1.5 · Archived')
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath(`reference-roster-chooser-${viewport.width}.png`), fullPage: true })
  }
  await page.setViewportSize(desktopContext.viewport)
  await chooser.locator(`a[href^="${current}?"]`).click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toBeVisible()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await page.reload()
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('180')
    await expect(page.locator('main header [data-rules-version]')).toHaveCount(0)
  }
})
