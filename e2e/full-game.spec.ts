import { expect, roundSummary, test } from './test'
import { playTurn, PHONE, scoreboard, twoPlayerBattle } from './account'
import { battleLog } from './storage'

test('two phones finish a five-round battle in step', async ({ browser }) => {
  test.setTimeout(300_000)
  const aliceContext = await browser.newContext({ viewport: PHONE })
  const bobContext = await browser.newContext({ viewport: PHONE })
  const alice = await aliceContext.newPage()
  // Bob's phone sums up each round; Alice's, like every other spec's, has already seen them.
  await bobContext.addInitScript(() => Object.assign(window, { showRoundSummaries: true }))
  const bob = await bobContext.newPage()
  const { aliceName, bobName } = await twoPlayerBattle(alice, bob)

  const playRound = async (round: number) => {
    await expect(scoreboard(alice).getByText(`${aliceName}’s turn`, { exact: true })).toBeVisible()
    await playTurn(alice)
    // Alice scoring Bob's last turn ends the round before, which Bob's phone then sums up.
    if (round > 1) {
      await expect(bob.getByRole('dialog', { name: `Round ${round - 1} complete` })).toBeVisible()
      await bob.getByRole('button', { name: `Continue to round ${round}` }).click()
      await expect(roundSummary(bob)).toBeHidden()
    }
    await expect(alice.locator('[data-side-score="0"] [data-line="done"]')).toHaveCount(round)
    await expect(alice.locator('[data-side-score="1"] [data-line="done"]')).toHaveCount(round - 1)
    await expect(scoreboard(bob).getByText(`${bobName}’s turn`, { exact: true })).toBeVisible()
    await playTurn(bob)
  }
  await playRound(1)
  await expect(alice.locator('[data-stat="round"]')).toHaveText('2')
  // Rounds 2 to 4 repeat round 1's prompts, so seed their turns and play the last round live.
  const log = await battleLog(alice)
  for (let turn = 0; turn < 6; turn += 1) {
    const by = turn % 2 ? log.second : log.first
    await log.append(by, { kind: 'settle-opponent-turn' })
    for (let phase = 0; phase < 6; phase += 1) await log.append(by, { kind: 'advance' })
  }
  await Promise.all([alice.reload(), bob.reload()])
  await expect(alice.locator('[data-stat="round"]')).toHaveText('5')
  // Only the latest round, not each one missed.
  await expect(bob.getByRole('dialog', { name: 'Round 3 complete' })).toBeVisible()
  await bob.getByRole('button', { name: 'Continue to round 4' }).click()
  await expect(roundSummary(bob)).toBeHidden()
  await playRound(5)
  // The last round ends the battle, so Bob's phone sums up the result instead.
  await expect(roundSummary(bob)).toHaveAttribute('data-round-summary', 'final')
  await bob.getByRole('button', { name: 'See the battle report' }).click()
  await expect(roundSummary(bob)).toBeHidden()

  // The scoreboard swaps the round for the outcome, and both phones read the same one.
  await expect(scoreboard(alice).getByRole('heading')).toContainText(/wins|win|Drawn/)
  await expect(scoreboard(bob).getByRole('heading')).toContainText(/wins|win|Drawn/)
  const outcome = await scoreboard(alice).getByRole('heading').textContent()
  await expect(scoreboard(bob).getByRole('heading')).toHaveText(outcome ?? '')
  // A finished battle opens as its replay for the players who sat at it.
  await expect(scoreboard(alice)).not.toContainText('Result')
  await expect(alice.getByRole('navigation', { name: 'Battle replay timeline' })).toBeVisible()
  await expect(alice.getByRole('button', { name: 'Battle options', includeHidden: true })).toHaveCount(0)
  await Promise.all([aliceContext.close(), bobContext.close()])
})
