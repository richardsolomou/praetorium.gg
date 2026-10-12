import { expect, test } from '@playwright/test'
import { retryUntilVisible } from './account'

const factions = [
  { name: 'Blood Angels', slug: 'blood-angels', versions: 3 },
  { name: 'Dark Angels', slug: 'dark-angels', versions: 5 },
  { name: 'Salamanders', slug: 'salamanders', versions: 4 },
  { name: 'Space Marines', slug: 'space-marines', versions: 2 },
]

for (const width of [390, 1440]) {
  test(`rules history labels recorded status dates rather than publisher dates at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/factions/space-marines/rules/space-marines-codex-2026-10-03', '/factions/dark-angels/rules/mfm-1-4-2026-09-30']) {
      await page.goto(path)
      await expect(page).toHaveURL(path)
      const history = page.locator('main details').filter({ has: page.locator('summary', { hasText: 'Rules history' }) })
      await history.locator('summary').click()
      await expect(history).toContainText(
        'These dates record status changes in Praetorium; publisher release and effective dates can differ.',
      )
      const events = history.getByRole('listitem')
      await expect(events.first()).toBeVisible()
      for (const event of await events.all()) await expect(event).toHaveText(/ · (Preview|Release|Archive) recorded$/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`status-history-${path.split('/').at(-1)}-${width}.png`) })
    }
  })
}

for (const width of [390, 1440]) {
  test(`faction links open current rules and version menus identify archives at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const faction of factions) {
      await page.goto('/factions')
      const row = page.locator(`[data-faction="${faction.name}"]`).first()
      const link = row.getByRole('link', { name: faction.name, exact: true })
      await expect(link).toHaveAttribute('href', `/factions/${faction.slug}/rules/space-marines-codex-2026-10-12`)
      if (faction.versions > 1) {
        await retryUntilVisible(page.getByRole('menu'), () =>
          row.getByRole('button', { name: `Rules versions for ${faction.name}` }).click(),
        )
        const items = page.getByRole('menuitem')
        await expect(items).toHaveCount(faction.versions)
        await expect(items.first().locator('[data-rules-status="current"]')).toHaveText('Current')
        await expect(items.first().locator('[data-rules-status="current"]')).toHaveCSS('border-top-style', 'solid')
        await expect(items.first().locator('[data-rules-status="current"]')).toHaveCSS('color', 'rgb(124, 196, 138)')
        await expect(items.first().locator('[data-rules-status="current"]')).toHaveCSS('width', '72px')
        expect(
          await items
            .first()
            .locator('[data-rules-status]')
            .evaluate((chip) => chip.parentElement?.firstElementChild === chip),
        ).toBe(true)
        if (faction.name === 'Dark Angels') await page.screenshot({ path: `test-results/rules-status-menu-${width}.png` })
        await expect(items.first()).toHaveText('Current Space Marines codex · 12 Oct 2026')
        await expect(page.getByRole('menu')).not.toContainText('Previous rules')
        await page.keyboard.press('Escape')
      } else {
        await expect(row.getByRole('button', { name: `Rules versions for ${faction.name}` })).toHaveCount(0)
      }
      await link.click()
      await expect(page).toHaveURL(new RegExp(`/factions/${faction.slug}/rules/space-marines-codex-2026-10-12$`))
      await expect(page.getByRole('heading', { level: 1, name: faction.name, exact: true })).toBeVisible()
      await expect(page.locator('main header [data-rules-version]')).toHaveCount(0)
      if (faction.versions > 1) {
        await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Current Space Marines codex · 12 Oct 2026')
        await retryUntilVisible(page.getByRole('option').first(), () => page.getByRole('combobox', { name: 'Rules version' }).click())
        await expect(page.getByRole('option').first().locator('[data-rules-status="current"]')).toHaveText('Current')
        await expect(page.getByRole('option').first().locator('[data-rules-status="current"]')).toHaveCSS('color', 'rgb(124, 196, 138)')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/rules-chips-${faction.slug}-${width}.png` })
    }
    await page.goto('/factions/dark-angels/rules/legacy-rosters')
    await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-30$/)
    await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Archived MFM 1.4 · 30 Sep 2026')
    await expect(page.getByRole('combobox', { name: 'Rules version' }).locator('[data-rules-status="archived"]')).toHaveText('Archived')
    await expect(page.getByRole('combobox', { name: 'Rules version' }).locator('[data-rules-status="archived"]')).toHaveCSS('width', '72px')
    await expect(page.locator('main header [data-rules-version] .lucide-archive')).toBeVisible()
    await expect(page.locator('main header [data-rules-version]')).toHaveCSS('color', 'rgb(166, 176, 174)')
    await page.locator('main header [data-rules-version]').click()
    await expect(page.getByRole('tooltip')).toContainText('Rules snapshot from 30 Sep 2026. MFM 1.4 was released on 2 Sep 2026.')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('link', { name: /Datasheets/ })).toHaveAttribute(
      'href',
      '/factions/dark-angels/rules/mfm-1-4-2026-09-30/datasheets',
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/dated-faction-rules-${width}.png`, fullPage: true })
    await page.goto('/factions/dark-angels/rules/470a-6daa-9014-12df')
    await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/space-marines-codex-2026-10-12$/)
    await page.goto('/factions/dark-angels/rules/legacy-marine-old')
    await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-02$/)
    await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Archived MFM 1.4 · 2 Sep 2026')
    await page.goto('/factions/necrons')
    await expect(page).toHaveURL(/\/factions\/necrons\/rules\/mfm-1-5$/)
    await page.goto('/factions/dark-angels/rules/legacy-rosters/datasheets')
    await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-30\/datasheets$/)
  })
}
