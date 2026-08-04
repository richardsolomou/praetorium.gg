import { expect, test, type Page } from '@playwright/test'

/**
 * The one thing the unit tests cannot prove: that a change made on one device
 * reaches the other without anybody touching it. Every assertion against the
 * page that did not act is the stream being tested, not the code compiling.
 */
test('a battle stays in step across two devices', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()

  await alice.goto('/')
  await alice.getByLabel('Your name').fill('Alice')
  await alice.getByRole('button', { name: 'Open a battle' }).click()

  const link = await alice.getByLabel('Send this link to your opponent').inputValue()
  expect(link).toContain('/b/')

  await bob.goto(link)
  await bob.getByLabel('Your name').fill('Bob')
  await bob.getByRole('button', { name: 'Join the battle' }).click()

  // Alice is not touched here: her page learns Bob arrived from the stream alone.
  await expect(alice.getByRole('heading', { name: 'Alice versus Bob' })).toBeVisible()

  await attach(alice, 'Ultramarines strike force', '10 Intercessors\n1 Captain')
  await expect(bob.getByText('Alice has attached Ultramarines strike force.')).toBeVisible()

  await attach(bob, 'Death Guard', '10 Plague Marines')
  await alice.getByRole('button', { name: 'Alice goes first' }).click()

  await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await expect(bob.getByRole('heading', { name: 'command phase' })).toBeVisible()

  // The ownership rule, as the opponent's device sees it.
  await expect(bob.getByRole('button', { name: 'End the command phase' })).toBeDisabled()

  await alice.getByRole('button', { name: 'End the command phase' }).click()
  await expect(bob.getByRole('heading', { name: 'movement phase' })).toBeVisible()

  // Alice gained a command point entering her own command phase, and Bob sees it.
  await expect(panel(bob, 'Ultramarines strike force').locator('[data-stat="cp"]')).toHaveText('1')

  await alice.getByRole('button', { name: 'Primary plus 5' }).click()
  await expect(panel(bob, 'Ultramarines strike force').locator('[data-stat="primary"]')).toHaveText('5')

  // Undo belongs to whoever acted, so it is not offered on the other device.
  await expect(bob.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await alice.getByRole('button', { name: 'Undo' }).click()
  await expect(panel(bob, 'Ultramarines strike force').locator('[data-stat="primary"]')).toHaveText('0')

  await alice.screenshot({ path: 'test-results/tracker-alice.png', fullPage: true })
  await bob.screenshot({ path: 'test-results/tracker-bob.png', fullPage: true })
})

/** One player's card, found by the army on it rather than by which side it is on. */
function panel(page: Page, army: string) {
  return page.locator('section').filter({ hasText: army })
}

async function attach(page: Page, army: string, list: string) {
  await page.getByLabel('Your army').fill(army)
  await page.getByLabel('Your list').fill(list)
  await page.getByRole('button', { name: /my list/ }).click()
}
