import { expect, test } from './test'
import {
  befriend,
  seededRoster,
  practiceBattle,
  setupBattle,
  signUp,
  uniqueName,
  expectNoPageOverflow,
  concede,
  scoreboard,
} from './account'

test("a signed-in player's battles page lists their own, their friends' or everyone's games, one list at a time", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  // A battle is listed once every army is in; until then it is its players' draft.
  await signUp(guest, uniqueName('Watched guest'))
  const guestRoster = await seededRoster(guest, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Watched guest list' })
  await signUp(host, uniqueName('Watched host'))
  const hostRoster = await seededRoster(host, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Watched host list' })
  const watchedPath = new URL(await setupBattle(host, guest, { hostRoster, guestRoster })).pathname
  const watched = `[href="${watchedPath}"]`

  await page.setViewportSize({ width: 1440, height: 900 })
  await signUp(page, uniqueName('Battle reader'))
  const roster = await seededRoster(page, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Reader list' })
  const own = `[href="${new URL(await practiceBattle(page, roster)).pathname}"]`
  const sections = () => page.locator('main [data-battle-shelf], main [data-friends-empty]').evaluateAll((nodes) => nodes.length)
  const views = page.getByRole('navigation', { name: 'Battles' })
  await page.goto('/battles')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator(`[data-battle-shelf="In progress"] a${own}`)).toBeVisible()
    await expect.poll(sections).toBe(1)
    await expectNoPageOverflow(page)
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  await views.getByRole('link', { name: 'Public', exact: true }).click()
  await expect(page).toHaveURL(/\/battles\?view=public$/)
  await expect(page.locator(`[data-battle-shelf="Public games"] a${watched}`)).toBeVisible()
  await expect(page.locator(`[data-battle-shelf="Public games"] a${own}`)).toHaveCount(0)

  const visitor = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage()
  await visitor.goto('/battles')
  await expect(visitor.getByRole('heading', { name: 'Public battles', exact: true })).toBeVisible()
  await expect(visitor.getByRole('link', { name: 'Sign in to play' })).toHaveAttribute('href', '/sign-in?next=%2Fbattles')
  await expect(visitor.getByRole('button', { name: 'New battle', exact: true })).toHaveCount(0)
  const watchedByVisitor = visitor.locator(`[data-battle-shelf="Public games"] article > a${watched}`)
  await expect(watchedByVisitor).toBeVisible()
  await expectNoPageOverflow(visitor)
  await watchedByVisitor.click()
  await expect(scoreboard(visitor)).toBeVisible()
  await expect(visitor.locator('[data-replay-timeline]')).toBeVisible()
  await expect(visitor.getByRole('button', { name: 'Battle options' })).toHaveCount(0)

  await views.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect(page.locator('[data-friends-empty]')).toBeVisible()

  await befriend(page, host)
  await page.goto('/battles?view=friends')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator(`[data-battle-shelf="Friends' games"] a${watched}`)).toBeVisible()
    await expectNoPageOverflow(page)
  }
  await host.goto(watchedPath)
  await concede(host)
  await expect(scoreboard(host)).toContainText('wins by concession')
  await visitor.goto('/battles')
  await expect(watchedByVisitor).toBeVisible()
  await hostContext.close()
  await guestContext.close()
})

test('a visitor follows a battle still being set up without its controls', async ({ page }) => {
  await page.goto('/battles/preview-public-setup')
  await expect(page.getByRole('heading', { name: 'Battle setup', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start battle' })).toHaveCount(0)
})
