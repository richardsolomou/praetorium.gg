import { expect, test, type Page } from './test'
import {
  advance,
  createRoster,
  rewind,
  signUp,
  startBattle,
  uniqueName,
  practiceBattle,
  concede,
  desktopContext,
  scoreboard,
} from './account'

/** Narrow screens show one column at a time behind the battle tabs. */
async function show(page: Page, tab: 'Your side' | 'Battle') {
  const tabs = page.locator('.battle-focus-tabs')
  if (await tabs.isVisible()) await tabs.getByRole('tab', { name: tab }).click()
}

async function recordMissed(page: Page, choose: (dialog: ReturnType<Page['getByRole']>) => Promise<void>) {
  await show(page, 'Battle')
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitem', { name: 'Record a missed action' }).click()
  const dialog = page.getByRole('dialog', { name: 'Record a missed action' })
  await expect(dialog).toBeVisible()
  await choose(dialog)
  await dialog.getByRole('button', { name: 'Record missed action' }).click()
  return dialog
}

const phone = { width: 390, height: 900 }

test('missed stratagems and scores are recorded late, refused past their limit, undone and replayed', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize(desktopContext.viewport)
  const name = uniqueName('Missed')
  await signUp(page, name)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Missed action roster' })
  await practiceBattle(page, roster)
  await startBattle(page)

  const side = page.locator('[data-panel="player"][data-side="0"]')
  await show(page, 'Your side')
  await side.getByRole('button', { name: '+1 CP', exact: true }).click()
  await expect(side.locator('[data-stat="cp"]')).toHaveText('2')
  const vp = Number(await side.locator('[data-stat="vp"]').textContent())
  await advance(page)
  await expect(page.locator('[data-scoreboard] h1')).toContainText('movement phase')

  const commandPhase = `Round 1 · ${name}’s turn · Command`
  const stratagem = await recordMissed(page, async (dialog) => {
    await dialog.getByRole('combobox', { name: 'Stratagem' }).click()
    await page.getByRole('option', { name: /^Insane Bravery · 1 CP/ }).click()
    for (const viewport of [desktopContext.viewport, phone]) {
      await page.setViewportSize(viewport)
      await expect(dialog.getByRole('button', { name: commandPhase })).toHaveAttribute('aria-pressed', 'true')
      await expect(dialog.getByRole('button', { name: 'Record missed action' })).toBeEnabled()
      await page.screenshot({ path: test.info().outputPath(`missed-action-dialog-${viewport.width}.png`) })
    }
    await page.setViewportSize(desktopContext.viewport)
  })
  await expect(stratagem).toBeHidden()
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await show(page, 'Your side')
    await expect(side.locator('[data-stat="cp"]')).toHaveText('1')
  }
  await page.setViewportSize(desktopContext.viewport)

  await show(page, 'Your side')
  await side.getByRole('button', { name: /^Show \d+ not playable now$/ }).click()
  await side.getByRole('button', { name: 'Insane Bravery options' }).click()
  await expect(page.getByRole('menuitem', { name: 'Use for 1 CP' })).toBeDisabled()
  await page.getByRole('menuitem', { name: 'Record as missed…' }).click()
  const fromCard = page.getByRole('dialog', { name: 'Record a missed action' })
  await expect(fromCard.getByRole('combobox', { name: 'Stratagem' })).toContainText('Insane Bravery')
  await expect(fromCard.getByRole('button', { name: commandPhase })).toHaveAttribute('aria-pressed', 'true')
  await fromCard.getByRole('button', { name: 'Cancel' }).click()
  await expect(fromCard).toBeHidden()

  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    const refused = await recordMissed(page, async (dialog) => {
      await dialog.getByRole('combobox', { name: 'Stratagem' }).click()
      await page.getByRole('option', { name: /^Insane Bravery · 1 CP/ }).click()
    })
    await expect(page.locator('[data-sonner-toast]', { hasText: 'Insane Bravery has been used this battle.' })).toBeVisible()
    await expect(refused.getByRole('button', { name: 'Record missed action' })).toBeEnabled()
    await page.screenshot({ path: test.info().outputPath(`missed-action-refused-${viewport.width}.png`) })
    await refused.getByRole('button', { name: 'Cancel' }).click()
    await expect(refused).toBeHidden()
  }

  await show(page, 'Battle')
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitem', { name: 'Record a missed action' }).click()
  const draft = page.getByRole('dialog', { name: 'Record a missed action' })
  await draft.getByRole('button', { name: 'Victory points' }).click()
  await draft.getByRole('button', { name: 'More victory points' }).click()
  await draft.getByRole('button', { name: 'More victory points' }).click()
  await expect(draft.getByLabel('3 VP')).toBeVisible()
  await draft.getByRole('button', { name: 'Cancel' }).click()
  await expect(draft).toBeHidden()
  await page.setViewportSize(desktopContext.viewport)

  const score = await recordMissed(page, async (dialog) => {
    await dialog.getByRole('button', { name: 'Victory points' }).click()
    await dialog.getByRole('button', { name: 'More victory points' }).click()
    await dialog.getByRole('button', { name: 'More victory points' }).click()
    await expect(dialog.getByLabel('3 VP')).toBeVisible()
  })
  await expect(score).toBeHidden()
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await show(page, 'Your side')
    await expect(side.locator('[data-stat="vp"]')).toHaveText(String(vp + 3))
  }

  const events = page.locator('[data-battle-report-scroll]')
  const lateStratagem = events.getByText(`${name} uses Insane Bravery for 1 CP, recorded late for round 1, ${name}’s command phase`)
  const lateScore = events.getByText(`${name} settles 3 primary VP, recorded late for round 1, ${name}’s command phase`)
  for (const viewport of [phone, desktopContext.viewport]) {
    await page.setViewportSize(viewport)
    await show(page, 'Battle')
    await expect(lateStratagem).toBeVisible()
    await expect(lateScore).toBeVisible()
    await expect(events.locator('li').filter({ hasText: 'settles 3 primary VP, recorded late' })).toContainText('R1 move')
    await lateScore.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`missed-action-events-${viewport.width}.png`) })
  }

  await page.getByRole('button', { name: 'Undo latest action' }).click()
  await expect(lateScore).toBeHidden()
  await page.reload()
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await show(page, 'Your side')
    await expect(side.locator('[data-stat="vp"]')).toHaveText(String(vp))
    await expect(side.locator('[data-stat="cp"]')).toHaveText('1')
    await show(page, 'Battle')
    await expect(lateStratagem).toBeVisible()
  }
  await page.setViewportSize(desktopContext.viewport)

  await concede(page)
  const slider = page.getByRole('navigation', { name: 'Battle replay timeline' }).getByRole('slider', { name: 'Replay event' })
  await rewind(slider)
  await slider.press('End')
  for (let step = 0; step < 10; step++) {
    if ((await slider.getAttribute('aria-valuetext'))?.includes('uses Insane Bravery')) break
    await slider.press('ArrowLeft')
  }
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(slider).toHaveAttribute(
      'aria-valuetext',
      new RegExp(`^Round 1, event \\d+ of \\d+: ${name} uses Insane Bravery for 1 CP, recorded late for round 1, ${name}’s command phase$`),
    )
    await expect(scoreboard(page)).toContainText('movement phase')
    await page.screenshot({ path: test.info().outputPath(`missed-action-replay-${viewport.width}.png`) })
  }
})
