import { expect, test, type Page } from '@playwright/test'
import { retryUntilVisible } from './account'

async function choose(page: Page, control: string, name: string) {
  const option = page.getByRole('option', { name, exact: true })
  await retryUntilVisible(option, () => page.getByRole('combobox', { name: control, exact: true }).click())
  await option.click()
}

async function matchup(page: Page) {
  for (const side of ['Attacker', 'Defender']) {
    await choose(page, `${side} faction`, 'Space Marines')
    await choose(page, `${side} unit`, 'Intercessor Squad')
    await expect(page.getByLabel(`${side} models`, { exact: true })).toBeVisible()
  }
  await expect(page.getByRole('region', { name: 'Shooting results' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('region', { name: 'Melee results' })).toHaveAttribute('aria-busy', 'false')
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    await page
      .locator('main section, [role=dialog], [data-slot=scroll-area-viewport]')
      .evaluateAll((panels) => panels.every((element) => element.scrollWidth <= element.clientWidth + 1)),
  ).toBe(true)
}

for (const width of [1440, 390, 860, 1024]) {
  test(`automatic shooting and melee with stable edits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/more')
    await page.getByRole('link', { name: 'Simulator Damage and kill probabilities' }).click()
    await expect(page.getByRole('heading', { name: 'Combat simulator', exact: true })).toBeVisible()
    const swap = page.getByRole('button', { name: 'Swap attacker and defender' })
    await expect(swap).toBeDisabled()
    await matchup(page)
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    const melee = page.getByRole('region', { name: 'Melee results' })
    await expect(shooting).toContainText('1.66')
    await expect(shooting).toContainText('5× Bolt Rifle')
    await expect(melee).toContainText('5× Close combat weapon')
    for (const [results, phase] of [
      [shooting, 'Shooting'],
      [melee, 'Melee'],
    ] as const) {
      for (const label of ['Wounds lost', 'Models lost']) {
        const chart = page.getByRole('dialog', { name: `${phase} · ${label} probabilities`, exact: true })
        await expect(chart).toHaveCount(0)
        await results.getByRole('button', { name: new RegExp(`${label}: .*Show probabilities`) }).hover()
        await expect(chart).toBeVisible()
        await expect(chart).toContainText('%')
        await chart.hover()
        await expect(chart).toBeVisible()
        await noOverflow(page)
        if (phase === 'Shooting' && label === 'Models lost') await page.screenshot({ path: `test-results/simulator-chart-${width}.png` })
        await page.mouse.move(0, 0)
        await expect(chart).toBeHidden()
      }
      await expect(results.locator('summary')).toHaveCount(0)
    }
    await expect(shooting.getByRole('heading', { name: '5× Bolt Rifle', exact: true }).locator('..').locator('.eyebrow')).toHaveText([
      'Range',
      'A',
      'BS',
      'S',
      'AP',
      'D',
    ])
    await expect(page.getByText('Evaluated profiles and weapon rules included.', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Each phase starts against the full defending unit.', { exact: true })).toHaveCount(0)
    await expect(page.locator('main details')).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Defender Feel No Pain', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Attacker rules', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Defender rules', exact: true })).toBeVisible()
    for (const side of ['Attacker', 'Defender']) {
      const panel = page.getByRole('region', { name: side, exact: true })
      await expect(panel.locator('[data-characteristic] .readout')).toHaveText(['4', '3+', '2', '—', '—'])
      await expect(panel.getByRole('button', { name: `Fewer ${side.toLowerCase()} models` })).toBeDisabled()
      const loadoutBounds = await panel.getByRole('button', { name: 'Loadout', exact: true }).boundingBox()
      const modelsBounds = await panel.getByLabel(`${side} models`, { exact: true }).boundingBox()
      expect(loadoutBounds!.x + loadoutBounds!.width).toBeLessThan(modelsBounds!.x)
      expect(Math.abs(loadoutBounds!.y + loadoutBounds!.height / 2 - modelsBounds!.y - modelsBounds!.height / 2)).toBeLessThan(2)
    }
    const defenderBounds = await page.getByRole('region', { name: 'Defender', exact: true }).boundingBox()
    const swapBounds = await swap.boundingBox()
    if (width === 390) expect(swapBounds!.y + swapBounds!.height / 2).toBeCloseTo(defenderBounds!.y, 0)
    else expect(swapBounds!.x + swapBounds!.width / 2).toBeCloseTo(defenderBounds!.x, 0)
    await noOverflow(page)
    await page.getByRole('region', { name: 'Attacker', exact: true }).screenshot({ path: `test-results/simulator-controls-${width}.png` })
    await page.screenshot({ path: `test-results/simulator-${width}.png`, fullPage: true })

    await page.getByRole('switch', { name: 'Defender has cover (−1 BS)' }).click()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).not.toContainText('1.66')

    let hold = true
    let intercepted = false
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/*', async (route) => {
      const request = route.request()
      if (hold && request.method() === 'POST' && request.postData()?.includes('85b1-eb9a-17a6-e5be')) {
        intercepted = true
        await gate
      }
      await route.continue()
    })
    await page.getByRole('button', { name: 'More defender models' }).click()
    await expect.poll(() => intercepted).toBe(true)
    await expect(shooting).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByText(/Updating…|Estimates · up to/)).toHaveCount(0)
    await expect(page.getByLabel('Defender models', { exact: true })).toHaveText('6')
    for (let added = 0; added < 4; added++) await page.getByRole('button', { name: 'More defender models' }).click()
    await expect(page.getByLabel('Defender models', { exact: true })).toHaveText('10')
    await expect(page.getByRole('button', { name: 'More defender models' })).toBeDisabled()
    await expect(swap).toBeDisabled()
    await expect(shooting).toContainText('1.25')
    await expect(melee).toContainText('5× Close combat weapon')
    await page.screenshot({ path: `test-results/simulator-updating-${width}.png`, fullPage: true })
    hold = false
    release()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await page.unrouteAll({ behavior: 'wait' })

    await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    const loadout = page.getByRole('dialog')
    const fist = loadout.getByRole('button', { name: 'Select Power fist', exact: true })
    await expect(fist).toBeVisible()
    const heading = loadout.getByRole('heading', { name: 'Attacker · Intercessor Squad' })
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-loadout-${width}.png`, fullPage: true })

    let releaseLoadout = () => {}
    let loadoutIntercepted = false
    const loadoutGate = new Promise<void>((resolve) => {
      releaseLoadout = resolve
    })
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST' && route.request().postData()?.includes('85b1-eb9a-17a6-e5be')) {
        loadoutIntercepted = true
        await loadoutGate
      }
      await route.continue()
    })
    await fist.click()
    await expect.poll(() => loadoutIntercepted).toBe(true)
    await expect(heading).toBeVisible()
    await expect(fist).toBeVisible()
    await expect(loadout.getByText('Select a unit from the roster to see its loadout.')).toHaveCount(0)
    await page.screenshot({ path: `test-results/simulator-loadout-updating-${width}.png`, fullPage: true })
    releaseLoadout()
    await expect(fist).toHaveAttribute('aria-pressed', 'true')
    await expect(fist).toBeEnabled()
    await page.unrouteAll({ behavior: 'wait' })
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(melee).toHaveAttribute('aria-busy', 'false')
    await expect(melee).toContainText('Power fist')
    await expect(melee).toContainText('4× Close combat weapon')
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-melee-${width}.png`, fullPage: true })

    await swap.click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('10')
    await expect(page.getByLabel('Defender models', { exact: true })).toHaveText('5')
    await expect(melee).toContainText('10× Close combat weapon')
    await expect(melee).not.toContainText('Power fist')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).toContainText('10× Bolt Rifle')
    await page.getByRole('region', { name: 'Defender', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    await expect(fist).toHaveAttribute('aria-pressed', 'true')
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    for (let removed = 0; removed < 5; removed++) await page.getByRole('button', { name: 'Fewer attacker models' }).click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('5')
    await expect(page.getByRole('button', { name: 'Fewer attacker models' })).toBeDisabled()
    await expect(swap).toBeEnabled()
    await swap.click()
    await expect(melee).toHaveAttribute('aria-busy', 'false')
    await expect(melee).toContainText('Power fist')
    await expect(melee).toContainText('4× Close combat weapon')
    await expect(shooting).toContainText('1.66')
    await expect(page.getByRole('switch', { name: 'Defender has cover (−1 BS)' })).not.toBeChecked()
    await choose(page, 'Defender Feel No Pain', '5+')
    await expect(page.getByRole('region', { name: 'Defender', exact: true }).locator('[data-characteristic="FNP"] .readout')).toHaveText(
      '5+',
    )
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    expect(Number(await shooting.locator('.readout').first().textContent())).toBeLessThan(1.3)
    await noOverflow(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/simulator-swapped-${width}.png`, fullPage: true })
  })

  test(`simulator first frame reserves its layout at ${width}px`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${baseURL}/simulator`)
    await expect(page.getByRole('heading', { name: 'Combat simulator', exact: true })).toBeVisible()
    await noOverflow(page)
    const serverBounds = await page.getByRole('region', { name: 'Attacker', exact: true }).boundingBox()
    await page.screenshot({ path: `test-results/simulator-first-frame-${width}.png`, fullPage: true })
    const interactive = await browser.newPage({ viewport: { width, height: 1000 } })
    await interactive.goto(`${baseURL}/simulator`)
    await choose(interactive, 'Attacker faction', 'Space Marines')
    expect(await interactive.getByRole('region', { name: 'Attacker', exact: true }).boundingBox()).toEqual(serverBounds)
    await interactive.close()
    await context.close()
  })
}

for (const width of [1440, 390]) {
  test(`printed Feel No Pain applies, resets and swaps with the unit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await choose(page, 'Attacker faction', 'Space Marines')
    await choose(page, 'Attacker unit', 'Intercessor Squad')
    await choose(page, 'Defender faction', 'Necrons')
    await choose(page, 'Defender unit', 'Canoptek Reanimator')
    const defender = page.getByRole('region', { name: 'Defender', exact: true })
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    const fnp = page.getByRole('combobox', { name: 'Defender Feel No Pain', exact: true })
    await expect(defender.locator('[data-characteristic] .readout')).toHaveText(['6', '3+', '6', '—', '4+'])
    await expect(fnp).toContainText('4+')
    await expect(
      page
        .getByRole('region', { name: 'Defender rules', exact: true })
        .getByRole('button', { name: 'Defender Feel No Pain 4+ rules', exact: true }),
    ).toBeVisible()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    const damage = shooting.locator('.readout').first()
    const baseline = Number(await damage.textContent())
    expect(baseline).toBeGreaterThan(0.53)
    expect(baseline).toBeLessThan(0.58)
    await choose(page, 'Defender Feel No Pain', 'None')
    await expect(defender.locator('[data-characteristic="FNP"] .readout')).toHaveText('—')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    expect(Number(await damage.textContent())).toBeGreaterThan(baseline * 1.8)
    await page.getByRole('button', { name: 'Reset adjustments', exact: true }).click()
    await expect(fnp).toContainText('4+')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    expect(Number(await damage.textContent())).toBe(baseline)
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(page.getByRole('region', { name: 'Attacker', exact: true }).locator('[data-characteristic="FNP"] .readout')).toHaveText(
      '4+',
    )
    await expect(defender.locator('[data-characteristic="FNP"] .readout')).toHaveText('—')
    await expect(fnp).toContainText('None')
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(fnp).toContainText('4+')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await noOverflow(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await defender.screenshot({ path: `test-results/simulator-reanimator-${width}.png` })
    await page.getByRole('region', { name: 'Conditions and rules' }).screenshot({ path: `test-results/simulator-conditions-${width}.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/simulator-fnp-${width}.png`, fullPage: true })
  })
}

