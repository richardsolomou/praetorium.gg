import { necronsOfficial } from '../src/core/rosterText.necrons.fixture'
import { expect, test, type Page } from './test'
import {
  attachRoster,
  chooseBattlefield,
  chooseUnit,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  retryUntilVisible,
  signUp,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
  makeWarlord,
  chooseFaction,
  chooseOption,
  desktopContext,
} from './account'

const prompt = (page: Page) => page.getByRole('note', { name: 'Getting started' })

async function launch(page: Page, task: string) {
  if (task === 'Start a battle') {
    await page.getByRole('button', { name: 'Battle guide', exact: true }).click()
    return
  }
  const gettingStarted = page.getByRole('menuitem', { name: /Getting started/ })
  await retryUntilVisible(gettingStarted, () =>
    page
      .getByRole('button', { name: /^Account menu/ })
      .filter({ visible: true })
      .click(),
  )
  await gettingStarted.click()
  await page
    .getByRole('dialog', { name: 'Your first army and matchup' })
    .getByRole('button', { name: new RegExp(`^${task}`) })
    .click()
}

async function next(page: Page, title: string) {
  await expect(prompt(page).getByRole('heading', { name: title, exact: true })).toBeVisible()
  await prompt(page).getByRole('button', { name: 'Next', exact: true }).click()
}

async function army(page: Page, name?: string) {
  const created = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name })
  await page.getByLabel('Add a unit').fill('Captain')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Captain', exact: true }).click())
  await page.locator('[data-unit="Captain"]').click()
  await makeWarlord(page, 'Captain')
  return created
}

async function practiceBattleGuide(page: Page, name: string, width: number) {
  await page.goto('/battles')
  await page.setViewportSize({ width, height: 900 })
  await launch(page, 'Start a battle')
  await createBattle(page, {
    practice: true,
    beforeCreate: async () => {
      await next(page, 'Table shape')
      await next(page, 'Fill every seat')
      await next(page, 'Check the sides')
      await expect(prompt(page)).toContainText('Start the battle')
    },
  })
  await expect(prompt(page)).toContainText('Find the table format')
  await expect(page.getByText('Determined by your rosters')).toBeVisible()
  await next(page, 'Find the table format')
  await attachRoster(page, name)
  await attachRoster(page, name, { forPlayer: PRACTICE_OPPONENT })
  // Setup is one page: the guide moves on as the table answers, and with its own Next where nothing needs answering.
  await expect(prompt(page)).toContainText('Read your primary mission')
  await next(page, 'Read your primary mission')
  await expect(prompt(page)).toContainText('Set the battlefield')
  await chooseBattlefield(page)
  await expect(prompt(page)).toContainText('Record the defender')
  await page.getByRole('group', { name: 'Defender', exact: true }).getByRole('button').first().click()
  await expect(prompt(page)).toContainText('Choose secondary missions')
  await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
  await next(page, 'Choose secondary missions')
  await next(page, 'Set reserves and transports')
  await next(page, 'Deploy the armies')
  await expect(prompt(page)).toContainText('Record the first turn')
  await page.getByRole('group', { name: 'First turn', exact: true }).getByRole('button').first().click()
  await expect(prompt(page)).toContainText('Resolve pre-battle rules')
  await page.getByRole('button', { name: 'Start battle', exact: true }).click()
  // The opening hand can arrive just after the battle starts, so the turn waits for it or the command phase.
  await expect(
    page
      .getByRole('dialog', { name: /secondary missions$/ })
      .or(page.getByRole('heading', { name: 'command phase' }))
      .first(),
  ).toBeVisible()
  await takeTheTurn(page)
  await next(page, 'Follow the score')
  await next(page, 'Advance phases and undo')
  await expect(page.locator('[data-onboarding="battle-live-side"]')).toBeVisible()
  await next(page, 'Use your army and mission controls')
  await expect(page.locator('[data-onboarding="battle-live-report"]')).toBeVisible()
  await expect(prompt(page)).toContainText('Read the battle back')
  await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
  await expect(prompt(page)).toBeHidden()
  await page.screenshot({ path: test.info().outputPath('battle-help-' + width + '.png') })
}

