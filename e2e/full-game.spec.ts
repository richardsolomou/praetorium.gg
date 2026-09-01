import { expect, test, type Page } from '@playwright/test'
import { advance, createRoster, setupBattle, signUp, uniqueName } from './account'

test('two phones complete all five rounds in step', async ({ browser }) => {
  const aliceContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const bobContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  for (let round = 1; round <= 5; round += 1) {
    await playTurn(alice)
    await expect(alice.locator('[data-side-score="0"] .bg-side-a')).toHaveCount(round)
    await expect(alice.locator('[data-side-score="1"] .bg-side-b')).toHaveCount(round - 1)
    await playTurn(bob)
    if (round < 5) {
      await expect(alice.locator('[data-stat="round"]')).toHaveText(String(round + 1))
    }
  }

  // The scoreboard swaps the round for the result, and both phones read the same one.
  await expect(scoreboard(alice)).toContainText('Result')
  await expect(scoreboard(bob)).toContainText('Result')
  const outcome = await scoreboard(alice).getByRole('heading').textContent()
  await expect(scoreboard(bob).getByRole('heading')).toHaveText(outcome ?? '')
  await Promise.all([aliceContext.close(), bobContext.close()])
})

function scoreboard(page: Page) {
  return page.getByRole('region', { name: 'Battle scoreboard' })
}

async function playTurn(page: Page, phase = 0): Promise<void> {
  if (phase === 6) return
  await advance(page)
  await playTurn(page, phase + 1)
}
