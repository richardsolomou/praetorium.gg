import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  advance,
  advanceButton,
  attachRoster,
  befriend,
  chooseBattlefield,
  createBattle,
  createRoster,
  desktopContext,
  PRACTICE_OPPONENT,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
} from './account'
import { savedWork } from './storage'

async function addUnit(page: Page, name: string) {
  await page.getByLabel('Add a unit').fill(name)
  await waitForRosterSave(page, () =>
    page
      .getByRole('button', { name: `Add ${name}`, exact: true })
      .first()
      .click(),
  )
}

async function draw(page: Page, cards: string[]) {
  const prompt = page.getByRole('dialog', { name: /secondary missions$/ })
  await prompt.getByRole('button', { name: 'Select missions', exact: true }).click()
  for (const card of cards) await prompt.getByRole('button', { name: `Select ${card}`, exact: true }).click()
  await prompt.getByRole('button', { name: 'Add selected missions', exact: true }).click()
  await prompt.getByRole('button', { name: 'Take the turn', exact: true }).click()
  await expect(prompt).toBeHidden()
}

async function inspectChoices(page: Page, card: Locator, name: string, image: string, board = true) {
  const title = card.getByRole('button', { name: `Read ${name}`, exact: true })
  const choices = card.locator('summary').filter({ hasText: /^Choices$/ })
  await expect(title).toHaveCount(1)
  await expect(choices).toHaveCount(1)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const record = card.locator('details > ul > li').last()
    await record.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await expect(record).toBeInViewport()
    await expect
      .poll(() =>
        card.evaluate((element, missionName) => {
          const titleElement = [...element.querySelectorAll('button')].find(
            (button) => button.getAttribute('aria-label') === `Read ${missionName}`,
          )
          const choicesElement = [...element.querySelectorAll('summary')].find((summary) => summary.textContent?.trim() === 'Choices')
          if (!titleElement || !choicesElement) throw new Error('The mission title and Choices must be inside the same card.')
          return choicesElement.getBoundingClientRect().top - titleElement.getBoundingClientRect().bottom
        }, name),
      )
      .toBeGreaterThanOrEqual(0)
    expect(await page.evaluate(() => ({ width: innerWidth, fits: document.documentElement.scrollWidth <= innerWidth }))).toEqual({
      width,
      fits: true,
    })
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    if (width === 390 && board) {
      const box = (await record.boundingBox())!
      expect(box.y + box.height).toBeLessThan((await page.locator('[data-turn-control]').boundingBox())!.y)
    }
    await page.screenshot({ path: `test-results/${image}-${width}.png`, animations: 'disabled' })
  }
}

