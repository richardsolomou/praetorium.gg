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
