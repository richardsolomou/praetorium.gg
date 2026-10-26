import { expect, test, type Locator, type Page } from './test'
import { encodeSimulatorState, type SimulatorState } from '../src/contracts/simulatorState'
import { addUnit, createRoster, signUp, waitForRosterSave, expectNoPageOverflow, chooseOption, nextFrames } from './account'
import { chooseCombatUnit, openCombatControls, combatSettled, simulatorState } from './combat'

declare global {
  interface Window {
    PraetoriumLoadoutGate?: { pending: (() => void)[]; started: number; replies: number; resume: () => void; release: () => void }
  }
}

const catalogueId = 'marine-main~e0af-67df-9d63-8fb7'
const focused = '343b-32b8-38b5-83fa'
const focusedName = '➤ Smite - Focused Witchfire'
const witchfireName = '➤ Smite - Witchfire'
const discarded = 'Some previous weapon choices no longer apply to this equipment. Current profiles are used.'

function memberState(): SimulatorState {
  const pick = { catalogueId, entryId: '85b1-eb9a-17a6-e5be' }
  return {
    v: 1,
    sides: [
      {
        catalogueId,
        pick,
        rules: {},
        preferences: {},
        attached: [
          { catalogueId, entryId: '9770-3a56-619e-f390' },
          { catalogueId, entryId: 'b62e-cd23-d338-8142' },
        ],
      },
      { catalogueId, pick, rules: {} },
    ],
    swapped: false,
    matchup: { adjustments: {}, preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] },
  }
}

function shared(page: Page) {
  const state = simulatorState(page)
  if (!state) throw new Error('The current simulator URL must contain valid v1 state.')
  return state
}

async function choose(page: Page, control: string, name: string) {
  await expect(page.getByRole('combobox', { name: control, exact: true })).toBeEnabled()
  await chooseOption(page, control, name)
}

