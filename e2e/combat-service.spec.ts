import { expect, test, type Locator, type Page } from './test'
import { chooseCombatUnit, isCombatCalculationRequest, openCombatBreakdown } from './combat'
import { chooseRosterAction, chooseOption, expectNoPageOverflow, PHONE, savedArmy } from './account'
import { screenshot } from './screenshots'

async function countLocalCalculations(page: Page) {
  await page.addInitScript(() => {
    const observed = { calculations: 0 }
    Object.assign(window, { combatServiceObservation: observed })
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Reflect.apply binds the saved method to its worker.
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message: unknown, ...args: unknown[]) {
      if (message && typeof message === 'object' && 'ranged' in message && 'melee' in message) observed.calculations++
      return Reflect.apply(original, this, [message, ...args])
    }
  })
}
/** A box read once it has held still, since a resize relays a dialog out over several frames. */
async function settledBox(locator: Locator) {
  let last: Awaited<ReturnType<Locator['boundingBox']>> = null
  await expect
    .poll(async () => {
      const box = await locator.boundingBox()
      const still = Boolean(box && last && box.x === last.x && box.y === last.y)
      last = box
      return still
    })
    .toBe(true)
  return last!
}

const localCalculations = (page: Page) =>
  page.evaluate(() => (window as unknown as { combatServiceObservation: { calculations: number } }).combatServiceObservation.calculations)

test('unit estimates run on the server across reloads and fall back locally when it is unavailable', async ({ page }) => {
  await countLocalCalculations(page)
  const responses: number[] = []
  page.on('response', (response) => {
    if (isCombatCalculationRequest(response.request())) responses.push(response.status())
  })
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await openCombatBreakdown(page)
  const damage = page.getByRole('region', { name: 'Shooting estimate' }).locator('.readout').first()
  const expected = await damage.innerText()
  expect(responses).toContain(200)
  expect(await localCalculations(page)).toBe(0)
  const completed = responses.length
  await page.reload()
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await openCombatBreakdown(page)
  await expect(damage).toHaveText(expected)
  expect(responses.length).toBeGreaterThan(completed)
  expect(await localCalculations(page)).toBe(0)
  await screenshot(page, 'server-unit-estimate.png')
  await page.route('**/_serverFn/**', (route) => (isCombatCalculationRequest(route.request()) ? route.abort() : route.continue()))
  await page.getByRole('button', { name: 'More defender models', exact: true }).click()
  await expect.poll(() => localCalculations(page)).toBeGreaterThan(0)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await expect(damage).toHaveText(/^\d+\.\d{2}$/)
})

test('a full roster matrix batches projections and uses the server without browser scoring', async ({ page }) => {
  await countLocalCalculations(page)
  const { id } = await savedArmy(page, 'Server matchup matrix', { name: 'Server comparison' })
  await page.goto(`/rosters/${id}`)
  let projections = 0
  let calculations = 0
  page.on('response', (response) => {
    const request = response.request()
    if (request.url().includes('/_serverFn/') && request.postData()?.includes('pickIndices')) projections++
    if (isCombatCalculationRequest(request) && response.status() === 200) calculations++
  })
  const started = Date.now()
  await chooseRosterAction(page, 'Test targets')
  const dialog = page.getByRole('dialog', { name: 'Test targets', exact: true })
  await expect(dialog).toContainText('117 / 117 matchups · Complete', { timeout: 120_000 })
  console.log(`Server 117-pair matrix: ${Date.now() - started} ms; ${projections} projection batches; ${calculations} calculation batches`)
  expect(projections).toBeLessThanOrEqual(10)
  expect(calculations).toBeGreaterThan(0)
  expect(await localCalculations(page)).toBe(0)
  const before = calculations
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await chooseRosterAction(page, 'Test targets')
  await expect(dialog).toContainText('117 / 117 matchups · Complete')
  expect(calculations).toBe(before)

  // Long matchup tables keep target headings and attacker names visible while scrolling.
  const grid = dialog.getByRole('region', { name: 'All unit matchups', exact: true })
  const corner = grid.getByRole('columnheader').first()
  const target = grid.getByRole('columnheader').nth(1)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await grid.scrollIntoViewIfNeeded()
    await grid.evaluate((element) => {
      element.scrollTop = 0
      element.scrollLeft = 0
    })
    const cornerBefore = await settledBox(corner)
    const targetBefore = await settledBox(target)
    await grid.evaluate((element) => {
      element.scrollTop = 240
      element.scrollLeft = 160
    })
    expect(await grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect.poll(async () => Math.abs((await corner.boundingBox())!.y - cornerBefore.y)).toBeLessThan(2)
    await expect.poll(async () => Math.abs((await target.boundingBox())!.y - targetBefore.y)).toBeLessThan(2)
    await expect.poll(async () => Math.abs((await corner.boundingBox())!.x - cornerBefore.x)).toBeLessThan(2)
    await expectNoPageOverflow(page)
    await screenshot(page, `pinned-matchup-headings-${width}.png`)
  }

  await page.setViewportSize(PHONE)
  const options = dialog.getByRole('button', { name: 'View options', exact: true })
  await expect(options).toHaveAttribute('aria-expanded', 'false')
  await expect(dialog.getByRole('combobox', { name: 'Comparison metric' })).toBeHidden()
  await expect(dialog.getByRole('tab', { name: 'Shooting', exact: true })).toBeVisible()
  await options.click()
  await chooseOption(page, 'Comparison metric', 'Models lost')
  await options.click()
  await expect(options).toContainText('Models lost · Best attackers')
  expect(calculations).toBe(before)
  const attackerSource = (await dialog.getByRole('group', { name: 'Attacking with' }).boundingBox())!
  const defenderSource = (await dialog.getByRole('group', { name: 'Defending with' }).boundingBox())!
  expect(Math.abs(attackerSource.y - defenderSource.y)).toBeLessThan(2)
  await screenshot(page, 'server-roster-matrix-phone.png')
})
