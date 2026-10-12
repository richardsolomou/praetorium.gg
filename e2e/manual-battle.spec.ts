import { expect, test, type Page } from '@playwright/test'
import { PRACTICE_OPPONENT, advance, attachRoster, createBattle, createRoster, setupStep, signUp, uniqueName } from './account'

const scoreboard = (page: Page) => page.getByRole('region', { name: 'Battle scoreboard' })
const panel = (page: Page, side: number) => page.locator(`[data-panel="player"][data-side="${side}"]`)
const noOverflow = async (page: Page, width: number) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)

for (const width of [390, 1440]) {
  test(`a table keeps score by hand in a manually tracked battle at ${width}px`, async ({ page }) => {
    test.setTimeout(240_000)
    const compact = width < 1024
    await page.setViewportSize({ width, height: 900 })
    const host = uniqueName('Manual host')
    await signUp(page, host)
    const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Manual list' })
    await createBattle(page, {
      practice: true,
      beforeCreate: async (dialog) => {
        await dialog.getByRole('button', { name: /^Manual/ }).click()
        await expect(dialog.getByText(/No mission cards, scoring prompts, caps/)).toBeVisible()
        await page.screenshot({ path: `test-results/manual-battle-create-${width}.png` })
      },
    })

    await expect(page.getByText(/^Manual tracking\. Scores and command points are whatever you enter/)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Battlefield', exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Secondaries', exact: true })).toHaveCount(0)
    await attachRoster(page, roster)
    await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
    await expect(page.getByText('Not battle ready')).toHaveCount(0)
    await setupStep(page, 'First turn')
    const first = page.getByRole('group', { name: 'First turn' }).getByRole('button').first()
    await expect(async () => {
      if ((await first.getAttribute('aria-pressed')) !== 'true') await first.click({ timeout: 1_000 })
      await expect(first).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    await noOverflow(page, width)
    await page.screenshot({ path: `test-results/manual-battle-setup-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Start battle' }).click()

    await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('0')

    const showSide = async (side: 'Your side' | 'Opponent' | 'Battle') => {
      if (compact) await page.getByRole('tab', { name: side }).click()
    }
    await showSide('Your side')
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
    await showSide('Opponent')
    await panel(page, 1)
      .getByRole('button', { name: `Add 1 secondary VP for ${PRACTICE_OPPONENT}` })
      .click()
    await expect(panel(page, 1).locator('[data-stat="vp"]')).toHaveText('1')

    await showSide('Battle')
    const note = 'Objective three contested by both sides'
    await page.getByLabel('Battle note').fill(note)
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.locator('[data-battle-report-scroll]')).toContainText(`notes: ${note}`)
    await expect(page.locator('[data-battle-report-scroll]')).not.toContainText('gain 1 CP')
    await noOverflow(page, width)
    await page.screenshot({ path: `test-results/manual-battle-live-${width}.png`, fullPage: true })

    for (let step = 0; step < 12; step += 1) await advance(page)
    await expect(scoreboard(page).locator('[data-stat="round"]')).toHaveText('2')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await showSide('Opponent')
    await panel(page, 1)
      .getByRole('button', { name: `Add 5 primary VP for ${PRACTICE_OPPONENT}` })
      .click()
    await expect(panel(page, 1).locator('[data-stat="vp"]')).toHaveText('6')

    await page.reload()
    await expect(scoreboard(page).locator('[data-stat="round"]')).toHaveText('2')
    await expect(panel(page, 0).locator('[data-stat="vp"]')).toHaveText('5')
    await expect(panel(page, 1).locator('[data-stat="vp"]')).toHaveText('6')
    await expect(panel(page, 0).locator('[data-stat="cp"]')).toHaveText('1')

    for (let step = 0; step < 47; step += 1) await advance(page)
    await expect(scoreboard(page).locator('[data-stat="round"]')).toHaveText('5')
    await page.getByRole('button', { name: 'Pass the turn' }).click()

    await expect(scoreboard(page)).toContainText(`${PRACTICE_OPPONENT} wins`)
    await expect(page.getByText('Battle replay')).toBeVisible()
    const facts = page.locator('dl').filter({ hasText: 'Tracking' }).first()
    await expect(facts).toContainText('Manual')
    await noOverflow(page, width)
    await page.screenshot({ path: `test-results/manual-battle-finished-${width}.png`, fullPage: true })

    await page.goto('/battles')
    const card = page.locator('[data-battle-shelf="Finished"] article').first()
    await expect(card).toContainText('Manual tracking')
    await expect(card).toContainText(host)
  })
}
