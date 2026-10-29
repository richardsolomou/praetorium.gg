import { expect, test } from './test'
import manifest from '../package.json' with { type: 'json' }
import { expectNoHorizontalOverflow } from './builder.harness'

for (const width of [1440, 390]) {
  test(
    `release and data update pages share navigation and preserve history at ${width}px`,
    { tag: '@catalogue' },
    async ({ page, request }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/whats-new')
      const navigation = page.getByRole('navigation', { name: 'Updates', exact: true })
      await expect(navigation.getByRole('link', { name: "What's new", exact: true })).toHaveAttribute('aria-current', 'page')
      const current = page.locator('section', { has: page.locator(`[id="release-${manifest.version}"]`) })
      await expect(current).toBeVisible()
      await expectNoHorizontalOverflow(page.locator('main'))
      await page.screenshot({ path: test.info().outputPath(`whats-new-${width}.png`) })

      await navigation.getByRole('link', { name: 'Data updates', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Data updates', exact: true })).toBeVisible()
      await expect(navigation.getByRole('link', { name: 'Data updates', exact: true })).toHaveAttribute('aria-current', 'page')
      const row = page.locator('main details:not([open])').first()
      await expect(row).toBeVisible()
      const anchor = (await row.getAttribute('id'))!
      const tile = row.locator('summary a').first()
      const target = (await tile.getAttribute('href'))!.slice(1)
      const html = await (await request.get('/data-updates')).text()
      expect(html).toContain(`id="${target}"`)
      await expectNoHorizontalOverflow(page.locator('main'))
      await page.screenshot({ path: test.info().outputPath(`data-updates-${width}.png`) })

      await tile.click()
      await expect(page.locator(`[id="${anchor}"]`)).toHaveAttribute('open', '')
      await expect(page.locator(`[id="${target}"]`)).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`#${target}$`))
      await expectNoHorizontalOverflow(page.locator('main'))
      await page.screenshot({ path: test.info().outputPath(`data-update-open-${width}.png`) })
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page.locator(`[id="${anchor}"]`)).toHaveAttribute('open', '')
      await expect(page.locator(`[id="${target}"]`)).toBeVisible()
      // The reloaded page scrolls back to its fragment on its own schedule, which can move the link out from under a pointer click.
      await page.getByRole('link', { name: 'Older updates', exact: true }).press('Enter')
      await expect(page).toHaveURL(/\/data-updates\?before=/)
      await expect(navigation.getByRole('link', { name: 'Data updates', exact: true })).toHaveAttribute('aria-current', 'page')
      await expectNoHorizontalOverflow(page.locator('main'))
      await page.getByRole('link', { name: 'Newest updates', exact: true }).click()
      await expect(page).toHaveURL('/data-updates')
      await navigation.getByRole('link', { name: "What's new", exact: true }).click()
      await expect(current).toBeVisible()
      await expect(navigation.getByRole('link', { name: "What's new", exact: true })).toHaveAttribute('aria-current', 'page')
    },
  )
}