for (const width of [1440, 390]) {
  test(`the simulator guide completes and persists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signUp(page, uniqueName('Simulator Guide'))
    await launch(page, 'Try your first matchup')
    await expect(prompt(page)).toContainText('Choose an attacker')
    await chooseUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
    await expect(prompt(page)).toContainText('Choose a defender')
    await chooseUnit(page, 'Defender', 'Tyranids', 'Termagants')
    await expect(prompt(page)).toContainText('Read the odds')
    await page.screenshot({ path: test.info().outputPath('simulator-guide-' + width + '.png') })
    await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
    await expect(prompt(page)).toBeHidden()
    await page.reload()
    await page
      .getByRole('button', { name: /^Account menu/ })
      .filter({ visible: true })
      .click()
    await page.getByRole('menuitem', { name: /Getting started/ }).click()
    await expect(page.getByRole('region', { name: 'Try your first matchup', exact: true })).toContainText('Complete')
    await page.getByRole('button', { name: /^Try your first matchup/ }).click()
    await expect(prompt(page)).toContainText('Read the odds')
  })
}

for (const signedIn of [false, true]) {
  test(`import guidance starts without an army and follows review for ${signedIn ? 'an account' : 'a visitor'}`, async ({ page }) => {
    await page.setViewportSize({ width: signedIn ? 1440 : 390, height: 900 })
    if (signedIn) await signUp(page, uniqueName('Import Guide'))
    else await page.goto('/')
    await launch(page, 'Import an existing army')
    await expect(prompt(page)).toContainText('Bring an existing army')
    await page.getByRole('button', { name: 'Import roster', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Import roster', exact: true })
    await expect(prompt(page)).toContainText('Paste your army')
    await dialog.getByLabel('Roster text or exchange code').fill('not an army export')
    await dialog.getByRole('button', { name: 'Import pasted roster' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(prompt(page)).toContainText('Paste your army')
    await dialog.getByLabel('Roster text or exchange code').fill(necronsOfficial)
    await dialog.getByRole('button', { name: 'Import pasted roster' }).click()
    await expect(prompt(page)).toContainText('Check what matched')
    await dialog.getByRole('button', { name: 'Edit pasted text' }).click()
    await expect(prompt(page)).toContainText('Paste your army')
    await dialog.getByRole('button', { name: 'Import pasted roster' }).click()
    await expect(prompt(page)).toContainText('Check what matched')
    await dialog.getByRole('button', { name: signedIn ? 'Import roster' : 'Open imported draft', exact: true }).click()
    await expect(page.locator('[data-unit]')).toHaveCount(7)
    await expect(prompt(page)).toContainText('Your imported army')
    await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
    await expect(prompt(page)).toBeHidden()
    if (!signedIn) {
      await page.goto('/rosters')
      await page.getByRole('button', { name: 'Build guide', exact: true }).click()
      await expect(prompt(page)).toContainText('Your roster')
      await expect(page.locator('[data-unit]')).toHaveCount(7)
      await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
      await page.getByRole('button', { name: 'Save roster', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Save your roster' })).toBeVisible()
      await expect(page.getByText('Until saving succeeds, the draft stays on this device.', { exact: false })).toBeVisible()
      await page.screenshot({ path: test.info().outputPath('guest-save-guidance.png') })
    }
  })
}

test('the practice battle guide follows setup into live play', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await signUp(page, uniqueName('Battle Guide'))
  const name = await army(page)
  for (const width of [1440, 390]) await practiceBattleGuide(page, name, width)
})

test('the first-army guide stops after adding a unit', async ({ page }) => {
  await page.setViewportSize(desktopContext.viewport)
  await signUp(page, uniqueName('First Army Guide'))
  await launch(page, 'Build your first army')
  await page.getByRole('button', { name: 'New roster', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await expect(prompt(page)).toContainText('Choose the army')
  await chooseFaction(dialog, 'Space Marines')
  await expect(prompt(page)).toContainText('Set the battle size')
  await chooseOption(page, 'Battle size', /^Onslaught/)
  await expect(prompt(page)).toContainText('Pick a detachment')
  await dialog.getByRole('button', { name: /^Select Gladius Task Force$/ }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
  for (const width of [1440, 1300]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(prompt(page)).toContainText('Name it, or leave it')
  }
  await page.setViewportSize(desktopContext.viewport)
  await next(page, 'Name it, or leave it')
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await next(page, 'The unit picker')
  await page.getByLabel('Add a unit').fill('Captain')
  await next(page, 'Find a unit fast')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Captain', exact: true }).click())
  await page.getByLabel('Add a unit').fill('Intercessor Squad')
  await expect(prompt(page)).toContainText('Your roster')
  const addBodyguard = page.getByRole('button', { name: 'Add Intercessor Squad', exact: true })
  const bodyguardReceivesPointer = () =>
    addBodyguard.evaluate((button) => {
      const { x, y, width: buttonWidth, height } = button.getBoundingClientRect()
      return button.contains(document.elementFromPoint(x + buttonWidth / 2, y + height / 2))
    })
  for (const width of [1300, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(addBodyguard).toBeEnabled()
    await expect.poll(bodyguardReceivesPointer).toBe(true)
  }
  await waitForRosterSave(page, () => addBodyguard.click())
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await page.getByLabel('Add a unit').fill('Intercessor Squad')
  const drawer = page.getByRole('dialog', { name: 'Add units', exact: true })
  await expect.poll(async () => (await drawer.boundingBox())?.x ?? -1).toBe(0)
  const pickerRow = page.locator('[data-picker-unit="Intercessor Squad"]')
  await expect.poll(async () => (await pickerRow.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0)
  await expect
    .poll(async () => {
      const box = await pickerRow.boundingBox()
      return box ? box.x + box.width : Infinity
    })
    .toBeLessThanOrEqual(1280)
  await expect(addBodyguard).toBeEnabled()
  await expect.poll(bodyguardReceivesPointer).toBe(true)
  await addBodyguard.click({ trial: true })
  await waitForRosterSave(page, () => addBodyguard.click())
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize(desktopContext.viewport)
  await expect(prompt(page)).toContainText('Your roster')
  await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
  await expect(prompt(page)).toBeHidden()
})

for (const width of [1440, 390]) {
  test(`the contextual tournament guide follows creation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signUp(page, uniqueName('Tournament Guide'))
    await page.goto('/tournaments')
    await page.getByRole('button', { name: 'Tournament guide', exact: true }).click()
    await expect(prompt(page)).toContainText('Run a tournament')
    await page.getByRole('button', { name: 'New tournament', exact: true }).click()
    await expect(prompt(page)).toContainText('Name the tournament')
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(uniqueName('Guided tournament'))
    await next(page, 'Name the tournament')
    await next(page, 'Format and points')
    await next(page, 'Everything else can wait')
    await page.locator('[data-onboarding="sealed-event-create"]').click()
    await expect(page).toHaveURL(/\/tournaments\/[^/]+$/)
    await next(page, 'Your entrants')
    await next(page, 'Before the reveal')
    await expect(prompt(page)).toContainText('Your own place')
    await page.screenshot({ path: test.info().outputPath('tournament-guide-' + width + '.png') })
    await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
    await expect(prompt(page)).toBeHidden()
  })

  test(`reference help stays on the current page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/factions')
    await page.getByRole('button', { name: 'Search help', exact: true }).click()
    await expect(prompt(page)).toContainText('Search everything')
    await expect(page).toHaveURL(/\/factions$/)
    await expect(page.locator('[data-onboarding="global-search"][data-onboarding-active="true"]')).toBeVisible()
    await prompt(page).getByRole('button', { name: 'Finish tour' }).click()
    await expect(prompt(page)).toBeHidden()
  })
}
