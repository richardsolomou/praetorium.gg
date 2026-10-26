import { expect, test, type Page } from './test'
import { chooseCombatUnit, isCombatCalculationRequest, openCombatBreakdown } from './combat'
import { chooseRosterAction, chooseOption, PHONE, savedArmy } from './account'

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
  await page.screenshot({ path: test.info().outputPath('server-unit-estimate.png') })
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
  await chooseRosterAction(page, 'Test targets')
  const dialog = page.getByRole('dialog', { name: 'Test targets', exact: true })
  await expect(dialog.getByRole('button', { name: 'Run all matchups' })).toBeEnabled()
  projections = 0
  const started = Date.now()
  await dialog.getByRole('button', { name: 'Run all matchups' }).click()
  await expect(dialog).toContainText('117 / 117 matchups · Complete', { timeout: 120_000 })
  console.log(`Server 117-pair matrix: ${Date.now() - started} ms; ${projections} projection batches; ${calculations} calculation batches`)
  expect(projections).toBeLessThanOrEqual(10)
  expect(calculations).toBeGreaterThan(0)
  expect(await localCalculations(page)).toBe(0)
  const before = calculations
  await dialog.getByRole('button', { name: 'Run again' }).click()
  await expect(dialog).toContainText('117 / 117 matchups · Complete')
  expect(calculations).toBe(before)
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
  const attackerSource = (await dialog.getByRole('combobox', { name: 'Attacking roster' }).boundingBox())!
  const defenderSource = (await dialog.getByRole('combobox', { name: 'Defending roster' }).boundingBox())!
  expect(Math.abs(attackerSource.y - defenderSource.y)).toBeLessThan(2)
  await page.screenshot({ path: test.info().outputPath('server-roster-matrix-phone.png') })
})
