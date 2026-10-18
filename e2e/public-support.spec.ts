import { expect, test } from './test'

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

test('support sends feedback in place and keeps the public issue tracker', async ({ page }) => {
  await page.goto('/support')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('link', { name: 'public issue tracker' })).toHaveAttribute(
      'href',
      'https://github.com/richardsolomou/praetorium.gg/issues/new',
    )
    await expect(page.getByRole('main').getByRole('link', { name: 'Praetorium Discord' })).toHaveAttribute(
      'href',
      'https://discord.gg/kQneZ8Nae',
    )
    const header = page.locator(width === 1440 ? '[data-web-app-chrome]' : '[data-mobile-app-header]')
    const community = header.getByRole('navigation', { name: 'Community' })
    await expect(community.getByRole('link', { name: 'Discord', exact: true })).toHaveAttribute('href', 'https://discord.gg/kQneZ8Nae')
    await expect(community.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/richardsolomou/praetorium.gg',
    )
    await community.getByRole('link', { name: 'Discord', exact: true }).press('Tab')
    await expect(community.getByRole('link', { name: 'GitHub', exact: true })).toBeFocused()
    await expect(page.getByRole('tooltip', { name: 'Browse the source on GitHub' })).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Send feedback' }).click()
    await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/support$/)
    await expect(page.getByRole('heading', { name: 'Report a problem' })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0)
    await page.screenshot({ path: `test-results/support-${width}.png`, fullPage: true })
  }
})
