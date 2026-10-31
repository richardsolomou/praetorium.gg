import { expect, test } from './test'
import { addUnit, createRoster, retryUntilVisible, signUp, chooseOption } from './account'
import { closeCombatBreakdown, openCombatBreakdown, openCombatControls, combatSettled } from './combat'
import { capture, docsScreenshots } from './docsScreenshots'

docsScreenshots()

test('compare loadouts in the unit simulator', async ({ page }) => {
  await page.goto('/simulator')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Try an example', exact: true }).click()
  await combatSettled(page)
  const attacker = page.getByRole('region', { name: 'Attacker', exact: true })

  const addMember = page.getByRole('combobox', { name: 'Attacker add attached unit', exact: true })
  const lieutenant = page.getByRole('option', { name: 'Lieutenant', exact: true })
  await retryUntilVisible(lieutenant, () => addMember.click())
  await lieutenant.click()
  await expect(attacker.locator('[data-combat-member="Lieutenant"]')).toBeVisible()
  await combatSettled(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture('compare-loadouts-add-member', attacker, addMember)

  await attacker.getByRole('button', { name: 'Loadout', exact: true }).click()
  const loadout = page.getByRole('dialog')
  const choice = loadout.getByRole('listitem').filter({ hasText: 'Bolt Rifle replaced with' }).last()
  const best = choice.getByRole('button', { name: 'Why this is best for shooting', exact: true }).filter({ hasText: 'Best kill %' })
  await expect(best).toBeVisible()
  await capture('compare-loadouts-best-kill', choice, best)
  await loadout.getByRole('button', { name: 'Close', exact: true }).click()
  await combatSettled(page)

  await page.evaluate(() => window.scrollTo(0, 0))
  await attacker.getByRole('button', { name: 'Optimization options', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Optimize for ranged', exact: true })).toBeVisible()
  await capture('compare-loadouts-optimize', attacker, attacker.getByRole('button', { name: 'Optimize', exact: true }))
  await page.keyboard.press('Escape')

  await openCombatControls(page)

  await page.getByRole('tab', { name: /^Shooting/ }).click()
  const cover = page.getByRole('button', { name: 'Cover (−1 BS)', exact: true })
  await cover.click()
  await expect(cover).toHaveAttribute('aria-pressed', 'true')
  await combatSettled(page)
  await capture(
    'compare-loadouts-modifiers',
    page.locator('[data-manual-modifiers]'),
    page.getByRole('tablist', { name: 'Attack modifiers' }),
    {
      padded: true,
    },
  )
  const applied = page.getByRole('region', { name: 'Applied modifiers', exact: true })
  await applied.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await capture('compare-loadouts-calculation-uses', applied, applied.getByRole('listitem').filter({ hasText: 'Cover' }), { padded: true })

  await openCombatBreakdown(page)
  await combatSettled(page)
  const summary = page.locator('[data-results-summary]')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await capture('compare-loadouts-breakdown', summary, summary.getByRole('region', { name: 'Combined distributions', exact: true }))
  await closeCombatBreakdown(page)
})

test('compare a roster against benchmark targets', async ({ page }) => {
  await signUp(page, 'Docs player')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necron strike force' })
  await addUnit(page, 'Immortals')
  await addUnit(page, 'Skorpekh Destroyers')
  await page.goto('/simulator')
  await page.waitForLoadState('networkidle')
  await chooseOption(page, 'Attacking with', 'Necron strike force')
  await page.getByRole('option', { name: 'The whole roster', exact: true }).click()
  const comparison = page.getByRole('region', { name: 'Roster comparison' })
  await expect(comparison.getByRole('group', { name: 'Defending with', exact: true })).toContainText('Benchmark targets')
  await expect(comparison).toContainText('18 / 18 matchups · Complete')
  await capture('compare-loadouts-rosters', comparison, comparison.getByRole('combobox', { name: 'Comparison metric', exact: true }))
})
