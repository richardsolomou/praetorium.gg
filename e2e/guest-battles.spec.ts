import { expect, test } from '@playwright/test'
import { befriend, createBattle, createRoster, setupBattle, signUp, uniqueName } from './account'

for (const width of [390, 1440]) {
  test(`a visitor browses public battles and opens a spectator view at ${width}px`, async ({ page, browser }) => {
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
}

test('signing in switches from public battles to the player’s own saved games', async ({ page, browser }) => {
  await page.goto('/battles')
  await expect(page.getByRole('heading', { name: 'Public battles', exact: true })).toBeVisible()
  await signUp(page, uniqueName('Battle visitor'))
  await page.goto('/battles')
  await expect(page.getByRole('heading', { name: 'My battles' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No battles yet.' })).toBeVisible()
  const opponentContext = await browser.newContext()
  const opponent = await opponentContext.newPage()
  const opponentName = uniqueName('Saved opponent')
  await signUp(opponent, opponentName)
  await befriend(page, opponent)
  const battleUrl = await createBattle(page, { opponent: opponentName })
  await page.goto('/battles')
  await expect(page.locator('[data-battle-shelf="Setup"] article > a')).toHaveAttribute('href', new URL(battleUrl).pathname)
  await opponentContext.close()
})
