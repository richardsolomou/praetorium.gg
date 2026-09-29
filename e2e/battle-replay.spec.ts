import { expect, test } from '@playwright/test'

test('a spectator scrubs a finished five-round battle by event', async ({ page }) => {
  await page.goto('/battles/preview-league-battle-duel')

  const timeline = page.getByRole('navigation', { name: 'Battle replay timeline' })
  await expect(timeline).toBeVisible()
  await expect(timeline.getByRole('button', { name: /^Round [1-5]$/ })).toHaveCount(5)
  await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toContainText('35–0')

  await timeline.getByRole('button', { name: 'Round 3' }).click()
  await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toContainText('Round 3 of 5')
  await expect(page.locator('[data-side-score="0"]')).toContainText('20')

  const slider = timeline.getByRole('slider', { name: 'Replay event' })
  const selected = Number(await slider.inputValue())
  await slider.press('ArrowRight')
  await expect(slider).toHaveValue(String(selected + 1))

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await slider.press('End')
    const scoreboard = page.getByRole('region', { name: 'Battle scoreboard' })
    await expect(scoreboard).toContainText('35–0')
    const finishedHeight = (await scoreboard.boundingBox())?.height
    await timeline.getByRole('button', { name: 'Round 3' }).click()
    await expect(scoreboard).toContainText('Round 3 of 5')
    expect((await scoreboard.boundingBox())?.height).toBe(finishedHeight)
  }
})
