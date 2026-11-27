import { seededRoster, signUp, startBattle, uniqueName, practiceBattle, PHONE } from './account'
import { expect, test } from './test'
import { screenshot } from './screenshots'

test('a failed mission draw can be retried after the connection returns', async ({ page, context }) => {
  await context.route('**/offline-reference*', (route) => route.abort('internetdisconnected'))
  await signUp(page, uniqueName('Disconnected draw'))
  const roster = await seededRoster(page, { faction: 'Necrons', detachment: 'Awakened Dynasty' })
  await practiceBattle(page, roster)
  await startBattle(page, undefined, false)
  const prompt = page.getByRole('dialog', { name: /secondary missions$/ })
  const draw = prompt.getByRole('button', { name: 'Draw at random', exact: true })

  // The opening draw prompt starts at the top, pins its actions and holds the page still on a phone.
  await expect(draw).toBeVisible()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  const before = page.viewportSize()!
  await page.setViewportSize(PHONE)
  await expect
    .poll(() =>
      prompt.evaluate(
        (dialog, slot) => dialog.getBoundingClientRect().bottom - dialog.querySelector(slot)!.getBoundingClientRect().bottom,
        '[data-slot="dialog-footer"]',
      ),
    )
    .toBeLessThanOrEqual(1)
  await page.mouse.move(195, 300)
  await page.mouse.wheel(0, 800)
  const settled = await page.evaluate(
    () => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY)))),
  )
  expect(settled).toBe(0)
  await page.setViewportSize(before)

  await page.route('**/_serverFn/**', (route) =>
    route.request().postData()?.includes('draw-secondaries') ? route.abort('internetdisconnected') : route.continue(),
  )
  await draw.click()
  await expect(page.getByText('Check your connection and try again.', { exact: true })).toBeVisible()
  await expect(draw).toBeEnabled()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(0)
  await prompt.getByRole('button', { name: 'Minimize dialog' }).click()
  await page.getByText('Check your connection and try again.', { exact: true }).scrollIntoViewIfNeeded()
  await screenshot(page, 'battle-connection-error.png')
  await page.getByRole('button', { name: 'Return to prompt', exact: true }).click()
  await page.unroute('**/_serverFn/**')
  await draw.click()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  await expect(page.getByText('Check your connection and try again.', { exact: true })).toHaveCount(0)
  await expect(prompt.getByRole('button', { name: 'Minimize dialog' })).toBeEnabled()
  await page.reload()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  await screenshot(page, 'battle-draw-reconnected.png')
})
