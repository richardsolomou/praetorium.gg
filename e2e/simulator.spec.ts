import { expect, test, type Locator, type Page } from '@playwright/test'
import { chooseUnit, retryUntilVisible } from './account'

async function choose(page: Page, control: string, name: string) {
  const option = page.getByRole('option', { name, exact: true })
  await retryUntilVisible(option, () => page.getByRole('combobox', { name: control, exact: true }).click())
  await option.click()
}

function chip(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name, exact: true })
}

function estimate(page: Page, phase: 'Shooting' | 'Melee') {
  return page.getByRole('region', { name: `${phase} estimate` })
}

test('the Death Guard Defiler calculates either Shearing claws mode', async ({ page }) => {
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Death Guard', 'Defiler')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const melee = page.getByRole('region', { name: 'Melee results' })
  const damage = estimate(page, 'Melee').locator('.readout').first()
  for (const mode of ['strike', 'sweep']) {
    await choose(page, 'Defiler · Shearing claws', `Shearing claws - ${mode}`)
    await expect(melee.getByRole('heading', { name: `Shearing claws - ${mode}`, exact: true })).toBeVisible()
    await expect(melee.locator('[data-weapon-card]')).toHaveCount(1)
    await expect(melee).not.toContainText('equipped weapons could not be matched')
    await expect(melee).toHaveAttribute('aria-busy', 'false')
    await expect(damage).toHaveText(/^\d+\.\d{2}$/)
    await page.screenshot({ path: `test-results/simulator-defiler-${mode}.png` })
  }
})