test('a failed worker can be retried without reselecting either unit', async ({ page }) => {
  await page.addInitScript(() => {
    const RealWorker = window.Worker
    let first = true
    window.Worker = class extends RealWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args)
        if (first) {
          first = false
          this.terminate()
          throw new Error('Worker startup failure')
        }
      }
    }
  })
  await page.goto('/simulator')
  await matchup(page)
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  await expect(shooting).toContainText('The calculation could not start.')
  await shooting.getByRole('button', { name: 'Retry' }).click()
  await expect(shooting).toContainText('1.66')
  await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('5')
})

for (const width of [1440, 390]) {
  test(`particle casters simulate with the Pistol keyword at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await choose(page, 'Attacker faction', 'Necrons')
    await choose(page, 'Attacker unit', 'Canoptek Wraiths')
    await choose(page, 'Defender faction', 'Space Marines')
    await choose(page, 'Defender unit', 'Intercessor Squad')
    await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    const loadout = page.getByRole('dialog')
    await loadout.getByRole('button', { name: 'More Wraith w/ claws and particle caster', exact: true }).click()
    await expect(loadout.getByRole('button', { name: 'Fewer Wraith w/ claws and particle caster', exact: true })).toBeEnabled()
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    await expect(shooting).toContainText('Particle caster')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting.getByRole('alert')).toHaveCount(0)
    const damage = shooting.locator('.readout').first()
    await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(0.47)
    expect(Number(await damage.textContent())).toBeLessThan(0.53)
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-particle-caster-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(page.getByRole('combobox', { name: 'Attacker faction', exact: true })).toContainText('Space Marines')
    await expect(page.getByRole('combobox', { name: 'Defender faction', exact: true })).toContainText('Necrons')
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('5')
    await expect(page.getByLabel('Defender models', { exact: true })).toHaveText('3')
    await expect(page.getByRole('region', { name: 'Defender', exact: true }).locator('[data-characteristic] .readout')).toHaveText([
      '6',
      '3+',
      '4',
      '4+',
      '—',
    ])
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).toContainText('5× Bolt Rifle')
    await expect(shooting).not.toContainText('Particle caster')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/simulator-wraith-defender-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).toContainText('Particle caster')
    expect(Number(await damage.textContent())).toBeGreaterThan(0.47)
    expect(Number(await damage.textContent())).toBeLessThan(0.53)
  })
}

test('faction options and selected factions show their catalogue icons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/simulator')
  const necrons = page.getByRole('option', { name: 'Necrons', exact: true })
  await retryUntilVisible(necrons, () => page.getByRole('combobox', { name: 'Attacker faction', exact: true }).click())
  const mark = necrons.locator('[data-faction-mark="necrons"]')
  await expect(mark).toBeVisible()
  const icon = await mark.evaluate((element) => getComputedStyle(element).maskImage)
  expect(icon).toMatch(/^url\(/)
  const imageWidth = await page.evaluate(
    async (src) => {
      const iconImage = new Image()
      iconImage.src = src
      await iconImage.decode()
      return iconImage.naturalWidth
    },
    JSON.parse(icon.slice(4, -1)),
  )
  expect(imageWidth).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/simulator-faction-icons.png', fullPage: true })
  await necrons.click()
  await expect(page.getByRole('combobox', { name: 'Attacker faction', exact: true }).locator('[data-faction-mark="necrons"]')).toBeVisible()
})

test('probability charts open on keyboard focus and close with Escape', async ({ page }) => {
  await page.goto('/simulator')
  await matchup(page)
  const trigger = page.getByRole('region', { name: 'Shooting results' }).getByRole('button', { name: /Wounds lost: .*Show probabilities/ })
  await page.keyboard.press('Tab')
  await trigger.focus()
  const chart = page.getByRole('dialog', { name: 'Shooting · Wounds lost probabilities', exact: true })
  await expect(chart).toBeVisible()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(chart).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('dialog', { name: 'Shooting · Models lost probabilities', exact: true })).toBeVisible()
})

test('Necron mortal abilities affect their phase and filter ineligible targets', async ({ page }) => {
  await page.goto('/simulator')
  await choose(page, 'Attacker faction', 'Necrons')
  await choose(page, 'Attacker unit', 'Skorpekh Lord')
  await choose(page, 'Defender faction', 'Space Marines')
  await choose(page, 'Defender unit', 'Intercessor Squad')
  const melee = page.getByRole('region', { name: 'Melee results' })
  const meleeDamage = melee.locator('.readout').first()
  await expect(meleeDamage).toHaveText(/^\d+\.\d+$/)
  const beforeCharge = Number(await meleeDamage.textContent())
  await page.getByRole('switch', { name: 'Attacker Crimson Harvest', exact: true }).click()
  await expect.poll(async () => Number(await meleeDamage.textContent())).toBeGreaterThan(beforeCharge)
  await choose(page, 'Attacker unit', 'Annihilation Barge')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const damage = shooting.locator('.readout').first()
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const beforeArcing = Number(await damage.textContent())
  await page.getByRole('switch', { name: 'Attacker Malevolent Arcing', exact: true }).click()
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(beforeArcing)
  await choose(page, 'Attacker unit', "C'tan Shard of the Void Dragon")
  await expect(page.getByRole('switch', { name: 'Attacker Matter Absorption', exact: true })).toHaveCount(0)
  await choose(page, 'Defender unit', 'Land Raider')
  await expect(page.getByRole('switch', { name: 'Defender Smokescreen', exact: true })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'Attacker Matter Absorption', exact: true })).toBeVisible()
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const beforeAbsorption = Number(await damage.textContent())
  await page.getByRole('switch', { name: 'Attacker Matter Absorption', exact: true }).click()
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(beforeAbsorption)
  await page.getByRole('button', { name: 'Attacker Matter Absorption rules', exact: true }).hover()
  await expect(page.getByRole('tooltip').filter({ hasText: 'Matter Absorption' })).toContainText('D3 mortal wounds')
  await page.screenshot({ path: 'test-results/simulator-necron-mortals.png' })
})

test.describe('touch probability charts', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('tap reveals the matching chart and an outside tap dismisses it', async ({ page }) => {
    await page.goto('/simulator')
    await matchup(page)
    const trigger = page
      .getByRole('region', { name: 'Shooting results' })
      .getByRole('button', { name: /Models lost: .*Show probabilities/ })
    const chart = page.getByRole('dialog', { name: 'Shooting · Models lost probabilities', exact: true })
    await expect(chart).toHaveCount(0)
    await trigger.tap()
    await expect(chart).toBeVisible()
    await noOverflow(page)
    await page.screenshot({ path: 'test-results/simulator-chart-touch.png' })
    await page.getByRole('region', { name: 'Shooting results' }).getByRole('heading', { name: '5× Bolt Rifle', exact: true }).tap()
    await expect(chart).toBeHidden()
    await trigger.tap()
    await expect(chart).toBeVisible()
    await trigger.tap()
    await expect(chart).toBeHidden()
    const rule = page.getByRole('button', { name: 'Attacker Hail of Bolts rules', exact: true })
    const buff = page.getByRole('switch', { name: 'Attacker Hail of Bolts', exact: true })
    await rule.tap()
    const tooltip = page.getByRole('tooltip').filter({ hasText: 'Hail of Bolts' })
    await expect(tooltip).toContainText('have +2 A')
    await expect(buff).not.toBeChecked()
    await noOverflow(page)
    await page.screenshot({ path: 'test-results/simulator-rule-touch.png' })
    await page.getByRole('heading', { name: 'Attacker rules & buffs', exact: true }).tap()
    await expect(tooltip).toBeHidden()
  })
})
