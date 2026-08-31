import { expect, test } from '@playwright/test'
import { createBattle, PRACTICE_OPPONENT, signUp, uniqueName } from './account'

/**
 * The home page is the front door for both kinds of visitor.
 *
 * A player who already has games opens it to get back to them; somebody who has
 * never signed in opens it to see whether anything is happening here at all. The
 * second half only works if a battle nobody invited them to is genuinely readable,
 * and the last step is the promise that goes with it: the moment a player says
 * otherwise, the same link stops answering.
 */
test('shows a battle publicly until its player withholds it', async ({ page, browser }) => {
  const name = uniqueName('Watcher')
  await signUp(page, name)
  const battleUrl = await createBattle(page, { practice: true })

  // The player's own page leads with their table rather than the pitch.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: `Welcome back, ${name}` })).toBeVisible()
  await expect(page.locator('[data-battle-shelf="Your table"]')).toContainText(PRACTICE_OPPONENT)
  // Their own battle is not repeated further down the same page.
  await expect(page.locator('[data-battle-shelf="Public tables"]')).not.toContainText(name)

  const visitor = await browser.newContext()
  const guest = await visitor.newPage()
  const battlePath = new URL(battleUrl).pathname
  try {
    await guest.goto('/')
    // The hero carries the liveliest public battle and the shelf below deliberately
    // does not repeat it, so which block this battle lands in depends on what else
    // has moved recently. Find it by where it points rather than by where it sits.
    const link = guest.getByRole('main').locator(`a[href="${battlePath}"]`)
    await expect(link.first()).toBeVisible()

    // A stranger following it watches; they are never offered the seat.
    await link.first().click()
    await guest.waitForURL(/\/battles\/[^/]+$/)
    await expect(guest.getByText('Spectators can follow the score')).toBeVisible()
    await expect(guest.getByRole('button', { name: /join/i })).toHaveCount(0)

    // The player closes the door, and the same link stops answering.
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Only my table' }).click()
    await expect(page.getByRole('button', { name: 'Only my table' })).toHaveAttribute('aria-pressed', 'true')

    await guest.goto(battleUrl)
    await expect(guest.getByText('Spectators can follow the score')).toHaveCount(0)
    await guest.goto('/')
    await expect(guest.getByRole('main').locator(`a[href="${battlePath}"]`)).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})

test('the home page fits a phone at both signed-out and signed-in widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  await signUp(page, uniqueName('Narrow'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
