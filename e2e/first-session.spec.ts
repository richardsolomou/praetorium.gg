import { expect, test } from './test'
import {
  advance,
  attachRoster,
  createRoster,
  PRACTICE_OPPONENT,
  setupStep,
  signUp,
  startBattle,
  uniqueName,
  visitorSetup,
  chooseFaction,
  chooseOption,
  concede,
  openImport,
  PHONE,
} from './account'
import { guestDraft } from './storage'

const rosterText = `First army (65 Points)

Necrons
Awakened Dynasty
Force Disposition: Take and Hold
Strike Force (2,000 Points)

BATTLELINE

Immortals (65 Points)
  • 5x Immortal
    • 5x Gauss blaster
    • 5x Close combat weapon

Exported with BattleBase, Data Version: v20260812`

test('a guest reviews, imports and saves their first list', async ({ page }, testInfo) => {
  const dialog = await openImport(page)
  await dialog.getByLabel('Roster text').fill(rosterText)
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(dialog).toContainText('1 of 1 matched entry')
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await dialog.screenshot({ path: testInfo.outputPath(`guest-import-review-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await dialog.getByRole('button', { name: 'Open imported draft', exact: true }).click()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
  await page.reload()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  const save = page.getByRole('button', { name: 'Save roster', exact: true })
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    if (width < 1300) {
      const add = page.getByRole('button', { name: 'Add units', exact: true })
      expect((await save.boundingBox())!.height).toBe((await add.boundingBox())!.height)
    } else {
      expect((await save.boundingBox())!.height).toBeLessThan(44)
    }
    await page.screenshot({ path: testInfo.outputPath(`guest-import-builder-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await signUp(page, uniqueName('Importer'))
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Save it', exact: true }).click()
  await expect(page).toHaveURL(/\/rosters\/[^/]+$/)
  await page.reload()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await page.goto('/rosters')
  await expect(page.locator('[data-roster]')).toHaveCount(1)
})

test('an import names a missing unit and lets the guest correct the text before opening a draft', async ({ page }) => {
  const dialog = await openImport(page)
  await dialog.getByLabel('Roster text').fill(rosterText.replace('Immortals (65 Points)', 'Imaginary unit (65 Points)'))
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Imaginary unit')
  await expect.poll(() => guestDraft(page)).toBe('')
  await dialog.getByRole('button', { name: 'Edit pasted text', exact: true }).click()
  await dialog.getByLabel('Roster text').fill(rosterText)
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await dialog.getByRole('button', { name: 'Open imported draft', exact: true }).click()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
})

test('the first roster names each missing setup choice', async ({ page }, testInfo) => {
  const setup = await visitorSetup(page)
  const start = setup.getByRole('button', { name: 'Create roster', exact: true })
  await expect(start).toHaveAccessibleDescription('Choose your faction.')
  await chooseFaction(setup, 'Necrons')
  await expect(start).toHaveAccessibleDescription('Choose a detachment.')
  await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await expect(start).toHaveAccessibleDescription('Choose a Force disposition.')
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page.getByRole('heading', { name: 'Add your first unit', exact: true })).toBeVisible()
  const choose = page.getByRole('button', { name: 'Choose a unit', exact: true })
  const search = page.getByPlaceholder('Search units, keywords, abilities…')
  await expect(choose).toBeHidden()
  await expect(search).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('first-unit-1440.png') })
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(search).toBeHidden()
    await choose.click()
    await expect(search).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(search).toBeHidden()
    await page.screenshot({ path: testInfo.outputPath(`first-unit-${width}.png`) })
  }
})

