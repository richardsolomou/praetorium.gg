import { expect, test, type Page } from '@playwright/test'
import { signUp } from './account'

test('two phones complete all five rounds in step', async ({ browser }) => {
  const alice = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  const bob = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()

  await signUp(alice, 'Alice')

  await alice.goto('/')
  await alice.getByRole('button', { name: 'Open a battle' }).click()
  const invite = alice.getByLabel('Send this link to your opponent')
  await expect(invite).toHaveValue(/\/b\//)

  await signUp(bob, 'Bob')
  await bob.goto(await invite.inputValue())
  await bob.getByRole('button', { name: 'Join the battle' }).click()
  await attach(alice, 'Ultramarines', '10 Intercessors')
  await attach(bob, 'Death Guard', '10 Plague Marines')
  await alice.getByRole('button', { name: 'Alice goes first' }).click()

  const playRound = async (round: number): Promise<void> => {
    if (round > 5) return
    await playTurn(alice)
    await expect(action(bob)).toBeEnabled()
    await playTurn(bob)
    if (round < 5) await expect(alice.getByText(`Round ${round + 1} of 5`)).toBeVisible()
    await playRound(round + 1)
  }
  await playRound(1)

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
  await expect(action(page)).toBeEnabled()
  await action(page).click()
  await playTurn(page, phase + 1)
}

async function attach(page: Page, army: string, list: string) {
  const paste = page.getByRole('button', { name: 'Paste a list' })
  if (await paste.isVisible()) await paste.click()
  await page.getByLabel('Your army').fill(army)
  await page.getByLabel('Your list').fill(list)
  await page.getByRole('button', { name: /my list/ }).click()
  await page.getByRole('button', { name: /Step 4 Ready/ }).click()
}
