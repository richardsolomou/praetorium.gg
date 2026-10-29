import { expect, test, type Page } from './test'
import {
  createBattle,
  PRACTICE_OPPONENT,
  retryUntilVisible,
  savedArmy,
  setupStep,
  chooseRosterAction,
  chooseOption,
  PHONE,
} from './account'
import type { SpacetimeOperator } from '../src/server/spacetimeOperator'

/** A practice battle at 2,000 points, opened straight in the product, and its token. */
async function strikeForceBattle(operator: SpacetimeOperator, userId: string, prefix: string) {
  const token = `${prefix}-${crypto.randomUUID()}`
  await operator.createBattle({
    id: token,
    token,
    userId,
    opponentIds: (await operator.practiceOpponentIds()).slice(0, 1),
    now: Date.now(),
    initialCommands: [
      { kind: 'configure-battle', limit: 2000, missionPackId: null, terrainLayoutId: null, twistId: null, clockLimitMinutes: null },
    ],
  })
  return token
}

const openChooser = async (page: Page) => {
  await setupStep(page, 'Armies')
  const chooser = page.getByRole('dialog', { name: 'Choose your roster' })
  await retryUntilVisible(chooser, () =>
    page
      .getByRole('button', { name: /^(Choose|Change) roster/ })
      .first()
      .click(),
  )
  return chooser
}

test('a roster chooser with no list for the battle size hands over to the battle size control', async ({ page }) => {
  const name = 'Incursion army'
  const { userId, operator } = await savedArmy(page, 'Roster chooser', { name, limit: 1000, pointsBudget: null })
  const token = await strikeForceBattle(operator, userId, 'chooser-size')
  await page.goto(`/battles/${token}`)

  const chooser = await openChooser(page)
  await expect(chooser).toContainText('is built for 2,000 points')
  await chooser.getByRole('button', { name: 'Choose a different battle size' }).click()
  await expect(chooser).toBeHidden()
  const size = page.getByRole('combobox', { name: 'Battle size' })
  await expect(size).toBeFocused()

  await chooseOption(page, 'Battle size', /Incursion/)
  await expect(size).toContainText('Incursion')
  const again = await openChooser(page)
  await expect(again.locator(`[data-roster="${name}"]`)).toBeVisible()
})

test('choosing a roster the library reports over its limit names the problem and links to editing it instead of attaching', async ({
  page,
}) => {
  const name = 'Overspent army'
  const { id } = await savedArmy(page, 'Roster chooser', { name, limit: 2000, pointsBudget: 500 })
  await createBattle(page, { practice: true })

  const chooser = await openChooser(page)
  const row = chooser.locator(`[data-roster="${name}"]`)
  await expect(row).toContainText('Over limit')
  await row.click()
  const refusal = page.getByRole('alertdialog', { name: 'This list is over its points limit' })
  await expect(refusal).toContainText(`${name} costs more than its 500-point limit.`)
  await expect(refusal).not.toContainText('fix roster errors')

  await refusal.getByRole('button', { name: 'Choose another' }).click()
  await expect(refusal).toBeHidden()
  await expect(chooser).toBeVisible()
  await expect(chooser.getByText('fix roster errors')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Armies' }).locator('article').first()).toContainText('No army chosen')

  await (await openChooser(page)).locator(`[data-roster="${name}"]`).click()
  await refusal.getByRole('link', { name: 'Edit roster' }).click()
  await expect(page).toHaveURL(new RegExp(`/rosters/${id}$`))
})

test('a battle started from a saved roster opens with that roster on the player’s seat', async ({ page }) => {
  const name = 'Roster-first army'
  const { id } = await savedArmy(page, 'Battle from roster', { name })
  await page.goto(`/rosters/${id}`)
  await page.waitForLoadState('networkidle')
  const dialog = page.getByRole('dialog', { name: 'Start a battle' })
  await retryUntilVisible(dialog, async () => {
    await chooseRosterAction(page, 'Start a battle')
  })
  await chooseOption(page, 'Opponent', PRACTICE_OPPONENT)
  await dialog.getByRole('button', { name: 'Start battle' }).click()
  await page.waitForURL(/\/battles\/[^/]+$/)

  await setupStep(page, 'Armies')
  const seat = page
    .getByRole('region', { name: 'Armies' })
    .locator('article')
    .filter({ has: page.getByRole('button', { name: /^Change roster/ }) })
  await expect(seat.getByText(name, { exact: true })).toBeVisible()
})

/** Opens a battle on a phone, one history entry after another page, with one saved list for the battle size. */
const phoneBattle = async (page: Page, name: string, pointsBudget: number | null = null) => {
  await page.setViewportSize(PHONE)
  const { userId, operator } = await savedArmy(page, 'Roster chooser back', { name, limit: 2000, pointsBudget })
  const token = await strikeForceBattle(operator, userId, 'chooser-back')
  await page.goto('/support')
  await page.goto(`/battles/${token}`)
  return new RegExp(`/battles/${token}$`)
}

test('going back on a phone closes the roster chooser and stays on the battle', async ({ page }) => {
  const name = 'Back gesture army'
  const battle = await phoneBattle(page, name)

  await openChooser(page)
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Choose your roster' })).toBeHidden()
  await expect(page).toHaveURL(battle)

  await (await openChooser(page)).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'Choose your roster' })).toBeHidden()
  await expect(page).toHaveURL(battle)

  const seat = page.getByRole('region', { name: 'Armies' }).locator('article').first()
  await (await openChooser(page)).locator(`[data-roster="${name}"]`).click()
  await setupStep(page, 'Armies')
  await expect(seat.getByText(name, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(battle)

  await page.goBack()
  await expect(page).toHaveURL(/\/support$/)
})

test('going back on a phone from a roster’s confirmation closes it with the chooser', async ({ page }) => {
  const name = 'Back from refusal army'
  const battle = await phoneBattle(page, name, 500)

  const row = (await openChooser(page)).locator(`[data-roster="${name}"]`)
  await expect(row).toContainText('Over limit')
  await row.click()
  const refusal = page.getByRole('alertdialog', { name: 'This list is over its points limit' })
  await expect(refusal).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(battle)
  await expect(page.getByRole('dialog', { name: 'Choose your roster' })).toBeHidden()
  await expect(refusal).toBeHidden()
})

test('closing a roster chooser restored by a reload leaves no history entry behind', async ({ page }) => {
  const battle = await phoneBattle(page, 'Reloaded chooser army')

  await openChooser(page)
  await page.reload()
  const chooser = page.getByRole('dialog', { name: 'Choose your roster' })
  // A press before hydration does nothing, so close until the chooser goes.
  await expect(async () => {
    await chooser.getByRole('button', { name: 'Close' }).click()
    await expect(chooser).toBeHidden({ timeout: 1000 })
  }).toPass()
  await expect(page).toHaveURL(battle)

  await page.goBack()
  await expect(page).toHaveURL(/\/support$/)
})