test('source matchup nominations survive undo and recur only when the next own turn is due', async ({ page, browser }) => {
  const guestContext = await browser.newContext(desktopContext)
  const guest = await guestContext.newPage()
  const guestName = uniqueName('Disruption captain')
  await signUp(guest, guestName)
  const guestRoster = await createRoster(guest, {
    faction: 'Death Guard',
    detachment: /Shamblerot Vectorium/,
    name: 'Disruption nomination roster',
  })
  await addUnit(guest, 'Plague Marines')
  await signUp(page, uniqueName('Purge captain'))
  const hostRoster = await createRoster(page, {
    faction: 'Necrons',
    detachment: /Annihilation Legion/,
    name: 'Purge nomination roster',
  })
  await addUnit(page, 'Immortals')
  await befriend(page, guest)
  const url = await createBattle(page, { opponent: guestName })
  await guest.goto(url)
  await attachRoster(page, hostRoster)
  await attachRoster(guest, guestRoster)
  await chooseBattlefield(page)
  await expect(page.getByRole('button', { name: 'Selected layout A: Search and Destroy', exact: true })).toBeVisible()
  await startBattle(page, undefined, false)
  await draw(page, ['Burden Of Trust', 'A Tempting Target'])

  const punishment = page.getByRole('dialog', { name: 'Punishment · choices', exact: true })
  await expect(punishment).toBeVisible()
  await punishment.getByRole('button', { name: `${guestName} · Plague Marines`, exact: true }).click()
  await expect(punishment.getByRole('button', { name: 'Record choice', exact: true })).toBeDisabled()
  await punishment.getByRole('switch', { name: 'No enemy unit qualifies; use the one-unit fallback' }).click()
  await punishment.getByRole('switch', { name: 'I confirm no enemy unit meets either qualification' }).click()
  await expect(punishment.getByRole('button', { name: 'Record choice', exact: true })).toBeEnabled()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(punishment).toBeVisible()
    if (width === 390) await expect.poll(async () => (await punishment.boundingBox())?.x).toBe(0)
    await page.screenshot({ path: `test-results/mission-punishment-${width}.png`, animations: 'disabled' })
  }
  await punishment.getByRole('button', { name: 'Minimize dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Return to prompt', exact: true }).click()
  await expect(punishment.getByRole('switch', { name: 'I confirm no enemy unit meets either qualification' })).toBeChecked()
  await punishment.getByRole('button', { name: 'Record choice', exact: true }).click()

  const guards = page.getByRole('dialog', { name: 'Burden Of Trust · choices', exact: true })
  const target = guest.getByRole('dialog', { name: 'A Tempting Target · choices', exact: true })
  await expect(target).toBeVisible()
  await expect(advanceButton(page)).toBeDisabled()
  await target.getByRole('button', { name: 'Undo latest action', exact: true }).click()
  await expect(punishment).toBeVisible()
  await punishment.getByRole('button', { name: `${guestName} · Plague Marines`, exact: true }).click()
  await punishment.getByRole('switch', { name: 'No enemy unit qualifies; use the one-unit fallback' }).click()
  await punishment.getByRole('switch', { name: 'I confirm no enemy unit meets either qualification' }).click()
  await punishment.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(target).toBeVisible()
  await target.getByRole('combobox', { name: 'Tempting target objective', exact: true }).click()
  await guest.getByRole('option', { name: 'Objective 2', exact: true }).click()
  await target.getByRole('switch', { name: 'This is not a home objective', exact: true }).click()
  await expect(target.getByRole('button', { name: 'Record choice', exact: true })).toBeDisabled()
  await target.getByRole('switch', { name: 'This objective is within No Man’s Land', exact: true }).click()
  for (const width of [1440, 390]) {
    await guest.setViewportSize({ width, height: 900 })
    if (width === 390) await expect.poll(async () => (await target.boundingBox())?.x).toBe(0)
    await guest.screenshot({ path: `test-results/mission-tempting-${width}.png`, animations: 'disabled' })
  }
  await target.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(target).toBeHidden()
  await expect(guards).toBeVisible()
  await guards.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(advanceButton(page)).toBeEnabled()
  await page.getByRole('button', { name: 'Undo latest action', exact: true }).click()
  await expect(guards).toBeVisible()
  await guards
    .getByRole('combobox', { name: /^Guard for / })
    .first()
    .click()
  await page.getByRole('option', { name: / · Immortals$/ }).click()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    if (width === 390) await expect.poll(async () => (await guards.boundingBox())?.x).toBe(0)
    await page.screenshot({ path: `test-results/mission-guards-${width}.png`, animations: 'disabled' })
    if (width === 390) {
      const last = guards.getByRole('combobox', { name: /^Guard for / }).last()
      await last.scrollIntoViewIfNeeded()
      await expect(last).toBeInViewport()
      const footer = guards.getByRole('button', { name: 'Record choice', exact: true })
      const box = (await last.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual((await footer.boundingBox())!.y)
      await page.screenshot({ path: 'test-results/mission-guards-phone-last.png', animations: 'disabled' })
    }
  }
  await guards.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(advanceButton(page)).toBeEnabled()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  for (const summary of await page
    .locator('summary')
    .filter({ hasText: /^Choices$/ })
    .all())
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click()
  await expect(page.getByText('1 guard nomination', { exact: true })).toBeVisible()
  await expect(page.getByText('1 condemned unit · fallback', { exact: true })).toBeVisible()
  const hostSide = page.locator('[data-panel="player"][data-side="0"]')
  const burden = hostSide
    .locator('[data-secondary]')
    .filter({ has: page.getByRole('button', { name: 'Read Burden Of Trust', exact: true }) })
  await inspectChoices(page, burden, 'Burden Of Trust', 'mission-burden-record-r1')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: 'test-results/mission-records-desktop.png' })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.screenshot({ path: 'test-results/mission-records-phone.png' })
  const guardRecord = page.getByText('1 guard nomination', { exact: true })
  await guardRecord.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await expect(guardRecord).toBeInViewport()
  const guardBox = (await guardRecord.boundingBox())!
  expect(guardBox.y + guardBox.height).toBeLessThan((await page.locator('[data-turn-control]').boundingBox())!.y)
  await page.screenshot({ path: 'test-results/mission-guard-record-phone.png', animations: 'disabled' })
  for (let phase = 0; phase < 6; phase++) await advance(page)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await takeTheTurn(guest)
  for (let phase = 0; phase < 6; phase++) await advance(guest)
  await expect.poll(async () => (await savedWork(guest))?.operations.length).toBe(0)
  const previousTurn = page.getByRole('dialog', { name: /^Scoring end of their turn points/ })
  await expect(previousTurn).toBeVisible()
  await expect(punishment).toBeHidden()
  await expect(guards).toBeHidden()
  const scoringBurden = previousTurn
    .locator('[data-due]')
    .filter({ has: page.getByRole('button', { name: 'Read Burden Of Trust', exact: true }) })
  if (await scoringBurden.count()) {
    await scoringBurden
      .locator('summary')
      .filter({ hasText: /^Choices$/ })
      .click()
    await inspectChoices(page, scoringBurden, 'Burden Of Trust', 'mission-burden-scoring', false)
  }
  await previousTurn.getByRole('button', { name: 'Take the turn', exact: true }).click()
  await expect(previousTurn).toBeHidden()
  const incomingDraw = page.getByRole('dialog', { name: /secondary missions$/ })
  await expect(incomingDraw).toBeVisible()
  await expect(punishment).toBeHidden()
  await expect(guards).toBeHidden()
  await draw(page, ['Cleanse', 'Defend Stronghold'])
  await expect(punishment).toBeVisible()
  await expect(target).toBeHidden()
  await punishment.getByRole('button', { name: `${guestName} · Plague Marines`, exact: true }).click()
  await punishment
    .getByRole('switch', { name: 'Each chosen unit is within objective range or destroyed a friendly unit in the previous turn' })
    .click()
  await punishment.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(guards).toBeVisible()
  for (const chooser of await guards
    .getByRole('combobox', { name: /^Guard for / })
    .all()
    .then((items) => items.slice(0, 2))) {
    await chooser.click()
    await page.getByRole('option', { name: / · Immortals$/ }).click()
  }
  await guards.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(advanceButton(page)).toBeEnabled()
  await expect(page.getByText('Round 2 of 5', { exact: true })).toBeVisible()
  for (const summary of await page
    .locator('summary')
    .filter({ hasText: /^Choices$/ })
    .all())
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click()
  await expect(page.getByText('2 guard nominations', { exact: true })).toBeVisible()
  const roundTwo = burden.locator('details > ul > li').filter({ has: page.getByText('R2', { exact: true }) })
  await expect(roundTwo.getByText('2 guard nominations', { exact: true })).toBeVisible()
  await expect(roundTwo.locator('p').filter({ hasText: / · Immortals$/ })).toHaveCount(2)
  await inspectChoices(page, burden, 'Burden Of Trust', 'mission-burden-record-r2')
  await guestContext.close()
})

