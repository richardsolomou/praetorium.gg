import { expect, test, type Page } from '@playwright/test'
import { createRoster, setupBattle, signUp, takeTheTurn, uniqueName } from './account'

test('a battle stays in step across two devices', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  await takeTheTurn(alice)
  await bob.getByRole('button', { name: 'End the command phase' }).click()
  await expect(bob.getByRole('heading', { name: 'movement phase' })).toBeVisible()
  await expect(panel(bob, 'Necrons').locator('[data-stat="cp"]')).toHaveText('1')

  await panel(bob, 'Necrons').getByRole('button', { name: '+1 CP' }).click()
  await expect(panel(bob, 'Necrons').locator('[data-stat="cp"]')).toHaveText('2')
  await expect(panel(alice, 'Necrons').locator('[data-stat="cp"]')).toHaveText('2')
  await expect(panel(bob, 'Necrons').getByRole('button', { name: 'Additional CP already gained this round' })).toBeDisabled()
  await bob.getByRole('button', { name: 'Undo latest action' }).click()
  await expect(panel(alice, 'Necrons').locator('[data-stat="cp"]')).toHaveText('1')
  await expect(panel(bob, 'Necrons').getByRole('button', { name: '+1 CP' })).toBeEnabled()

  await alice.screenshot({ path: 'test-results/tracker-alice.png', fullPage: true })
  await bob.screenshot({ path: 'test-results/tracker-bob.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  // The same scoreboard as the desktop one, so a phone and a laptop cannot disagree
  // about the score. What each army is stays in its own panel rather than being said
  // a second time up here, where there is no room for it.
  const scoreboard = alice.getByRole('region', { name: 'Battle scoreboard' })
  await expect(scoreboard).toContainText(aliceName)
  await expect(scoreboard).toContainText(bobName)
  await expect(scoreboard).not.toContainText('Awakened Dynasty')
  await expect(panel(alice, 'Necrons')).toContainText('Awakened Dynasty')
  await alice.screenshot({ path: 'test-results/tracker-phone.png', fullPage: true })
  await alice.getByRole('tab', { name: 'Battle' }).click()
  await expect(alice.getByText(new RegExp(`${bobName} ends the command phase for ${aliceName}`))).toBeVisible()
  await alice.screenshot({ path: 'test-results/tracker-events.png', fullPage: true })

  // Pinned flush to the bottom at every width that pins it. A margin between a fixed
  // box and the edge it is pinned to is invisible in the markup and obvious on a phone.
  for (const width of [390, 768, 1023]) {
    await alice.setViewportSize({ width, height: 844 })
    const gap = await alice.locator('[data-turn-control]').evaluate((node) => window.innerHeight - node.getBoundingClientRect().bottom)
    expect(gap, `turn control at ${width}px`).toBe(0)
  }
  await alice.setViewportSize({ width: 390, height: 844 })
  await alice.getByRole('tab', { name: 'Battle' }).click()
  await alice.getByRole('button', { name: 'Battle options' }).click()
  await alice.getByRole('menuitem', { name: 'Finish early' }).click()
  await expect(alice.getByRole('alertdialog', { name: 'Finish early?' })).toBeVisible()
  await alice.getByRole('button', { name: 'Keep playing' }).click()
  await expect(alice.getByRole('button', { name: /End the .+ phase/ })).toBeVisible()
})

function panel(page: Page, army: string) {
  return page.locator('[data-panel="player"]').filter({ hasText: army })
}
