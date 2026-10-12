import { expect, test } from '@playwright/test'

for (const pageDetails of [
  { path: '/support', heading: 'Support' },
  { path: '/delete-account', heading: 'Delete account' },
  { path: '/sources', heading: 'Data sources' },
]) {
  test(`${pageDetails.path} fits a phone viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(pageDetails.path)

    expect(
      await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      })),
    ).toEqual({ heading: pageDetails.heading, hasHorizontalOverflow: false })
  })
}

for (const width of [390, 1440]) {
  test(`support sends problem reports to the public issue tracker at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/support')

    await expect(page.getByRole('link', { name: 'public issue tracker' })).toHaveAttribute(
      'href',
      'https://github.com/richardsolomou/praetorium.gg/issues/new',
    )
    await expect(page.getByRole('heading', { name: 'Report a problem' })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0)
    await page.screenshot({ path: `test-results/support-${width}.png`, fullPage: true })
  })
}
