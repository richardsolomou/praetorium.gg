import { expect, test } from './test'
import { chooseBattleSize, chooseFaction, retryUntilVisible, signUp } from './account'
import { screenshot } from './screenshots'

test(`roster setup keeps every detachment in place and explains one that shares a one-per-army limit`, async ({ page }) => {
  await signUp(page, 'Dynasty')
  await page.goto('/rosters')
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'New roster', exact: true }).first().click())
  await chooseFaction(dialog, 'Necrons')
  await chooseBattleSize(dialog, /^Onslaught · 3,000 points/)
  const detachments = dialog.getByRole('button', { name: /^Select / })
  const names = async () => (await detachments.allInnerTexts()).map((text) => text.split('\n')[0])
  const offered = await names()
  await dialog.getByRole('button', { name: 'Select Awakened Dynasty', exact: true }).click()

  const unavailable = dialog.getByRole('button', { name: 'Select Hand of the Dynasty, unavailable' })
  await expect(unavailable).toHaveAttribute('aria-disabled', 'true')
  expect(await names()).toEqual(offered)
  await expect(unavailable).toHaveAccessibleDescription("Can't be taken with Awakened Dynasty: only one Dynasty detachment")
  await unavailable.click({ force: true })
  await expect(page.getByRole('tooltip')).toHaveText("Can't be taken with Awakened Dynasty: only one Dynasty detachment")
  await expect(dialog.getByRole('button', { name: 'Select Hand of the Dynasty', exact: true })).toHaveCount(0)
  await screenshot(page, `exclusive-detachments.png`)

  await dialog.getByRole('button', { name: 'Select Awakened Dynasty', pressed: true }).click()
  await expect(dialog.getByRole('button', { name: 'Select Hand of the Dynasty', exact: true })).toBeEnabled()
})
