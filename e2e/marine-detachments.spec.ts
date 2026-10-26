import { expect, test } from './test'
import { expectNoPageOverflow } from './account'

for (const width of [390, 1440]) {
  test(`Marine chapter detachment navigation survives reload at ${width}px @catalogue`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const chapter = 'salamanders'
    const detachment = "Forgefather's Seekers"
    await page.goto(`/factions/${chapter}`)
    const list = page.getByRole('region', { name: 'Detachments', exact: true })
    await expect(list.locator('h2 > .readout')).toHaveText('1')
    await expect(list.getByRole('link', { name: /^Gladius Task Force/ })).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`marine-${chapter}-${width}.png`), fullPage: true })
    await list.getByRole('link', { name: new RegExp(`^${detachment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click()
    await expect(page.getByRole('heading', { level: 1, name: detachment, exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/factions/${chapter}/.*detachments/`))
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: detachment, exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`marine-${chapter}-detachment-${width}.png`), fullPage: true })
    const version = 'space-marines-codex-2026-10-03'
    await page.goto(`/factions/salamanders/rules/${version}`)
    await page
      .getByRole('region', { name: 'Detachments', exact: true })
      .getByRole('link', { name: /^Forgefather's Seekers/ })
      .click()
    await expect(page).toHaveURL(`/factions/salamanders/rules/${version}/detachments/forgefathers-seekers`)
    await expect(page.getByRole('heading', { level: 1, name: "Forgefather's Seekers", exact: true })).toBeVisible()
    await page.goto(`/factions/space-marines/rules/${version}`)
    const parentList = page.getByRole('region', { name: 'Detachments', exact: true })
    await expect(parentList.getByRole('link', { name: /^Forgefather's Seekers/ })).toHaveCount(0)
    await parentList.getByRole('link', { name: /^Gladius Task Force/ }).click()
    await expect(page).toHaveURL(`/factions/space-marines/rules/${version}/detachments/gladius-task-force`)
    await expect(page.getByRole('heading', { level: 1, name: 'Gladius Task Force', exact: true })).toBeVisible()
    await expectNoPageOverflow(page)
  })
}
