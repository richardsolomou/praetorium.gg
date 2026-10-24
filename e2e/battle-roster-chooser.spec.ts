import { expect, test, type Page } from './test'
import { createBattle, PRACTICE_OPPONENT, retryUntilVisible, savedArmy, setupStep } from './account'

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
  const token = `chooser-size-${crypto.randomUUID()}`
  await operator.createBattle({
    id: token,
    token,
    userId,
    opponentIds: (await operator.practiceOpponentIds()).slice(0, 1),
    now: Date.now(),
    initialCommand: {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      clockLimitMinutes: null,
    },
  })
  await page.goto(`/battles/${token}`)

  const chooser = await openChooser(page)
  await expect(chooser).toContainText('is built for 2,000 points')
  await chooser.getByRole('button', { name: 'Choose a different battle size' }).click()
  await expect(chooser).toBeHidden()
  const size = page.getByRole('combobox', { name: 'Battle size' })
  await expect(size).toBeFocused()

  await size.click()
  await page.getByRole('option', { name: /Incursion/ }).click()
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
    await page.getByRole('button', { name: 'Roster actions' }).click()
    await page.getByRole('menuitem', { name: 'Start a battle' }).click()
  })
  await dialog.getByRole('combobox', { name: 'Opponent' }).click()
  await page.getByRole('option', { name: PRACTICE_OPPONENT, exact: true }).click()
  await dialog.getByRole('button', { name: 'Start battle' }).click()
  await page.waitForURL(/\/battles\/[^/]+$/)

  await setupStep(page, 'Armies')
  const seat = page
    .getByRole('region', { name: 'Armies' })
    .locator('article')
    .filter({ has: page.getByRole('button', { name: /^Change roster/ }) })
  await expect(seat.getByText(name, { exact: true })).toBeVisible()
})

test('going back on a phone closes the roster chooser and stays on the battle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const name = 'Back gesture army'
  const { userId, operator } = await savedArmy(page, 'Roster chooser back', { name, limit: 2000, pointsBudget: null })
  const token = `chooser-back-${crypto.randomUUID()}`
  await operator.createBattle({
    id: token,
    token,
    userId,
    opponentIds: (await operator.practiceOpponentIds()).slice(0, 1),
    now: Date.now(),
    initialCommand: {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      clockLimitMinutes: null,
    },
  })
  await page.goto('/support')
  await page.goto(`/battles/${token}`)
  const battle = new RegExp(`/battles/${token}$`)

  await openChooser(page)
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Choose your roster' })).toBeHidden()
  await expect(page).toHaveURL(battle)

  await (await openChooser(page)).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'Choose your roster' })).toBeHidden()
  await expect(page).toHaveURL(battle)

  const seat = page.getByRole('region', { name: 'Armies' }).locator('article').first()
  await (await openChooser(page)).locator(`[data-roster="${name}"]`).click()
  await expect(seat.getByText(name, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(battle)

  await page.goBack()
  await expect(page).toHaveURL(/\/support$/)
})
