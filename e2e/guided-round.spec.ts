import { waitForOfflineApp } from './offline'
import { expect, test } from './test'
import { advance, advanceButton, createRoster, desktopContext, setupBattle, signUp, takeTheTurn, uniqueName, playerPanel } from './account'
import { battleCommands, battleLog, lastPathSegment, battleIdFor } from './storage'
import type { Command } from '../src/core/battle'

/** The battle's logged command bodies, in log order. */
async function loggedCommands(battleId: string) {
  return (await battleCommands(battleId)).map(({ body }) => body)
}

const isFinalSettlement = (command: Command): command is Extract<Command, { kind: 'score-settlement' }> =>
  command.kind === 'score-settlement' && command.scores.some((score) => score.category === 'primary' && score.final)

test('New Orders, discard CP and carried cards survive a complete two-player round', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const opponent = await (await browser.newContext(desktopContext)).newPage()
  const name = uniqueName('Round opponent')
  await signUp(opponent, name)
  const theirs = await createRoster(opponent, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Second army' })
  await signUp(page, uniqueName('Round host'))
  const ours = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'First army' })
  await setupBattle(page, opponent, { opponent: name, hostRoster: ours, guestRoster: theirs, openingSecondaries: ['Cleanse', 'Plunder'] })
  const side = playerPanel(page, 0)
  await side.getByRole('button', { name: 'Use New Orders', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'New Orders', exact: true })
    .getByRole('button', { name: 'Discard Cleanse and draw a replacement', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: 'Your secondary missions', exact: true })).toBeVisible()
  await takeTheTurn(page)
  const commands = await loggedCommands(await battleIdFor(lastPathSegment(page.url())))
  expect(commands.findLast((command) => command.kind === 'set-battlefield')?.terrainLayoutId).toBe('ed87b70c-bb09-49c7-bf06-54ca47956dcd')
  const orders = commands.filter((command) => command.kind === 'use-new-orders')
  expect(orders).toHaveLength(1)
  test.info().annotations.push({ type: 'New Orders replacement', description: orders[0]!.secondary.name })
  await test.info().attach('New Orders replacement', {
    body: Buffer.from(JSON.stringify({ name: orders[0]!.secondary.name })),
    contentType: 'application/json',
  })
  const target = opponent.getByRole('dialog', { name: 'A Tempting Target · choices', exact: true })
  const guards = page.getByRole('dialog', { name: 'Burden Of Trust · choices', exact: true })
  if ((await side.getByRole('button', { name: 'Read A Tempting Target', exact: true, includeHidden: true }).count()) > 0) {
    await expect(target).toBeVisible()
    test.info().annotations.push({ type: 'Replacement nomination', description: 'Opponent chose the centre objective at the table.' })
    await target
      .getByRole('group', { name: 'Tempting target objective', exact: true })
      .getByRole('button', { name: 'Centre', exact: true })
      .click()
    await target.getByRole('button', { name: 'Record choice', exact: true }).click()
    await expect(target).toBeHidden()
  } else if ((await side.getByRole('button', { name: 'Read Burden Of Trust', exact: true, includeHidden: true }).count()) > 0) {
    await expect(guards).toBeVisible()
    test.info().annotations.push({ type: 'Replacement nomination', description: 'Burden Of Trust: no optional guards.' })
    await guards.getByRole('button', { name: 'Record choice', exact: true }).click()
    await expect(guards).toBeHidden()
  }
  await expect(advanceButton(page)).toBeEnabled()
  await expect(side.getByRole('button', { name: 'Use New Orders', exact: true })).toBeDisabled()
  await page.reload()
  await expect(side.getByRole('button', { name: 'Use New Orders', exact: true })).toBeDisabled()
  await expect(side.locator('[data-stat="cp"]')).toHaveText('0')
  for (let phase = 0; phase < 5; phase += 1) await advance(page)
  await page.getByRole('button', { name: 'Pass the turn', exact: true }).click()
  const scoring = page.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await scoring.getByRole('button', { name: 'Pass the turn', exact: true }).click()
  const discard = page.getByRole('dialog', { name: 'Discard tactical secondaries?' })
  const replacement = discard.locator('button[aria-pressed]').filter({ hasNotText: 'Plunder' }).first()
  await replacement.click()
  await discard.getByRole('button', { name: 'Discard 1 and gain 1 CP' }).click()
  await expect(side.locator('button[aria-label="Additional CP already gained this round"]')).toBeDisabled()
  await takeTheTurn(opponent)
  for (let phase = 0; phase < 6; phase += 1) await advance(opponent)
  await expect(page.locator('[data-scoreboard]')).toContainText('Round 2 of 5')
  await expect(page.getByRole('dialog', { name: 'Your secondary missions', exact: true })).toBeVisible()
  await takeTheTurn(page)
  await expect(side.locator('[data-secondary]')).toHaveCount(3)
  await expect(side.locator('[data-secondary]').filter({ hasText: 'Plunder' })).toBeVisible()
  await expect(side.getByRole('button', { name: 'Use New Orders', exact: true })).toHaveAttribute(
    'title',
    'New Orders has been used this battle',
  )
  await opponent.reload()
  await expect(opponent.locator('[data-scoreboard]')).toContainText('Round 2 of 5')
  await expect(playerPanel(opponent, 0).getByRole('button', { name: 'Read Plunder', exact: true })).toBeVisible()
})

