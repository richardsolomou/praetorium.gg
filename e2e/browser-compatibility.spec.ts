import { chooseCombatUnit } from './combat'
import { expect, test } from './test'
import { guestDraft } from './storage'

test('roster creation and loadout odds work without native array-copy methods', async ({ page }) => {
  await page.addInitScript(() => {
    const methods = ['toSorted', 'toReversed', 'toSpliced', 'with']
    for (const method of methods) Reflect.deleteProperty(Array.prototype, method)
    const NativeBlob = window.Blob
    // Inline workers need their own globals reset before their bundle executes.
    window.Blob = class extends NativeBlob {
      constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
        const reset = `for (const name of ${JSON.stringify(methods)}) delete Array.prototype[name];`
        super(options?.type?.startsWith('text/javascript') ? [reset, ...parts] : parts, options)
      }
    }
  })
  await page.goto('/factions/necrons/datasheets/imotekh-the-stormlord')
  await page.getByRole('button', { name: 'Add to roster', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await setup.getByRole('button', { name: 'Select Awakened Dynasty', exact: true }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster', exact: true }).click()
  await expect(page.locator('[data-unit]').filter({ hasText: 'Imotekh the Stormlord' })).toHaveCount(1)
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
  await page.reload()
  await expect(page.locator('[data-unit]').filter({ hasText: 'Imotekh the Stormlord' })).toHaveCount(1)
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Orks', 'Boyz')
  await chooseCombatUnit(page, 'Defender', 'Necrons', 'Tomb Blades')
  await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
  const loadout = page.getByRole('dialog', { name: 'Attacker · Boyz' })
  await expect(loadout.getByLabel(/^Shooting, unit with one more: <?\d+\.\d+% destroyed/).first()).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('browser-array-copy-loadouts.png') })
})
