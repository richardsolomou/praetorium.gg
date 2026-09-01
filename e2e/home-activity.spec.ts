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

test('the home page fits a phone at both signed-out and signed-in widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  await signUp(page, uniqueName('Narrow'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
