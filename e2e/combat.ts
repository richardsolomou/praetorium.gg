import { expect, type Locator, type Page, type Request, type Route } from '@playwright/test'
import { chooseUnit } from './account'

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
    if (!isCombatCalculationRequest(route.request())) return route.continue()
    await page.evaluate(() => window.PraetoriumCombatGate?.pending.push(() => {}))
    await waiting.promise
    try {
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

export async function closeCombatBreakdown(scope: Page | Locator) {
  const details = scope.locator('[data-results-summary] details')
  if (await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator('summary').click()
}
