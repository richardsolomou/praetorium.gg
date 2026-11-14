import { capture, docsScreenshots } from './docsScreenshots'
import { expect, test } from './test'
import {
  advance,
  advanceButton,
  attachRoster,
  chooseBattlefield,
  chooseTracking,
  createRoster,
  newBattle,
  playBothSides,
  signUp,
  startBattle,
  playerPanel,
} from './account'

docsScreenshots()

test('track a battle', async ({ page }) => {
  test.setTimeout(300_000)
  await signUp(page, 'Aurelia')
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necron army' })

  await newBattle(page)
  await expect(page.locator('[data-face-off-side="1"]').getByRole('button', { name: 'Share a link' })).toBeVisible()
  // The header and the first step, without the steps below it or the bar pinned over them.
  const later = await page.addStyleTag({ content: 'main ol > li:not(:first-child), [data-setup-bar] { display: none !important; }' })
  await capture('track-a-battle-new-battle', page.locator('main .max-w-5xl').first())
  await later.evaluate((element) => element.remove())
  const tracking = page.getByRole('region', { name: 'Tracking', exact: true })
  await capture('track-a-battle-tracking', tracking, tracking.getByRole('group', { name: 'How you track it' }))
  await chooseTracking(page)
  await playBothSides(page)

  await attachRoster(page, roster)
  await attachRoster(page, roster, { side: 1 })
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
  await capture('track-a-battle-stratagems', side, side.getByRole('button', { name: 'Use Command Re-roll for 1 CP', exact: true }))

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
