import { PRODUCT_DOCS } from '../src/contracts/productDocs'
import { expect, test } from './test'
import { expectNoPageOverflow, PHONE } from './account'

for (const pageDetails of [
  { path: '/support', heading: 'Support' },
  { path: '/delete-account', heading: 'Delete account' },
  { path: '/sources', heading: 'Data sources' },
]) {
  test(`${pageDetails.path} fits a phone viewport`, async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto(pageDetails.path)

    await expect(page.locator('h1').first()).toHaveText(pageDetails.heading)
    await expectNoPageOverflow(page)
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
      'https://discord.gg/RFUMZNFwMu',
    )
    const header = page.locator(width === 1440 ? '[data-web-app-chrome]' : '[data-mobile-app-header]')
    const community = header.getByRole('navigation', { name: 'Community' })
    await expect(community.getByRole('link', { name: 'Discord', exact: true })).toHaveAttribute('href', 'https://discord.gg/RFUMZNFwMu')
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
    await expect(page.getByRole('main').getByRole('textbox')).toHaveAccessibleName('Search docs')
    await page.screenshot({ path: test.info().outputPath(`support-${width}.png`), fullPage: true })
  }
})

test('support lists every area of fixes and searches the docs', async ({ page }) => {
  await page.goto('/support')
  const fixes = page.getByRole('list', { name: 'Troubleshooting' })
  for (const doc of PRODUCT_DOCS.filter((entry) => entry.slug.endsWith('-problems')))
    await expect(fixes.getByRole('link', { name: new RegExp(`^${doc.title}`) })).toHaveAttribute('href', `/docs/${doc.slug}`)
  await page.getByRole('textbox', { name: 'Search docs' }).fill('start battle greyed')
  await page
    .getByRole('region', { name: 'Search results' })
    .getByRole('link', { name: /Start battle is greyed out/ })
    .click()
  await expect(page).toHaveURL('/docs/battle-problems#start-battle-is-greyed-out')
})
