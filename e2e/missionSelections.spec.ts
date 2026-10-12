import { expect, test, type Locator, type Page } from './test'
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

async function inspectDialog(page: Page, dialog: Locator, image: string) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(dialog).toBeVisible()
    if (width === 390) await expect.poll(async () => (await dialog.boundingBox())?.x).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/${image}-${width}.png`, animations: 'disabled' })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function openChoices(page: Page) {
  for (const summary of await page
    .locator('summary')
    .filter({ hasText: /^Choices$/ })
    .all())
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click()
}

const primaryCard = (page: Page, side: number) =>
  page.locator(`[data-panel="player"][data-side="${side}"] section`).filter({ has: page.getByText('Primary mission', { exact: true }) })

test('Consecrate records end-of-turn objectives that stay consecrated into the next turn', async ({ page }) => {
  const name = uniqueName('Consecrate captain')
  await signUp(page, name)
  const purge = await createRoster(page, { faction: 'Necrons', detachment: /Annihilation Legion/, name: 'Consecrate purge roster' })
  await addUnit(page, 'Immortals')
  const recon = await createRoster(page, { faction: 'Necrons', detachment: /Hypercrypt Legion/, name: 'Consecrate recon roster' })
  await addUnit(page, 'Immortals')
  await createBattle(page, { practice: true })
  await attachRoster(page, purge)
  await attachRoster(page, recon, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page, undefined, false)
  await draw(page, ['Cleanse', 'No Prisoners'])
  const consecrate = page.getByRole('dialog', { name: 'Consecrate · choices', exact: true })
  for (let phase = 0; phase < 5; phase++) await advance(page)
  await expect(consecrate).toBeVisible()
  await consecrate.getByRole('button', { name: 'Minimize dialog', exact: true }).click()
  await expect(advanceButton(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Return to prompt', exact: true }).click()
  const first = consecrate.getByRole('combobox', { name: /^Consecration unit for / }).first()
  const objective = (await first.getAttribute('aria-label'))!.replace('Consecration unit for ', '')
  await first.click()
  await page.getByRole('option', { name: `${name} · Immortals`, exact: true }).click()
  const record = consecrate.getByRole('button', { name: 'Record choice', exact: true })
  await expect(record).toBeDisabled()
  await consecrate
    .getByRole('switch', { name: 'Each chosen unit destroyed a unit since it last consecrated and is within range of its objective' })
    .click()
  await expect(record).toBeDisabled()
  await consecrate.getByRole('switch', { name: 'None of these objectives is my home objective' }).click()
  await inspectDialog(page, consecrate, 'mission-consecrate')
  await record.click()
  await expect(consecrate).toBeHidden()
  await expect(advanceButton(page)).toBeEnabled()
  await page.getByRole('button', { name: 'Undo latest action', exact: true }).click()
  await expect(consecrate).toBeVisible()
  await consecrate.getByRole('combobox', { name: `Consecration unit for ${objective}`, exact: true }).click()
  await page.getByRole('option', { name: `${name} · Immortals`, exact: true }).click()
  await consecrate
    .getByRole('switch', { name: 'Each chosen unit destroyed a unit since it last consecrated and is within range of its objective' })
    .click()
  await consecrate.getByRole('switch', { name: 'None of these objectives is my home objective' }).click()
  await record.click()
  await expect(advanceButton(page)).toBeEnabled()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await openChoices(page)
  const card = primaryCard(page, 0)
  await expect(card.getByText('1 consecrated objective', { exact: true })).toBeVisible()
  await expect(card.getByText(`${objective} · Immortals`, { exact: true })).toBeVisible()
  await inspectChoices(page, card, 'Consecrate', 'mission-consecrate-record-r1')
  await page.setViewportSize({ width: 1440, height: 900 })
  await advance(page)
  await takeTheTurn(page)
  for (let phase = 0; phase < 6; phase++) await advance(page)
  await takeTheTurn(page)
  await expect(page.getByText('Round 2 of 5', { exact: true })).toBeVisible()
  await expect(consecrate).toBeHidden()
  for (let phase = 0; phase < 5; phase++) await advance(page)
  await expect(consecrate).toBeVisible()
  await expect(consecrate.getByText(`Already consecrated: ${objective}`, { exact: true })).toBeVisible()
  await expect(consecrate.getByRole('combobox', { name: `Consecration unit for ${objective}`, exact: true })).toHaveCount(0)
  await inspectDialog(page, consecrate, 'mission-consecrate-r2')
  await record.click()
  await expect(advanceButton(page)).toBeEnabled()
  await openChoices(page)
  await expect(card.getByText('0 consecrated objectives', { exact: true })).toBeVisible()
  await inspectChoices(page, card, 'Consecrate', 'mission-consecrate-record-r2')
})

test('Locate and Deny markers are placed before the first turn and an Extract Relic sweep removes one', async ({ page }) => {
  const name = uniqueName('Locate captain')
  await signUp(page, name)
  const disruption = await createRoster(page, {
    faction: 'Death Guard',
    detachment: /Shamblerot Vectorium/,
    name: 'Locate disruption roster',
  })
  await addUnit(page, 'Plague Marines')
  const assets = await createRoster(page, { faction: 'Necrons', detachment: /Cryptek Conclave/, name: 'Relic assets roster' })
  await addUnit(page, 'Immortals')
  await createBattle(page, { practice: true })
  await attachRoster(page, disruption)
  await attachRoster(page, assets, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page, undefined, false)
  await draw(page, ['Cleanse', 'No Prisoners'])
  const locate = page.getByRole('dialog', { name: 'Locate and Deny · choices', exact: true })
  await expect(locate).toBeVisible()
  await locate.getByRole('button', { name: 'Minimize dialog', exact: true }).click()
  await expect(advanceButton(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Return to prompt', exact: true }).click()
  const record = locate.getByRole('button', { name: 'Record choice', exact: true })
  for (const area of ['Ruin A', 'Ruin B', 'Ruin C', 'Ruin D', 'Ruin E']) {
    await locate.getByLabel('Terrain area at the table').fill(area)
    await locate.getByRole('button', { name: 'Add terrain area', exact: true }).click()
  }
  await expect(locate.getByText('5 of 5 markers', { exact: true })).toBeVisible()
  await expect(locate.getByRole('switch', { name: 'No other terrain area is outside my deployment zone' })).toHaveCount(0)
  await expect(record).toBeDisabled()
  await locate.getByRole('switch', { name: 'Each terrain area is outside my deployment zone' }).click()
  await inspectDialog(page, locate, 'mission-locate')
  await record.click()
  await expect(locate).toBeHidden()
  await expect(advanceButton(page)).toBeEnabled()
  for (let phase = 0; phase < 6; phase++) await advance(page)
  await takeTheTurn(page)
  for (let phase = 0; phase < 5; phase++) await advance(page)
  await expect(page.getByRole('heading', { name: 'end phase' })).toBeVisible()
  const relic = primaryCard(page, 1)
  await relic.getByRole('button', { name: 'Record Sensor Sweep', exact: true }).click()
  const sweep = page.getByRole('dialog', { name: 'Extract Relic · choices', exact: true })
  await sweep.getByRole('combobox', { name: 'Operation marker to remove', exact: true }).click()
  await page.getByRole('option', { name: `${name} · Ruin B`, exact: true }).click()
  await expect(sweep.getByRole('button', { name: 'Record choice', exact: true })).toBeDisabled()
  await sweep
    .getByRole('switch', { name: 'The sweeping unit started within range of a central objective and controls it at the end of my turn' })
    .click()
  await inspectDialog(page, sweep, 'mission-sensor-sweep')
  await sweep.getByRole('button', { name: 'Record choice', exact: true }).click()
  await expect(sweep).toBeHidden()
  await expect(relic.getByRole('button', { name: 'Record Sensor Sweep', exact: true })).toHaveCount(0)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await openChoices(page)
  const card = primaryCard(page, 0)
  await expect(card.getByText('5 operation markers', { exact: true })).toBeVisible()
  await expect(card.getByText('(removed R1)', { exact: true })).toBeVisible()
  await expect(relic.getByText('Removed Ruin B', { exact: true })).toBeVisible()
  await inspectChoices(page, card, 'Locate and Deny', 'mission-locate-record')
})
