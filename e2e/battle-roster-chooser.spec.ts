import { expect, test, type Page } from './test'
import { createBattle, setupStep, signUp, uniqueName } from './account'
import { productOperator, withAuthSql } from './storage'

/** Signs up and saves the preview Necrons list under a new name, with the size and budget asked for. */
async function savedArmy(page: Page, name: string, { limit, pointsBudget }: { limit: number; pointsBudget?: number }) {
  const account = await signUp(page, uniqueName('Roster chooser'))
  const operator = await productOperator()
  const source = (await operator.roster('preview-necrons-cursed-skyshroud'))!
  const user = (await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ?').get(account.email))) as {
    id: string
  }
  const id = crypto.randomUUID()
  await operator.saveRoster({
    ...source,
    id,
    userId: user.id,
    name,
    automaticName: false,
    visibility: 'private',
    limit,
    pointsBudget: pointsBudget ?? null,
    now: Date.now(),
  })
  return { id, userId: user.id, operator }
}

const openChooser = async (page: Page) => {
  await setupStep(page, 'Armies')
  await page
    .getByRole('button', { name: /^(Choose|Change) roster/ })
    .first()
    .click()
  return page.getByRole('dialog', { name: 'Choose your roster' })
}

test('a roster chooser with no list for the battle size hands over to the battle size control', async ({ page }) => {
  const name = 'Incursion army'
  const { userId, operator } = await savedArmy(page, name, { limit: 1000 })
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
  await expect(chooser).toContainText('is built for 2000 points')
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
  const { id } = await savedArmy(page, name, { limit: 2000, pointsBudget: 500 })
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
  await refusal.getByText('Edit roster').click()
  await expect(page).toHaveURL(new RegExp(`/rosters/${id}$`))
})
