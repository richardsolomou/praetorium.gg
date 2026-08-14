import { expect, test, type Page } from '@playwright/test'
import { createRoster, dismissDrawPrompt, setupBattle, signUp, uniqueName } from './account'

test('two phones complete all five rounds in step', async ({ browser }) => {
  const alice = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  const bob = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Death Lord/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  for (let round = 1; round <= 5; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await playTurn(alice)
    // eslint-disable-next-line no-await-in-loop
    await expect(action(bob)).toBeEnabled()
    // eslint-disable-next-line no-await-in-loop
    await playTurn(bob)
    if (round < 5) {
      // eslint-disable-next-line no-await-in-loop
      await expect(alice.locator('[data-stat="round"]')).toHaveText(String(round + 1))
    }
  }

  await expect(alice.getByText('Battle over')).toBeVisible()
  await expect(bob.getByText('Battle over')).toBeVisible()
  await expect(alice.getByRole('complementary', { name: 'Battle scoreboard' })).toContainText('Round5')
  await expect(bob.getByRole('complementary', { name: 'Battle scoreboard' })).toContainText('Round5')
})

function action(page: Page) {
  return page.getByRole('button', { name: /^(End the .+ phase|Pass the turn)$/ })
}

async function playTurn(page: Page, phase = 0): Promise<void> {
  if (phase === 6) return
  // The prompt only lands at the top of a turn, so it is only worth looking for there.
  if (phase === 0) await dismissDrawPrompt(page)
  await expect(action(page)).toBeEnabled()
  await action(page).click()
  await playTurn(page, phase + 1)
}
