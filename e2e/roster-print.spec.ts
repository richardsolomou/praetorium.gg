import { expect, test } from './test'
import {
  createRoster,
  signInAsPreview,
  signUp,
  startBattle,
  uniqueName,
  waitForRosterSave,
  addUnit,
  chooseRosterAction,
  practiceBattle,
  PHONE,
  playerPanel,
} from './account'
import { attach } from './builder.harness'
import { NATIVE_BRIDGE_SCRIPT, parseNativeActionRequest } from '../mobile/src/nativeActions'
import { lastPathSegment } from './storage'

test('a full saved army prints selected equipment, both detachments and every page', async ({ page }, testInfo) => {
  await signInAsPreview(page)
  await expect(page.getByRole('button', { name: 'Account menu for Preview Player', includeHidden: true }).first()).toBeAttached()
  await page.goto('/rosters/preview-necrons-cursed-skyshroud')
  await expect(page.locator('[data-unit]')).toHaveCount(13)
  const name = await page.getByLabel('List name').inputValue()
  const points = await page.locator('[data-stat="points"]').innerText()
  await chooseRosterAction(page, 'Export text')
  const exportDialog = page.getByRole('dialog', { name: 'Export roster' })
  const exported = await exportDialog.locator('pre').innerText()
  await exportDialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printedDatasheets = String(document.querySelectorAll('[data-print-datasheet]').length)
    }
  })
  await chooseRosterAction(page, 'Print')
  const pack = page.locator('[data-battle-reference-pack]')
  await expect(pack.locator('[data-print-datasheet]')).toHaveCount(13)
  await expect(page.locator('html')).toHaveAttribute('data-printed-datasheets', '13')
  await expect(pack).toContainText(points.replaceAll(/\s/g, '') + ' points')
  await expect(pack).toContainText('13 units · 48 models')
  await expect(pack).toContainText('Cursed Legion (2 DP) · Skyshroud Spearhead (1 DP)')
  await expect(pack).toContainText('Rules version: MFM')
  await expect(pack).toContainText('Warlord')
  await expect(pack).toContainText('Force disposition: Purge the Foe')
  await expect(pack.getByRole('heading', { name: /Cursed Legion: detachment rules/i })).toBeVisible()
  await expect(pack.getByRole('heading', { name: /Skyshroud Spearhead: detachment rules/i })).toBeVisible()
  await expect(pack.getByRole('heading', { name: /Insane Bravery/ })).toHaveCount(1)
  const immortals = pack.locator('[data-print-datasheet="Immortals"]')
  await expect(immortals).toContainText('10× Gauss blaster')
  expect(exported).toContain('10x Gauss blaster')
  await page.setViewportSize(PHONE)
  await expect(page.getByRole('button', { name: 'Print battle reference pack', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('print-pack-phone.png') })
  await page.evaluate(() => {
    Object.defineProperty(window, 'ReactNativeWebView', {
      value: {
        postMessage: (message: string) => {
          if (JSON.parse(message).type === 'native-print') localStorage.setItem('e2e-print-action', message)
        },
      },
    })
  })
  await page.evaluate(NATIVE_BRIDGE_SCRIPT)
  await page.getByRole('button', { name: 'Print battle reference pack', exact: true }).click()
  const nativeAction = parseNativeActionRequest(await page.evaluate(() => localStorage.getItem('e2e-print-action')!))
  if (nativeAction?.kind !== 'print') throw new Error('Native print request missing')
  expect(nativeAction.html.match(/data-print-datasheet=/g)).toHaveLength(13)
  expect(nativeAction.html).not.toContain('<script')
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('button', { name: 'Return to roster', exact: true })).toBeHidden()
  await expect.poll(() => pack.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false)
  await page.pdf({ path: testInfo.outputPath('battle-reference-pack.pdf'), format: 'A4', printBackground: false, preferCSSPageSize: true })
  await page.pdf({
    path: testInfo.outputPath('battle-reference-pack-colour.pdf'),
    format: 'Letter',
    printBackground: true,
    preferCSSPageSize: true,
  })
  await page.screenshot({ path: testInfo.outputPath('print-pack-long.png'), fullPage: true })
  await page.emulateMedia({ media: 'screen' })
  await page.getByRole('button', { name: 'Return to roster' }).click()
  const battleUrl = await practiceBattle(page, name)
  await page.goto(`/rosters/preview-necrons-cursed-skyshroud?battle=${lastPathSegment(battleUrl)}`)
  await expect(page.locator('[data-unit]')).toHaveCount(13)
  await expect(page.locator('[data-stat="points"]')).toHaveText(points)
  await expect(page.locator('[data-unit="Immortals"]')).toContainText('10x Gauss blaster')
  await page.goto(battleUrl)
  await startBattle(page)
  const player = playerPanel(page, 0)
  await expect(player.locator('[data-army-models]')).toHaveText('48/48')
  await player.locator('[data-army-models]').screenshot({ path: testInfo.outputPath('recorded-full-army-count.png') })
  await player.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  const recordedArmy = page.locator('[data-army-roster]')
  await expect(recordedArmy.locator('[data-unit]')).toHaveCount(13)
  await page.screenshot({ path: testInfo.outputPath('recorded-full-army.png') })
})

