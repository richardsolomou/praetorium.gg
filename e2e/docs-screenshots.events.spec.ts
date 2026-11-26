import { test } from './test'
import { retryUntilVisible, signInAsPreview, signUp } from './account'
import { capture, docsScreenshots } from './docsScreenshots'

docsScreenshots()

test('group screenshots', async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/groups/preview-group', { waitUntil: 'networkidle' })
  const header = page
    .locator('header')
    .filter({ has: page.getByRole('heading', { level: 1 }) })
    .first()
  await capture('groups-page', header, header.getByRole('button', { name: 'Copy invite link' }))

  const newGame = page.getByRole('dialog', { name: 'New game', exact: true })
  await retryUntilVisible(newGame, () => page.getByRole('button', { name: 'New game', exact: true }).click({ timeout: 1_000 }))
  await capture('groups-new-game', newGame, newGame.getByRole('switch', { name: 'Hide lists until everyone has sealed' }))
  await page.keyboard.press('Escape')

  await page.goto('/groups/preview-group?tab=league', { waitUntil: 'networkidle' })
  // The nearest box around the round's name that holds a fixture to start is that round's card.
  const round = page
    .locator('[data-group-league]')
    .getByText('Round 2', { exact: true })
    .locator(`xpath=ancestor::*[.//button[normalize-space()='Start battle']][1]`)
  // A round with nothing of the reader's to play folds, so the screenshot opens it.
  await round.evaluate((element) => ((element as HTMLDetailsElement).open = true))
  await capture('groups-league', round, round.getByRole('button', { name: 'Start battle', exact: true }).first(), { padded: true })
})

test('tournament screenshots', async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/tournaments', { waitUntil: 'networkidle' })
  const create = page.getByRole('dialog', { name: 'New tournament' })
  await retryUntilVisible(create, () => page.getByRole('button', { name: 'New tournament', exact: true }).click({ timeout: 1_000 }))
  await capture('tournament-new', create, create.getByRole('group', { name: 'Battle format' }))
  await page.keyboard.press('Escape')

  await page.goto('/tournaments/preview-tournament-swiss', { waitUntil: 'networkidle' })
  const armies = page.locator('[data-sealed-event-armies]')
  await capture('tournament-rosters', armies, armies.getByLabel(/Simulate/).first(), { padded: true })
  const enterScore = page.getByRole('button', { name: /^Enter score for table/ }).first()
  const round = page.locator('main *').filter({ hasText: 'Round 2' }).filter({ has: enterScore }).last()
  await capture('tournament-round', round, enterScore, { padded: true })
  const clock = page.getByRole('button', { name: 'Start the clock' })
  await capture('tournament-round-tools', clock.locator('xpath=..'), clock, { padded: true })
})

test('battle screenshots', async ({ browser }) => {
  let page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await signUp(page, 'Docs player')
  await page.goto('/battles', { waitUntil: 'networkidle' })
  const importer = page.getByRole('dialog', { name: 'Import battles' })
  await retryUntilVisible(importer, () => page.getByRole('button', { name: 'Import battles', exact: true }).click({ timeout: 1_000 }))
  await capture('import-battles-dialog', importer, importer.getByLabel('BattleBase username'))
  await page.keyboard.press('Escape')

  page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await signInAsPreview(page)
  await page.goto('/battles/preview-tournament-swiss-battle-1-1', { waitUntil: 'networkidle' })
  const events = page.getByText('Battle events', { exact: true }).locator('..')
  // The timeline is pinned to the window's foot and would cover the events.
  const pinned = await page.addStyleTag({ content: '[data-replay-timeline] { display: none !important; }' })
  await capture('after-the-game-events', events, events.getByText('CP only', { exact: true }), { padded: true })
  await pinned.evaluate((element) => element.remove())
  const timeline = page.locator('[data-replay-timeline]')
  await capture('after-the-game-timeline', timeline, timeline.getByRole('slider'))
})
