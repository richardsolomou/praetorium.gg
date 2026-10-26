import type { WebSocketRoute } from '@playwright/test'
import { expect, test, type Page } from './test'
import { createRoster, setupBattle, signUp, takeTheTurn, uniqueName, PHONE } from './account'

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
  await expect(panel(bob, 'Death Guard').locator('[data-stat="cp"]')).toHaveText('1')
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

  await alice.screenshot({ path: test.info().outputPath('tracker-alice.png'), fullPage: true })
  await bob.screenshot({ path: test.info().outputPath('tracker-bob.png'), fullPage: true })
  await alice.setViewportSize(PHONE)
  // The same scoreboard as the desktop one, so a phone and a laptop cannot disagree
  // about the score. What each army is stays in its own panel rather than being said
  // a second time up here, where there is no room for it.
  const scoreboard = alice.getByRole('region', { name: 'Battle scoreboard' })
  await expect(scoreboard).toContainText(aliceName)
  await expect(scoreboard).toContainText(bobName)
  await expect(scoreboard).not.toContainText('Awakened Dynasty')
  await expect(panel(alice, 'Necrons')).toContainText('Awakened Dynasty')
  await alice.screenshot({ path: test.info().outputPath('tracker-phone.png'), fullPage: true })
  await alice.getByRole('tab', { name: 'Battle' }).click()
  await expect(alice.getByText(new RegExp(`${bobName} ends the command phase for ${aliceName}`))).toBeVisible()
  await alice.screenshot({ path: test.info().outputPath('tracker-events.png'), fullPage: true })

  // Pinned flush to the application tabs on mobile and the viewport otherwise. A
  // margin between fixed controls is invisible in the markup and obvious on a phone.
  for (const width of [390, 768, 1023]) {
    await alice.setViewportSize({ width, height: 844 })
    const tabs = alice.getByRole('navigation', { name: 'Application sections' })
    const boundary = (await tabs.isVisible())
      ? await tabs.evaluate((node) => node.getBoundingClientRect().top)
      : await alice.evaluate(() => window.innerHeight)
    const gap = await alice
      .locator('[data-turn-control]')
      .evaluate((node, bottom) => bottom - node.getBoundingClientRect().bottom, boundary)
    expect(gap, `turn control at ${width}px`).toBe(0)
  }
  await alice.setViewportSize(PHONE)
  await alice.getByRole('tab', { name: 'Battle' }).click()
  await alice.getByRole('button', { name: 'Battle options' }).click()
  await alice.getByRole('menuitem', { name: `Concede for ${bobName}` }).click()
  await expect(alice.getByRole('alertdialog', { name: `Concede for ${bobName}?` })).toBeVisible()
  await alice.getByRole('button', { name: 'Keep playing' }).click()
  await expect(alice.getByRole('button', { name: /End the .+ phase/ })).toBeVisible()

  await alice.getByRole('button', { name: 'Battle options' }).click()
  await alice.getByRole('menuitem', { name: `Concede for ${bobName}` }).click()
  const concession = alice.getByRole('alertdialog', { name: `Concede for ${bobName}?` })
  await expect(concession).toContainText(`This records that ${bobName} conceded`)
  await concession.getByRole('button', { name: `Concede for ${bobName}` }).click()
  await expect(alice.getByRole('heading', { name: `${aliceName} wins by concession` })).toBeVisible()
  // The confetti is the winner's, on the winner's device: the player who conceded gets the result and nothing else.
  await expect(bob.locator('[data-victory="confetti"]')).toHaveCount(0)
})

test('a dropped live connection reconnects without a new ticket and keeps the battle in step', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bobContext = await browser.newContext()
  // Sockets the page holds open, so the test can drop them as a network failure would.
  const live = new Map<WebSocketRoute, WebSocketRoute>()
  await bobContext.routeWebSocket(/\/v1\/database\/[^/]+\/subscribe/, (route) => {
    const server = route.connectToServer()
    live.set(route, server)
    route.onClose((code, reason) => {
      live.delete(route)
      void server.close({ code, reason })
    })
    server.onClose((code, reason) => {
      live.delete(route)
      void route.close({ code, reason })
    })
  })
  const bob = await bobContext.newPage()
  let tickets = 0
  bob.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/spacetime/token') tickets += 1
  })
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')
  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })
  await takeTheTurn(alice)
  await expect(panel(bob, 'Death Guard').locator('[data-stat="cp"]')).toHaveText('1')

  const dropped = [...live]
  expect(dropped.length).toBeGreaterThan(0)
  const issued = tickets
  for (const [route, server] of dropped) {
    live.delete(route)
    await server.close()
    await route.close({ code: 1011, reason: 'test drop' })
  }
  await expect.poll(() => live.size).toBe(dropped.length)
  expect(tickets).toBe(issued)

  await panel(alice, 'Necrons').getByRole('button', { name: '+1 CP' }).click()
  await expect(panel(bob, 'Necrons').locator('[data-stat="cp"]')).toHaveText('2')
})

function panel(page: Page, army: string) {
  return page.locator('[data-panel="player"]').filter({ hasText: army })
}
