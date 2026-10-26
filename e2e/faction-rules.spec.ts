import { expect, test } from './test'
import { retryUntilVisible, expectNoPageOverflow } from './account'

const factions = [
  { name: 'Blood Angels', slug: 'blood-angels', versions: 6 },
  { name: 'Dark Angels', slug: 'dark-angels', versions: 8 },
  { name: 'Salamanders', slug: 'salamanders', versions: 7 },
  { name: 'Space Marines', slug: 'space-marines', versions: 5 },
]

test('Custodes reference retains cards with unsupported battle timing', { tag: '@catalogue' }, async ({ page }, testInfo) => {
  const factionPath = '/factions/adeptus-custodes/rules/custodes-codex-2026-10-17'
  await page.goto(factionPath)
  const detachments = page.getByRole('region', { name: 'Detachments', exact: true })
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
  const stratagems = page.getByRole('region', { name: 'Stratagems', exact: true })
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
    await expectNoPageOverflow(page)
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
      await expectNoPageOverflow(page)
      await page.screenshot({ path: testInfo.outputPath(`status-history-${path.split('/').at(-1)}-${width}.png`) })
    }
  }
})

test('faction cards open current rules and the rules version menu lists every version', { tag: '@catalogue' }, async ({ page }) => {
  for (const faction of factions) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/factions')
    const row = page.locator(`[data-faction="${faction.name}"]`).first()
    const link = row.getByRole('link', { name: new RegExp(`^${faction.name}`) })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(link).toHaveAttribute('href', `/factions/${faction.slug}/rules/mfm-1-6`)
      await expect(row).toContainText(faction.versions > 1 ? `${faction.versions} rules versions` : 'detachments')
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/factions/${faction.slug}/rules/mfm-1-6$`))
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.getByRole('heading', { level: 1, name: faction.name, exact: true })).toBeVisible()
      await expect(page.locator('main header [data-rules-version]')).toHaveCount(0)
      if (faction.versions > 1) {
        await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Current MFM 1.6')
        await retryUntilVisible(page.getByRole('option').first(), () => page.getByRole('combobox', { name: 'Rules version' }).click())
        await expect(page.getByRole('option')).toHaveCount(faction.versions)
        await expect(page.getByRole('option').first().locator('[data-rules-status="current"]')).toHaveText('Current')
        await expect(page.getByRole('option').first().locator('[data-rules-status="current"]')).toHaveCSS('color', 'rgb(124, 196, 138)')
      }
      await expectNoPageOverflow(page)
      await page.screenshot({ path: test.info().outputPath(`rules-chips-${faction.slug}-${width}.png`) })
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
    await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Archived MFM 1.4')
    await expect(page.getByRole('combobox', { name: 'Rules version' }).locator('[data-rules-status="archived"]')).toHaveText('Archived')
    await expect(page.getByRole('combobox', { name: 'Rules version' }).locator('[data-rules-status="archived"]')).toHaveCSS('width', '72px')
    await expect(page.locator('main header [data-rules-version] .lucide-archive')).toBeVisible()
    await expect(page.locator('main header [data-rules-version]')).toHaveCSS('color', 'rgb(166, 176, 174)')
    await page.locator('main header [data-rules-version]').click()
    await expect(page.getByRole('tooltip')).toContainText(
      'Munitorum Field Manual 1.4 rules, released on 2 Sep 2026, as captured on 30 Sep 2026.',
    )
    await page.keyboard.press('Escape')
    await expect(page.getByRole('link', { name: /Datasheets/ })).toHaveAttribute(
      'href',
      '/factions/dark-angels/rules/mfm-1-4-2026-09-30/datasheets',
    )
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath(`dated-faction-rules-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/factions/dark-angels/rules/470a-6daa-9014-12df')
  await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-6$/)
  await page.goto('/factions/dark-angels/rules/legacy-marine-old')
  await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-02$/)
  await expect(page.getByRole('combobox', { name: 'Rules version' })).toHaveText('Archived MFM 1.4 · 2 Sep 2026')
  await page.goto('/factions/necrons')
  await expect(page).toHaveURL(/\/factions\/necrons\/rules\/mfm-1-6$/)
  await page.goto('/factions/necrons/rules/mfm-1-5/datasheets/overlord')
  await expect(page).toHaveURL(/\/factions\/necrons\/rules\/mfm-1-6\/datasheets\/overlord$/)
  await page.goto('/factions/adeptus-custodes/rules/mfm-1-5')
  await expect(page).toHaveURL(/\/factions\/adeptus-custodes\/rules\/space-marines-points-2026-10-13$/)
  await page.goto('/factions/dark-angels/rules/legacy-rosters/datasheets')
  await expect(page).toHaveURL(/\/factions\/dark-angels\/rules\/mfm-1-4-2026-09-30\/datasheets$/)
})

test('a detachment address under a faction that borrows it opens the printing faction’s page', { tag: '@catalogue' }, async ({ page }) => {
  await page.goto('/factions/dark-angels/detachments/gladius-task-force')
  await expect(page).toHaveURL(/\/factions\/space-marines\/rules\/[^/]+\/detachments\/gladius-task-force$/)
  await expect(page.getByRole('heading', { name: 'Gladius Task Force', level: 1 })).toBeVisible()
})