// The desktop path through Battle options runs in the other battle journeys; a phone reaches it through the Battle tab.
test('a casual player practises a round, corrects an action and reviews the finished game at 390px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await signUp(page, uniqueName('Practice learner'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Practise a game', exact: true })).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('home-actions.png') })
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Practice army' })
  await page.goto('/rosters')
  await expect(page.getByRole('button', { name: 'Practise a game', exact: true })).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('roster-actions.png') })
  await page.goto('/battles')
  await page.getByRole('button', { name: 'New battle', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Start a battle', exact: true })
  await chooseOption(page, 'Opponent', PRACTICE_OPPONENT)
  await dialog.getByRole('button', { name: 'Start battle', exact: true }).click()
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  // Both hands are dealt once both armies are in.
  await expect(page.locator('#setup-secondaries')).toHaveAttribute('data-complete', 'true')
  await setupStep(page, 'Secondaries')
  // A phone shows one side of the step at a time, so each hand is switched to before it is set.
  const sides = page.getByRole('region', { name: 'Secondaries' }).getByRole('group', { name: 'Show side' })
  const decks = page.locator('[data-secondary-deck-ready]')
  for (let at = 0; at < (await decks.count()); at += 1) {
    if (await sides.isVisible()) await sides.getByRole('button').nth(at).click()
    const prep = decks.nth(at)
    await prep.getByRole('button', { name: /^Fixed Select/ }).click()
    await prep.getByRole('button', { name: /^Select Engage on All Fronts$/i }).click()
    await prep.getByRole('button', { name: 'Select Bring It Down', exact: true }).click()
  }
  await startBattle(page)
  await expect(page.getByRole('heading', { name: 'command phase', exact: true })).toBeVisible()
  await expect(page.getByText('New to the tracker?', { exact: true })).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('tracker.png') })
  await advance(page)
  await expect(page.getByRole('heading', { name: 'movement phase', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo latest action', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'command phase', exact: true })).toBeVisible()
  for (let phase = 0; phase < 13; phase += 1) await advance(page)
  await expect(page.locator('[data-stat="round"]')).toHaveText('2')
  await expect(page.getByRole('heading', { name: 'movement phase', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('practice-round.png'), fullPage: true })
  await page.getByRole('tab', { name: 'Battle', exact: true }).click()
  await concede(page)
  const debrief = page.getByRole('region', { name: 'Battle debrief', exact: true })
  await expect(debrief).toBeHidden()
  await expect(page.locator('[data-scoreboard]')).toContainText('by concession')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('finished-game-viewport.png') })
  await page.screenshot({ path: testInfo.outputPath('finished-game.png'), fullPage: true })
  const timeline = page.getByRole('slider', { name: 'Replay event', exact: true })
  await timeline.focus()
  await timeline.press('Home')
  await expect(debrief).toBeHidden()
  await timeline.press('End')
  await expect(debrief).toBeHidden()
})

test('a friend invite QR code opens the same one-time invite link', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: PHONE })
  try {
    const page = await context.newPage()
    await signUp(page, uniqueName('QR inviter'))
    await page.goto('/friends')
    await page.getByRole('button', { name: 'Create invite link', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Link copied', exact: true })).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.getByRole('button', { name: 'Scan invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite a friend', exact: true })
    await expect(dialog.getByRole('img', { name: 'Friend invite QR code' })).toBeVisible()
    await expect(dialog).toContainText(link)
    await dialog.screenshot({ path: testInfo.outputPath('friend-invite-qr.png') })
    const visitor = await browser.newContext()
    try {
      const recipient = await visitor.newPage()
      await recipient.goto(link)
      await expect(recipient.getByRole('heading', { name: 'Create an account to accept' })).toBeVisible()
    } finally {
      await visitor.close()
    }
  } finally {
    await context.close()
  }
})

test('the first-game landing path fits', async ({ page }, testInfo) => {
  await page.goto('/')
  const features = page.locator('[data-home-features]')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(features.getByRole('img')).toHaveCount(0)
    await expect(features.getByRole('list')).toHaveCount(0)
    await expect(features.getByRole('heading', { name: 'Combat simulator', exact: true })).toBeVisible()
    await features.getByRole('heading', { level: 2 }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`landing-path-${width}.png`) })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  }
})

test('a saved long roster prints every card without clipping or editing controls', async ({ page }, testInfo) => {
  await signUp(page, uniqueName('Printer'))
  const dialog = await openImport(page)
  const entry = rosterText.slice(rosterText.indexOf('Immortals ('), rosterText.indexOf('Exported with'))
  const longRoster = rosterText.replace(entry, entry.repeat(12))
  await dialog.getByLabel('Roster text').fill(longRoster)
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await dialog.getByRole('button', { name: 'Import roster', exact: true }).click()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(12)
  await page.emulateMedia({ media: 'print' })
  const units = page.locator('[data-slot="roster-units"]')
  await expect.poll(() => units.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await expect(page.getByRole('button', { name: 'Roster actions', exact: true })).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('printed-roster.png'), fullPage: true })
})
