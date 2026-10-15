import { expect, test } from './test'

test.use({ javaScriptEnabled: false })

const guides = [
  { title: 'Prepare for your first game', example: 'A ten-minute table check', action: 'Open Battles', destination: /\/battles$/ },
  { title: 'Give every unit a job', example: 'Find the missing job', action: 'Build your army', destination: /\/rosters$/ },
  {
    title: 'Plan your scoring and secondaries',
    example: 'Score now or preserve a threat?',
    action: 'Read the missions',
    destination: /\/missions\//,
  },
] as const

for (const guide of guides) {
  test(`a visitor reads ${guide.title} and follows its action`, async ({ page }, testInfo) => {
    await page.goto('/guides')
    const link = page.getByRole('link', { name: new RegExp(`^${guide.title}`) })
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(link).toBeVisible()
    }
    await link.click()
    const action = page.getByRole('link', { name: guide.action, exact: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.getByRole('heading', { name: guide.title, exact: true })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Steps', exact: true }).getByRole('listitem')).toHaveCount(5)
      await page.getByRole('heading', { name: guide.example, exact: true }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('heading', { name: guide.example, exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Common questions', exact: true })).toBeVisible()
      const overview = page.getByRole('region', { name: 'Guide overview' })
      await expect(overview.getByRole('img')).toBeVisible()
      await expect(overview.getByRole('img')).toHaveAttribute('src', /^\/assets\/[\w-]+-[\w-]{8,}\.svg$/)
      await expect.poll(() => overview.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: testInfo.outputPath(`guide-${width}.png`), fullPage: true })
      await expect(action).toBeVisible()
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await action.click()
    await expect(page).toHaveURL(guide.destination)
  })
}
