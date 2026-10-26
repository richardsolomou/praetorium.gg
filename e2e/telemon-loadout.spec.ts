import { expect, test } from './test'
import { visitorSetup, chooseRosterAction, expectNoPageOverflow, chooseFaction } from './account'
import { add, expectNoHorizontalOverflow } from './builder.harness'
import { guestDraft } from './storage'

for (const width of [1440, 390]) {
  test(`Telemon bundles select and persist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const setup = await visitorSetup(page)
    await chooseFaction(setup, 'Adeptus Custodes')
    await setup.getByRole('button', { name: 'Select Aquilan Shield', exact: true }).click()
    await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
    await setup.getByRole('button', { name: 'Create roster' }).click()
    if (width < 1300) await page.getByRole('button', { name: 'Add units', exact: true }).click()
    await add(page, 'Telemon Heavy Dreadnought')
    if (width < 1300) await page.getByRole('button', { name: 'Close', exact: true }).click()

    const card = page.locator('[data-unit="Telemon Heavy Dreadnought"]')
    await card.getByRole('button', { name: 'Telemon Heavy Dreadnought', exact: true }).click()
    const loadout = page.locator('aside[aria-label="Loadout"]')
    const weapons = loadout.getByRole('group', { name: 'Telemon Heavy Dreadnought Heavy weapons', exact: true })
    const dual = 'Dual Caestus Fists + 2 Twin Neutronium Cascade Projectors'
    const dualOption = weapons.locator('article').filter({ has: page.getByRole('button', { name: `Select ${dual}`, exact: true }) })
    await expect(weapons.getByRole('button', { name: /^Select / })).toHaveCount(4)
    await expect(dualOption.getByRole('heading', { name: 'Caestus Fist', exact: true })).toHaveCount(0)
    // The chosen bundle's weapons appear once among the equipped weapons as well as in their option.
    const equipped = loadout.locator('section').filter({ has: page.getByRole('heading', { name: /^Equipped/ }) })
    await expect(dualOption.getByRole('heading', { name: 'Dual Caestus Fists', exact: true })).toHaveCount(1)
    await expect(equipped.getByRole('heading', { name: 'Dual Caestus Fists', exact: true })).toHaveCount(1)
    await expect(dualOption.getByRole('heading', { name: '2× Twin Neutronium Cascade Projectors', exact: true })).toHaveCount(1)
    await expect(equipped.getByRole('heading', { name: '2× Twin Neutronium Cascade Projectors', exact: true })).toHaveCount(1)
    await expect(card).toContainText('2x Twin Neutronium Cascade Projectors')
    await expectNoPageOverflow(page)
    await expectNoHorizontalOverflow(loadout)
    await page.screenshot({ path: test.info().outputPath(`telemon-dual-${width}.png`) })

    for (const gun of ['Adrathic Desolator', 'Arachnus Storm Cannon', 'Iliastus Accelerator Culverin']) {
      const label =
        gun === 'Iliastus Accelerator Culverin'
          ? `Caestus Fist + ${gun} + Twin Neutronium Cascade Projectors`
          : `${gun} + Caestus Fist + Twin Neutronium Cascade Projectors`
      const gunOption = weapons.locator('article').filter({ has: page.getByRole('button', { name: `Select ${label}`, exact: true }) })
      await expect(gunOption.getByRole('heading', { name: gun, exact: true })).toHaveCount(1)
      const before = await guestDraft(page)
      await gunOption.getByRole('button', { name: `Select ${label}`, exact: true }).click()
      await expect(card).toContainText(`1x ${gun}`)
      await expect(card).toContainText('1x Twin Neutronium Cascade Projectors')
      await expect(loadout.getByRole('heading', { name: gun, exact: true })).toHaveCount(1)
      await expect(gunOption.getByRole('heading', { name: 'Caestus Fist', exact: true })).toHaveCount(1)
      await expect(gunOption.getByRole('heading', { name: 'Dual Caestus Fists', exact: true })).toHaveCount(0)
      await expect(gunOption.getByRole('heading', { name: 'Twin Neutronium Cascade Projectors', exact: true })).toHaveCount(1)
      await expect.poll(() => guestDraft(page)).not.toBe(before)
    }
    await expectNoHorizontalOverflow(loadout)
    await page.screenshot({ path: test.info().outputPath(`telemon-gun-${width}.png`) })
    await page.reload()
    await expect(card).toContainText('1x Iliastus Accelerator Culverin')
    if (width >= 1300 || !(await loadout.getByRole('button', { name: 'Back to roster', exact: true }).isVisible())) {
      await card.getByRole('button', { name: 'Telemon Heavy Dreadnought', exact: true }).click()
    }
    await expect(weapons.getByRole('heading', { name: 'Iliastus Accelerator Culverin', exact: true })).toHaveCount(1)
    await weapons.getByRole('button', { name: `Select ${dual}`, exact: true }).click()
    await expect(card).toContainText('2x Twin Neutronium Cascade Projectors')
    await expect(dualOption.getByRole('heading', { name: 'Caestus Fist', exact: true })).toHaveCount(0)
    if (width < 1300) await loadout.getByRole('button', { name: 'Back to roster', exact: true }).click()
    await page.getByRole('button', { name: 'View', exact: true }).click()
    if (width < 1300) await card.getByRole('button', { name: 'Telemon Heavy Dreadnought', exact: true }).click()
    await expect(equipped.getByRole('heading', { name: '2× Twin Neutronium Cascade Projectors', exact: true })).toHaveCount(1)
    await expect(weapons.getByRole('button', { name: /^Select / })).toHaveCount(0)
    if (width < 1300) await loadout.getByRole('button', { name: 'Back to roster', exact: true }).click()
    await chooseRosterAction(page, 'Export text')
    const exported = page.getByRole('dialog', { name: 'Export roster' }).locator('pre')
    await expect(exported).toContainText('2x Twin Neutronium Cascade Projectors')
    await expect(exported).not.toContainText('Iliastus Accelerator Culverin')
  })
}