test('both sides settle source final awards beyond round caps through cold offline resume', async ({
  page: initialPage,
  context,
  browser,
}) => {
  test.setTimeout(180_000)
  let page = initialPage
  const opponent = await (await browser.newContext(desktopContext)).newPage()
  const name = uniqueName('Final opponent')
  await signUp(opponent, name)
  const theirs = await createRoster(opponent, { faction: 'Death Guard', detachment: /Flyblown Host/, name: 'Second final army' })
  await signUp(page, uniqueName('Final host'))
  const ours = await createRoster(page, { faction: 'Death Guard', detachment: /Flyblown Host/, name: 'First final army' })
  await setupBattle(page, opponent, { opponent: name, hostRoster: ours, guestRoster: theirs })
  const { append, first, second, id: battleId } = await battleLog(page)
  for (let phase = 0; phase < 48; phase += 1) {
    const playerId = Math.floor(phase / 6) % 2 ? second : first
    if (phase > 0 && phase % 6 === 0) await append(playerId, { kind: 'settle-opponent-turn' })
    await append(playerId, { kind: 'advance' })
  }
  await append(first, { kind: 'settle-opponent-turn' })
  await append(first, { kind: 'score', category: 'primary', delta: 15 })
  for (let phase = 0; phase < 6; phase += 1) await append(first, { kind: 'advance' })
  await append(second, { kind: 'settle-opponent-turn' })
  await append(second, { kind: 'score', category: 'primary', delta: 15 })
  for (let phase = 0; phase < 5; phase += 1) await append(second, { kind: 'advance' })
  await page.reload()
  await page.getByRole('button', { name: 'Pass the turn', exact: true }).click()
  const finalTurn = page.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(finalTurn).toContainText('Final awards: 0 VP')
  const primary = finalTurn.locator('[data-due="662be231-e658-4007-9e78-406749ebc71a"]')
  await expect(primary.getByText('End of battle', { exact: true })).toHaveCount(2)
  await primary.getByRole('button', { name: 'Gather Intel plus 4', exact: true }).click()
  await primary
    .getByRole('button', { name: /plus 5$/ })
    .first()
    .click()
  await primary
    .getByRole('button', { name: /plus 5$/ })
    .nth(1)
    .click()
  await expect(finalTurn.locator('output').filter({ hasText: 'VP' })).toContainText('Scoring 10 VP')
  await expect(finalTurn).toContainText('Primary mission 15/15 this round')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect
      .poll(() =>
        finalTurn.evaluate((element) => {
          const box = element.getBoundingClientRect()
          return box.left >= 0 && box.right <= innerWidth && (innerWidth > 859 || (box.top === 0 && box.bottom <= innerHeight - 64))
        }),
      )
      .toBe(true)
  }
  await page.reload()
  await expect(finalTurn.locator('output').filter({ hasText: 'VP' })).toContainText('Scoring 0 VP')
  await primary.getByRole('button', { name: 'Gather Intel plus 4', exact: true }).click()
  await primary
    .getByRole('button', { name: /plus 5$/ })
    .first()
    .click()
  await primary
    .getByRole('button', { name: /plus 5$/ })
    .nth(1)
    .click()
  await expect(finalTurn.locator('output').filter({ hasText: 'VP' })).toContainText('Scoring 10 VP')
  await waitForOfflineApp(page)
  const url = page.url()
  await context.setOffline(true)
  await finalTurn.getByRole('button', { name: 'Pass the turn', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /^Scoring end of battle points/ })).toBeVisible()
  await page.close()
  page = await context.newPage()
  await page.goto(url)
  const firstFinal = page.getByRole('dialog', { name: /^Scoring end of battle points/ })
  await expect(firstFinal).toBeVisible()
  await expect(page.locator('[data-scoreboard]')).not.toContainText('wins')
  await firstFinal
    .getByRole('button', { name: /plus 5$/ })
    .first()
    .click()
  await firstFinal
    .getByRole('button', { name: /plus 5$/ })
    .nth(1)
    .click()
  await expect(firstFinal.locator('output').filter({ hasText: 'VP' })).toContainText('Scoring 10 VP')
  await firstFinal.getByRole('button', { name: 'Finish battle', exact: true }).click()
  await expect(page.locator('[data-scoreboard] h1')).toHaveText('Drawn at 35')
  expect((await loggedCommands(battleId)).filter(isFinalSettlement)).toHaveLength(0)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await loggedCommands(battleId)).filter(isFinalSettlement).length, { timeout: 30_000 }).toBe(2)
  await opponent.reload()
  await expect(opponent.locator('[data-scoreboard] h1')).toHaveText('Drawn at 35')
  expect(
    (await loggedCommands(battleId))
      .filter(isFinalSettlement)
      .map((command) => ({ playerId: command.playerId, round: command.round, scores: command.scores })),
  ).toEqual([
    { playerId: second, round: 5, scores: [{ category: 'primary', delta: 10, final: { claims: [0, 0, 0, 0, 1, 1], delta: 10 } }] },
    { playerId: first, round: 5, scores: [{ category: 'primary', delta: 10, final: { claims: [0, 0, 0, 0, 1, 1], delta: 10 } }] },
  ])
})
