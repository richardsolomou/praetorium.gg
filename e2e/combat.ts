import { expect, type Locator, type Page, type Request, type Route } from '@playwright/test'
import { decodeSimulatorState } from '../src/contracts/simulatorState'
import { chooseUnit, retryUntilVisible } from './account'

declare global {
  interface Window {
    PraetoriumCombatGate?: { pending: (() => void)[]; release: () => void }
  }
}

export function isCombatCalculationRequest(request: Request) {
  const body = request.postData() ?? ''
  return request.url().includes('/_serverFn/') && body.includes('ranged') && body.includes('melee') && body.includes('weapons')
}

export async function holdCombatCalculations(page: Page) {
  const waiting = Promise.withResolvers<void>()
  const hold = async (route: Route) => {
    try {
      if (isCombatCalculationRequest(route.request())) {
        await page.evaluate(() => window.PraetoriumCombatGate?.pending.push(() => {}))
        await waiting.promise
      }
      await route.continue()
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Route is already handled')) throw error
    }
  }
  await page.route('**/_serverFn/**', hold)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Reflect.apply binds the saved method to its worker.
    const original = Worker.prototype.postMessage
    const pending: (() => void)[] = []
    Worker.prototype.postMessage = function (message: unknown, ...args: unknown[]) {
      const send = () => Reflect.apply(original, this, [message, ...args])
      if (message && typeof message === 'object' && !('kind' in message) && ('ranged' in message || 'melee' in message)) pending.push(send)
      else send()
    }
    window.PraetoriumCombatGate = {
      pending,
      release: () => {
        Worker.prototype.postMessage = original
        for (const send of pending) send()
        delete window.PraetoriumCombatGate
      },
    }
  })
  return {
    waitForStart: () => expect.poll(() => page.evaluate(() => window.PraetoriumCombatGate?.pending.length ?? 0)).toBeGreaterThan(0),
    release: async () => {
      waiting.resolve()
      await page.unroute('**/_serverFn/**', hold)
      await page.evaluate(() => window.PraetoriumCombatGate?.release())
    },
  }
}

export async function openCombatControls(scope: Page | Locator) {
  await closeCombatBreakdown(scope)
  for (const selector of ['[data-manual-modifiers]', '[data-combat-buffs]']) {
    for (const details of await scope.locator(selector).all()) {
      if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click()
    }
  }
}

export async function openCombatBreakdown(scope: Page | Locator) {
  const details = scope.locator('[data-results-summary] details')
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click()
}

export async function chooseCombatUnit(page: Page, side: string, faction: string, name: string) {
  await chooseUnit(page, side, faction, name)
  await expect(page.getByRole('region', { name: side, exact: true }).getByRole('button', { name: 'Loadout', exact: true })).toBeEnabled()
  await openCombatControls(page)
}

/** Opens a roster from a side's unit picker and fields one of its units, the first when none is named. */
export async function chooseRosterUnit(page: Page, side: string, roster: string | RegExp, unit?: RegExp) {
  await openRosterList(page, side)
  await page.getByRole('option', { name: roster }).click()
  const listed = page.getByRole('listbox').getByRole('option')
  await (unit ? listed.filter({ hasText: unit }) : listed).first().click()
}

/** Opens a side's unit picker at the list of rosters. */
export async function openRosterList(page: Page, side: string) {
  const fromRoster = page.getByRole('button', { name: /^From a roster/ })
  await retryUntilVisible(fromRoster, () => page.getByRole('combobox', { name: `${side} unit`, exact: true }).click())
  await fromRoster.click()
}

export async function combatEstimate(scope: Page | Locator, phase: 'Shooting' | 'Melee') {
  await openCombatControls(scope)
  await openCombatBreakdown(scope)
  return scope.getByRole('region', { name: `${phase} estimate`, includeHidden: true })
}

/** The average damage a phase's estimate reads. */
export async function combatDamage(scope: Page | Locator, phase: 'Shooting' | 'Melee') {
  return (await combatEstimate(scope, phase)).locator('.readout').first()
}

export async function closeCombatBreakdown(scope: Page | Locator) {
  const details = scope.locator('[data-results-summary] details')
  if (await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator('summary').click()
}

/** The simulator state the page's address carries, or undefined when it carries none that parses. */
export const simulatorState = (page: Page) => decodeSimulatorState(new URL(page.url()).searchParams.get('s') ?? undefined)

/** Every simulator result region on the page, or within `scope`, has finished calculating. */
export async function combatSettled(scope: Page | Locator) {
  for (const name of ['Shooting results', 'Melee results', 'Combined estimate'])
    await expect(scope.getByRole('region', { name, exact: true })).toHaveAttribute('aria-busy', 'false')
}
