import { expect, test, type Page } from '@playwright/test'
import { createRoster, setupBattle, signUp, uniqueName } from './account'

test('a battle stays in step across two devices', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Death Lord/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  await expect(bob.getByRole('button', { name: 'End the command phase' })).toBeDisabled()
  await alice.getByRole('button', { name: 'End the command phase' }).click()
  await expect(bob.getByRole('heading', { name: 'movement phase' })).toBeVisible()
  await expect(panel(bob, 'Necrons').locator('[data-stat="cp"]')).toHaveText('1')

  await alice.getByRole('button', { name: '+1 additional CP' }).click()
  await expect(panel(bob, 'Necrons').locator('[data-stat="cp"]')).toHaveText('2')
  await expect(bob.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await alice.getByRole('button', { name: 'Undo' }).click()
  await expect(panel(bob, 'Necrons').locator('[data-stat="cp"]')).toHaveText('1')

  await alice.screenshot({ path: 'test-results/tracker-alice.png', fullPage: true })
  await bob.screenshot({ path: 'test-results/tracker-bob.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  const scoreboard = alice.getByRole('complementary', { name: 'Battle scoreboard' })
  await expect(scoreboard).toContainText('Necrons')
  await expect(scoreboard).toContainText('Death Guard')
  await alice.screenshot({ path: 'test-results/tracker-phone.png', fullPage: true })
  // The last thing on the page must clear the fixed scoreboard rather than sit behind it.
  const last = alice.getByRole('button', { name: 'Delete battle' })
  await last.scrollIntoViewIfNeeded()
  const [lastBox, scoreboardBox] = await Promise.all([last.boundingBox(), scoreboard.boundingBox()])
  expect(lastBox && scoreboardBox && lastBox.y + lastBox.height <= scoreboardBox.y).toBe(true)
  await alice.getByRole('button', { name: 'events' }).click()
  await expect(alice.getByText(new RegExp(`${aliceName} ends the command phase`))).toBeVisible()
  await alice.screenshot({ path: 'test-results/tracker-events.png', fullPage: true })

  await alice.getByRole('button', { name: 'info' }).click()
  await alice.getByRole('button', { name: 'Finish early' }).click()
  await expect(alice.getByRole('alertdialog', { name: 'Finish early?' })).toBeVisible()
  await alice.getByRole('button', { name: 'Keep playing' }).click()
  await expect(alice.getByRole('button', { name: /End the .+ phase/ })).toBeVisible()
})

function panel(page: Page, army: string) {
  return page.locator('[data-panel="player"]').filter({ hasText: army })
}
