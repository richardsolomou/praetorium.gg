import { expect, test, type Locator, type Page } from '@playwright/test'
import { chooseUnit, confirmRosterSetup, retryUntilVisible, signUp, waitForRosterSave } from './account'
import { decodeSimulatorState } from '../src/contracts/simulatorState'

const desktop = { width: 1440, height: 900 }
const phone = { width: 390, height: 900 }

test('faction search explains structured matches', async ({ page }) => {
  await page.setViewportSize(desktop)
  await page.goto('/factions/necrons/datasheets')
  const search = page.getByRole('textbox', { name: 'Find a datasheet' })
  const technomancer = page.locator('[data-datasheet="Technomancer"]')

  await retryUntilVisible(technomancer.getByText('Matches Cryptek keyword · Staff of light weapon'), async () => {
    await search.fill('')
    await search.fill('cryptek staff')
  })
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(technomancer).toContainText('Matches Cryptek keyword · Staff of light weapon')
    await expect(technomancer.locator('mark')).toHaveText(['Cryptek', 'Staff'])
    await page.screenshot({ path: `test-results/reference-search-${viewport.width}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }

  for (const viewport of [phone, desktop]) {
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
  for (const viewport of [desktop, phone]) {
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
    for (const viewport of [desktop, phone]) {
      await page.setViewportSize(viewport)
      await expect(selected).toContainText(source.name)
      await expect(selected.locator(`[data-rules-version="${source.edition}"]`)).toBeVisible()
      expect(new URL(page.url()).searchParams.get('s')).toBe(state)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/reference-simulator-${source.edition}-${viewport.width}.png`, fullPage: true })
    }
    await page.setViewportSize(desktop)
    await chooseUnit(page, 'Defender', source.edition === 'custodes-11e' ? 'Adeptus Custodes' : 'Dark Angels', source.name)
    await expect(selected).toHaveAttribute('aria-busy', 'false')
    await expect(selected).toContainText(source.name)
    await expect(selected.locator(`[data-rules-version="${source.edition}"]`)).toHaveCount(0)
    expect(decodeSimulatorState(new URL(page.url()).searchParams.get('s') ?? undefined)?.sides[1]?.catalogueId).not.toMatch(
      new RegExp(`^${source.edition}~`),
    )
  }
})

async function custodesRoster(page: Page, archived?: string) {
  await page.goto('/rosters')
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'Create roster', exact: true }).click())
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Adeptus Custodes')
  await page.getByRole('option', { name: 'Adeptus Custodes', exact: true }).click()
  await chooseDetachment(dialog, 'Aquilan Shield')
  await dialog.getByRole('button', { name: 'Create roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Same Custodes roster'), 'Same Custodes roster')
  if (archived) {
    // Retired versions are offered only when converting an existing roster.
    await page.getByRole('button', { name: 'Roster actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Convert rules version', exact: true }).click()
    const conversion = page.getByRole('dialog', { name: 'Convert rules version' })
    await conversion.getByRole('combobox', { name: 'Rules version' }).click()
    await page.getByRole('option', { name: archived, exact: true }).click()
    await chooseDetachment(conversion, 'Aquilan Shield')
    await confirmRosterSetup(conversion)
    await expect(conversion).not.toBeVisible()
  }
  return new URL(page.url()).pathname
}

async function chooseDetachment(dialog: Locator, detachment: string) {
  await dialog.getByRole('button', { name: `Select ${detachment}`, exact: true }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
}

test('reference roster choices distinguish saved rules versions', async ({ page }) => {
  await signUp(page, 'Rules chooser')
  const current = await custodesRoster(page)
  const archived = await custodesRoster(page, 'Custodes codex · 17 Oct 2026 · Archived')
  await page.goto('/factions/adeptus-custodes/rules/custodes-codex-2026-10-17/datasheets/allarus-custodians')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add to', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Add Allarus Custodians to', exact: true })
    .getByRole('button', { name: 'Roster…', exact: true })
    .click()
  const chooser = page.getByRole('dialog', { name: 'Add Allarus Custodians to a roster', exact: true })
  const archivedChoice = chooser.locator(`a[href^="${archived}?"]`)
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(chooser.getByRole('link')).toHaveCount(2)
    await expect(chooser.locator(`a[href^="${current}?"]`)).toContainText('MFM 1.6 · Current')
    await expect(archivedChoice).toContainText('Custodes codex · 17 Oct 2026 · Archived')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/reference-roster-chooser-${viewport.width}.png`, fullPage: true })
  }
  await page.setViewportSize(desktop)
  await archivedChoice.click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toBeVisible()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await page.reload()
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('[data-unit="Allarus Custodians"]')).toContainText('180')
    await expect(page.locator('[data-rules-version="custodes-11e"]')).toBeVisible()
  }
})
