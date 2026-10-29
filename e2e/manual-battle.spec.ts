import { expect, test, type Page } from './test'
import {
  PRACTICE_OPPONENT,
  advance,
  attachRoster,
  createBattle,
  createRoster,
  recordFirstTurn,
  setupStep,
  signUp,
  uniqueName,
  expectNoPageOverflow,
  desktopContext,
  scoreboard,
} from './account'
import { battleLog } from './storage'

const panel = (page: Page, side: number) => page.locator(`[data-panel="player"][data-side="${side}"]`)
test('a table keeps score by hand in a manually tracked battle', async ({ page }) => {
  test.setTimeout(240_000)
  const phone = { width: 390, height: 900 }
  await page.setViewportSize(desktopContext.viewport)
  const host = uniqueName('Manual host')
  await signUp(page, host)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Manual list' })
  await createBattle(page, {
    practice: true,
    beforeCreate: async (dialog) => {
      await dialog.getByRole('button', { name: /^Manual/ }).click()
      await expect(dialog.getByText(/No mission cards, scoring prompts, caps/)).toBeVisible()
    },
  })

  await expect(page.getByText(/^Manual tracking\. Scores and command points are whatever you enter/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Battlefield', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Secondaries', exact: true })).toHaveCount(0)
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await expect(page.getByText('Not battle ready')).toHaveCount(0)
  await recordFirstTurn(page)
  await expectNoPageOverflow(page)
  await page.setViewportSize(phone)
  await setupStep(page, 'First turn')
  await expect(page.getByRole('group', { name: 'First turn' }).getByRole('button', { pressed: true })).toHaveCount(1)
  await expectNoPageOverflow(page)
  await page.setViewportSize(desktopContext.viewport)
  await page.getByRole('button', { name: 'Start battle' }).click()

  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('0')

  await panel(page, 0)
    .getByRole('button', { name: `Add 5 primary VP for ${host}` })
    .click()
  await expect(panel(page, 0).locator('[data-stat="vp"]')).toHaveText('5')
  await panel(page, 0)
    .getByRole('button', { name: `Add 1 CP for ${host}` })
    .click()
  await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('1')
  await panel(page, 0)
    .getByRole('button', { name: `Add 1 CP for ${host}` })
    .click()
  await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('2')
  await panel(page, 0)
    .getByRole('button', { name: `Remove 1 CP for ${host}` })
    .click()
  await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('1')
  await panel(page, 1)
    .getByRole('button', { name: `Add 1 secondary VP for ${PRACTICE_OPPONENT}` })
    .click()
  await expect(panel(page, 1).locator('[data-stat="vp"]')).toHaveText('1')

  const note = 'Objective three contested by both sides'
  await page.getByLabel('Battle note').fill(note)
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.locator('[data-battle-report-scroll]')).toContainText(`notes: ${note}`)
  await expect(page.locator('[data-battle-report-scroll]')).not.toContainText('gain 1 CP')
  await expectNoPageOverflow(page)

  await page.setViewportSize(phone)
  await page.getByRole('tab', { name: 'Your side' }).click()
  await expect(panel(page, 0).locator('[data-stat="vp"]')).toHaveText('5')
  await panel(page, 0)
    .getByRole('button', { name: `Add 1 CP for ${host}` })
    .click()
  await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('2')
  await panel(page, 0)
    .getByRole('button', { name: `Remove 1 CP for ${host}` })
    .click()
  await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('1')
  await page.getByRole('tab', { name: 'Opponent' }).click()
  await expect(panel(page, 1).locator('[data-stat="vp"]')).toHaveText('1')
  await page.getByRole('tab', { name: 'Battle' }).click()
  await expect(page.locator('[data-battle-report-scroll]')).toContainText(`notes: ${note}`)
  await expect(page.locator('[data-battle-report-scroll]')).not.toContainText('gain 1 CP')
  await expectNoPageOverflow(page)
  await page.setViewportSize(desktopContext.viewport)

  for (let step = 0; step < 12; step += 1) await advance(page)
  await expect(scoreboard(page).locator('[data-stat="round"]')).toHaveText('2')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await panel(page, 1)
    .getByRole('button', { name: `Add 5 primary VP for ${PRACTICE_OPPONENT}` })
    .click()
  await expect(panel(page, 1).locator('[data-stat="vp"]')).toHaveText('6')

  await page.reload()
  await expect(scoreboard(page).locator('[data-stat="round"]')).toHaveText('2')
  await expect(panel(page, 0).locator('[data-stat="vp"]')).toHaveText('5')
  await expect(panel(page, 1).locator('[data-stat="vp"]')).toHaveText('6')
  await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('1')

  // Manual turns are bare phase advances, which battle.manual.test.ts already plays to the end, so seed them.
  const log = await battleLog(page)
  for (let step = 0; step < 47; step += 1) await log.append(Math.floor(step / 6) % 2 ? log.second : log.first, { kind: 'advance' })
  await page.reload()
  await expect(scoreboard(page).locator('[data-stat="round"]')).toHaveText('5')
  await page.getByRole('button', { name: 'Pass the turn' }).click()

  await expect(scoreboard(page)).toContainText(`${PRACTICE_OPPONENT} wins`)
  await expect(page.getByText('Battle replay')).toBeVisible()
  const facts = page.locator('dl').filter({ hasText: 'Tracking' }).first()
  await expect(facts).toContainText('Manual')
  const teams = page.locator('[data-teams-battle-points]')
  await teams.getByRole('switch', { name: 'Teams event scoring' }).click()
  await expect(teams.locator('dl')).toHaveText(`${host}5 VP10 BP${PRACTICE_OPPONENT}6 VP10 BP`)
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await page.reload()
    await expect(teams.locator('dl')).toHaveText(`${host}5 VP10 BP${PRACTICE_OPPONENT}6 VP10 BP`)
    await expect(scoreboard(page)).toContainText(`${PRACTICE_OPPONENT} wins`)
    await expectNoPageOverflow(page)
  }

  await page.goto('/battles')
  const card = page.locator('[data-battle-shelf="Finished"] article').first()
  for (const viewport of [phone, desktopContext.viewport]) {
    await page.setViewportSize(viewport)
    await expect(card).toContainText('Manual tracking')
    await expect(card).toContainText(host)
  }
})
