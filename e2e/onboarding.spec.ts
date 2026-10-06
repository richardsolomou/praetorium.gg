import { expect, test, type Page } from '@playwright/test'
import {
  attachRoster,
  chooseBattlefield,
  chooseUnit,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  signUp,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
} from './account'

const prompt = (page: Page) => page.getByRole('note', { name: 'Getting started' })

async function launch(page: Page, task: string) {
  await page
    .getByRole('button', { name: /Account menu for/ })
    .filter({ visible: true })
    .click()
  await page.getByRole('menuitem', { name: /Getting started/ }).click()
  await page
    .getByRole('dialog', { name: 'Learn Praetorium' })
    .getByRole('button', { name: new RegExp(`^${task}`) })
    .click()
}

async function next(page: Page, title: string) {
  await expect(prompt(page).getByRole('heading', { name: title, exact: true })).toBeVisible()
  await prompt(page).getByRole('button', { name: 'Next', exact: true }).click()
}

async function army(page: Page) {
  const name = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/ })
  await page.getByLabel('Add a unit').fill('Captain')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Captain', exact: true }).click())
  await page.locator('[data-unit="Captain"]').click()
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Make Captain Warlord', exact: true }).click())
  return name
}

for (const width of [1440, 390]) {
  test(`the simulator guide completes and persists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signUp(page, uniqueName('Simulator Guide'))
    await launch(page, 'Compare units in combat')
    await expect(prompt(page)).toContainText('Choose an attacker')
    await chooseUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
    await expect(prompt(page)).toContainText('Choose a defender')
    await chooseUnit(page, 'Defender', 'Tyranids', 'Termagants')
    await next(page, 'Read the odds')
    await next(page, 'Compare weapons')
    await next(page, 'Find a stronger loadout')
    await next(page, 'Apply the rules in play')
    await next(page, 'Set the conditions')
    await expect(prompt(page)).toContainText('Reverse or share the matchup')
    const swap = page.getByRole('button', { name: 'Swap attacker and defender' })
    await expect(swap).toHaveAttribute('data-onboarding-active', 'true')
    await expect.poll(async () => (await swap.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(54)
    await page.screenshot({ path: `test-results/onboarding-simulator-${width}.png` })
    await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
    await expect(prompt(page)).toBeHidden()
    await page.reload()
    await page
      .getByRole('button', { name: /Account menu for/ })
      .filter({ visible: true })
      .click()
    await page.getByRole('menuitem', { name: /Getting started/ }).click()
    await expect(page.getByRole('button', { name: /^Compare units in combat/ })).toContainText('Complete')
    await page.getByRole('button', { name: /^Compare units in combat/ }).click()
    await expect(prompt(page)).toContainText('Read the odds')
  })

  test(`saved-list guidance handles variants and persists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUp(page, uniqueName('Army Tools Guide'))
    const name = await army(page)
    await page.goto('/rosters')
    await page.setViewportSize({ width, height: 900 })
    await launch(page, 'Import and manage armies')
    await next(page, 'Bring an existing army')
    await expect(prompt(page)).toContainText('Open a saved list')
    await page.locator('[data-onboarding="roster-open"]').filter({ hasText: name }).click()
    if (width === 1440) {
      await expect(prompt(page)).toContainText('Share, print, or make a variant')
      const original = page.url()
      await page.getByRole('button', { name: 'Roster actions', exact: true }).click()
      await page.getByRole('menuitem', { name: 'New variant', exact: true }).click()
      await expect(page).not.toHaveURL(original)
      await expect(page.getByRole('button', { name: 'Variant 2 of 2' })).toBeVisible()
    }
    await next(page, 'Share, print, or make a variant')
    if (width === 1440) await next(page, 'Compare your variants')
    await expect(prompt(page)).toContainText('Review rules and points changes')
    await expect(page).toHaveURL(/\/data-updates$/)
    await page.screenshot({ path: `test-results/onboarding-army-tools-${width}.png` })
    await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
    await expect(prompt(page)).toBeHidden()
    await page.reload()
    await page
      .getByRole('button', { name: /Account menu for/ })
      .filter({ visible: true })
      .click()
    await page.getByRole('menuitem', { name: /Getting started/ }).click()
    await expect(page.getByRole('button', { name: /^Import and manage armies/ })).toContainText('Complete')
  })

  test(`the practice battle guide follows setup into live play at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUp(page, uniqueName('Battle Guide'))
    const name = await army(page)
    await page.goto('/battles')
    await page.setViewportSize({ width, height: 900 })
    await launch(page, 'Start a battle')
    await createBattle(page, {
      practice: true,
      beforeCreate: async () => {
        await next(page, 'Table shape')
        await next(page, 'Fill every seat')
        await next(page, 'Check the sides')
        await expect(prompt(page)).toContainText('Start the battle')
      },
    })
    await expect(prompt(page)).toContainText('Find the table format')
    await expect(page.getByText('Determined by your rosters')).toBeVisible()
    await next(page, 'Find the table format')
    await attachRoster(page, name)
    await attachRoster(page, name, { forPlayer: PRACTICE_OPPONENT })
    const setupNext = page.locator('[data-setup-next]').getByRole('button', { name: 'Next', exact: true })
    await setupNext.click()
    await expect(prompt(page)).toContainText('Read your primary mission')
    await page.screenshot({ path: `test-results/onboarding-battle-mission-${width}.png` })
    await setupNext.click()
    await expect(prompt(page)).toContainText('Set the battlefield')
    await chooseBattlefield(page)
    await setupNext.click()
    await expect(prompt(page)).toContainText('Record the defender')
    await page.getByRole('group', { name: 'Defender', exact: true }).getByRole('button').first().click()
    await setupNext.click()
    await expect(prompt(page)).toContainText('Choose secondary missions')
    await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
    await setupNext.click()
    await expect(prompt(page)).toContainText('Set reserves and transports')
    await setupNext.click()
    await expect(prompt(page)).toContainText('Deploy the armies')
    await setupNext.click()
    await expect(prompt(page)).toContainText('Record the first turn')
    await page.getByRole('group', { name: 'First turn', exact: true }).getByRole('button').first().click()
    await setupNext.click()
    await expect(prompt(page)).toContainText('Resolve pre-battle rules')
    await page.getByRole('button', { name: 'Start battle', exact: true }).click()
    await takeTheTurn(page)
    await next(page, 'Follow the score')
    await next(page, 'Advance phases and undo')
    await expect(page.locator('[data-onboarding="battle-live-side"]')).toBeVisible()
    await next(page, 'Use your army and mission controls')
    await expect(page.locator('[data-onboarding="battle-live-report"]')).toBeVisible()
    await expect(prompt(page)).toContainText('Read the battle back')
    await page.screenshot({ path: `test-results/onboarding-battle-${width}.png` })
    await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
    await expect(prompt(page)).toBeHidden()
  })
}

test('the first-army guide explains Warlords, leader attachments, and reminders', async ({ page }) => {
  await signUp(page, uniqueName('First Army Guide'))
  await launch(page, 'Build your first army')
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await expect(prompt(page)).toContainText('Choose the army')
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Space Marines')
  await page.getByRole('option', { name: 'Space Marines', exact: true }).click()
  await expect(prompt(page)).toContainText('Set the battle size')
  await dialog.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Onslaught/ }).click()
  await expect(prompt(page)).toContainText('Pick a detachment')
  await dialog.getByRole('button', { name: /^Select Gladius Task Force$/ }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
  await expect(prompt(page)).toContainText('Name it, or leave it')
  await page.screenshot({ path: 'test-results/onboarding-roster-setup.png' })
  await next(page, 'Name it, or leave it')
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await next(page, 'The unit picker')
  await page.getByLabel('Add a unit').fill('Captain')
  await next(page, 'Find a unit fast')
  await next(page, 'Read a row first')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Captain', exact: true }).click())
  await page.getByLabel('Add a unit').fill('Intercessor Squad')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Intercessor Squad', exact: true }).click())
  await next(page, 'Your list')
  await expect(prompt(page)).toContainText('Points and legality')
  await page.locator('[data-unit="Captain"]').click()
  await next(page, 'Shape the unit')
  for (const [title, target] of [
    ['How many models', 'unit-models'],
    ['Wargear options', 'loadout-wargear'],
    ['One weapon at a time', 'loadout-weapon'],
    ['Enhancements', 'loadout-enhancement'],
  ] as const) {
    if (await page.locator(`[data-onboarding="${target}"]`).first().isVisible()) await next(page, title)
  }
  await next(page, 'Choose your Warlord')
  await expect(page.getByRole('button', { name: 'Attach Captain to unit' })).toHaveAttribute('data-onboarding-active', 'true')
  await next(page, 'Attach a leader')
  await expect(page.locator('[data-onboarding="unit-reminder"][data-onboarding-active="true"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/onboarding-first-army.png' })
  await next(page, 'Remember an ability')
  await expect(prompt(page)).toContainText('What the unit costs')
  await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
  await expect(prompt(page)).toBeHidden()
})
