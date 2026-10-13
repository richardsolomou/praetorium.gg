import { expect, test } from '@playwright/test'
import { retryUntilVisible } from './account'

const factions = [
  { name: 'Blood Angels', slug: 'blood-angels', versions: 5 },
  { name: 'Dark Angels', slug: 'dark-angels', versions: 7 },
  { name: 'Salamanders', slug: 'salamanders', versions: 6 },
  { name: 'Space Marines', slug: 'space-marines', versions: 4 },
]

test('Custodes reference retains cards with unsupported battle timing', { tag: '@catalogue' }, async ({ page }, testInfo) => {
  const factionPath = '/factions/adeptus-custodes/rules/custodes-codex-2026-10-17'
  await page.goto(factionPath)
  const detachments = page.locator('[data-onboarding="faction-detachments"]')
  for (const [name, count] of [
    ['Aquilan Shield', 3],
    ['Auric Champions', 2],
    ['Dread Host', 3],
    ['Emissaries Imperatus', 3],
    ['Emperor’s Chosen', 3],
    ['Grav-Assault Force', 3],
    ['Guardians of the Throne', 6],
    ['Honoured Companions', 3],
    ['Lions of the Emperor', 3],
    ['Might of the Moritoi', 3],
    ['Null Maiden Vigil', 3],
    ['Shadowkeepers', 3],
    ['Solar Watch', 3],
  ] as const) {
    await expect(detachments.getByRole('link', { name: new RegExp(`^${name}\\s`, 'i') })).toContainText(`${count} stratagems`)
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await detachments.getByRole('link', { name: /^Guardians of the Throne\s/i }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`custodes-detachment-counts-${width}.png`) })
  }
  await detachments.getByRole('link', { name: /^Guardians of the Throne\s/i }).click()
  const stratagems = page.locator('[data-onboarding="detachment-stratagems"]')
  await expect(stratagems.locator('article')).toHaveCount(6)
  await expect(stratagems).toContainText('Superhuman Focus')
  await expect(stratagems).toContainText('In Auramite Clad')
  await page.reload()
  await expect(stratagems.locator('article')).toHaveCount(6)
  const firstCard = stratagems.locator('article').first()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await firstCard.scrollIntoViewIfNeeded()
    await expect(firstCard).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`guardians-stratagems-${width}.png`) })
  }
  await page.goto(`${factionPath}/detachments/auric-champions`)
  await expect(stratagems.locator('article')).toHaveCount(2)
  await expect(stratagems).toContainText('Gilded Champion')
  await expect(stratagems).toContainText('Duty Unto Death')
})

test(
  'current Redeemer rules include Machine Spirit while retained rules stay unchanged',
  { tag: '@catalogue' },
  async ({ page }, testInfo) => {
    await page.goto('/factions/space-marines/datasheets/land-raider-redeemer')
    const ability = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Wrath of the Machine Spirit', exact: true }) })
    await expect(ability).toContainText('Devastating Wounds: non-Monster/vehicle')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.reload()
      await expect(ability).toContainText('Devastating Wounds: non-Monster/vehicle')
      await page.getByRole('heading', { name: 'Wrath of the Machine Spirit', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`redeemer-current-${width}.png`) })
    }
    await page.goto('/factions/space-marines/rules/space-marines-codex-2026-10-12/datasheets/land-raider-redeemer')
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.getByRole('heading', { level: 1, name: 'Land Raider Redeemer', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Wrath of the Machine Spirit', exact: true })).toHaveCount(0)
    }
  },
)

test('rules history labels recorded status dates rather than publisher dates', { tag: '@catalogue' }, async ({ page }, testInfo) => {
  for (const path of ['/factions/space-marines/rules/space-marines-codex-2026-10-03', '/factions/dark-angels/rules/mfm-1-4-2026-09-30']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    await expect(page).toHaveURL(path)
    const history = page.locator('main details').filter({ has: page.locator('summary', { hasText: 'Rules history' }) })
    await history.locator('summary').click()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(history).toContainText(
        'These dates record status changes in Praetorium; publisher release and effective dates can differ.',
      )
      const events = history.getByRole('listitem')
      await expect(events.first()).toBeVisible()
      for (const event of await events.all()) await expect(event).toHaveText(/ · (Preview|Release|Archive) recorded$/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`status-history-${path.split('/').at(-1)}-${width}.png`) })
    }
  }
})

test('faction links open current rules and version menus identify archives', { tag: '@catalogue' }, async ({ page }) => {
  for (const faction of factions) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/factions')
    const row = page.locator(`[data-faction="${faction.name}"]`).first()
    const link = row.getByRole('link', { name: faction.name, exact: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(link).toHaveAttribute('href', `/factions/${faction.slug}/rules/space-marines-points-2026-10-13`)
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
        await expect(items.first()).toHaveText('Current Space Marines points · 13 Oct 2026')
        await expect(page.getByRole('menu')).not.toContainText('Previous rules')
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menu')).toHaveCount(0)
      } else {
        await expect(row.getByRole('button', { name: `Rules versions for ${faction.name}` })).toHaveCount(0)
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/factions/${faction.slug}/rules/space-marines-points-2026-10-13$`))
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.getByRole('heading', { level: 1, name: faction.name, exact: true })).toBeVisible()
      await expect(page.locator('main header [data-rules-version]')).toHaveCount(0)
      if (faction.versions > 1) {
        await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Current Space Marines points · 13 Oct 2026')
        await retryUntilVisible(page.getByRole('option').first(), () => page.getByRole('combobox', { name: 'Rules version' }).click())
        await expect(page.getByRole('option').first().locator('[data-rules-status="current"]')).toHaveText('Current')
        await expect(page.getByRole('option').first().locator('[data-rules-status="current"]')).toHaveCSS('color', 'rgb(124, 196, 138)')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/rules-chips-${faction.slug}-${width}.png` })
      if (faction.versions > 1) {
        await page.keyboard.press('Escape')
        await expect(page.getByRole('option')).toHaveCount(0)
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/factions/dark-angels/rules/legacy-rosters')
  await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-30$/)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
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
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/factions/dark-angels/rules/470a-6daa-9014-12df')
  await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/space-marines-points-2026-10-13$/)
  await page.goto('/factions/dark-angels/rules/legacy-marine-old')
  await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-02$/)
  await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Archived MFM 1.4 · 2 Sep 2026')
  await page.goto('/factions/necrons')
  await expect(page).toHaveURL(/\/factions\/necrons\/rules\/mfm-1-5$/)
  await page.goto('/factions/dark-angels/rules/legacy-rosters/datasheets')
  await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-30\/datasheets$/)
})
