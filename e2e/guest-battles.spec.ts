import { expect, test } from './test'
import { befriend, createBattle, createRoster, setupBattle, signUp, uniqueName, expectNoPageOverflow, concede, scoreboard } from './account'

test('a visitor browses public battles and opens a spectator view on a phone and a desktop', async ({ page, browser }) => {
  const hostContext = await browser.newContext()
  const opponentContext = await browser.newContext()
  const host = await hostContext.newPage()
  const opponent = await opponentContext.newPage()
  const opponentName = uniqueName('Public opponent')
  await signUp(opponent, opponentName)
  const guestRoster = await createRoster(opponent, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Guest list' })
  await signUp(host, uniqueName('Public host'))
  const hostRoster = await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host list' })
  const battleUrl = await setupBattle(host, opponent, { opponent: opponentName, hostRoster, guestRoster })
  const battlePath = new URL(battleUrl).pathname
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/battles')

    await expect(page.getByRole('heading', { name: 'Public battles', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in to play' })).toHaveAttribute('href', '/sign-in?next=%2Fbattles')
    await expect(page.getByRole('button', { name: 'New battle', exact: true })).toHaveCount(0)
    await expect(page.locator(`[data-battle-shelf="Public games"] article > a[href="${battlePath}"]`)).toBeVisible()
    await expectNoPageOverflow(page)

    await page.locator(`[data-battle-shelf="Public games"] article > a[href="${battlePath}"]`).click()
    await expect(scoreboard(page)).toBeVisible()
    await expect(page.locator('[data-replay-timeline]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Battle options' })).toHaveCount(0)
  }
  await concede(host)
  await expect(scoreboard(host)).toContainText('wins by concession')
  await page.goto('/battles')
  await expect(page.locator(`[data-battle-shelf="Public games"] article > a[href="${battlePath}"]`)).toBeVisible()
  await hostContext.close()
  await opponentContext.close()
})

test("a signed-in player's battles page lists their own, their friends' or everyone's games, one list at a time", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const guestName = uniqueName('Watched guest')
  await signUp(guest, guestName)
  await signUp(host, uniqueName('Watched host'))
  await befriend(host, guest)
  const watched = `[href="${new URL(await createBattle(host, { opponent: guestName })).pathname}"]`

  await page.setViewportSize({ width: 1440, height: 900 })
  await signUp(page, uniqueName('Battle reader'))
  const own = `[href="${
    new URL(
      await createBattle(page, {
        practice: true,
        beforeCreate: async (dialog) => {
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 900 })
            await expect(dialog.getByRole('button', { name: 'Start battle' })).toBeVisible()
            await expect(dialog).not.toContainText('Battles are public by default')
            await expect(dialog).not.toContainText('One device can record the whole game')
          }
          await page.setViewportSize({ width: 1440, height: 900 })
        },
      }),
    ).pathname
  }"]`
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

  await views.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect(page.locator('[data-friends-empty]')).toBeVisible()

  await befriend(page, host)
  await page.goto('/battles?view=friends')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator(`[data-battle-shelf="Friends' games"] a${watched}`)).toBeVisible()
    await expectNoPageOverflow(page)
  }
  await hostContext.close()
  await guestContext.close()
})
