import { chooseCombatUnit, closeCombatBreakdown, openCombatBreakdown, openCombatControls } from './combat'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { chooseUnit as chooseCatalogueUnit, retryUntilVisible } from './account'

async function choose(page: Page, control: string, name: string) {
  const option = page.getByRole('option', { name, exact: true })
  await retryUntilVisible(option, () => page.getByRole('combobox', { name: control, exact: true }).click())
  await option.click()
}

function chip(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name, exact: true })
}

async function estimate(page: Page, phase: 'Shooting' | 'Melee') {
  await openCombatControls(page)
  await openCombatBreakdown(page)
  return page.getByRole('region', { name: `${phase} estimate`, includeHidden: true })
}

for (const width of [1440, 390]) {
  test(`Terminator hammer and shield loadouts survive reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Space Marines', 'Terminator Assault Squad')
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
    const melee = page.getByRole('region', { name: 'Melee results' })
    const loadout = page.getByRole('dialog')
    await attacker.getByRole('button', { name: 'Loadout', exact: true }).click()
    for (const [name, count] of [
      ['Terminator Sergeant with Storm Shield and Thunder Hammer', 1],
      ['Terminator with Storm Shield and Thunder Hammer', 2],
    ] as const) {
      for (let selected = 1; selected <= count; selected++) {
        await loadout.getByRole('button', { name: `More ${name}`, exact: true }).click()
        await expect(loadout.getByLabel(`${name} count`, { exact: true })).toHaveText(String(selected))
      }
    }
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-thunder-hammers-${width}.png` })
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(melee.getByRole('heading', { name: '3× Thunder Hammer', exact: true })).toBeVisible()
    await expect(melee.getByRole('heading', { name: '2× Twin Lightning Claws', exact: true })).toBeVisible()
    await expect(melee.getByRole('alert')).toHaveCount(0)
    await page.reload()
    await expect(melee.getByRole('heading', { name: '3× Thunder Hammer', exact: true })).toBeVisible()
    await attacker.getByRole('button', { name: 'Loadout', exact: true }).click()
    await expect(loadout.getByLabel('Terminator Sergeant with Storm Shield and Thunder Hammer count', { exact: true })).toHaveText('1')
    await expect(loadout.getByLabel('Terminator with Storm Shield and Thunder Hammer count', { exact: true })).toHaveText('2')
    await noOverflow(page)
  })
}

test('the Death Guard Defiler calculates either Shearing claws mode', async ({ page }) => {
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Death Guard', 'Defiler')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const melee = page.getByRole('region', { name: 'Melee results' })
  const damage = (await estimate(page, 'Melee')).locator('.readout').first()
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
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    for (const [faction, unit, phase] of [
      ['Blood Angels', 'Lemartes', 'Shooting'],
      ['Chaos Daemons', 'Pink Horrors', 'Shooting'],
      ['Astra Militarum', 'Cadian Heavy Weapons Squad', 'Melee'],
      ['Aeldari', 'Jain Zar', 'Melee'],
      ['Drukhari', 'Lady Malys', 'Melee'],
      ['Orks', 'Deffkoptas', 'Shooting'],
    ] as const) {
      await chooseCombatUnit(page, 'Attacker', faction, unit)
      const results = page.getByRole('region', { name: `${phase} results` })
      await expect(results).toHaveAttribute('aria-busy', 'false')
      await expect(results.getByRole('alert')).toHaveCount(0)
      await expect((await estimate(page, phase)).locator('.readout').first()).toHaveText(/^\d+\.\d{2}$/)
      await expect(results).not.toContainText('ref. only')
      await noOverflow(page)
      await page.screenshot({ path: `test-results/simulator-ownership-${unit.replaceAll(' ', '-')}-${width}.png` })
    }
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Triarch Praetorians')
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
      await expect((await estimate(page, phase)).locator('.readout').first()).toHaveText(/^\d+\.\d{2}$/)
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
    await chooseCombatUnit(page, side, 'Space Marines', 'Intercessor Squad')
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
  const shootingDamage = (await estimate(page, 'Shooting')).locator('.readout').first()
  const meleeDamage = (await estimate(page, 'Melee')).locator('.readout').first()
  const resultsSummary = page.getByLabel('Results summary')
  await expect(resultsSummary).toBeVisible()
  await expect(page.locator('[data-result-numbers]')).toHaveCount(4)
  expect(await resultsSummary.evaluate((element) => getComputedStyle(element).position)).toBe('fixed')
  await expect(shootingDamage).toHaveText(/^\d+\.\d{2}$/)
  await expect(meleeDamage).toHaveText(/^\d+\.\d{2}$/)
  await expect(page.getByRole('region', { name: 'Combined estimate' }).locator('[data-combat-wipe]')).toHaveText(/^\d+\.\d%$/)
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
  await expect(shootingDamage).toHaveText('0.00')
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
  await modifierTab(page, 'Shooting')
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
  await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
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
  await chooseCombatUnit(page, 'Attacker', 'Dark Angels', 'Belial')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const attacker = page.getByRole('region', { name: 'Attacker rules', exact: true })
  await expect(attacker).not.toContainText('Oath of Moment')
  await expect(attacker).not.toContainText('Grand Master of the Deathwing')
  await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(page)
  const defender = page.getByRole('region', { name: 'Defender rules', exact: true })
  await expect(defender).not.toContainText('Strikes of Retribution')
  for (const panel of await page.locator('[aria-label="Attacker buffs"], [aria-label="Defender buffs"]').all())
    await expect(panel).not.toContainText('Not calculated')
  const buffs = page.getByLabel('Combat matchup', { exact: true }).locator(':scope > div').first()
  await buffs.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await buffs.screenshot({ path: 'test-results/simulator-exclusions.png' })
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow(page)
  await buffs.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await buffs.screenshot({ path: 'test-results/simulator-exclusions-390.png' })
})