for (const width of [1440, 390]) {
  test(`source-linked equipment calculates without ownership errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    for (const [faction, unit, phase] of [
      ['Blood Angels', 'Lemartes', 'Shooting'],
      ['Chaos Daemons', 'Pink Horrors', 'Shooting'],
      ['Astra Militarum', 'Cadian Heavy Weapons Squad', 'Melee'],
      ['Aeldari', 'Jain Zar', 'Melee'],
      ['Drukhari', 'Lady Malys', 'Melee'],
      ['Orks', 'Deffkoptas', 'Shooting'],
    ] as const) {
      await chooseUnit(page, 'Attacker', faction, unit)
      const results = page.getByRole('region', { name: `${phase} results` })
      await expect(results).toHaveAttribute('aria-busy', 'false')
      await expect(results.getByRole('alert')).toHaveCount(0)
      await expect(estimate(page, phase).locator('.readout').first()).toHaveText(/^\d+\.\d{2}$/)
      await expect(results).not.toContainText('ref. only')
      await noOverflow(page)
      await page.screenshot({ path: `test-results/simulator-ownership-${unit.replaceAll(' ', '-')}-${width}.png` })
    }
    await chooseUnit(page, 'Attacker', 'Necrons', 'Triarch Praetorians')
    await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    const loadout = page.getByRole('dialog')
    for (let count = 1; count <= 5; count++) {
      await loadout.getByRole('button', { name: 'More Particle caster and voidblade', exact: true }).click()
      await expect(loadout.getByLabel('Particle caster and voidblade count', { exact: true })).toHaveText(String(count))
    }
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Shooting results' })).toContainText('Particle caster')
    await expect(page.getByRole('region', { name: 'Melee results' })).toContainText('Voidblade')
    for (const phase of ['Shooting', 'Melee'] as const) {
      await expect(page.getByRole('region', { name: `${phase} results` }).getByRole('alert')).toHaveCount(0)
      await expect(estimate(page, phase).locator('.readout').first()).toHaveText(/^\d+\.\d{2}$/)
    }
    await page.screenshot({ path: `test-results/simulator-ownership-bundle-${width}.png` })
  })
}

/** Every modifier tab offers the same chips, and the previous panel can linger while the next one opens. */
async function modifierTab(page: Page, title: 'All' | 'Shooting' | 'Melee') {
  // A tab, and the panel it labels, count the modifiers selected in it.
  const name = new RegExp(`^${title}(?: \\d+)?$`)
  await page.getByRole('tab', { name }).click()
  return page.getByRole('tabpanel', { name })
}

async function matchup(page: Page) {
  for (const side of ['Attacker', 'Defender']) {
    await chooseUnit(page, side, 'Space Marines', 'Intercessor Squad')
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

test('the unit picker keeps only distinct faction contexts', async ({ page }) => {
  await page.goto('/simulator')
  await page.getByRole('combobox', { name: 'Attacker unit' }).click()
  const search = page.getByPlaceholder('Search units…')
  await search.fill('Intercessor Squad')
  await expect(page.getByRole('option', { name: /^Intercessor Squad, / })).toHaveCount(1)
  await expect(page.getByRole('option', { name: /^Intercessor Squad, Space Marines,/ })).toBeVisible()
  await search.fill('Assault Intercessor Squad')
  await expect(page.getByRole('option', { name: /^Assault Intercessor Squad, / })).toHaveCount(1)
  await page.getByRole('listbox').screenshot({ path: 'test-results/simulator-assault-intercessor-choices.png' })
  await search.fill('Sternguard Veteran Squad')
  await expect(page.getByRole('option', { name: /^Sternguard Veteran Squad, / })).toHaveCount(2)
  await expect(page.getByRole('option', { name: /^Sternguard Veteran Squad, Black Templars,/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /^Sternguard Veteran Squad, Space Marines,/ })).toBeVisible()
})

test('weapon switches leave profiles visible and shared modifiers can be overridden by phase', async ({ page }) => {
  await page.goto('/simulator')
  await matchup(page)
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const shootingDamage = estimate(page, 'Shooting').locator('.readout').first()
  const meleeDamage = estimate(page, 'Melee').locator('.readout').first()
  const resultsSummary = page.getByLabel('Results summary')
  await expect(resultsSummary).toBeVisible()
  await expect(page.locator('[data-result-numbers]')).toHaveCount(2)
  expect(await resultsSummary.evaluate((element) => getComputedStyle(element).position)).toBe('fixed')
  await expect(shootingDamage).toHaveText(/^\d+\.\d{2}$/)
  await expect(meleeDamage).toHaveText(/^\d+\.\d{2}$/)
  const startingShooting = Number(await shootingDamage.textContent())
  const startingMelee = Number(await meleeDamage.textContent())
  const boltRifle = page.getByRole('switch', { name: 'Include Bolt Rifle – Focused Fire in shooting calculation' })
  expect(
    await boltRifle.evaluate((switchElement) => {
      const card = switchElement.closest('[data-weapon-card]')
      return Boolean(card && switchElement.getBoundingClientRect().right > card.getBoundingClientRect().right - 40)
    }),
  ).toBe(true)
  await shooting
    .locator('[data-weapon-card]')
    .first()
    .screenshot({ path: 'test-results/simulator-weapon-switch.png', animations: 'disabled' })
  await boltRifle.click()
  await expect(boltRifle).not.toBeChecked()
  await shooting
    .locator('[data-weapon-card]')
    .first()
    .screenshot({ path: 'test-results/simulator-weapon-switch-off.png', animations: 'disabled' })
  await expect(shooting.getByRole('heading', { name: /Bolt Rifle/i })).toBeVisible()
  await expect(shootingDamage).toHaveText('—')
  await boltRifle.click()
  await expect.poll(async () => Number(await shootingDamage.textContent())).toBe(startingShooting)

  await chip(await modifierTab(page, 'All'), 'Sustained Hits 1').click()
  await expect.poll(async () => Number(await shootingDamage.textContent())).toBeGreaterThan(startingShooting)
  await expect.poll(async () => Number(await meleeDamage.textContent())).toBeGreaterThan(startingMelee)
  const sharedMelee = Number(await meleeDamage.textContent())
  const sharedShooting = Number(await shootingDamage.textContent())
  const shootingModifiers = await modifierTab(page, 'Shooting')
  await chip(shootingModifiers, 'Sustained Hits 2').click()
  await expect.poll(async () => Number(await shootingDamage.textContent())).toBeGreaterThan(sharedShooting)
  await expect.poll(async () => Number(await meleeDamage.textContent())).toBe(sharedMelee)
  const noSustained = chip(shootingModifiers, 'No Sustained Hits')
  await noSustained.click()
  await expect(noSustained).not.toHaveClass(/opacity-45/)
  await expect.poll(async () => Number(await shootingDamage.textContent())).toBe(startingShooting)

  await chip(await modifierTab(page, 'All'), '+1 Hit').click()
  await expect.poll(async () => Number(await shootingDamage.textContent())).toBeGreaterThan(startingShooting)
  await chip(await modifierTab(page, 'Shooting'), '−1 Hit').click()
  await expect.poll(async () => Number(await shootingDamage.textContent())).toBe(startingShooting)
  const summary = page.getByRole('region', { name: 'Applied modifiers' })
  await expect(summary).toContainText('+1 to hit (All)')
  await expect(summary).toContainText('−1 to hit (Shooting)')
  await expect(summary).toContainText('Hit modifiers cancel to 0')
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('region', { name: 'Modifiers', exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await expect(resultsSummary).toBeVisible()
  await page.setViewportSize({ width: 390, height: 900 })
  await noOverflow(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  const top = await resultsSummary.evaluate((element) => element.getBoundingClientRect().top)
  await page.getByRole('region', { name: 'Modifiers', exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await expect(resultsSummary).toBeVisible()
  expect(await resultsSummary.evaluate((element) => element.getBoundingClientRect().top)).toBe(top)
  await page.getByRole('region', { name: 'Modifiers', exact: true }).screenshot({ path: 'test-results/simulator-shared-modifiers-390.png' })
})

test('stacked wound bonuses remain selected and explain the roll cap', async ({ page }) => {
  await page.goto('/simulator')
  await matchup(page)
  await chip(await modifierTab(page, 'All'), '+1 Wound').click()
  const shootingModifiers = await modifierTab(page, 'Shooting')
  const shootingBonus = chip(shootingModifiers, '+1 Wound')
  await shootingBonus.click()
  await expect(shootingBonus).toHaveAttribute('aria-pressed', 'true')
  await expect(shootingBonus).not.toHaveClass(/opacity-45/)
  const summary = page.getByRole('region', { name: 'Applied modifiers' })
  await expect(summary).toContainText('+1 to wound (All)')
  await expect(summary).toContainText('+1 to wound (Shooting)')
  await expect(summary).toContainText('Wound roll modifier capped at +1')
  await shootingBonus.hover()
  await expect(page.getByRole('tooltip')).toContainText('Bonuses and penalties combine before the roll modifier is capped')
  await summary.screenshot({ path: 'test-results/simulator-stacked-wound-bonuses.png' })
  await chip(shootingModifiers, '−1 Wound').click()
  await expect(summary).toContainText('−1 to wound (Shooting)')
  await expect(summary).toContainText('Wound modifiers cancel to 0')
  await expect(summary).not.toContainText('Wound roll modifier capped')
})

test('critical threshold cue follows wound modifiers and Devastating Wounds', async ({ page }) => {
  await page.goto('/simulator')
  await matchup(page)
  const shooting = page.getByRole('region', { name: 'Modifiers', exact: true })
  const invulnerableFour = shooting.getByRole('button', { name: '4++' })
  await expect(invulnerableFour).toHaveClass(/opacity-45/)
  await invulnerableFour.hover()
  await expect(page.getByRole('tooltip')).toContainText("The defender's 3+ armour save becomes 4+ against AP −1")
  const criticalFour = shooting.getByRole('button', { name: 'Crit wounds 4+' })
  await expect(criticalFour).toHaveClass(/opacity-45/)
  await criticalFour.hover()
  await expect(page.getByRole('tooltip')).toContainText('Those rolls already wound')
  await criticalFour.click()
  await expect(criticalFour).not.toHaveClass(/opacity-45/)
  await criticalFour.hover()
  await expect(page.getByRole('tooltip')).toContainText('Those rolls already wound')
  await expect(shooting.getByRole('region', { name: 'Applied modifiers' })).not.toContainText('Critical wounds on 4+ (Shooting)')
  await shooting.getByRole('button', { name: 'Devastating Wounds' }).click()
  await expect(criticalFour).not.toHaveClass(/opacity-45/)
  await expect(shooting.getByRole('region', { name: 'Applied modifiers' })).toContainText('Critical wounds on 4+ (Shooting)')
  await shooting.getByRole('button', { name: 'Devastating Wounds' }).click()
  await criticalFour.click()
  const criticalThree = shooting.getByRole('button', { name: 'Crit wounds 3+' })
  await criticalThree.click()
  await expect(criticalThree).not.toHaveClass(/opacity-45/)
  await shooting.getByRole('button', { name: '+1 Wound' }).click()
  await expect(criticalThree).not.toHaveClass(/opacity-45/)
  await criticalThree.hover()
  await expect(page.getByRole('tooltip')).toContainText('Those rolls already wound')
})

test('a printed wound re-roll makes a weaker modifier show no effect', async ({ page }) => {
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Necrons', 'Immortals')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  await expect(page.getByRole('region', { name: 'Shooting results' })).toHaveAttribute('aria-busy', 'false')
  const modifiers = page.getByRole('region', { name: 'Modifiers', exact: true })
  await expect(modifiers.getByRole('button', { name: 'Re-roll wound 1s' })).toHaveClass(/opacity-45/)
  await modifiers.getByRole('button', { name: 'Re-roll wound 1s' }).click()
  await expect(modifiers.getByRole('button', { name: 'Re-roll wound 1s' })).not.toHaveClass(/opacity-45/)
  await modifiers.getByRole('button', { name: 'Re-roll wound 1s' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('An active unit rule already grants an equal or better re-roll')
  await expect(modifiers.getByRole('region', { name: 'Applied modifiers' })).toContainText('Re-roll wound 1s from rules')
  await modifiers.getByRole('button', { name: 'Re-roll wounds', exact: true }).click()
  await expect(modifiers.getByRole('button', { name: 'Re-roll wounds', exact: true })).not.toHaveClass(/opacity-45/)
})

test('unsupported rules disappear while calculated rules remain', async ({ page }) => {
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Dark Angels', 'Belial')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const attacker = page.getByRole('region', { name: 'Attacker rules', exact: true })
  await expect(attacker).not.toContainText('Oath of Moment')
  await expect(attacker).not.toContainText('Grand Master of the Deathwing')
  await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
  const defender = page.getByRole('region', { name: 'Defender rules', exact: true })
  await expect(defender).not.toContainText('Strikes of Retribution')
  await expect(page.getByRole('region', { name: 'Buffs', exact: true })).not.toContainText('Not calculated')
  const buffs = page.getByRole('region', { name: 'Buffs', exact: true })
  await buffs.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await buffs.screenshot({ path: 'test-results/simulator-exclusions.png' })
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow(page)
  await buffs.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await buffs.screenshot({ path: 'test-results/simulator-exclusions-390.png' })
})

test('named weapon alternatives and once-per-battle attack buffs calculate from catalogue wording', async ({ page }) => {
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Aeldari', 'Death Jester')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const melee = page.getByRole('region', { name: 'Melee results' })
  const damage = estimate(page, 'Shooting').locator('.readout').first()
  await expect(damage).toHaveText(/^\d+(?:\.\d+)?$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const baseline = Number(await damage.textContent())
  await choose(page, 'Attacker Cruel Amusement', 'SUSTAINED HITS 3')
  await expect(shooting).toContainText('SUSTAINED HITS 3')
  await expect(melee).not.toContainText('SUSTAINED HITS 3')
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(baseline)
  const buffs = page.getByRole('region', { name: 'Buffs', exact: true })
  await noOverflow(page)
  await buffs.screenshot({ path: 'test-results/simulator-ability-alternatives.png' })
  await choose(page, 'Attacker Cruel Amusement', 'Off')
  await expect.poll(async () => Number(await damage.textContent())).toBe(baseline)

  await chooseUnit(page, 'Attacker', 'Orks', 'Boyz')
  const ammo = page.getByRole('switch', { name: 'Attacker Ammo Runts (Once per battle, per unit)', exact: true })
  await expect(ammo).not.toBeChecked()
  await expect(damage).toHaveText(/^\d+(?:\.\d+)?$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const unbuffed = Number(await damage.textContent())
  await ammo.click()
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(unbuffed)
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow(page)
  await buffs.screenshot({ path: 'test-results/simulator-activated-buff-390.png' })
  await ammo.click()
  await expect.poll(async () => Number(await damage.textContent())).toBe(unbuffed)
  await expect(page.getByRole('region', { name: 'Attacker rules', exact: true })).not.toContainText('Waaagh!')
  await chooseUnit(page, 'Attacker', 'Orks', 'Painboy')
  await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
  const waaagh = page.getByRole('switch', { name: 'Defender Waaagh!', exact: true })
  await expect(waaagh).not.toBeChecked()
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await expect(damage).toHaveText(/^\d+(?:\.\d+)?$/)
  const unprotected = Number(await damage.textContent())
  await waaagh.click()
  await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(unprotected)
  await noOverflow(page)
  await buffs.screenshot({ path: 'test-results/simulator-army-state-390.png' })
})

test('shared weapon modes count every carrier and indirect shooting applies its firing conditions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Death Guard', 'Deathshroud Terminators')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const melee = page.getByRole('region', { name: 'Melee results' })
  await expect(estimate(page, 'Melee').locator('.readout').first()).toHaveText(/^\d+(?:\.\d+)?$/)
  await expect(melee).not.toContainText('could not be matched')
  await expect(melee).toContainText('3× ➤ Manreaper - strike')
  await choose(page, 'Deathshroud Terminator Champion · Manreaper', '➤ Manreaper - sweep')
  await expect(melee.getByRole('heading', { name: '➤ Manreaper - sweep', exact: true })).toBeVisible()
  await expect(melee).toContainText('2× ➤ Manreaper - strike')
  await expect(melee.getByRole('switch', { name: /Include .*Manreaper.* in melee calculation/ })).toHaveCount(1)
  await choose(page, 'Deathshroud Terminator · Manreaper', '➤ Manreaper - sweep')
  await expect(melee).toContainText('3× ➤ Manreaper - sweep')
  await page.getByRole('button', { name: 'More attacker models', exact: true }).click()
  await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('4')
  await expect(melee).toContainText('4× ➤ Manreaper - sweep')
  await expect(melee).toHaveAttribute('aria-busy', 'false')
  await expect(melee).not.toContainText('could not be matched')
  await melee.screenshot({ path: 'test-results/simulator-shared-weapon-modes.png' })

  await chooseUnit(page, 'Attacker', 'Death Guard', 'Plagueburst Crawler')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const damage = estimate(page, 'Shooting').locator('.readout').first()
  const unobservedFire = chip(page, 'Indirect, unobserved or moving')
  const spottedFire = chip(page, 'Indirect, stationary and spotted')
  await expect(unobservedFire).toHaveAttribute('aria-pressed', 'false')
  await expect(spottedFire).toHaveAttribute('aria-pressed', 'false')
  await expect(damage).toHaveText(/^\d+(?:\.\d+)?$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await expect(shooting).not.toContainText('Unsupported')
  const direct = Number(await damage.textContent())
  await unobservedFire.click()
  await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(direct)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const unobserved = Number(await damage.textContent())
  await spottedFire.click()
  await expect(unobservedFire).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(unobserved)
  await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(direct)
  await noOverflow(page)
  await shooting.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await shooting.screenshot({ path: 'test-results/simulator-indirect-fire.png' })
  await page.getByRole('region', { name: 'Modifiers', exact: true }).screenshot({ path: 'test-results/simulator-indirect-modifiers.png' })
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow(page)
  await shooting.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await shooting.screenshot({ path: 'test-results/simulator-indirect-fire-390.png' })
  await page
    .getByRole('region', { name: 'Modifiers', exact: true })
    .screenshot({ path: 'test-results/simulator-indirect-modifiers-390.png' })
  await spottedFire.click()
  await expect.poll(async () => Number(await damage.textContent())).toBe(direct)
})

test('current army rules exclude retired vows and apply plague choices to the relevant combatant', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Black Templars', 'Sternguard Veteran Squad')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const attackerRules = page.getByRole('region', { name: 'Attacker rules', exact: true })
  await expect(attackerRules).not.toContainText('Templar Vows')
  await expect(page.getByRole('region', { name: 'Defender rules', exact: true })).not.toContainText('Templar Vows')
  const melee = page.getByRole('region', { name: 'Melee results' })
  const damage = estimate(page, 'Melee').locator('.readout').first()
  await expect(damage).toHaveText(/^\d+(?:\.\d+)?$/)
  await expect(melee).toHaveAttribute('aria-busy', 'false')

  await chooseUnit(page, 'Attacker', 'Death Guard', 'Plague Marines')
  const plague = page.getByRole('combobox', { name: "Attacker Nurgle's Gift (Aura)", exact: true })
  await expect(plague).toContainText('Off')
  const defender = page.getByRole('region', { name: 'Defender', exact: true })
  const stats = defender.locator('[data-characteristic] .readout')
  await expect(stats).toHaveText(['5', '3+', '2', '—', '—'])
  await choose(page, "Attacker Nurgle's Gift (Aura)", 'Opponent afflicted · Rattlejoint Ague')
  await expect(stats).toHaveText(['4', '4+', '2', '—', '—'])
  await choose(page, "Attacker Nurgle's Gift (Aura)", 'Opponent afflicted · Scabrous Soulrot')
  await expect(stats).toHaveText(['4', '3+', '2', '—', '—'])
  await choose(page, "Attacker Nurgle's Gift (Aura)", 'Opponent afflicted · Skullsquirm Blight')
  await expect(stats).toHaveText(['4', '3+', '2', '—', '—'])
  await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
  const defensivePlague = page.getByRole('switch', { name: "Defender Nurgle's Gift (Aura)", exact: true })
  await expect(defensivePlague).toBeChecked()
  const cover = page.getByRole('button', { name: 'Cover (−1 BS)', exact: true })
  await expect(cover).toHaveAttribute('aria-pressed', 'true')
  await expect(cover).toBeDisabled()
  await expect(page.getByRole('tab', { name: /^Melee/ })).toHaveText('Melee')
  await expect(defender.locator('[data-characteristic] .readout').first()).toHaveText('6')
  await defensivePlague.click()
  await expect(cover).toHaveAttribute('aria-pressed', 'false')
  await expect(cover).toBeEnabled()
  await defensivePlague.click()
  await noOverflow(page)
  await page.getByRole('region', { name: 'Buffs', exact: true }).screenshot({ path: 'test-results/simulator-plague.png' })
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow(page)
  await page.getByRole('region', { name: 'Buffs', exact: true }).screenshot({ path: 'test-results/simulator-plague-390.png' })
})

test('variable weapon abilities produce damage probabilities', async ({ page }) => {
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Aeldari', 'Avatar of Khaine')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  await expect(shooting).toContainText('Sustained Hits D3')
  await expect(shooting).not.toContainText('Unsupported')
  await expect(estimate(page, 'Shooting').locator('.readout').first()).toHaveText(/^\d+\.\d+$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await expect.poll(async () => Number(await estimate(page, 'Shooting').locator('.readout').first().textContent())).toBeGreaterThan(0)
  await shooting.screenshot({ path: 'test-results/simulator-variable-hits.png' })
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow(page)
  await shooting.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await shooting.screenshot({ path: 'test-results/simulator-variable-hits-390.png' })
})

for (const width of [1440, 390, 860, 1024]) {
  test(`automatic shooting and melee with stable edits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/more')
    await page.getByRole('link', { name: 'Simulator Damage and kill probabilities' }).click()
    await expect(page.getByRole('heading', { name: 'Combat simulator', exact: true })).toBeVisible()
    const swap = page.getByRole('button', { name: 'Swap attacker and defender' })
    await expect(swap).toBeDisabled()
    await matchup(page)
    if (width === 390) {
      expect(await page.getByLabel('Results summary').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(160)
      const shootingEstimate = estimate(page, 'Shooting')
      await expect(shootingEstimate.locator('h2 svg')).toBeVisible()
      expect(
        await shootingEstimate.evaluate((element) => {
          const heading = element.querySelector('h2')!
          const wounds = element.querySelector('[data-result-numbers] > div')!
          return wounds.getBoundingClientRect().left - heading.getBoundingClientRect().right
        }),
      ).toBeGreaterThanOrEqual(7)
    }
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    const melee = page.getByRole('region', { name: 'Melee results' })
    await expect(estimate(page, 'Shooting')).toContainText('2.22')
    await expect(shooting).toContainText('5× Bolt Rifle – Focused Fire')
    await expect(melee).toContainText('5× Knives and Fists')
    for (const [results, phase] of [
      [shooting, 'Shooting'],
      [melee, 'Melee'],
    ] as const) {
      for (const label of ['Wounds lost', 'Models lost']) {
        const chart = page.getByRole('dialog', { name: `${phase} · ${label} probabilities`, exact: true })
        await expect(chart).toHaveCount(0)
        await estimate(page, phase)
          .getByRole('button', { name: new RegExp(`${label}: .*Show probabilities`) })
          .hover()
        await expect(chart).toBeVisible()
        await expect(chart).toContainText('At least')
        await expect(chart.getByText('0', { exact: true })).toHaveCount(0)
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
    await expect(
      shooting.getByRole('heading', { name: '5× Bolt Rifle – Focused Fire', exact: true }).locator('..').locator('.eyebrow'),
    ).toHaveText(['Range', 'A', 'BS', 'S', 'AP', 'D'])
    await expect(page.getByText('Evaluated profiles and weapon rules included.', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Each phase starts against the full defending unit.', { exact: true })).toHaveCount(0)
    await expect(page.locator('main details')).toHaveCount(0)
    await expect(chip(page, 'FNP 5+')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Attacker rules', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Defender rules', exact: true })).toBeVisible()
    for (const side of ['Attacker', 'Defender']) {
      const panel = page.getByRole('region', { name: side, exact: true })
      await expect(panel.locator('[data-characteristic] .readout')).toHaveText(['5', '3+', '2', '—', '—'])
      await expect(panel.getByRole('button', { name: `Fewer ${side.toLowerCase()} models` })).toBeDisabled()
      const loadoutBounds = await panel.getByRole('button', { name: 'Loadout', exact: true }).boundingBox()
      const modelsBounds = await panel.getByLabel(`${side} models`, { exact: true }).boundingBox()
      expect(loadoutBounds!.x + loadoutBounds!.width).toBeLessThan(modelsBounds!.x)
      expect(Math.abs(loadoutBounds!.y + loadoutBounds!.height / 2 - modelsBounds!.y - modelsBounds!.height / 2)).toBeLessThan(2)
    }
    await expect(
      page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Swap attacker and defender' }),
    ).toBeVisible()
    const swapBounds = await swap.boundingBox()
    await page.mouse.move(swapBounds!.x + swapBounds!.width / 2, swapBounds!.y + swapBounds!.height / 2)
    await page.mouse.down()
    expect(Math.abs((await swap.boundingBox())!.y - swapBounds!.y)).toBeLessThan(2)
    await page.mouse.up()
    await noOverflow(page)
    await page.getByRole('region', { name: 'Attacker', exact: true }).screenshot({ path: `test-results/simulator-controls-${width}.png` })
    await page.screenshot({ path: `test-results/simulator-${width}.png`, fullPage: true })

    await page.getByRole('button', { name: 'Cover (−1 BS)', exact: true }).click()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(estimate(page, 'Shooting')).not.toContainText('2.22')
    const coveredDamage = await estimate(page, 'Shooting').locator('.readout').first().textContent()

    let hold = true
    let intercepted = false
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/*', async (route) => {
      const request = route.request()
      if (hold && request.method() === 'POST' && request.url().includes('/_serverFn/')) {
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
    await expect(estimate(page, 'Shooting').locator('.readout').first()).toHaveText(coveredDamage!)
    await expect(melee).toContainText('5× Knives and Fists')
    await page.screenshot({ path: `test-results/simulator-updating-${width}.png`, fullPage: true })
    hold = false
    release()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await page.unrouteAll({ behavior: 'wait' })

    await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    const loadout = page.getByRole('dialog')
    const mode = loadout.getByRole('button', { name: 'More Bolt Rifle – Saturation', exact: true }).first()
    await expect(mode).toBeVisible()
    const heading = loadout.getByRole('heading', { name: 'Attacker · Intercessor Squad' })
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-loadout-${width}.png`, fullPage: true })

    let releaseLoadout = () => {}
    let loadoutIntercepted = false
    const loadoutGate = new Promise<void>((resolve) => {
      releaseLoadout = resolve
    })
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST' && route.request().url().includes('/_serverFn/')) {
        loadoutIntercepted = true
        await loadoutGate
      }
      await route.continue()
    })
    await mode.click()
    await expect.poll(() => loadoutIntercepted).toBe(true)
    await expect(heading).toBeVisible()
    await expect(mode).toBeVisible()
    await expect(loadout.getByText('Select a unit from the roster to see its loadout.')).toHaveCount(0)
    await page.screenshot({ path: `test-results/simulator-loadout-updating-${width}.png`, fullPage: true })
    releaseLoadout()
    await expect(loadout.getByLabel('Bolt Rifle – Saturation count', { exact: true }).first()).toHaveText('1')
    await expect(mode).toBeDisabled()
    await page.unrouteAll({ behavior: 'wait' })
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(melee).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).toContainText('Bolt Rifle – Saturation')
    await expect(melee).toContainText('5× Knives and Fists')
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-melee-${width}.png`, fullPage: true })

    await swap.click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('10')
    await expect(page.getByLabel('Defender models', { exact: true })).toHaveText('5')
    await expect(melee).toContainText('10× Knives and Fists')
    await expect(melee).not.toContainText('Bolt Rifle – Saturation')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).toContainText('10× Bolt Rifle – Focused Fire')
    await page.getByRole('region', { name: 'Defender', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    await expect(loadout.getByLabel('Bolt Rifle – Saturation count', { exact: true }).first()).toHaveText('1')
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    for (let removed = 0; removed < 5; removed++) await page.getByRole('button', { name: 'Fewer attacker models' }).click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('5')
    await expect(page.getByRole('button', { name: 'Fewer attacker models' })).toBeDisabled()
    await expect(swap).toBeEnabled()
    await swap.click()
    await expect(melee).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).toContainText('Bolt Rifle – Saturation')
    await expect(melee).toContainText('5× Knives and Fists')
    const withMode = Number(await estimate(page, 'Shooting').locator('.readout').first().textContent())
    expect(withMode).toBeGreaterThan(0)
    await expect(page.getByRole('button', { name: 'Cover (−1 BS)', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await chip(page, 'FNP 5+').click()
    await expect(page.getByRole('region', { name: 'Defender', exact: true }).locator('[data-characteristic="FNP"] .readout')).toHaveText(
      '5+',
    )
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect.poll(async () => Number(await estimate(page, 'Shooting').locator('.readout').first().textContent())).toBeLessThan(withMode)
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
    const contentWidth = await page.locator('main > div').evaluate((element) => {
      const padding = getComputedStyle(element)
      return element.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight)
    })
    expect((await page.getByLabel('Combat matchup').boundingBox())?.width).toBe(contentWidth)
    expect((await page.getByLabel('Results summary').boundingBox())?.width).toBe(contentWidth)
    const serverBounds = await page.getByRole('region', { name: 'Attacker', exact: true }).boundingBox()
    await page.screenshot({ path: `test-results/simulator-first-frame-${width}.png`, fullPage: true })
    const interactive = await browser.newPage({ viewport: { width, height: 1000 } })
    await interactive.goto(`${baseURL}/simulator`)
    await retryUntilVisible(interactive.getByPlaceholder('Search units…'), () =>
      interactive.getByRole('combobox', { name: 'Attacker unit', exact: true }).click(),
    )
    await interactive.keyboard.press('Escape')
    expect(await interactive.getByRole('region', { name: 'Attacker', exact: true }).boundingBox()).toEqual(serverBounds)
    await interactive.close()
    await context.close()
  })
}

for (const width of [1440, 390]) {
  test(`printed Feel No Pain applies, an extra one only improves it, and it swaps with the unit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
    await chooseUnit(page, 'Defender', 'Necrons', 'Canoptek Reanimator')
    const defender = page.getByRole('region', { name: 'Defender', exact: true })
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    const printed = defender.locator('[data-characteristic="FNP"] .readout')
    const extra = page.locator('button[aria-pressed="true"]', { hasText: /^FNP/ })
    await expect(defender.locator('[data-characteristic] .readout')).toHaveText(['6', '3+', '6', '—', '4+'])
    await expect(extra).toHaveCount(0)
    await expect(
      page
        .getByRole('region', { name: 'Defender rules', exact: true })
        .getByRole('button', { name: 'Defender Feel No Pain 4+ rules', exact: true }),
    ).toBeVisible()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    const damage = estimate(page, 'Shooting').locator('.readout').first()
    await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(0)
    const baseline = Number(await damage.textContent())
    await chip(page, 'FNP 6+').click()
    await expect(printed).toHaveText('4+')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    expect(Number(await damage.textContent())).toBe(baseline)
    await chip(page, 'FNP 2+').click()
    await expect(printed).toHaveText('2+')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(baseline)
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(extra).toHaveCount(0)
    await expect(printed).toHaveText('4+')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect.poll(async () => Number(await damage.textContent())).toBe(baseline)
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(page.getByRole('region', { name: 'Attacker', exact: true }).locator('[data-characteristic="FNP"] .readout')).toHaveText(
      '4+',
    )
    await expect(printed).toHaveText('—')
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(printed).toHaveText('4+')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await noOverflow(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await defender.screenshot({ path: `test-results/simulator-reanimator-${width}.png` })
    await page.getByRole('region', { name: 'Modifiers', exact: true }).screenshot({ path: `test-results/simulator-modifiers-${width}.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/simulator-fnp-${width}.png`, fullPage: true })
  })
}

for (const width of [1440, 350]) {
  test(`mixed defences allocate attacks in the chosen group order at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
    await chooseUnit(page, 'Defender', 'Orks', 'Boyz')
    const defender = page.getByRole('region', { name: 'Defender', exact: true })
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    const numbers = estimate(page, 'Shooting').locator('[data-result-numbers] .readout')
    await expect(defender.getByRole('row')).toHaveText([/Order/, /^1\. Boy ×9/, /^2\. Nob ×1/])
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(numbers).toHaveText([/^\d+\.\d{2}$/, /^\d+\.\d{2}$/, /^\d+\.\d%$/])
    const [wounds, models] = await numbers.allTextContents()
    expect(Number(models)).toBe(Number(wounds))
    await defender.getByRole('button', { name: 'Allocate to Nob earlier', exact: true }).click()
    await expect(defender.getByRole('row')).toHaveText([/Order/, /^1\. Nob ×1/, /^2\. Boy ×9/])
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect.poll(async () => Number((await numbers.allTextContents())[1])).toBeLessThan(Number(models))
    expect(Number((await numbers.allTextContents())[0])).toBeGreaterThan(Number(wounds))
    await noOverflow(page)
    await defender.screenshot({ path: `test-results/simulator-mixed-defences-${width}.png` })
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
  await expect(estimate(page, 'Shooting')).toContainText('2.22')
  await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('5')
})

for (const width of [1440, 390]) {
  test(`particle casters simulate with the Pistol keyword at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseUnit(page, 'Attacker', 'Necrons', 'Canoptek Wraiths')
    await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    const loadout = page.getByRole('dialog')
    await loadout.getByRole('button', { name: 'More Particle caster', exact: true }).click()
    await expect(loadout.getByLabel('Particle caster count', { exact: true })).toHaveText('1')
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    await expect(shooting).toContainText('Particle caster')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting.getByRole('alert')).toHaveCount(0)
    const damage = estimate(page, 'Shooting').locator('.readout').first()
    await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(0.4)
    expect(Number(await damage.textContent())).toBeLessThan(0.45)
    const baseline = Number(await damage.textContent())
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-particle-caster-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Intercessor Squad')
    await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Canoptek Wraiths')
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
    await expect.poll(async () => Number(await damage.textContent())).toBe(baseline)
  })
}

test('the unit picker opens on every unit, grouped by faction, rendering only the visible rows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/simulator')
  const trigger = page.getByRole('combobox', { name: 'Attacker unit', exact: true })
  const search = page.getByPlaceholder('Search units…')
  await retryUntilVisible(search, () => trigger.click())
  await expect(page.getByRole('option').first()).toBeVisible()
  expect(await page.getByRole('option').count()).toBeLessThan(100)
  await search.fill('Terminator')
  await expect(page.getByRole('option', { name: /^Deathshroud Terminators, Death Guard, \d+ pts$/ })).toBeVisible()
  await search.fill('Canoptek Doomstalker')
  const doomstalker = page.getByRole('option', { name: /^Canoptek Doomstalker, Necrons/ })
  const mark = doomstalker.locator('[data-faction-mark="necrons"]')
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
  await page.screenshot({ path: 'test-results/simulator-unit-options.png', fullPage: true })
  await doomstalker.click()
  await expect(trigger.locator('[data-faction-mark="necrons"]')).toBeVisible()
  await trigger.click()
  await expect(page.locator('[role=option][data-selected]')).toBeInViewport()
})

test('probability charts open on keyboard focus and close with Escape', async ({ page }) => {
  await page.goto('/simulator')
  await matchup(page)
  const trigger = estimate(page, 'Shooting').getByRole('button', { name: /Wounds lost: .*Show probabilities/ })
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
  await chooseUnit(page, 'Attacker', 'Necrons', 'Skorpekh Lord')
  await chooseUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const meleeDamage = estimate(page, 'Melee').locator('.readout').first()
  await expect(meleeDamage).toHaveText(/^\d+\.\d+$/)
  const beforeCharge = Number(await meleeDamage.textContent())
  await page.getByRole('switch', { name: 'Attacker Crimson Harvest', exact: true }).click()
  await expect.poll(async () => Number(await meleeDamage.textContent())).toBeGreaterThan(beforeCharge)
  await chooseUnit(page, 'Attacker', 'Necrons', 'Annihilation Barge')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const damage = estimate(page, 'Shooting').locator('.readout').first()
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const beforeArcing = Number(await damage.textContent())
  await page.getByRole('switch', { name: 'Attacker Malevolent Arcing', exact: true }).click()
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(beforeArcing)
  await chooseUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
  await expect(page.getByRole('switch', { name: 'Attacker Matter Absorption', exact: true })).toHaveCount(0)
  await chooseUnit(page, 'Defender', 'Space Marines', 'Land Raider')
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
      .getByRole('region', { name: 'Shooting estimate' })
      .getByRole('button', { name: /Models lost: .*Show probabilities/ })
    const chart = page.getByRole('dialog', { name: 'Shooting · Models lost probabilities', exact: true })
    await expect(chart).toHaveCount(0)
    await trigger.tap()
    await expect(chart).toBeVisible()
    await noOverflow(page)
    await page.screenshot({ path: 'test-results/simulator-chart-touch.png' })
    await page
      .getByRole('region', { name: 'Shooting results' })
      .getByRole('heading', { name: '5× Bolt Rifle – Focused Fire', exact: true })
      .tap()
    await expect(chart).toBeHidden()
    await trigger.tap()
    await expect(chart).toBeVisible()
    await trigger.tap()
    await expect(chart).toBeHidden()
    await chooseUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
    await chooseUnit(page, 'Defender', 'Space Marines', 'Land Raider')
    const rule = page.getByRole('button', { name: 'Attacker Matter Absorption rules', exact: true })
    const buff = page.getByRole('switch', { name: 'Attacker Matter Absorption', exact: true })
    await rule.tap()
    const tooltip = page.getByRole('tooltip').filter({ hasText: 'Matter Absorption' })
    await expect(tooltip).toContainText('D3 mortal wounds')
    await expect(buff).not.toBeChecked()
    await noOverflow(page)
    await page.screenshot({ path: 'test-results/simulator-rule-touch.png' })
    await page.getByRole('heading', { name: 'Attacker rules & buffs', exact: true }).tap()
    await expect(tooltip).toBeHidden()
  })
})

test('the loadout editor estimates each option and uses the strongest legal loadout in the matchup', async ({ page }) => {
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Orks', 'Boyz')
  await chooseUnit(page, 'Defender', 'Necrons', 'Tomb Blades')
  await expect(estimate(page, 'Shooting')).toHaveAttribute('aria-busy', 'false')
  const destroyed = estimate(page, 'Shooting').locator('.readout').nth(2)
  await expect(destroyed).toHaveText(/%$/)
  const before = Number.parseFloat((await destroyed.textContent()) ?? '')
  const hint = page.getByLabel('Stronger loadout')
  await expect(page.getByLabel('Weapon odds').first()).toContainText('destroyed')
  await hint.getByRole('button', { name: 'Open loadout' }).click()
  const loadout = page.getByRole('dialog', { name: 'Attacker · Boyz' })
  const advice = loadout.getByRole('region', { name: 'Best loadout' })
  await expect(advice).toHaveAttribute('aria-busy', 'false')
  await expect(advice).toContainText('Against Tomb Blades')
  await expect(loadout.getByLabel(/^Shooting, unit with one more: \d+\.\d% destroyed/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/simulator-loadout-estimates.png' })
  await advice.getByRole('button', { name: 'Use best loadout' }).click()
  await expect(advice).toContainText('No loadout is meaningfully stronger.')
  await loadout.getByRole('button', { name: 'Close', exact: true }).click()
  await expect.poll(async () => Number.parseFloat((await destroyed.textContent()) ?? '')).toBeGreaterThan(before)
  await expect(hint).toHaveCount(0)
})

test('a simulator link reopens the same units, swap, and modifiers', async ({ page }) => {
  await page.goto('/simulator')
  await chooseUnit(page, 'Attacker', 'Necrons', 'Tomb Blades')
  await chooseUnit(page, 'Defender', 'Orks', 'Boyz')
  await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await page.getByRole('button', { name: 'Cover (−1 BS)', exact: true }).click()
  await expect(estimate(page, 'Shooting')).toHaveAttribute('aria-busy', 'false')
  const damage = await estimate(page, 'Shooting').locator('.readout').first().textContent()
  await expect(page).toHaveURL(/[?&]s=[\w-]+/)
  await page.goto(page.url())
  await expect(page.getByRole('region', { name: 'Attacker', exact: true })).toContainText('Boyz')
  await expect(page.getByRole('button', { name: 'Cover (−1 BS)', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(estimate(page, 'Shooting').locator('.readout').first()).toHaveText(damage!)
})

test('a link that does not decode opens an empty simulator', async ({ page }) => {
  await page.goto('/simulator?s=broken')
  await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toBeVisible()
  await expect(estimate(page, 'Shooting')).toHaveCount(0)
})
