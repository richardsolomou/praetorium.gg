import { expect, type Locator, type Page } from '@playwright/test'
import { chooseUnit } from './account'

export async function openCombatControls(scope: Page | Locator) {
  await closeCombatBreakdown(scope)
  for (const selector of ['[data-manual-modifiers]', '[data-combat-buffs]']) {
    for (const details of await scope.locator(selector).all()) {
      if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click()
    }
  }
}

export async function openCombatBreakdown(scope: Page | Locator) {
  const details = scope.locator('[data-results-summary] details')
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click()
}

export async function chooseCombatUnit(page: Page, side: string, faction: string, name: string) {
  await chooseUnit(page, side, faction, name)
  await expect(page.getByRole('region', { name: side, exact: true }).getByRole('button', { name: 'Loadout', exact: true })).toBeEnabled()
  await openCombatControls(page)
}

export async function closeCombatBreakdown(scope: Page | Locator) {
  const details = scope.locator('[data-results-summary] details')
  if (await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator('summary').click()
}
