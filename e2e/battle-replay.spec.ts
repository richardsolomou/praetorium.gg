import { expect, test, type Locator } from './test'
import { rewind, PHONE } from './account'

test('the full replay preloads before scrubbing', async ({ page }) => {
  let replayRequests = 0
  let singleRequests = 0
  page.on('requestfinished', (request) => {
    const payload = new URL(request.url()).searchParams.get('payload')
    if (payload?.includes('"preview-tournament-battle-duel"')) {
      if (payload.includes('"seqs"')) replayRequests++
      if (payload.includes('"seq"')) singleRequests++
    }
  })
  await page.goto('/battles/preview-tournament-battle-duel')

  await expect.poll(() => replayRequests).toBe(4)
  const timeline = page.getByRole('navigation', { name: 'Battle replay timeline' })
  const slider = timeline.getByRole('slider', { name: 'Replay event' })
  await slider.press('Home')
  await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toContainText('Round 0 of 5')
  await expect(timeline).not.toContainText('Loading…')
  expect(singleRequests).toBe(0)
})

test('a long battle report does not extend the page past its footer', async ({ page }) => {
  await page.goto('/battles/preview-tournament-battle-duel')
  const report = page.locator('[data-battle-report-scroll]')
  await expect(report).toBeVisible()

  await report.evaluate((element) => {
    const list = element.querySelector('ol')!
    const row = list.lastElementChild!
    for (let index = 0; index < 150; index++) list.append(row.cloneNode(true))
  })

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => report.evaluate((element) => element.scrollHeight)).toBeGreaterThan(900)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight -
          Math.ceil(document.querySelector('[data-native-app-frame]')!.getBoundingClientRect().bottom + scrollY),
      ),
    ).toBeLessThanOrEqual(1)
    expect(
      await page.evaluate(() => {
        scrollTo(0, document.documentElement.scrollHeight)
        const links = document.querySelector('[data-web-app-footer] p:last-child')!.getBoundingClientRect()
        const timeline = document.querySelector('[data-replay-timeline]')!.getBoundingClientRect()
        return links.bottom <= timeline.top
      }),
    ).toBe(true)
  }
})

test('dragging the replay timeline on a phone changes the event without scrolling the page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })
  try {
    const page = await context.newPage()
    await page.goto('/battles/preview-tournament-battle-duel')
    const slider = page.getByRole('slider', { name: 'Replay event' })
    await rewind(slider)
    await slider.press('End')
    await expect(slider).toHaveValue((await slider.getAttribute('max'))!)
    await page.evaluate(() => {
      document.querySelector('main')!.style.minHeight = '200vh'
      // Scrubbing changes the content above the viewport, and scroll anchoring would move the page for that rather than the touch.
      document.documentElement.style.overflowAnchor = 'none'
    })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(300)
    const session = await context.newCDPSession(page)
    for (const native of [false, true]) {
      if (native) {
        await page.evaluate(() => {
          document.documentElement.dataset.nativeApp = 'true'
          document.documentElement.dataset.nativeShell = 'true'
        })
        await slider.press('End')
      }
      await page.evaluate(() => window.scrollTo(0, 300))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      const scrollY = await page.evaluate(() => window.scrollY)
      const bounds = (await slider.boundingBox())!
      const y = bounds.y + bounds.height / 2
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * 0.9, y }] })
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: bounds.x + bounds.width * 0.9, y: y + 30 }],
      })
      for (let step = 8; step >= 1; step--) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: bounds.x + (bounds.width * step) / 10, y: y + 30 }],
        })
      }
      await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(20)
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
      await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toContainText('Round 1 of 5')
      await page.screenshot({ path: test.info().outputPath(native ? 'replay-native-phone.png' : 'replay-phone.png') })
    }
  } finally {
    await context.close()
  }
})

test('a spectator scrubs a finished five-round battle by event', async ({ page }) => {
  await page.goto('/battles/preview-tournament-battle-duel')

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
  await page.setViewportSize(PHONE)
  await page.goto('/battles/preview-tournament-battle-duel')
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
  await rewind(slider)
  await expect(page.getByText('Battle setup')).toBeVisible()
  await slider.press('End')
  await expect(page.getByText('Watching live')).toBeVisible()
})

/** Steps one entry at a time, waiting for each to render, so the read never sees the step before. */
async function scrubToRound(slider: Locator, round: number) {
  await rewind(slider)
  await expect(slider).toHaveValue((await slider.getAttribute('min')) ?? '0')
  for (let step = 0; step < 300; step++) {
    if ((await slider.getAttribute('aria-valuetext'))?.startsWith(`Round ${round},`)) return
    const value = await slider.inputValue()
    await slider.press('ArrowRight')
    await expect(slider).not.toHaveValue(value)
  }
  throw new Error(`the timeline never reached round ${round}`)
}
