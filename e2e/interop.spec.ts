import { expect, test } from './test'
import { arrangeByRole } from './builder.harness'
import { readFile } from 'node:fs/promises'
import { listForgeDetailed } from '../src/core/rosterText.fixtures'
import { custodesOfficial } from '../src/core/rosterText.custodes.fixture'
import { necronsOfficial } from '../src/core/rosterText.necrons.fixture'
import { blackTemplarsNewRecruit } from '../src/core/rosterText.blackTemplars.fixture'
import { salamandersOfficial } from '../src/core/rosterText.salamanders.fixture'
import {
  confirmRosterSetup,
  chooseBattlefield,
  createRoster,
  retryUntilVisible,
  signUp,
  waitForRosterSave,
  chooseRosterAction,
  desktopContext,
  practiceBattle,
  chooseLibraryAction,
  openImport,
} from './account'

test('a list can be copied as Games Workshop text', async ({ browser }) => {
  const page = await (await browser.newContext({ ...desktopContext, permissions: ['clipboard-read', 'clipboard-write'] })).newPage()

  await signUp(page, 'Alice')

  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Overlord')
  await page.getByRole('button', { name: 'Add Overlord', exact: true }).first().click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Attach Overlord to unit' }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Immortals', exact: true }).click()
  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  for (let models = 6; models <= 10; models++) {
    await page.getByRole('button', { name: 'More models in Immortals' }).click()
    await expect(page.getByLabel('Immortals models')).toHaveText(String(models))
  }
  // Immortals take one weapon or the other for the whole squad, so the export has to
  // carry whichever was picked.
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'Select Tesla carbine' }).click()
  await expect(page.getByText('10x Tesla carbine')).toBeVisible()

  await chooseRosterAction(page, 'Export text')
  const dialog = page.getByRole('dialog', { name: 'Export roster' })
  const text = dialog.locator('pre')
  const body = dialog.locator('[data-slot="dialog-body"]')
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(dialog).toContainText('Necrons roster')
  await expect(dialog).toContainText('Awakened Dynasty')
  await expect(dialog).toContainText('Immortals')
  await expect(dialog).toContainText('10x Tesla carbine')
  await expect(dialog).toContainText('Overlord')
  await expect(dialog).toContainText('Leading: Immortals')
  await expect(dialog).toContainText('Leader: Overlord')
  await expect(text).toContainText(/Exported with Praetorium\.gg v\d+\.\d+\.\d+\s*\nRuleset: [a-z0-9-]+\s*$/)
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)
  await expect(dialog.getByRole('button', { name: 'Copy text' })).toBeInViewport()
  await expect(body).toHaveJSProperty('scrollTop', 0)
  await dialog.getByRole('button', { name: 'Copy text' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  const readable = await page.evaluate(() => navigator.clipboard.readText())
  expect(readable).toContain('• Models: 10')
  await dialog.screenshot({ path: test.info().outputPath('gw-text-export-phone.png') })
  await page.setViewportSize({ width: 1440, height: 500 })
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeInViewport()
  await dialog.screenshot({ path: test.info().outputPath('gw-text-export-desktop.png') })
  await page.setViewportSize({ width: 390, height: 500 })
  await body.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await dialog.screenshot({ path: test.info().outputPath('gw-text-export-footer-phone.png') })
  await body.evaluate((element) => element.scrollTo({ top: 0 }))
  await expect(dialog.getByRole('group', { name: 'Text layout' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^(Readable|Compact|ListForge|Warmind|WTC-style)$/ })).toHaveCount(0)
  await expect.poll(() => text.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download text' }).click()
  const download = await downloaded
  expect(await readFile(await download.path(), 'utf8')).toBe(readable)
  const review = await openImport(page)
  await review.getByLabel('Roster text').fill(readable)
  await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(review).toContainText('2 of 2 matched entries')
  await expect(review).toContainText('Matched entries at selected rules:')
  await expect(review.getByRole('alert')).toHaveCount(0)
  await review.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await page.reload()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await chooseRosterAction(page, 'Export text')
  const saved = page.getByRole('dialog', { name: 'Export roster' })
  await expect(saved.locator('pre')).toContainText('• Models: 10')
  await expect(saved.locator('pre')).toContainText('• 10x Tesla carbine')
  await expect(saved.locator('pre')).toContainText('• Leading: Immortals')
})

test('an official Custodes roster keeps all units and choices after import and reload', async ({ page }, testInfo) => {
  await signUp(page, 'Custodes importer')
  const review = await openImport(page)
  await review.getByLabel('Roster text').fill(custodesOfficial)
  await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(review).toContainText('10 of 10 matched entries')
  await expect(review.getByRole('alert')).toHaveCount(0)
  await review.screenshot({ path: testInfo.outputPath('custodes-import-review.png') })
  await review.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await page.reload()
  await expect(page.locator('[data-unit]')).toHaveCount(10)
  await chooseRosterAction(page, 'Export text')
  const text = page.getByRole('dialog', { name: 'Export roster' }).locator('pre')
  for (const line of [
    'First test (2,000 Points)',
    '• 2x Adrathic Combi-destructors',
    'Auric Exemplar',
    'Flawless Bladework',
    'Memento Moritoi',
    'Augury Uplink',
    '• Leading: Custodian Guard Sodality',
  ])
    await expect(text).toContainText(line)
})

test('an official Necrons roster keeps leaders and support after import and reload', async ({ page }, testInfo) => {
  await arrangeByRole(page)
  await signUp(page, 'Necrons importer')
  const review = await openImport(page)
  await review.getByLabel('Roster text').fill(necronsOfficial)
  await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(review).toContainText('7 of 7 matched entries')
  await expect(review).toContainText('Reported army: 1000 points. Matched entries at selected rules: 1000 points.')
  await expect(review.getByRole('alert')).toHaveCount(0)
  await review.screenshot({ path: testInfo.outputPath('necrons-import-review.png') })
  await review.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await page.reload()
  await expect(page.locator('[data-unit]')).toHaveCount(7)
  await expect(page.locator('[data-unit="Chronomancer"]')).toContainText('Supporting')
  await expect(page.locator('[data-unit="Chronomancer"]')).toContainText('Lokhust Heavy Destroyers')
  await chooseRosterAction(page, 'Export text')
  const exported = page.getByRole('dialog', { name: 'Export roster' })
  const text = exported.locator('pre')
  for (const line of [
    'CL 1K - Nekrosor & Chronomancer (1,000 Points)',
    'Force Disposition: Purge the Foe',
    '• Supporting: Lokhust Heavy Destroyers',
    '• Support: Chronomancer',
    '• Leading: Lokhust Destroyers',
    '• Leading: Skorpekh Destroyers',
    '• Warlord',
    '• Enhancement: Murdermind',
    '• Enhancement: Mark of the Nekrosor',
    '• 3x Gauss destructor',
    '• 6x Gauss cannon',
    '• 6x Skorpekh hyperphase weapons',
    '• 2x Plasmacyte',
  ])
    await expect(text).toContainText(line)
  await exported.screenshot({ path: testInfo.outputPath('necrons-import-export-desktop.png') })
  await page.setViewportSize({ width: 390, height: 700 })
  await expect(exported.getByRole('button', { name: 'Copy text' })).toBeInViewport()
  await exported.screenshot({ path: testInfo.outputPath('necrons-import-export-phone.png') })
})

test('a New Recruit chapter roster keeps its allies and attachments after import and reload', async ({ page }, testInfo) => {
  await arrangeByRole(page)
  await signUp(page, 'Chapter importer')
  const review = await openImport(page)
  await review.getByLabel('Roster text').fill(blackTemplarsNewRecruit)
  await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(review).toContainText('16 of 16 matched entries')
  await expect(review).toContainText('Reported army: 2000 points. Matched entries at selected rules: 2000 points.')
  await expect(review.getByRole('alert')).toHaveCount(0)
  await review.screenshot({ path: testInfo.outputPath('black-templars-import-review.png') })
  await review.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await page.reload()
  await expect(page.locator('[data-unit]')).toHaveCount(16)
  await expect(page.locator('[data-unit="Eversor Assassin"]')).toBeVisible()
  for (const [leader, bodyguard] of [
    ['Chaplain Grimaldus', 'Crusader Squad'],
    ['Apothecary', 'Crusader Squad'],
    ['Bladeguard Ancient', 'Bladeguard Veteran Squad'],
    ['High Marshal Helbrecht', 'Sword Brethren Squad'],
    ['Castellan', 'Sword Brethren Squad'],
  ])
    await expect(page.locator(`[data-unit="${leader}"]`)).toContainText(bodyguard)
  await chooseRosterAction(page, 'Export text')
  const exported = page.getByRole('dialog', { name: 'Export roster' })
  for (const line of [
    'Test (2,000 Points)',
    'Black Templars',
    "Marshal's Household",
    'Assault Brethren',
    'Tacticus Attack Force',
    'Force Disposition: Take and Hold',
    "Enhancement: Imperium's Sword",
    'Eversor Assassin',
  ])
    await expect(exported.locator('pre')).toContainText(line)
  await exported.screenshot({ path: testInfo.outputPath('black-templars-import-export-desktop.png') })
  await page.setViewportSize({ width: 390, height: 700 })
  await expect(exported.getByRole('button', { name: 'Copy text' })).toBeInViewport()
  await exported.screenshot({ path: testInfo.outputPath('black-templars-import-export-phone.png') })
})

test('a visitor imports the reported Salamanders detachments and keeps them after reload', async ({ page }, testInfo) => {
  await arrangeByRole(page)
  const review = await openImport(page)
  await review.getByLabel('Roster text').fill(salamandersOfficial)
  await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(review).toContainText('12 of 12 matched entries')
  await expect(review).toContainText('Reported army: 1435 points. Matched entries at selected rules: 1435 points.')
  await expect(review.getByRole('alert')).toHaveCount(0)
  await review.screenshot({ path: testInfo.outputPath('salamanders-import-review-desktop.png') })
  await page.setViewportSize({ width: 390, height: 700 })
  await review.screenshot({ path: testInfo.outputPath('salamanders-import-review-phone.png') })
  await review.getByRole('button', { name: 'Open imported draft', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-unit]')).toHaveCount(12)
  await page.reload()
  await expect(page.locator('[data-unit]')).toHaveCount(12)
  for (const [leader, count] of [
    ['Adrax Agatone', 1],
    ["Vulkan He'stan", 1],
    ['Apothecary', 2],
  ] as const) {
    const cards = page.locator(`[data-unit="${leader}"]`)
    await expect(cards).toHaveCount(count)
    for (const card of await cards.all()) await expect(card).toContainText('Infernus Squad')
  }
  await chooseRosterAction(page, 'Export text')
  const exported = page.getByRole('dialog', { name: 'Export roster' })
  for (const line of ['Dudes (1,435 Points)', 'Salamanders', 'Deathwatch Support', "Forgefather's Seekers", '3 Detachment Points'])
    await expect(exported.locator('pre')).toContainText(line)
  await exported.screenshot({ path: testInfo.outputPath('salamanders-import-export-phone.png') })
})

test('an imported roster with disagreeing dispositions asks for one before battle setup', async ({ page }) => {
  await signUp(page, 'Bob')

  await page.goto('/rosters')
  await retryUntilVisible(page.getByLabel('Roster text'), () => page.getByRole('button', { name: 'Import roster' }).click())
  await page.getByLabel('Roster text').fill(`HLHOTD 2K - C'tan (1995 Points)

Necrons
Hypercrypt Legion and Hand of the Dynasty (3 Detachment Points)
Force Dispositions: Reconnaissance, Take and Hold
Strike Force (2,000 Points)

CHARACTER

Overlord (85 Points)
  • Warlord

Exported with BattleBase, Data Version: v20260812`)
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await page.getByRole('button', { name: 'Import anyway', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)

  const notice = page.getByRole('alert').filter({ hasText: 'Pick a disposition.' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Choose one' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Take and Hold', exact: true }).click()
  await waitForRosterSave(page, () => confirmRosterSetup(setup))
  await expect(notice).toHaveCount(0)
  await expect(page.getByText('Take and Hold', { exact: true })).toBeVisible()

  for (const disposition of ['Take and Hold', 'Reconnaissance']) {
    if (disposition === 'Reconnaissance') {
      await chooseRosterAction(page, 'Edit roster setup')
      await setup.getByRole('button', { name: disposition, exact: true }).click()
      await waitForRosterSave(page, () => confirmRosterSetup(setup))
    }
    await page.reload()
    await expect(page.getByText(disposition, { exact: true })).toBeVisible()
    await chooseRosterAction(page, 'Export text')
    const exported = page.getByRole('dialog', { name: 'Export roster' })
    await expect(exported.locator('pre')).toContainText(`Force Disposition: ${disposition}\n`)
    await expect(exported.locator('pre')).not.toContainText('Force Dispositions:')
    await exported.screenshot({ path: test.info().outputPath(`selected-disposition-export-${disposition.toLowerCase()}.png`) })
    await exported.getByRole('button', { name: 'Close' }).click()
  }

  await practiceBattle(page, "HLHOTD 2K - C'tan")
  await chooseBattlefield(page)
})

test('a ListForge export imports through review and exports as readable text', async ({ page }) => {
  await signUp(page, 'Switcher')
  const review = await openImport(page)
  await review.getByLabel('Roster text').fill(listForgeDetailed)
  await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(review).toContainText('Sanitised list · 6 of 6 matched entries')
  await expect(review).toContainText('Reported army: 510 points. Matched entries at selected rules: 510 points.')
  await review.screenshot({ path: test.info().outputPath('listforge-import-review.png') })
  await review.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-unit="Venom"]')).toHaveCount(2)
  await chooseRosterAction(page, 'Export text')
  const exported = page.getByRole('dialog', { name: 'Export roster' })
  await expect(exported.locator('pre')).toContainText('Sanitised list (510 Points)\n')
  await expect(exported.locator('pre')).toContainText('Enhancement: Informant Network\n')
  await expect(exported.locator('pre')).toContainText('Exported with Praetorium.gg')
})

for (const count of [0, 1, 3]) {
  test(`an account reviews and saves all ${count} source entries, and cancelling writes nothing`, async ({ page }) => {
    await signUp(page, `Entry count ${count}`)
    const review = await openImport(page)
    const text = `Saved entries (999 Points)\n\nNecrons\nAwakened Dynasty\nForce Disposition: Take and Hold\nStrike Force (2,000 Points)\n\nBATTLELINE\n\n${'Immortals (65 Points)\n • 5x Gauss blaster\n • 5x Close combat weapon\n • Models: 5\n\n'.repeat(count)}Exported with Praetorium.gg vtest\n`
    await review.getByLabel('Roster text').fill(text)
    await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
    await expect(review).toContainText(`${count} of ${count} matched ${count === 1 ? 'entry' : 'entries'}`)
    await review.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('[data-roster]')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('[data-roster]')).toHaveCount(0)
    await retryUntilVisible(review.getByLabel('Roster text'), () =>
      page.getByRole('button', { name: 'Import roster', exact: true }).click(),
    )
    await review.getByLabel('Roster text').fill(text)
    await review.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
    await review.getByRole('button', { name: 'Import roster', exact: true }).click()
    await page.waitForURL(/\/rosters\/[^/]+$/)
    await page.reload()
    await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(count)
    await page.goto('/rosters')
    await expect(page.locator('[data-roster]')).toHaveCount(1)
    await chooseLibraryAction(page, 'Saved entries', 'Export text')
    const exported = page.getByRole('dialog', { name: 'Export roster' })
    expect((await exported.locator('pre').innerText()).match(/• Models: 5/g) ?? []).toHaveLength(count)
    if (count === 1) {
      await page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('clipboard denied')) })
      })
      await exported.getByRole('button', { name: 'Copy text', exact: true }).click()
      await expect(exported.getByRole('alert')).toHaveText('Copy failed. Select the text to copy it.')
      await expect(exported.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0)
    }
  })
}
