import { attachRoster, createBattle, createRoster, PRACTICE_OPPONENT, signUp, startBattle, uniqueName } from './account'
import { expect, test } from './test'

test('a failed mission draw can be retried after the connection returns', async ({ page, context }) => {
  await context.route('**/offline-reference*', (route) => route.abort('internetdisconnected'))
  await signUp(page, uniqueName('Disconnected draw'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page, undefined, false)
  const prompt = page.getByRole('dialog', { name: /secondary missions$/ })
  const draw = prompt.getByRole('button', { name: 'Draw at random', exact: true })
  await page.route('**/_serverFn/**', (route) =>
    route.request().postData()?.includes('draw-secondaries') ? route.abort('internetdisconnected') : route.continue(),
  )
  await draw.click()
  await expect(page.getByText('Check your connection and try again.', { exact: true })).toBeVisible()
  await expect(draw).toBeEnabled()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(0)
  await prompt.getByRole('button', { name: 'Minimize dialog' }).click()
  await page.getByText('Check your connection and try again.', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/battle-connection-error.png' })
  await page.getByRole('button', { name: 'Return to prompt', exact: true }).click()
  await page.unroute('**/_serverFn/**')
  await draw.click()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  await expect(page.getByText('Check your connection and try again.', { exact: true })).toHaveCount(0)
  await expect(prompt.getByRole('button', { name: 'Minimize dialog' })).toBeEnabled()
  await page.reload()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/battle-draw-reconnected.png' })
})
