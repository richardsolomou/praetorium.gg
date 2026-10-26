import { expect, test } from './test'
import { createRoster, setupBattle, signUp, uniqueName, playTurn, PHONE, scoreboard } from './account'
import { battleLog } from './storage'

test('two phones finish a five-round battle in step', async ({ browser }) => {
  test.setTimeout(300_000)
  const aliceContext = await browser.newContext({ viewport: PHONE })
  const bobContext = await browser.newContext({ viewport: PHONE })
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  const playRound = async (round: number) => {
    await expect(scoreboard(alice).getByText(`${aliceName}’s turn`, { exact: true })).toBeVisible()
    await playTurn(alice)
    await expect(alice.locator('[data-side-score="0"] .bg-side-a')).toHaveCount(round)
    await expect(alice.locator('[data-side-score="1"] .bg-side-b')).toHaveCount(round - 1)
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
  await playRound(5)

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
