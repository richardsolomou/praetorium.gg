import { eq } from 'drizzle-orm'
import { expect, test } from '@playwright/test'
import { openDatabase } from '../src/db/connection'
import { battles } from '../src/db/schema'
import { createBattle, createRoster, PRACTICE_OPPONENT, setupBattle, signUp, uniqueName } from './account'
import { postgresPort } from './stackEnv'

async function makePreviewBattleMostRecent() {
  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const updated = await connection.database
      .update(battles)
      .set({ createdAt: Date.now() })
      .where(eq(battles.token, 'preview-casual-doubles'))
      .returning({ id: battles.id })
    if (updated.length !== 1) throw new Error('The preview doubles battle is missing.')
  } finally {
    await connection.close()
  }
}

/**
 * The home page is the front door for both kinds of visitor.
 *
 * A player who already has games opens it to get back to them; somebody who has
 * never signed in opens it to see whether anything is happening here at all. The
 * second half only works if a battle nobody invited them to is genuinely readable,
 * and the last step is the promise that goes with it: the moment a player says
 * otherwise, the same link stops answering.
 */
test('keeps practice battles off the home page', async ({ page, browser }) => {
  const name = uniqueName('Watcher')
  await signUp(page, name)
  const battleUrl = await createBattle(page, { practice: true })

  // Practice is useful history, but it is not activity for other people to watch.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: `Welcome back, ${name}` })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText(PRACTICE_OPPONENT)

  const visitor = await browser.newContext()
  const guest = await visitor.newPage()
  const battlePath = new URL(battleUrl).pathname
  try {
    await guest.goto('/')
    await expect(guest.getByRole('main').locator(`a[href="${battlePath}"]`)).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})

test('links each homepage capability card as one action', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: /Build your army/ })).toHaveAttribute('href', '/rosters')
  await expect(page.getByRole('link', { name: /Choose a mission/ })).toHaveAttribute('href', '/mission-packs')
  await expect(page.getByRole('link', { name: /Track the battle/ })).toHaveAttribute('href', '/battles')
})

test('the home page fits a phone at both signed-out and signed-in widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await makePreviewBattleMostRecent()
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  const featuredBattle = page.getByRole('link', { name: /Watch Preview Player/ })
  for (const [first, second] of [
    ['Preview Player', 'Preview Ally'],
    ['Preview Opponent', 'Preview Rival'],
  ]) {
    const firstName = featuredBattle.getByText(first, { exact: true })
    const secondName = featuredBattle.getByText(second, { exact: true })
    await expect(firstName).toBeVisible()
    await expect(secondName).toBeVisible()
    expect((await secondName.boundingBox())!.y).toBeGreaterThan((await firstName.boundingBox())!.y)
  }

  await signUp(page, uniqueName('Narrow'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

/**
 * The signed-in home page runs outwards from the reader.
 *
 * The order is the whole point of the page: the games waiting on the player, then
 * the ones they have finished, then their friends' tables, then everybody else's.
 * A finished game in the first shelf would put a game nobody can act on above one
 * that is live, which is the arrangement this replaces.
 */
test('orders the signed-in home page from the player outwards', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const hostName = uniqueName('Host')
  const guestName = uniqueName('Guest')
  try {
    await signUp(guest, guestName)
    const guestRoster = await createRoster(guest, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Guest list' })
    await signUp(host, hostName)
    const hostRoster = await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host list' })

    const played = await setupBattle(host, guest, { opponent: guestName, hostRoster, guestRoster })
    await host.getByRole('button', { name: 'Battle options' }).click()
    await host.getByRole('menuitem', { name: 'Finish early' }).click()
    await host.getByRole('button', { name: 'Finish early' }).click()
    await expect(host.getByRole('region', { name: 'Battle scoreboard' })).toContainText('Result')
    // A second table, still being set, so the live shelf and the history shelf are both on the page.
    const going = await createBattle(host, { opponent: guestName })

    await host.goto('/')
    await expect(host.getByRole('heading', { name: `Welcome back, ${hostName}` })).toBeVisible()
    const rubrics = host.locator('main').getByText(/^(Your games|Games you have played|Friends' games|Public games)$/)
    await expect(rubrics).toHaveText(['Your games', 'Games you have played', "Friends' games", 'Public games'])

    const yours = host.locator('[data-battle-shelf="Your games"]')
    const history = host.locator('[data-battle-shelf="Games you have played"]')
    await expect(yours.locator(`a[href="${new URL(going).pathname}"]`)).toHaveCount(1)
    await expect(yours.locator(`a[href="${new URL(played).pathname}"]`)).toHaveCount(0)
    await expect(history.locator(`a[href="${new URL(played).pathname}"]`)).toHaveCount(1)
    await expect(history.locator(`a[href="${new URL(going).pathname}"]`)).toHaveCount(0)
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})

test('the leaderboard fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/leaderboard')

  expect(
    await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    })),
  ).toEqual({ heading: 'Who is winning', hasHorizontalOverflow: false })
})
