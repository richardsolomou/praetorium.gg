import { expect, type Page, test } from './test'
import { chooseRosterAction, retryUntilVisible, signUp, uniqueName, waitForRosterSave } from './account'
import { expectNoHorizontalOverflow, shot } from './builder.harness'
import { productOperator, userIdFor, guestDraft } from './storage'

/** The seeded finished battle's Aeldari army, which this test fields again under its own players. */
const ARMY = 'Warhost 2K'

const playedArmy = (page: Page, player: string) => page.locator(`[data-played-army="${ARMY}"]`).filter({ hasText: `By ${player}` })

for (const [width, label] of [
  [390, 'phone'],
  [1440, 'desktop'],
] as const) {
  test(`a played army is found, copied, edited and simulated without changing its battle (${label})`, async ({ browser }) => {
    test.setTimeout(180_000)
    const viewport = { width, height: width === 390 ? 844 : 900 }
    const operator = await productOperator()
    const playerName = uniqueName('Veteran')
    const seated = await Promise.all(
      [playerName, uniqueName('Rival')].map(async (name) => {
        const page = await (await browser.newContext({ viewport })).newPage()
        return userIdFor((await signUp(page, name)).email)
      }),
    )
    const seeded = (await operator.battleByToken('preview-public-finished'))!
    let commands = JSON.stringify(seeded.log.map((entry) => entry.command))
    seeded.seats.forEach((seat, index) => (commands = commands.replaceAll(seat.id, seated[index])))
    const token = `played-${crypto.randomUUID()}`
    await operator.createBattle({
      id: token,
      token,
      userId: seated[0],
      opponentIds: [seated[1]],
      initialCommands: JSON.parse(commands),
      now: Date.now(),
    })
    const fielded = await operator.log(token)

    try {
      const reader = await (await browser.newContext({ viewport })).newPage()
      await signUp(reader, uniqueName('Scout'))
      await reader.goto('/rosters')
      await reader.getByRole('navigation', { name: 'Rosters' }).getByRole('link', { name: 'Played', exact: true }).click()
      await expect(reader).toHaveURL(/\/rosters\?view=played$/)
      const card = playedArmy(reader, playerName)
      await expect(card).toContainText('Legal')
      await expect(card).toContainText('played')
      const outcome = card.locator('[data-played-outcome]')
      await expect(outcome.locator('.chip')).toHaveText('Won')
      await expect(outcome).toContainText('Conceded')
      await expect(outcome).toContainText('Orks')
      await expectNoHorizontalOverflow(reader.locator('main'))
      await shot(card, test.info().outputPath(`played-army-${label}.png`))

      await outcome.getByRole('link', { name: 'Open battle' }).click()
      await expect(reader).toHaveURL(new RegExp(`/battles/${token}$`))
      await reader.goBack()

      await card.getByRole('link', { name: new RegExp(ARMY, 'i') }).click()
      await expect(reader).toHaveURL(new RegExp(`battle=${token}`))
      await expect(reader.getByLabel('List name')).toHaveValue(ARMY)
      await expect(reader.getByLabel('List name')).not.toBeEditable()
      await reader.goBack()

      await playedArmy(reader, playerName)
        .getByRole('button', { name: `Duplicate ${ARMY}` })
        .click()
      await reader.waitForURL((url) => /^\/rosters\/[^/]+$/.test(url.pathname))
      await expect(reader.getByLabel('List name')).toHaveValue(`Copy of ${ARMY}`)
      await waitForRosterSave(reader, () => reader.getByLabel('List name').fill('Borrowed Warhost'), 'Borrowed Warhost')
      if (width === 1440) {
        await chooseRosterAction(reader, 'Test targets')
        const simulator = reader.getByRole('dialog', { name: 'Test targets', exact: true })
        await expect(simulator.getByRole('group', { name: 'Attacking with', exact: true })).toContainText('Current roster')
        await expect(simulator).toContainText(/(\d+) \/ \1 matchups · Complete/, { timeout: 120_000 })
        await shot(simulator, test.info().outputPath(`played-army-simulate-${label}.png`))
        await simulator.getByRole('button', { name: 'Close', exact: true }).click()
      }
      expect(await operator.log(token)).toEqual(fielded)
    } finally {
      await operator.deleteBattleForOperator(token)
    }
  })
}

test('a visitor copies a played army as the one roster their device keeps, and is asked to sign up for another', async ({ page }) => {
  await page.goto('/rosters?view=played')
  const card = page.locator(`[data-played-army="${ARMY}"]`).first()
  await retryUntilVisible(card, () => page.getByRole('button', { name: 'Show more armies' }).click({ timeout: 1_000 }))
  await card.getByRole('button', { name: `Duplicate ${ARMY}` }).click()
  await page.waitForURL((url) => /^\/rosters\/[^/]+$/.test(url.pathname))
  await expect(page.getByLabel('List name')).toHaveValue(`Copy of ${ARMY}`)
  await expect.poll(() => guestDraft(page)).toContain(`Copy of ${ARMY}`)

  await page.goto('/rosters?view=played')
  await retryUntilVisible(card, () => page.getByRole('button', { name: 'Show more armies' }).click({ timeout: 1_000 }))
  await card.getByRole('button', { name: `Duplicate ${ARMY}` }).click()
  await expect(page.getByRole('dialog', { name: 'Keep more than one roster' })).toBeVisible()
})