test('manual Beacon nomination persists and a destroyed Beacon cannot be replaced', async ({ page }) => {
  await signUp(page, uniqueName('Beacon captain'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Beacon nomination roster' })
  await addUnit(page, 'Immortals')
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page, undefined, false)
  await draw(page, ['Beacon', 'Cleanse'])
  const side = page.locator('[data-panel="player"][data-side="0"]')
  await expect(advanceButton(page)).toBeEnabled()
  await side.getByRole('button', { name: 'Record Beacon', exact: true }).click()
  const nomination = page.getByRole('dialog', { name: 'Beacon · choices', exact: true })
  await expect(nomination).toContainText('Manual tracking.')
  await nomination.getByRole('combobox', { name: 'Beacon unit', exact: true }).click()
  await page.getByRole('option', { name: / · Immortals$/ }).click()
  await nomination.getByLabel('Beacon table note').fill('Chosen at the table during the card’s timing.')
  await nomination.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(nomination).toBeHidden()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await side
    .locator('summary')
    .filter({ hasText: /^Choices$/ })
    .click()
  await expect(side.getByText('Chosen at the table during the card’s timing.', { exact: true })).toBeVisible()
  const beacon = side.locator('[data-secondary]').filter({ has: page.getByRole('button', { name: 'Read Beacon', exact: true }) })
  await inspectChoices(page, beacon, 'Beacon', 'mission-beacon-record')
  await side.getByRole('button', { name: 'Open Beacon nomination roster', exact: true }).click()
  const army = page.getByRole('dialog', { name: 'Beacon nomination roster', exact: true })
  await army.getByRole('button', { name: 'Mark Immortals lost', exact: true }).click()
  await army.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(side.getByRole('button', { name: 'Record Beacon', exact: true })).toHaveCount(0)
  await expect(beacon.getByText('Immortals (destroyed)', { exact: true })).toBeVisible()
  await inspectChoices(page, beacon, 'Beacon', 'mission-beacon-record-destroyed')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await side.screenshot({ path: `test-results/mission-beacon-destroyed-${width}.png`, animations: 'disabled' })
  }
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await expect(side.getByRole('button', { name: 'Record Beacon', exact: true })).toHaveCount(0)
  await expect(side.locator('[data-stat="secondary"]')).toHaveText('0')
})