async function noOverflow(page: Page, scope: Locator) {
  await expectNoPageOverflow(page)
  expect(await scope.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
}

async function selectedProfile(page: Page, prefix: string) {
  await combatSettled(page)
  await expect(page.getByRole('combobox', { name: 'Librarian · Smite', exact: true })).toContainText(focusedName)
  await expect(
    page.getByRole('region', { name: 'Shooting results' }).getByRole('heading', { name: focusedName, exact: true }),
  ).toBeVisible()
  await expect.poll(() => shared(page).sides[0]?.preferences).toEqual({ [`${prefix}ranged:0:smite`]: `${prefix}${focused}` })
}

test('surviving profile choices agree with results and v1 links through member edits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/simulator?s=${encodeSimulatorState(memberState())}`)
  await choose(page, 'Librarian · Smite', focusedName)
  await selectedProfile(page, 'attached:2:')

  const previous = await page.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1).textContent()
  const { promise: gate, resolve: release } = Promise.withResolvers<void>()
  let pending = 0
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') {
      pending++
      await gate
    }
    await route.continue()
  })
  try {
    await page.getByRole('button', { name: 'Remove attacker Lieutenant', exact: true }).click()
    await expect.poll(() => pending).toBeGreaterThan(0)
    await expect(page.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1)).toHaveText(previous!)
    await expect(page.getByText(discarded, { exact: true })).toHaveCount(0)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
  }
  await selectedProfile(page, 'attached:1:')
  await choose(page, 'Librarian · Smite', witchfireName)
  await combatSettled(page)
  const ordinary = await page.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1).textContent()
  await choose(page, 'Librarian · Smite', focusedName)
  await selectedProfile(page, 'attached:1:')
  await expect(page.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1)).not.toHaveText(ordinary!)

  await page.getByRole('button', { name: 'Remove attacker Intercessor Squad', exact: true }).click()
  await selectedProfile(page, '')
  const damage = await page.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1).textContent()
  const swap = page.getByRole('button', { name: 'Swap attacker and defender', exact: true })
  await swap.click()
  await combatSettled(page)
  await page.goto(page.url())
  await expect(page.getByRole('region', { name: 'Defender', exact: true })).toContainText('Librarian')
  await expect(swap).toBeEnabled()
  await swap.click()
  await selectedProfile(page, '')
  await expect(page.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1)).toHaveText(damage!)
  await swap.click()
  await combatSettled(page)
  await swap.click()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await selectedProfile(page, '')
    await expect(page.getByText(discarded, { exact: true })).toHaveCount(0)
    await noOverflow(page, page.getByRole('region', { name: 'Attacker', exact: true }))
    await page.screenshot({ path: test.info().outputPath(`simulator-context-members-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })

  const obsolete = shared(page)
  obsolete.sides[0]!.preferences = { 'ranged:0:smite': 'retired-smite-profile' }
  await page.goto(`/simulator?s=${encodeSimulatorState(obsolete)}`)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await combatSettled(page)
    await expect(page.getByText(discarded, { exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Librarian · Smite', exact: true })).toContainText(witchfireName)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect
    .poll(() => {
      const state = shared(page)
      return [state.sides[0]?.preferences ?? {}, state.matchup?.preferences]
    })
    .toEqual([{}, {}])
  await choose(page, 'Librarian · Smite', focusedName)
  await selectedProfile(page, '')
  await expect(page.getByText(discarded, { exact: true })).toHaveCount(0)
  await page.goto(`/simulator?s=${encodeSimulatorState(obsolete)}`)
  await combatSettled(page)
  await expect(page.getByText(discarded, { exact: true })).toBeVisible()
  await openCombatControls(page)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByText(discarded, { exact: true })).toHaveCount(0)
})

async function holdLoadoutReplies(page: Page, memberIndex: number) {
  await page.evaluate((index) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Reflect.apply binds the saved method to its worker.
    const original = Worker.prototype.postMessage
    const pending: (() => void)[] = []
    let holding = true
    const gate = {
      pending,
      started: 0,
      replies: 0,
      resume: () => {
        holding = false
      },
      release: () => {
        Worker.prototype.postMessage = original
        for (const callback of pending.splice(0)) callback()
        delete window.PraetoriumLoadoutGate
      },
    }
    Worker.prototype.postMessage = function (message: unknown, ...args: unknown[]) {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'loadouts' && 'scoring' in message) {
        const scoring = message.scoring as { memberIndex?: number }
        if ((scoring.memberIndex ?? 0) === index) {
          const callback = this.onmessage
          this.onmessage = (event) => {
            gate.replies++
            if (holding) pending.push(() => callback?.call(this, event))
            else callback?.call(this, event)
          }
          gate.started = performance.now()
        }
      }
      Reflect.apply(original, this, [message, ...args])
    }
    window.PraetoriumLoadoutGate = gate
  }, memberIndex)
  return {
    waitForReply: () => expect.poll(() => page.evaluate(() => window.PraetoriumLoadoutGate?.pending.length ?? 0)).toBeGreaterThan(0),
    resume: () => page.evaluate(() => window.PraetoriumLoadoutGate?.resume()),
    replies: () => page.evaluate(() => window.PraetoriumLoadoutGate?.replies ?? 0),
    elapsed: () => page.evaluate(() => performance.now() - (window.PraetoriumLoadoutGate?.started ?? performance.now())),
    release: () => page.evaluate(() => window.PraetoriumLoadoutGate?.release()),
  }
}

async function editor(page: Page, context: 'standalone' | 'roster', companion: boolean, width: number) {
  await page.setViewportSize({ width, height: 1000 })
  if (context === 'standalone') {
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    await choose(page, 'Attacker add attached unit', 'Overlord')
  } else {
    await signUp(page, `Odds ${companion ? 'companion' : 'primary'} ${width}`)
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    for (const name of ['Necron Warriors', 'Immortals', 'Overlord']) await addUnit(page, name)
    if (width < 1300) await page.getByRole('dialog', { name: 'Add units' }).getByRole('button', { name: 'Close' }).click()
    await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Attach Overlord to unit', exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('menuitem', { name: 'Immortals', exact: true }).click())
    await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
    await page.locator('aside[aria-label="Loadout"]').getByRole('button', { name: 'Simulate combat', exact: true }).click()
  }
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  await combatSettled(page)
  const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
  if (companion) await attacker.getByLabel('Attacker Overlord loadout', { exact: true }).click()
  else await attacker.getByRole('button', { name: 'Loadout', exact: true }).click()
  return page.getByRole('dialog', { name: `Attacker · ${companion ? 'Overlord' : 'Immortals'}`, exact: true })
}

const editors = [
  { context: 'standalone', companion: false, width: 390 },
  { context: 'standalone', companion: true, width: 1440 },
  { context: 'roster', companion: false, width: 1440 },
  { context: 'roster', companion: true, width: 390 },
] as const

for (const { context, companion, width } of editors) {
  const member = companion ? 'companion' : 'primary'
  test(`${context} ${member} loadout retains odds through a real deadline and native retry at ${width}px`, async ({ page }) => {
    // A background refetch restarts scoring with a fresh fifteen-second worker, so allow for one restart.
    test.setTimeout(180_000)
    const loadout = await editor(page, context, companion, width)
    const odds = loadout.getByLabel(/^(Shooting|Melee), unit: /)
    await expect(odds.first()).toBeVisible()
    await expect(loadout.locator('[aria-label*="destroyed,"].text-faint')).toHaveCount(0)
    const priorLabels = await odds.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))
    const gate = await holdLoadoutReplies(page, companion ? 1 : 0)
    try {
      const next = companion ? 'Voidscythe' : 'Tesla carbine'
      await loadout.getByRole('button', { name: `Select ${next}`, exact: true }).click()
      await expect(loadout.getByRole('button', { name: `Select ${next}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await gate.waitForReply()
      const alert = loadout.getByRole('alert').filter({ hasText: 'The loadout comparison took too long. Try again.' })
      await expect(alert).toBeVisible({ timeout: 45_000 })
      expect(await gate.elapsed()).toBeGreaterThanOrEqual(14_900)
      await expect(alert).toContainText('Previous odds are shown.')
      expect(await odds.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))).toEqual(priorLabels)
      await expect(loadout.locator('[aria-label*="destroyed,"].text-faint').first()).toBeVisible()
      await noOverflow(page, loadout)
      await loadout.screenshot({ path: test.info().outputPath(`simulator-context-timeout-${context}-${member}-${width}.png`) })
      await gate.resume()
      const beforeRetry = await gate.replies()
      await alert.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect.poll(gate.replies).toBeGreaterThan(beforeRetry)
      await expect(alert).toHaveCount(0)
      await expect(odds.first()).toBeVisible()
      await expect(loadout.locator('[aria-label*="destroyed,"].text-faint')).toHaveCount(0)

      const current = companion ? 'Staff of light' : 'Gauss blaster'
      const beforeEdit = await gate.replies()
      await loadout.getByRole('button', { name: `Select ${current}`, exact: true }).click()
      await expect(loadout.getByRole('button', { name: `Select ${current}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(gate.replies).toBeGreaterThan(beforeEdit)
      await expect(loadout.locator('[aria-label*="destroyed,"].text-faint')).toHaveCount(0)
      const currentLabels = await odds.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))
      await gate.release()
      await nextFrames(page)
      expect(await odds.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))).toEqual(currentLabels)
      await expect(loadout.locator('[aria-label*="destroyed,"].text-faint')).toHaveCount(0)
      await expect(loadout.getByRole('alert')).toHaveCount(0)
      await noOverflow(page, loadout)
      await loadout.screenshot({ path: test.info().outputPath(`simulator-context-recovered-${context}-${member}-${width}.png`) })
    } finally {
      await gate.release()
    }
  })
}
