import { expect, type Page, test } from './test'
import { chooseRosterAction, signUp, uniqueName, waitForRosterSave } from './account'
import { expectNoHorizontalOverflow, shot } from './builder.harness'
import { productOperator, userIdFor } from './storage'

/** The seeded finished battle's Aeldari army, which this test fields again under its own players. */
const ARMY = 'Warhost 2K'

const playedArmy = (page: Page, player: string) => page.locator(`[data-played-army="${ARMY}"]`).filter({ hasText: `Played by ${player}` })

for (const [width, label] of [
  [390, 'phone'],
  [1440, 'desktop'],
] as const) {
  test(`a played army is found, copied, edited and simulated without changing its battle, and leaves when its player turns battles private (${label})`, async ({
    browser,
  }) => {
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
      await expectNoHorizontalOverflow(reader.locator('main'))
      await shot(card, `test-results/played-army-${label}.png`)

      await card.getByRole('link', { name: new RegExp(ARMY, 'i') }).click()
      await expect(reader).toHaveURL(new RegExp(`battle=${token}`))
      await expect(reader.locator('main')).toContainText(ARMY, { ignoreCase: true })
      await reader.goBack()

      await playedArmy(reader, playerName)
        .getByRole('button', { name: `Copy ${ARMY}` })
        .click()
      await reader.waitForURL((url) => /^\/rosters\/[^/]+$/.test(url.pathname))
      await expect(reader.getByLabel('List name')).toHaveValue(`Copy of ${ARMY}`)
      await waitForRosterSave(reader, () => reader.getByLabel('List name').fill('Borrowed Warhost'), 'Borrowed Warhost')
      if (width === 1440) {
        await chooseRosterAction(reader, 'Test targets')
        const simulator = reader.getByRole('dialog', { name: 'Test targets', exact: true })
        await expect(simulator.getByRole('combobox', { name: 'Attacking roster', exact: true })).toContainText('Current roster')
        await simulator.getByRole('button', { name: 'Run all matchups' }).click()
        await expect(simulator).toContainText(/(\d+) \/ \1 matchups · Complete/, { timeout: 120_000 })
        await shot(simulator, `test-results/played-army-simulate-${label}.png`)
        await simulator.getByRole('button', { name: 'Close', exact: true }).click()
      }
      expect(await operator.log(token)).toEqual(fielded)

      await operator.setBattleAudience(seated[0], 'private', Date.now())
      await reader.goto('/rosters?view=played')
      await expect(reader.getByRole('heading', { name: 'Played armies', exact: true })).toBeVisible()
      await expect(playedArmy(reader, playerName)).toHaveCount(0)
    } finally {
      await operator.deleteBattleForOperator(token)
    }
  })
}
