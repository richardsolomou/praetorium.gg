import { capture, docsScreenshots } from './docsScreenshots'
import { expect, test } from './test'
import {
  advance,
  advanceButton,
  attachRoster,
  chooseBattlefield,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  signUp,
  startBattle,
  playerPanel,
} from './account'

docsScreenshots()

test('track a battle', async ({ page }) => {
  test.setTimeout(300_000)
  await signUp(page, 'Aurelia')
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necron army' })

  await createBattle(page, {
    practice: true,
    beforeCreate: async (dialog) => {
      await capture('track-a-battle-tracking', dialog, dialog.getByRole('group', { name: 'Tracking' }))
      await page.getByRole('combobox', { name: 'Opponent' }).click()
      const seats = page.locator('[data-slot="combobox-content"]')
      await expect(seats.getByRole('option', { name: PRACTICE_OPPONENT, exact: true })).toBeVisible()
      await capture('track-a-battle-new-battle', dialog, seats)
      await page.keyboard.press('Escape')
      await expect(seats).toBeHidden()
    },
  })

  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await chooseBattlefield(page)
  const bar = page.locator('[data-setup-bar]')
  await expect(bar).toContainText('2 left')
  // A narrower window keeps the bar's count and Start battle close enough to read together.
  await page.setViewportSize({ width: 720, height: 900 })
  await capture('track-a-battle-setup-bar', bar, bar.getByRole('button', { name: 'Start battle' }), { padded: true })
  await page.setViewportSize({ width: 1280, height: 900 })

  await startBattle(page)
  await capture('track-a-battle-phase', page.locator('[data-turn-control]'), advanceButton(page))

  const side = playerPanel(page, 0)
  await capture('track-a-battle-stratagems', side, side.getByRole('button', { name: 'Use Command Re-roll', exact: true }))

  await advance(page)
  await page.getByRole('button', { name: 'Battle options' }).click()
  const options = page.locator('[data-slot="dropdown-menu-content"]')
  await expect(options.getByRole('menuitem', { name: 'Record a missed action' })).toBeVisible()
  await capture('track-a-battle-battle-options', options, options.getByRole('menuitem', { name: 'Record a missed action' }), {
    padded: true,
  })
  await page.keyboard.press('Escape')
  await expect(options).toBeHidden()

  for (let phase = 0; phase < 4; phase += 1) await advance(page)
  await advanceButton(page).click()
  const scoring = page.getByRole('dialog', { name: /^Scoring end of turn/ })
  await expect(scoring).toBeVisible()
  await capture('track-a-battle-scoring', scoring, scoring.getByText('Did not score (or chose not to)').first().locator('..'))
})
