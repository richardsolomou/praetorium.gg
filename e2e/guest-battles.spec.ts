import { expect, test } from './test'
import { befriend, createBattle, createRoster, setupBattle, signUp, uniqueName } from './account'

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
    await expect(page.locator(`[data-battle-shelf="Active"] article > a[href="${battlePath}"]`)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/guest-battles-${width}.png`, fullPage: true })

    await page.locator(`[data-battle-shelf="Active"] article > a[href="${battlePath}"]`).click()
    await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toBeVisible()
    await expect(page.locator('[data-replay-timeline]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Battle options' })).toHaveCount(0)
  }
  await host.getByRole('button', { name: 'Battle options' }).click()
  await host.getByRole('menuitem', { name: 'Concede battle' }).click()
  await host.getByRole('alertdialog').getByRole('button', { name: 'Concede battle' }).click()
  await expect(host.getByRole('region', { name: 'Battle scoreboard' })).toContainText('wins by concession')
  await page.goto('/battles')
  await expect(page.locator(`[data-battle-shelf="Finished"] article > a[href="${battlePath}"]`)).toBeVisible()
  await host.goto('/profile')
  for (const audience of ['Friends', 'Players only']) {
    const choice = host.getByRole('button', { name: new RegExp(`^${audience}`) })
    await choice.click()
    await expect(choice).toHaveAttribute('aria-pressed', 'true')
    await expect(choice).toBeEnabled()
    await page.reload()
    await expect(page.locator(`[data-battle-shelf] article > a[href="${battlePath}"]`)).toHaveCount(0)
  }
  await hostContext.close()
  await opponentContext.close()
})

test("a signed-in player's battles page lists their games, then friends' and public games once each", async ({ page, browser }) => {
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
  await createBattle(page, {
    practice: true,
    beforeCreate: async (dialog) => {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(dialog.getByRole('button', { name: 'Start battle' })).toBeVisible()
        await expect(dialog).not.toContainText('Battles are public by default')
        await expect(dialog).not.toContainText('One device can record the whole game')
        await dialog.screenshot({ path: `test-results/create-battle-${width}.png` })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
    },
  })
  await page.goto('/battles')
  const sections = () =>
    page
      .locator('main [data-battle-shelf], main [data-home-feed], main [data-friends-empty]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-battle-shelf') ?? node.getAttribute('data-home-feed') ?? "Friends' games"),
      )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(sections).toEqual(['Setup', "Friends' games", 'Public games'])
    await expect(page.locator(`[data-home-feed="Public games"] a${watched}`)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/signed-in-battles-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  await befriend(page, host)
  await page.goto('/battles')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator(`[data-home-feed="Friends' games"] a${watched}`)).toBeVisible()
    await expect(page.locator(`[data-home-feed="Public games"] a${watched}`)).toHaveCount(0)
    await page.screenshot({ path: `test-results/signed-in-battles-friends-${width}.png`, fullPage: true })
  }
  await hostContext.close()
  await guestContext.close()
})
