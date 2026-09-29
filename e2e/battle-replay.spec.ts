import { expect, test, type Locator } from '@playwright/test'

test('a spectator scrubs a finished five-round battle by event', async ({ page }) => {
  await page.goto('/battles/preview-league-battle-duel')

  const timeline = page.getByRole('navigation', { name: 'Battle replay timeline' })
  await expect(timeline).toBeVisible()
  await expect(timeline.locator('[data-round-start]')).toHaveCount(5)
  await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toContainText('35–0')

  const slider = timeline.getByRole('slider', { name: 'Replay event' })
  await scrubToRound(slider, 3)
  await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toContainText('Round 3 of 5')
  await expect(timeline).toContainText('Round 3')
  await expect(page.locator('[data-side-score="0"]')).toContainText('20')

  const selected = Number(await slider.inputValue())
  await slider.press('ArrowRight')
  await expect(slider).toHaveValue(String(selected + 1))

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await slider.press('End')
    const scoreboard = page.getByRole('region', { name: 'Battle scoreboard' })
    await expect(scoreboard).toContainText('35–0')
    const finishedHeight = (await scoreboard.boundingBox())?.height
    await scrubToRound(slider, 3)
    await expect(scoreboard).toContainText('Round 3 of 5')
    expect((await scoreboard.boundingBox())?.height).toBe(finishedHeight)
  }
})

test('the native app keeps the replay timeline above the application tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/battles/preview-league-battle-duel')
  await page.evaluate(() => {
    document.documentElement.dataset.nativeApp = 'true'
  })

  const timeline = page.getByRole('navigation', { name: 'Battle replay timeline' })
  const applicationTabs = page.getByRole('navigation', { name: 'Application sections' })
  await expect(timeline).toBeVisible()
  await expect(applicationTabs).toBeVisible()
  const timelineBox = await timeline.boundingBox()
  const tabsBox = await applicationTabs.boundingBox()
  expect(timelineBox!.y + timelineBox!.height).toBeLessThanOrEqual(tabsBox!.y)
})

test('a spectator scrubs back through a live battle and returns to the latest event', async ({ page }) => {
  await page.goto('/battles/preview-casual-strike-force')
  await expect(page.getByText('Watching live')).toBeVisible()

  const slider = page.getByRole('navigation', { name: 'Battle replay timeline' }).getByRole('slider', { name: 'Replay event' })
  const latest = await slider.getAttribute('max')
  await expect(slider).toHaveValue(latest!)
  await slider.press('Home')
  await expect(page.getByText('Battle setup')).toBeVisible()
  await slider.press('End')
  await expect(page.getByText('Watching live')).toBeVisible()
})

async function scrubToRound(slider: Locator, round: number) {
  await slider.press('Home')
  for (let step = 0; step < 300; step++) {
    if ((await slider.getAttribute('aria-valuetext'))?.startsWith(`Round ${round},`)) return
    await slider.press('ArrowRight')
  }
  throw new Error(`the timeline never reached round ${round}`)
}