test('attached datasheets stay grouped and a missing reference never prints a partial pack', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = 'true'
    }
  })
  await signUp(page, uniqueName('Print attachments'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Attached army' })
  await chooseRosterAction(page, 'Print')
  const pack = page.locator('[data-battle-reference-pack]')
  await expect(pack).toContainText('0 units · 0 models')
  await expect(pack.locator('[data-print-datasheet]')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'true')
  await page.getByRole('button', { name: 'Return to roster' }).click()
  await addUnit(page, 'Immortals')
  await addUnit(page, 'Technomancer')
  await waitForRosterSave(page, () => attach(page, 'Technomancer', 'Immortals'))
  await chooseRosterAction(page, 'Print')
  await expect(pack.locator('[data-print-unit]')).toHaveCount(1)
  await expect(pack.locator('[data-print-datasheet]')).toHaveCount(2)
  await expect(pack).toContainText('Supporting Immortals (Unit 1)')
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'true')
  await page.getByRole('button', { name: 'Return to roster' }).click()
  await page.reload()
  await expect(page.locator('[data-unit]')).toHaveCount(2)
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await route.abort()
    else await route.continue()
  })
  await chooseRosterAction(page, 'Print')
  await expect(page.getByRole('alert')).toContainText('could not be prepared')
  await expect(page.locator('html')).not.toHaveAttribute('data-printed', 'true')
  await expect(pack).toHaveCount(0)
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(pack.locator('[data-print-datasheet]')).toHaveCount(2)
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'true')
})

test('a saved mixed-equipment pack agrees with export and the fielded army', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await signUp(page, uniqueName('Print mixed equipment'))
  const name = await createRoster(page, { faction: 'Death Guard', detachment: /Champions of Contagion/, name: 'Mixed equipment' })
  await addUnit(page, 'Plague Marines')
  const rosterId = lastPathSegment(page.url())
  const card = page.locator('[data-unit="Plague Marines"]')
  await card.getByRole('button', { name: /^Plague Marines/ }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  const champion = loadout.locator('section').filter({ hasText: 'Plague Champion' })
  await waitForRosterSave(page, () => champion.getByRole('button', { name: 'More Plasma gun' }).click())
  const marines = loadout.locator('section').filter({ has: page.getByLabel('Plague Marine models', { exact: true }) })
  await waitForRosterSave(page, () => marines.getByRole('button', { name: 'More Plague spewer' }).click())
  const points = await page.locator('[data-stat="points"]').innerText()
  await chooseRosterAction(page, 'Export text')
  const dialog = page.getByRole('dialog', { name: 'Export roster' })
  const exported = await dialog.locator('pre').innerText()
  expect(exported).toContain('3x Boltgun')
  expect(exported).toContain('1x Plasma gun')
  expect(exported).toContain('1x Plague spewer')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printedCards = String(document.querySelectorAll('[data-unit], [data-print-datasheet]').length)
    }
  })
  await page.goto(`/rosters/${rosterId}?print=true`)
  const pack = page.locator('[data-battle-reference-pack]')
  await expect(pack).toContainText('1 unit · 5 models')
  await expect(pack).toContainText(points.replaceAll(/\s/g, '') + ' points')
  await expect(pack).toContainText('3× Boltgun')
  await expect(pack).toContainText('1× Plasma gun')
  await expect(pack).toContainText('1× Plague spewer')
  await expect(page.locator('html')).toHaveAttribute('data-printed-cards', '1')
  await page.pdf({ path: testInfo.outputPath('mixed-equipment.pdf'), format: 'A4' })
  await page.getByRole('button', { name: 'Return to roster' }).click()
  const battleUrl = await practiceBattle(page, name)
  await page.goto(`/rosters/${rosterId}?battle=${lastPathSegment(battleUrl)}&print=true`)
  await expect(page.locator('html')).toHaveAttribute('data-printed-cards', '1')
  await expect(page.locator('[data-battle-reference-pack]')).toHaveCount(0)
  const recorded = page.locator('[data-unit="Plague Marines"]')
  await expect(recorded).toContainText('3x Boltgun')
  await expect(recorded).toContainText('1x Plasma gun')
  await expect(recorded).toContainText('1x Plague spewer')
  await expect(page.locator('[data-stat="points"]')).toHaveText(points)
  await recorded.screenshot({ path: testInfo.outputPath('recorded-mixed-equipment.png') })
})