test('named weapon alternatives and once-per-battle attack buffs calculate from catalogue wording', async ({ page }) => {
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Aeldari', 'Death Jester')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const melee = page.getByRole('region', { name: 'Melee results' })
  const damage = (await estimate(page, 'Shooting')).locator('.readout').first()
  await expect(damage).toHaveText(/^\d+(?:\.\d+)?$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const baseline = Number(await damage.textContent())
  await choose(page, 'Attacker Cruel Amusement', 'SUSTAINED HITS 3')
  await expect(shooting).toContainText('SUSTAINED HITS 3')
  await expect(melee).not.toContainText('SUSTAINED HITS 3')
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(baseline)
  const buffs = page.getByLabel('Combat matchup', { exact: true }).locator(':scope > div').first()
  await noOverflow(page)
  await buffs.screenshot({ path: 'test-results/simulator-ability-alternatives.png' })
  await choose(page, 'Attacker Cruel Amusement', 'Off')
  await expect.poll(async () => Number(await damage.textContent())).toBe(baseline)

  await chooseCombatUnit(page, 'Attacker', 'Orks', 'Boyz')
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
  await chooseCombatUnit(page, 'Attacker', 'Orks', 'Painboy')
  await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(page)
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
  await chooseCombatUnit(page, 'Attacker', 'Death Guard', 'Deathshroud Terminators')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const melee = page.getByRole('region', { name: 'Melee results' })
  await expect((await estimate(page, 'Melee')).locator('.readout').first()).toHaveText(/^\d+(?:\.\d+)?$/)
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

  await chooseCombatUnit(page, 'Attacker', 'Death Guard', 'Plagueburst Crawler')
  await modifierTab(page, 'Shooting')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const damage = (await estimate(page, 'Shooting')).locator('.readout').first()
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
  await chooseCombatUnit(page, 'Attacker', 'Black Templars', 'Sternguard Veteran Squad')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const attackerRules = page.getByRole('region', { name: 'Attacker rules', exact: true })
  await expect(attackerRules).not.toContainText('Templar Vows')
  await expect(page.getByRole('region', { name: 'Defender rules', exact: true })).not.toContainText('Templar Vows')
  const melee = page.getByRole('region', { name: 'Melee results' })
  const damage = (await estimate(page, 'Melee')).locator('.readout').first()
  await expect(damage).toHaveText(/^\d+(?:\.\d+)?$/)
  await expect(melee).toHaveAttribute('aria-busy', 'false')

  await chooseCombatUnit(page, 'Attacker', 'Death Guard', 'Plague Marines')
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
  await openCombatControls(page)
  const defensivePlague = page.getByRole('switch', { name: "Defender Nurgle's Gift (Aura)", exact: true })
  await expect(defensivePlague).toBeChecked()
  await page.getByRole('tab', { name: /^Shooting/ }).click()
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
  await page
    .getByLabel('Combat matchup', { exact: true })
    .locator(':scope > div')
    .first()
    .screenshot({ path: 'test-results/simulator-plague.png' })
  await page.setViewportSize({ width: 390, height: 1000 })
  await noOverflow(page)
  await page
    .getByLabel('Combat matchup', { exact: true })
    .locator(':scope > div')
    .first()
    .screenshot({ path: 'test-results/simulator-plague-390.png' })
})

test('variable weapon abilities produce damage probabilities', async ({ page }) => {
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Aeldari', 'Avatar of Khaine')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  await expect(shooting).toContainText('Sustained Hits D3')
  await expect(shooting).not.toContainText('Unsupported')
  await expect((await estimate(page, 'Shooting')).locator('.readout').first()).toHaveText(/^\d+\.\d+$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await expect
    .poll(async () => Number(await (await estimate(page, 'Shooting')).locator('.readout').first().textContent()))
    .toBeGreaterThan(0)
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
    await closeCombatBreakdown(page)
    if (width === 390) {
      expect(await page.getByLabel('Results summary').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(160)
      const shootingEstimate = await estimate(page, 'Shooting')
      await expect(shootingEstimate.locator('h3 svg')).toBeVisible()
      expect(
        await shootingEstimate.evaluate((element) => {
          const heading = element.querySelector('h3')!
          const wounds = element.querySelector('[data-result-numbers] > div')!
          return wounds.getBoundingClientRect().left - heading.getBoundingClientRect().right
        }),
      ).toBeGreaterThanOrEqual(7)
    }
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    const melee = page.getByRole('region', { name: 'Melee results' })
    await expect(await estimate(page, 'Shooting')).toContainText('2.22')
    await expect(shooting).toContainText('5× Bolt Rifle – Focused Fire')
    await expect(melee).toContainText('5× Knives and Fists')
    for (const [results, phase] of [
      [shooting, 'Shooting'],
      [melee, 'Melee'],
    ] as const) {
      for (const label of ['Wounds lost', 'Models lost']) {
        const chart = page.getByRole('dialog', { name: `${phase} · ${label} probabilities`, exact: true })
        await expect(chart).toHaveCount(0)
        await (await estimate(page, phase)).getByRole('button', { name: new RegExp(`${label}: .*Show probabilities`) }).hover()
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
    await expect(page.locator('[data-manual-modifiers]')).toHaveCount(1)
    await expect(chip(page, 'FNP 5+')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Attacker rules', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Defender rules', exact: true })).toBeVisible()
    for (const side of ['Attacker', 'Defender']) {
      const panel = page.getByRole('region', { name: side, exact: true })
      await expect(panel.locator('[data-characteristic] .readout')).toHaveText(['5', '3+', '2', '—', '—'])
      await expect(panel.getByRole('button', { name: `Fewer ${side.toLowerCase()} models` })).toBeDisabled()
      const controls = await panel.getByRole('button', { name: 'Loadout', exact: true }).evaluate((element) => {
        const row = element.parentElement!
        const models = row.firstElementChild!
        return {
          actions: element.getBoundingClientRect().toJSON(),
          models: models.getBoundingClientRect().toJSON(),
          row: row.getBoundingClientRect().toJSON(),
        }
      })
      expect(Math.abs(controls.actions.y + controls.actions.height / 2 - controls.models.y - controls.models.height / 2)).toBeLessThan(2)
      expect(Math.abs(controls.models.left - controls.row.left)).toBeLessThan(2)
      expect(controls.models.right).toBeLessThan(controls.actions.left)
    }
    await expect(swap).toBeVisible()
    await swap.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    const swapBounds = await swap.boundingBox()
    await page.mouse.move(swapBounds!.x + swapBounds!.width / 2, swapBounds!.y + swapBounds!.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(250)
    expect(await swap.boundingBox()).toEqual(swapBounds)
    await page.mouse.up()
    await openCombatControls(page)
    await noOverflow(page)
    await page.getByRole('region', { name: 'Attacker', exact: true }).screenshot({ path: `test-results/simulator-controls-${width}.png` })
    await page.screenshot({ path: `test-results/simulator-${width}.png`, fullPage: true })

    await page.getByRole('tab', { name: /^Shooting/ }).click()
    await page.getByRole('button', { name: 'Cover (−1 BS)', exact: true }).click()
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(await estimate(page, 'Shooting')).not.toContainText('2.22')
    const coveredDamage = await (await estimate(page, 'Shooting')).locator('.readout').first().textContent()

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
    await expect((await estimate(page, 'Shooting')).locator('.readout').first()).toHaveText(coveredDamage!)
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
    await openCombatControls(page)
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
    await openCombatControls(page)
    await expect(melee).toHaveAttribute('aria-busy', 'false')
    await expect(shooting).toContainText('Bolt Rifle – Saturation')
    await expect(melee).toContainText('5× Knives and Fists')
    const withMode = Number(await (await estimate(page, 'Shooting')).locator('.readout').first().textContent())
    expect(withMode).toBeGreaterThan(0)
    await page.getByRole('tab', { name: /^Shooting/ }).click()
    await expect(page.getByRole('button', { name: 'Cover (−1 BS)', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await chip(page, 'FNP 5+').click()
    await expect(page.getByRole('region', { name: 'Defender', exact: true }).locator('[data-characteristic="FNP"] .readout')).toHaveText(
      '5+',
    )
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect
      .poll(async () => Number(await (await estimate(page, 'Shooting')).locator('.readout').first().textContent()))
      .toBeLessThan(withMode)
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
    const initialAttacker = page.getByRole('region', { name: 'Attacker', exact: true })
    for (const name of ['Fewer attacker models', 'More attacker models', 'Loadout', 'Optimize']) {
      await expect(initialAttacker.getByRole('button', { name, exact: true })).toBeDisabled()
    }
    for (const side of ['Attacker', 'Defender']) {
      const card = page.getByRole('region', { name: side, exact: true })
      await expect(card.getByLabel(`${side} models`, { exact: true })).toHaveAttribute('aria-busy', 'false')
      await expect(card.getByLabel(`${side} models`, { exact: true })).toHaveText('—')
      await expect(card.getByRole('combobox', { name: `${side} unit`, exact: true })).toContainText('Choose a unit')
      await expect(card.locator('.animate-pulse, .animate-spin')).toHaveCount(0)
    }
    await expect(initialAttacker.getByRole('combobox', { name: 'Attacker add attached unit', exact: true })).toBeDisabled()
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
    await chooseCombatUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
    await chooseCombatUnit(page, 'Defender', 'Necrons', 'Canoptek Reanimator')
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
    const damage = (await estimate(page, 'Shooting')).locator('.readout').first()
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
    await openCombatControls(page)
    await expect(page.getByRole('region', { name: 'Attacker', exact: true }).locator('[data-characteristic="FNP"] .readout')).toHaveText(
      '4+',
    )
    await expect(printed).toHaveText('—')
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await openCombatControls(page)
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
    await chooseCombatUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
    await chooseCombatUnit(page, 'Defender', 'Orks', 'Boyz')
    const defender = page.getByRole('region', { name: 'Defender', exact: true })
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    const numbers = (await estimate(page, 'Shooting')).locator('[data-result-numbers] .readout')
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
  await expect(await estimate(page, 'Shooting')).toContainText('2.22')
  await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('5')
})

for (const width of [1440, 390]) {
  test(`particle casters simulate with the Pistol keyword at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Canoptek Wraiths')
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
    const loadout = page.getByRole('dialog')
    await loadout.getByRole('button', { name: 'More Particle caster', exact: true }).click()
    await expect(loadout.getByLabel('Particle caster count', { exact: true })).toHaveText('1')
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    const shooting = page.getByRole('region', { name: 'Shooting results' })
    await expect(shooting).toContainText('Particle caster')
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    await expect(shooting.getByRole('alert')).toHaveCount(0)
    const damage = (await estimate(page, 'Shooting')).locator('.readout').first()
    await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(0.4)
    expect(Number(await damage.textContent())).toBeLessThan(0.45)
    const baseline = Number(await damage.textContent())
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-particle-caster-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await openCombatControls(page)
    await expect(page.getByRole('region', { name: 'Attacker', exact: true }).locator('[data-combat-member]').first()).toContainText(
      'Intercessor Squad',
    )
    await expect(page.getByRole('region', { name: 'Defender', exact: true }).locator('[data-combat-member]').first()).toContainText(
      'Canoptek Wraiths',
    )
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
    await openCombatControls(page)
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
  const trigger = (await estimate(page, 'Shooting')).getByRole('button', { name: /Wounds lost: .*Show probabilities/ })
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
  await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Skorpekh Lord')
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const meleeDamage = (await estimate(page, 'Melee')).locator('.readout').first()
  await expect(meleeDamage).toHaveText(/^\d+\.\d+$/)
  const beforeCharge = Number(await meleeDamage.textContent())
  await page.getByRole('switch', { name: 'Attacker Crimson Harvest', exact: true }).click()
  await expect.poll(async () => Number(await meleeDamage.textContent())).toBeGreaterThan(beforeCharge)
  await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Annihilation Barge')
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  const damage = (await estimate(page, 'Shooting')).locator('.readout').first()
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  const beforeArcing = Number(await damage.textContent())
  await page.getByRole('switch', { name: 'Attacker Malevolent Arcing', exact: true }).click()
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(beforeArcing)
  await chooseCombatUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
  await expect(page.getByRole('switch', { name: 'Attacker Matter Absorption', exact: true })).toHaveCount(0)
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Land Raider')
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
    await openCombatBreakdown(page)
    const trigger = page
      .getByRole('region', { name: 'Shooting estimate' })
      .getByRole('button', { name: /Models lost: .*Show probabilities/ })
    const chart = page.getByRole('dialog', { name: 'Shooting · Models lost probabilities', exact: true })
    await expect(chart).toHaveCount(0)
    await trigger.tap()
    await expect(chart).toBeVisible()
    await noOverflow(page)
    await page.screenshot({ path: 'test-results/simulator-chart-touch.png' })
    await page.getByRole('heading', { name: 'Combat simulator', exact: true }).tap()
    await expect(chart).toBeHidden()
    await trigger.tap()
    await expect(chart).toBeVisible()
    await trigger.tap()
    await expect(chart).toBeHidden()
    await chooseCombatUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Land Raider')
    const rule = page.getByRole('button', { name: 'Attacker Matter Absorption rules', exact: true })
    const buff = page.getByRole('switch', { name: 'Attacker Matter Absorption', exact: true })
    await rule.tap()
    const tooltip = page.getByRole('tooltip').filter({ hasText: 'Matter Absorption' })
    await expect(tooltip).toContainText('D3 mortal wounds')
    await expect(buff).not.toBeChecked()
    await noOverflow(page)
    await page.screenshot({ path: 'test-results/simulator-rule-touch.png' })
    await page.locator('[data-combat-buffs] > summary').tap()
    await expect(tooltip).toBeHidden()
  })
})

test("the loadout editor shows each option's odds against the defender", async ({ page }) => {
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Orks', 'Boyz')
  await chooseCombatUnit(page, 'Defender', 'Necrons', 'Tomb Blades')
  await expect(await estimate(page, 'Shooting')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
  const loadout = page.getByRole('dialog', { name: 'Attacker · Boyz' })
  await expect(loadout.getByLabel(/^Shooting, unit with one more: <?\d+\.\d+% destroyed/).first()).toBeVisible()
  await expect(loadout.getByLabel(/^Shooting, unit with one more: .*, best$/)).toHaveCount(1)
  await expect(loadout.getByLabel(/^Shooting, \d+ models? with this weapon: <?\d+\.\d+% destroyed/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/simulator-loadout-estimates.png' })
})

test('a simulator link reopens the same units, swap, and modifiers', async ({ page }) => {
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Tomb Blades')
  await chooseCombatUnit(page, 'Defender', 'Orks', 'Boyz')
  await page.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(page)
  await page.getByRole('tab', { name: /^Shooting/ }).click()
  await page.getByRole('button', { name: 'Cover (−1 BS)', exact: true }).click()
  await expect(await estimate(page, 'Shooting')).toHaveAttribute('aria-busy', 'false')
  const damage = await (await estimate(page, 'Shooting')).locator('.readout').first().textContent()
  await expect(page).toHaveURL(/[?&]s=[\w-]+/)
  await page.goto(page.url())
  await expect(page.getByRole('region', { name: 'Attacker', exact: true })).toContainText('Boyz')
  await page.getByRole('tab', { name: /^Shooting/ }).click()
  await expect(page.getByRole('button', { name: 'Cover (−1 BS)', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect((await estimate(page, 'Shooting')).locator('.readout').first()).toHaveText(damage!)
})

test('a link that does not decode opens an empty simulator', async ({ page }) => {
  await page.goto('/simulator?s=broken')
  await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toBeVisible()
  await expect(page.getByText('Choose a unit to see its buffs.')).toHaveCount(2)
})

for (const width of [1440, 390]) {
  test(`combined shooting and melee against Lion El'Jonson at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
    await chooseCombatUnit(page, 'Defender', 'Dark Angels', "Lion El'Jonson")
    const combined = page.getByRole('region', { name: 'Combined estimate' })
    await expect(combined).toHaveAttribute('aria-busy', 'false')
    await expect(combined.locator('[data-combat-wipe]')).toHaveText(/^\d+\.\d%$/)
    const percentage = async (region: Locator) => Number((await region.locator('[data-combat-wipe]').textContent())!.replace('%', ''))
    expect(await percentage(combined)).toBeGreaterThan(
      (await percentage(await estimate(page, 'Shooting'))) + (await percentage(await estimate(page, 'Melee'))),
    )
    await noOverflow(page)
    await closeCombatBreakdown(page)
    if (width === 390) {
      expect(await page.getByLabel('Results summary').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(160)
    }
    await closeCombatBreakdown(page)
    await page.getByRole('region', { name: 'Defender buffs' }).evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await page.screenshot({ path: `test-results/simulator-combined-lion-${width}.png` })
    await openCombatBreakdown(page)
    await page
      .getByRole('region', { name: 'Combined distributions' })
      .getByRole('button', { name: /Wounds lost: .*Show probabilities/ })
      .click()
    await expect(page.getByRole('dialog', { name: 'Combined · Wounds lost probabilities', exact: true })).toBeVisible()
  })
}

for (const width of [1440, 390]) {
  test(`the simulator leads with one outcome and reveals its controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCatalogueUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
    await chooseCatalogueUnit(page, 'Defender', 'Dark Angels', "Lion El'Jonson")
    const summary = page.getByLabel('Results summary')
    const combined = page.getByRole('region', { name: 'Combined estimate' })
    await expect(combined).toContainText('8.1%')
    await expect(combined).toContainText('6.83')
    await expect(page.getByRole('region', { name: 'Shooting estimate' })).toBeHidden()
    await expect(page.locator('[data-manual-modifiers]')).toHaveAttribute('open')
    await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('region', { name: 'Applied modifiers' })).toBeVisible()
    expect(await summary.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(160)
    await expect(page.locator('[data-results-space]')).toHaveCSS('height', '0px')
    const defender = page.getByRole('region', { name: 'Defender buffs', exact: true })
    await expect(page.locator('[data-combat-buffs]')).toHaveCount(1)
    await expect(page.locator('[data-combat-buffs]')).toHaveAttribute('open')
    for (const selector of ['[data-combat-buffs]', '[data-manual-modifiers]']) {
      const section = page.locator(selector)
      const heading = section.locator(':scope > summary')
      await heading.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      const box = await section.boundingBox()
      const headingBox = await heading.boundingBox()
      await section.click({ position: { x: box!.width - 8, y: headingBox!.height / 2 } })
      await expect(section).toHaveAttribute('open')
      await heading.click()
      await expect(section).not.toHaveAttribute('open')
      await heading.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await section.click({ position: { x: box!.width - 8, y: headingBox!.height / 2 } })
      await expect(section).not.toHaveAttribute('open')
      await heading.click()
      await expect(section).toHaveAttribute('open')
    }
    await expect(defender.getByRole('switch', { name: "Defender The Emperor's Shield", exact: true })).toBeVisible()
    const watchers = defender.getByRole('switch', { name: 'Defender The Watchers', exact: true })
    await expect(watchers).toBeChecked()
    await watchers.click()
    await expect(watchers).toBeVisible()
    await watchers.click()
    await expect(watchers).toBeChecked()
    await expect(defender.getByRole('switch', { name: 'Defender The Watchers', exact: true })).toHaveCount(1)
    await watchers.click()
    await openCombatBreakdown(page)
    await expect(page.getByRole('region', { name: 'Shooting estimate' })).toContainText('alone')
    await expect(summary).toContainText('what survives shooting')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(
      await page.getByRole('region', { name: 'Applied modifiers' }).evaluate((element) => element.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(await summary.evaluate((element) => element.getBoundingClientRect().top))
    await page
      .getByRole('region', { name: 'Shooting estimate' })
      .getByRole('button', { name: /Wounds lost: .*Show probabilities/ })
      .click()
    await expect(page.getByRole('dialog', { name: 'Shooting · Wounds lost probabilities', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await summary.locator('details > summary').click()
    await expect(combined).toContainText('8.1%')
    await noOverflow(page)
    await page.locator('[data-combat-buffs] > summary').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/simulator-hierarchy-${width}.png` })
    await chip(await modifierTab(page, 'All'), '+1 Hit').click()
    await page.locator('[data-manual-modifiers] > summary').click()
    await expect(page.getByRole('region', { name: 'Applied modifiers' })).toContainText('+1 to hit (All)')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(
      await page.getByRole('region', { name: 'Applied modifiers' }).evaluate((element) => element.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(await summary.evaluate((element) => element.getBoundingClientRect().top))
    await page.screenshot({ path: `test-results/simulator-bottom-${width}.png` })
  })
}

test('folded rules keep saved selections through reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/simulator')
  await chooseCatalogueUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
  await chooseCatalogueUnit(page, 'Defender', 'Dark Angels', "Lion El'Jonson")
  const defender = page.getByRole('region', { name: 'Defender buffs', exact: true })
  const rules = page.locator('[data-combat-buffs]')
  const shield = defender.getByRole('switch', { name: "Defender The Emperor's Shield", exact: true })
  const watchers = defender.getByRole('switch', { name: 'Defender The Watchers', exact: true })
  await expect(rules).toHaveAttribute('open')
  await expect(watchers).toBeChecked()
  await watchers.click()
  await shield.click()
  await expect
    .poll(() => {
      const shared = new URL(page.url()).searchParams.get('s')
      return shared ? Object.values(JSON.parse(Buffer.from(shared, 'base64url').toString()).sides[1].rules) : []
    })
    .toEqual([0, 0])
  await rules.locator('summary').click()
  await expect(watchers).toBeHidden()
  await page.reload()
  await expect(rules).toHaveAttribute('open')
  await expect(watchers).not.toBeChecked()
  await expect(shield).not.toBeChecked()
  await shield.click()
  await watchers.click()
  await rules.locator('summary').click()
  await expect(page.getByRole('region', { name: 'Combined estimate' })).toContainText('8.1%')
})

for (const width of [1440, 390]) {
  test(`Deathwing Knights optimize against Mortarion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Dark Angels', 'Deathwing Knights')
    await chooseCombatUnit(page, 'Defender', 'Death Guard', 'Mortarion')
    const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
    const headline = page.getByRole('region', { name: 'Combined estimate' })
    await expect(headline.locator('.readout').nth(1)).toHaveText('5.55')
    const response = page.waitForResponse((answer) => answer.url().endsWith('/api/simulator/optimize'))
    await attacker.getByRole('button', { name: 'Optimize', exact: true }).click()
    expect((await response).ok()).toBe(true)
    await expect(attacker.getByRole('button', { name: 'Optimize', exact: true })).toBeVisible()
    await expect(attacker.getByRole('alert')).toHaveCount(0)
    await expect(headline.locator('.readout').nth(1)).toHaveText('6.00')
    await expect(page.getByRole('region', { name: 'Melee results' })).toContainText('Relic Weapon')
    await expect(attacker.getByRole('button', { name: 'Optimize', exact: true })).toBeEnabled()
    await page.screenshot({ path: `test-results/simulator-deathwing-optimized-${width}.png` })
  })

  test(`the headline retains results when weapon phases are empty at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCatalogueUnit(page, 'Attacker', 'Necrons', "C'tan Shard of the Void Dragon")
    await chooseCatalogueUnit(page, 'Defender', 'Dark Angels', "Lion El'Jonson")
    const headline = page.getByRole('region', { name: 'Combined estimate' })
    await expect(headline).toContainText('8.1%')
    const togglePhase = async (phase: 'Shooting' | 'Melee') => {
      for (const toggle of await page
        .getByRole('region', { name: `${phase} results` })
        .getByRole('switch')
        .all())
        await toggle.click()
    }
    const matchesPhase = async (phase: 'Shooting' | 'Melee') => {
      await openCombatBreakdown(page)
      const result = page.getByRole('region', { name: `${phase} estimate` })
      await expect(headline.locator('[data-combat-wipe]')).toHaveText(await result.locator('[data-combat-wipe]').innerText())
      await expect(headline.locator('.readout').nth(1)).toHaveText(await result.locator('.readout').first().innerText())
      await expect(headline.locator('.readout').nth(2)).toHaveText(await result.locator('.readout').nth(1).innerText())
      await closeCombatBreakdown(page)
    }
    await togglePhase('Shooting')
    await expect(headline).toContainText('2.3%')
    await matchesPhase('Melee')
    await page.getByRole('region', { name: 'Shooting results' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/simulator-melee-only-${width}.png` })
    await togglePhase('Melee')
    await expect(headline.locator('[data-combat-wipe]')).toHaveText('0.0%')
    await expect(headline.locator('.readout').nth(1)).toHaveText('0.00')
    await expect(headline.locator('.readout').nth(2)).toHaveText('0.00')
    await togglePhase('Shooting')
    await expect(headline).toContainText('0.3%')
    await matchesPhase('Shooting')
    await chooseCatalogueUnit(page, 'Attacker', 'Tyranids', 'Hormagaunts')
    await expect(page.getByRole('region', { name: 'Shooting results' })).toContainText('No shooting weapons equipped')
    await expect(headline.locator('[data-combat-wipe]')).toHaveText(/^\d+\.\d%$/)
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    await matchesPhase('Melee')
    await noOverflow(page)
  })
}

for (const width of [1440, 390]) {
  test(`attached leaders and support contribute weapons and survive sharing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
    const headline = page.getByRole('region', { name: 'Combined estimate' })
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    const initial = Number(await headline.locator('.readout').nth(1).textContent())
    await expect(attacker.getByLabel('Attacker Overlord loadout', { exact: true })).toHaveCount(0)
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(1)
    await expect(attacker.getByRole('button', { name: 'Remove attacker Immortals', exact: true })).toBeDisabled()
    await expect(attacker).not.toContainText('Attached units')
    await expect(attacker.getByText('Replace unit', { exact: true })).toHaveCount(0)
    await expect(attacker.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Immortals')
    await expect(attacker.getByRole('combobox', { name: 'Attacker add attached unit', exact: true })).toBeEnabled()
    const countPosition = await attacker.getByLabel('Attacker models', { exact: true }).boundingBox()
    const loadoutPosition = await attacker.getByRole('button', { name: 'Loadout', exact: true }).boundingBox()
    expect(countPosition!.x).toBeLessThan(loadoutPosition!.x)
    const oldWeapon = await page
      .getByRole('region', { name: 'Shooting results' })
      .getByRole('heading', { name: '5× Gauss blaster', exact: true })
      .elementHandle()
    const oldLoadout = await attacker.getByRole('button', { name: 'Loadout', exact: true }).elementHandle()
    const beforeAttach = await headline.locator('.readout').nth(1).textContent()
    const buffs = page.locator('[data-combat-buffs]')
    await buffs.locator('summary').click()
    let intercepted = false
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST' && route.request().url().includes('/_serverFn/')) {
        intercepted = true
        await gate
      }
      await route.continue()
    })
    try {
      await choose(page, 'Attacker add attached unit', 'Overlord')
      await expect.poll(() => intercepted).toBe(true)
      await expect(headline).toHaveAttribute('aria-busy', 'true')
      await expect(headline.locator('.readout').nth(1)).toHaveText(beforeAttach!)
      await expect(attacker.getByRole('button', { name: 'Loadout', exact: true })).toBeVisible()
      await expect(attacker).not.toContainText('Loading loadout…')
      expect(await oldWeapon.evaluate((element) => element.isConnected)).toBe(true)
      expect(await oldLoadout.evaluate((element) => element.isConnected)).toBe(true)
      await page.screenshot({ path: `test-results/simulator-member-pending-${width}.png`, fullPage: true })
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
    }
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    expect(await oldWeapon.evaluate((element) => element.isConnected)).toBe(true)
    expect(await oldLoadout.evaluate((element) => element.isConnected)).toBe(true)
    expect(await buffs.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(false)
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(2)
    await expect(attacker).toContainText('6 models')
    expect((await attacker.getByLabel('Attacker models', { exact: true }).boundingBox())!.x).toBe(countPosition!.x)
    await expect(attacker.getByLabel('Attacker Overlord loadout', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Melee results' })).toContainText("Overlord's blade")
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    await expect.poll(async () => Number(await headline.locator('.readout').nth(1).textContent())).toBeGreaterThan(initial)
    await choose(page, 'Attacker add attached unit', 'Plasmancer')
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toBeVisible()
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(3)
    await expect(attacker).toContainText('7 models')
    await expect(page.getByRole('region', { name: 'Shooting results' })).toContainText('Plasmic lance')
    await expect(attacker.getByRole('combobox', { name: 'Attacker add attached unit', exact: true })).toBeDisabled()
    await choose(page, 'Defender add attached unit', 'Captain')
    const defender = page.getByRole('region', { name: 'Defender', exact: true })
    await expect(defender.getByLabel('Defender Captain loadout', { exact: true })).toBeVisible()
    await expect(defender).toContainText('Captain ×1')
    await expect(defender.getByRole('button', { name: /Allocate to .*Captain.* earlier/ })).toHaveCount(0)
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    const beforeReload = await headline.locator('.readout').nth(1).textContent()
    await page.reload()
    await expect(attacker.getByLabel('Attacker Overlord loadout', { exact: true })).toBeVisible()
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toBeVisible()
    await expect(defender.getByLabel('Defender Captain loadout', { exact: true })).toBeVisible()
    await expect(headline.locator('.readout').nth(1)).toHaveText(beforeReload!)
    await attacker.getByLabel('Attacker Overlord loadout', { exact: true }).click()
    const leaderLoadout = page.getByRole('dialog', { name: 'Attacker · Overlord', exact: true })
    await expect(leaderLoadout).toBeVisible()
    await expect(leaderLoadout.getByLabel(/^Melee, unit: .*, best$/).first()).toBeVisible()
    await expect(leaderLoadout.getByLabel(/^Melee, 1 model with this weapon: /).first()).toBeVisible()
    const choiceOdds = await leaderLoadout
      .locator('article')
      .filter({ has: page.getByRole('button', { name: 'Select Voidscythe', exact: true }) })
      .getByLabel(/^Melee, unit: /)
      .getAttribute('aria-label')
    const predicted = choiceOdds!.match(/([\d.]+) wounds lost on average/)![1]
    await leaderLoadout.getByRole('button', { name: 'Select Voidscythe', exact: true }).click()
    await expect(leaderLoadout.getByRole('button', { name: 'Select Voidscythe', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await noOverflow(page)
    await leaderLoadout.screenshot({ path: `test-results/simulator-attached-loadout-${width}.png` })
    await leaderLoadout.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Melee results' })).toContainText('Voidscythe')
    await expect((await estimate(page, 'Melee')).locator('.readout').first()).toHaveText(predicted)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Melee results' })).toContainText('Voidscythe')
    await expect(attacker).toContainText('7 models')
    await page.getByRole('button', { name: 'Swap attacker and defender', exact: true }).click()
    await expect(attacker.getByLabel('Attacker Captain loadout', { exact: true })).toBeVisible()
    await expect(defender.getByLabel('Defender Overlord loadout', { exact: true })).toBeVisible()
    await expect(defender.getByLabel('Defender Plasmancer loadout', { exact: true })).toBeVisible()
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-attached-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Swap attacker and defender', exact: true }).click()
    await attacker.getByRole('button', { name: 'Remove attacker Overlord', exact: true }).click()
    await expect(attacker.getByLabel('Attacker Overlord loadout', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Melee results' })).not.toContainText('Voidscythe')
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toBeVisible()
    await attacker.getByRole('button', { name: 'Remove attacker Plasmancer', exact: true }).click()
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toHaveCount(0)
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(1)
    await expect(attacker).toContainText('5 models')
    await page.reload()
    await expect(attacker.getByLabel('Attacker Overlord loadout', { exact: true })).toHaveCount(0)
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toHaveCount(0)
    await choose(page, 'Attacker add attached unit', 'Overlord')
    await choose(page, 'Attacker add attached unit', 'Plasmancer')
    await attacker.getByRole('combobox', { name: 'Attacker Overlord unit', exact: true }).click()
    const replacement = page.getByRole('option').filter({ hasNotText: 'Overlord' }).first()
    await expect(replacement).toBeVisible()
    await replacement.click()
    await expect(attacker.getByLabel('Attacker Overlord loadout', { exact: true })).toHaveCount(0)
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toBeVisible()
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(3)
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    const replacementName = await attacker.locator('[data-combat-member]').nth(1).getAttribute('data-combat-member')
    await page.reload()
    await expect(attacker.locator('[data-combat-member]').nth(1)).toHaveAttribute('data-combat-member', replacementName!)
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    const beforeReplacement = await headline.locator('.readout').nth(1).textContent()
    const rootPicker = await attacker.getByRole('combobox', { name: 'Attacker unit', exact: true }).elementHandle()
    const rootLoadout = await attacker.getByRole('button', { name: 'Loadout', exact: true }).elementHandle()
    let finishReplacement = () => {}
    const replacementGate = new Promise<void>((resolve) => {
      finishReplacement = resolve
    })
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST' && route.request().url().includes('/_serverFn/')) await replacementGate
      await route.continue()
    })
    try {
      await chooseCatalogueUnit(page, 'Attacker', 'Necrons', 'Necron Warriors')
      await expect(headline).toHaveAttribute('aria-busy', 'true')
      await expect(headline.locator('.readout').nth(1)).toHaveText(beforeReplacement!)
      await expect(attacker.getByRole('combobox', { name: 'Attacker unit', exact: true })).toHaveAttribute('aria-busy', 'true')
      await expect(attacker.getByRole('button', { name: 'Loadout', exact: true })).toBeDisabled()
      expect(await rootPicker.evaluate((element) => element.isConnected)).toBe(true)
      expect(await rootLoadout.evaluate((element) => element.isConnected)).toBe(true)
      await expect(attacker.locator('[data-combat-member]')).toHaveCount(3)
      await page.screenshot({ path: `test-results/simulator-member-replacing-${width}.png`, fullPage: true })
    } finally {
      finishReplacement()
      await page.unrouteAll({ behavior: 'wait' })
    }
    await expect(attacker.locator('[data-combat-member]').first()).toHaveAttribute('data-combat-member', 'Necron Warriors')
    await expect(attacker.locator('[data-combat-member]').nth(1)).toHaveAttribute('data-combat-member', replacementName!)
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toBeVisible()
    await expect(attacker.getByRole('alert')).toHaveCount(0)
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-member-pickers-${width}.png`, fullPage: true })
    await attacker.getByRole('button', { name: 'Remove attacker Necron Warriors', exact: true }).click()
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(2)
    await expect(attacker.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText(replacementName!)
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toBeEnabled()
    await page.reload()
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(2)
    await attacker.getByRole('button', { name: 'Remove attacker Plasmancer', exact: true }).click()
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(1)
    await expect(attacker.getByRole('button', { name: `Remove attacker ${replacementName}`, exact: true })).toBeDisabled()
    await page.reload()
    await expect(attacker.locator('[data-combat-member]')).toHaveCount(1)
    await expect(attacker.getByRole('button', { name: `Remove attacker ${replacementName}`, exact: true })).toBeDisabled()
    await noOverflow(page)
  })
}

test('shared defences retain phase estimates when their source can die before another character', async ({ page }) => {
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
  await chooseCombatUnit(page, 'Defender', 'Necrons', 'Immortals')
  await choose(page, 'Defender add attached unit', 'Technomancer')
  await choose(page, 'Defender add attached unit', 'Overlord')
  const headline = page.getByRole('region', { name: 'Combined estimate' })
  await expect(headline).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('alert')).toContainText('shared defensive ability')
  await expect(headline.locator('[data-combat-wipe]')).toHaveText('—')
  for (const phase of ['Shooting', 'Melee'] as const) {
    await expect((await estimate(page, phase)).locator('.readout').first()).toHaveText(/^\d+\.\d{2}$/)
  }
})

for (const width of [1440, 390]) {
  test(`Immortals and Overlord calculate combined attacks against Deathshroud and Typhus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    await choose(page, 'Attacker add attached unit', 'Overlord')
    await chooseCombatUnit(page, 'Defender', 'Death Guard', 'Deathshroud Terminators')
    await choose(page, 'Defender add attached unit', 'Typhus')
    await expect(
      page.getByRole('region', { name: 'Defender', exact: true }).getByRole('row').filter({ hasText: 'Typhus' }).getByRole('cell').last(),
    ).toHaveText('4+')
    const headline = page.getByRole('region', { name: 'Combined estimate' })
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    await expect(headline.locator('[data-combat-wipe]')).toHaveText(/^\d+(?:\.\d+)?%$/)
    await expect(page.getByRole('alert')).toHaveCount(0)
    const optimize = page.getByRole('button', { name: 'Optimize', exact: true })
    await expect(optimize).toBeEnabled()
    await optimize.click()
    await expect(optimize).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.reload()
    await expect(headline.locator('[data-combat-wipe]')).toHaveText(/^\d+(?:\.\d+)?%$/)
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-deathshroud-typhus-${width}.png`, fullPage: true })
  })
}

for (const width of [1440, 390]) {
  test(`Optimize changes attached character equipment and preserves the whole unit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    await chooseCombatUnit(page, 'Defender', 'Death Guard', 'Mortarion')
    await choose(page, 'Attacker add attached unit', 'Overlord')
    await choose(page, 'Attacker add attached unit', 'Plasmancer')
    await expect(page.getByRole('region', { name: 'Shooting results' })).toContainText('Plasmic lance')
    const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
    const headline = page.getByRole('region', { name: 'Combined estimate' })
    await attacker.getByLabel('Attacker Overlord loadout', { exact: true }).click()
    const loadout = page.getByRole('dialog', { name: 'Attacker · Overlord', exact: true })
    await loadout.getByRole('button', { name: 'Select Staff of light', exact: true }).click()
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    const melee = page.getByRole('region', { name: 'Melee results' })
    await expect(melee).toContainText('Staff of light')
    await expect(headline).toHaveAttribute('aria-busy', 'false')
    const original = Number(await headline.locator('.readout').nth(1).textContent())
    const optimize = attacker.getByRole('button', { name: 'Optimize', exact: true })
    await expect(optimize).toHaveText('')
    await optimize.hover()
    await expect(page.getByRole('tooltip')).toContainText('Optimize the whole unit’s loadout')
    const idleBounds = await optimize.boundingBox()
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/simulator/optimize', async (route) => {
      await gate
      await route.continue()
    })
    try {
      await optimize.click()
      const progress = attacker.getByRole('button', { name: /^Cancel optimization/ })
      await expect(progress).toHaveText('0%')
      expect(await progress.boundingBox()).toEqual(idleBounds)
      await attacker.screenshot({ path: `test-results/simulator-optimize-progress-${width}.png` })
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
    }
    await expect(optimize).toBeVisible({ timeout: 120_000 })
    expect(await optimize.boundingBox()).toEqual(idleBounds)
    await expect(attacker.getByRole('alert')).toHaveCount(0)
    await expect(melee).not.toContainText('Staff of light')
    await expect.poll(async () => Number(await headline.locator('.readout').nth(1).textContent())).toBeGreaterThan(original)
    await expect(attacker).toContainText('7 models')
    await expect(attacker.getByLabel('Attacker Plasmancer loadout', { exact: true })).toBeVisible()
    const optimized = await headline.locator('.readout').nth(1).textContent()
    await page.reload()
    await expect(melee).not.toContainText('Staff of light')
    await expect(headline.locator('.readout').nth(1)).toHaveText(optimized!)
    await expect(attacker).toContainText('7 models')
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-attached-optimized-${width}.png`, fullPage: true })
  })
}

for (const width of [1440, 390]) {
  test(`initial unit loading reserves every member control at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
    for (const side of ['Attacker', 'Defender']) {
      const card = page.getByRole('region', { name: side, exact: true })
      await expect(card.getByLabel(`${side} models`, { exact: true })).toHaveText('—')
      await expect(card.getByLabel(`${side} models`, { exact: true })).toHaveAttribute('aria-busy', 'false')
      await expect(card.locator('.animate-pulse, .animate-spin')).toHaveCount(0)
    }
    const controls = [
      attacker.getByRole('combobox', { name: 'Attacker unit', exact: true }),
      attacker.getByLabel('Attacker models', { exact: true }),
      attacker.getByRole('button', { name: 'Fewer attacker models', exact: true }),
      attacker.getByRole('button', { name: 'More attacker models', exact: true }),
      attacker.getByRole('button', { name: 'Loadout', exact: true }),
      attacker.getByRole('button', { name: /^Remove attacker / }),
      attacker.getByRole('combobox', { name: 'Attacker add attached unit', exact: true }),
      attacker.getByRole('button', { name: 'Optimize', exact: true }),
    ]
    const before = await Promise.all(controls.map((control) => control.boundingBox()))
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST' && route.request().url().includes('/_serverFn/')) await gate
      await route.continue()
    })
    try {
      await chooseCatalogueUnit(page, 'Attacker', 'Necrons', 'Immortals')
      await expect(attacker.getByLabel('Attacker models', { exact: true })).toHaveAttribute('aria-busy', 'true')
      await expect(attacker.locator('.animate-pulse').first()).toBeVisible()
      await expect(page.getByRole('region', { name: 'Defender', exact: true }).locator('.animate-pulse, .animate-spin')).toHaveCount(0)
      await expect(attacker.getByRole('button', { name: 'Loadout', exact: true })).toBeDisabled()
      await expect(attacker).not.toContainText('Loading loadout…')
      expect(await Promise.all(controls.map((control) => control.boundingBox()))).toEqual(before)
      await noOverflow(page)
      await attacker.screenshot({ path: `test-results/simulator-member-placeholders-${width}.png` })
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
    }
    await expect(attacker.getByRole('button', { name: 'Loadout', exact: true })).toBeEnabled()
    await expect(attacker.getByLabel('Attacker models', { exact: true })).toHaveText('5')
    await expect(attacker.locator('.animate-pulse, .animate-spin')).toHaveCount(0)
    expect(await Promise.all(controls.map((control) => control.boundingBox()))).toEqual(before)
    await noOverflow(page)
  })

  test(`imported leaders retain their faction mark and compact loadout control at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Dark Angels', 'Deathwing Knights')
    const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
    await attacker.getByRole('combobox', { name: 'Attacker add attached unit', exact: true }).click()
    await page
      .getByRole('option', { name: /Captain/ })
      .first()
      .click()
    const captain = attacker.locator('[data-combat-member]').nth(1)
    await expect(captain.locator('[data-faction-mark="space-marines"]')).toBeVisible()
    await expect(
      attacker.getByRole('combobox', { name: 'Attacker unit', exact: true }).locator('[data-faction-mark="dark-angels"]'),
    ).toBeVisible()
    const loadout = captain.getByRole('button', { name: /loadout$/ })
    await expect(loadout).toHaveText('')
    await expect(loadout).toHaveAttribute('title', 'Loadout')
    await noOverflow(page)
    await attacker.screenshot({ path: `test-results/simulator-member-factions-${width}.png` })
    await loadout.click()
    await expect(page.getByRole('dialog').getByText('Invulnerable save', { exact: false }).first()).toBeVisible()
    await noOverflow(page)
  })

  test(`defender can add a squad to a standalone Captain at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Captain')
    const defender = page.getByRole('region', { name: 'Defender', exact: true })
    await defender.getByRole('button', { name: 'Loadout', exact: true }).click()
    const loadout = page.getByRole('dialog')
    await loadout.getByRole('button', { name: 'Select Power Fist', exact: true }).click()
    await loadout.getByRole('button', { name: 'Close', exact: true }).click()
    await choose(page, 'Defender add attached unit', 'Intercessor Squad')
    await expect(defender.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Intercessor Squad')
    await expect(defender.getByLabel('Defender Captain loadout', { exact: true })).toBeEnabled()
    await expect(defender).toContainText('6 models')
    await defender.getByLabel('Defender Captain loadout', { exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Select Power Fist', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await page.reload()
    await expect(defender.getByLabel('Defender Captain loadout', { exact: true })).toBeEnabled()
    await expect(defender).toContainText('6 models')
    await expect(defender.getByRole('alert')).toHaveCount(0)
    await noOverflow(page)
    await defender.screenshot({ path: `test-results/simulator-captain-squad-${width}.png` })
    await defender.getByRole('button', { name: 'Remove defender Intercessor Squad', exact: true }).click()
    await expect(defender.locator('[data-combat-member]')).toHaveCount(1)
    await expect(defender.getByRole('button', { name: 'Remove defender Captain', exact: true })).toBeDisabled()
    await expect(defender.getByRole('button', { name: 'Loadout', exact: true })).toBeEnabled()
    await page.reload()
    await defender.getByRole('button', { name: 'Loadout', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Select Power Fist', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await choose(page, 'Defender add attached unit', 'Intercessor Squad')
    await defender.getByRole('button', { name: 'Remove defender Captain', exact: true }).click()
    await expect(defender.locator('[data-combat-member]')).toHaveCount(1)
    await expect(defender.getByRole('button', { name: 'Remove defender Intercessor Squad', exact: true })).toBeDisabled()
    await page.reload()
    await expect(defender.locator('[data-combat-member]')).toHaveCount(1)
    await expect(defender.getByRole('button', { name: 'Remove defender Intercessor Squad', exact: true })).toBeDisabled()
    await noOverflow(page)
  })
}

for (const width of [320, 690, 1024]) {
  test(`unit controls remain beside truncated pickers at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    for (const side of ['Attacker', 'Defender']) {
      const picker = page.getByRole('combobox', { name: `${side} unit`, exact: true })
      const models = page.getByRole('button', { name: `Fewer ${side.toLowerCase()} models`, exact: true })
      const pickerBounds = await picker.boundingBox()
      const modelBounds = await models.boundingBox()
      expect(Math.abs(pickerBounds!.y + pickerBounds!.height / 2 - modelBounds!.y - modelBounds!.height / 2)).toBeLessThan(2)
    }
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    await choose(page, 'Attacker add attached unit', 'Overlord')
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    await choose(page, 'Defender add attached unit', 'Captain')
    for (const side of ['Attacker', 'Defender']) {
      const card = page.getByRole('region', { name: side, exact: true })
      const actions = card.getByLabel(`${side} unit actions`, { exact: true })
      await expect(actions.getByRole('combobox', { name: `${side} add attached unit`, exact: true })).toBeVisible()
      const actionBounds = await actions.boundingBox()
      const pickerBounds = await card.getByRole('combobox', { name: `${side} unit`, exact: true }).boundingBox()
      expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(pickerBounds!.y)
      if (width === 1024) {
        const heading = await actions.getByRole('heading', { name: side, exact: true }).boundingBox()
        const totals = await actions.getByText(/^\d+ models$/).boundingBox()
        expect(Math.abs(heading!.y + heading!.height / 2 - totals!.y - totals!.height / 2)).toBeLessThan(2)
      }
      if (side === 'Attacker') await expect(actions.getByRole('button', { name: 'Optimize', exact: true })).toBeEnabled()
      for (const row of await card.locator('[data-combat-member]').all()) {
        const picker = await row.getByRole('combobox').boundingBox()
        const loadout = row.getByRole('button', { name: /loadout/i })
        await expect(loadout).toBeEnabled()
        const gear = await loadout.boundingBox()
        expect(Math.abs(picker!.y + picker!.height / 2 - gear!.y - gear!.height / 2)).toBeLessThan(2)
      }
    }
    const picker = page.getByRole('combobox', { name: 'Attacker unit', exact: true })
    await retryUntilVisible(page.getByPlaceholder('Search units…'), () => picker.click())
    const dropdown = page.locator('[data-slot="combobox-content"]')
    expect((await dropdown.boundingBox())!.width).toBeGreaterThan((await picker.boundingBox())!.width)
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-member-dropdown-${width}.png` })
    await page.keyboard.press('Escape')
    const member = page.getByRole('combobox', { name: 'Attacker Overlord unit', exact: true })
    await retryUntilVisible(page.getByPlaceholder('Search leaders and support…'), () => member.click())
    expect((await dropdown.boundingBox())!.width).toBeGreaterThan((await member.boundingBox())!.width)
    await noOverflow(page)
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `test-results/simulator-inline-members-${width}.png`, fullPage: true })
  })
}

for (const width of [1440, 390]) {
  test(`optimized weapon profiles follow the unit through swaps and reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/simulator')
    await chooseCombatUnit(page, 'Attacker', 'Chaos Daemons', "Be'lakor")
    await chooseCombatUnit(page, 'Defender', 'Necrons', 'Necron Warriors')
    for (let models = 11; models <= 20; models++) {
      await page.getByRole('button', { name: 'More defender models', exact: true }).click()
      await expect(page.getByLabel('Defender models', { exact: true })).toHaveText(String(models))
    }
    const optimize = page.getByRole('button', { name: 'Optimize', exact: true })
    await optimize.click()
    await expect(optimize).toBeVisible({ timeout: 120_000 })
    const melee = page.getByRole('region', { name: 'Melee results' })
    await expect(melee).toContainText(/The Blade of Shadows.*sweep/i)
    const weapons = page.locator('[data-weapon-card] h3')
    const profiles = await weapons.allTextContents()
    const summary = page.getByRole('region', { name: 'Combined estimate' })
    await expect(summary).toHaveAttribute('aria-busy', 'false')
    const outcome = await summary.locator('.readout').allTextContents()
    const swap = page.getByRole('button', { name: 'Swap attacker and defender', exact: true })
    await swap.click()
    await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText("Be'lakor")
    await swap.click()
    await expect(weapons).toHaveText(profiles)
    await expect(summary.locator('.readout')).toHaveText(outcome)
    await swap.click()
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText("Be'lakor")
    await expect(swap).toBeEnabled()
    await swap.click()
    await expect(melee).toContainText(/The Blade of Shadows.*sweep/i)
    await expect(weapons).toHaveText(profiles)
    await expect(summary.locator('.readout')).toHaveText(outcome)
    await noOverflow(page)
    await page.screenshot({ path: `test-results/simulator-optimized-swap-${width}.png`, fullPage: true })
  })
}
