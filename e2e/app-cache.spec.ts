import { expect, test, type Page } from '@playwright/test'
import { createBattle, createRoster, PRACTICE_OPPONENT, signUp, uniqueName } from './account'

async function savedState(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('praetorium-app', 1)
        request.onsuccess = () => {
          const db = request.result
          const read = db.transaction('state').objectStore('state').get('snapshot')
          read.onsuccess = () => {
            resolve(JSON.stringify(read.result?.snapshot))
            db.close()
          }
          read.onerror = () => reject(read.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
}

test('Home, rosters and battles launch from saved state and update without replacing the app', async ({ page, context }) => {
  test.setTimeout(240_000)
  const player = uniqueName('Seamless')
  await signUp(page, player)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Saved army' })
  const rosterPath = new URL(page.url()).pathname
  const battlePath = new URL(await createBattle(page, { practice: true })).pathname
  await page.goto('/')
  await expect(page.getByRole('heading', { name: `Welcome back, ${player}` })).toBeVisible()
  await expect.poll(() => savedState(page)).toContain(roster)
  await expect.poll(() => savedState(page)).toContain(JSON.stringify(['battle', battlePath.split('/').at(-1)!]))
  await expect
    .poll(() => page.evaluate(async () => Boolean(await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html'))), {
      timeout: 180_000,
    })
    .toBe(true)
  await page.goto('/rosters')
  await expect(page.locator(`[data-roster="${roster}"]`)).toBeVisible()
  await expect.poll(() => savedState(page)).toContain('saved-roster-page')
  await context.setOffline(true)
  await page.close()
  const reopened = await context.newPage()
  const errors: string[] = []
  reopened.on('pageerror', (error) => errors.push(error.message))
  await reopened.setViewportSize({ width: 390, height: 844 })
  await reopened.goto('/')
  await expect(reopened.getByRole('heading', { name: `Welcome back, ${player}` })).toBeVisible()
  await expect(reopened.getByRole('main').getByText(roster, { exact: true })).toBeVisible()
  await expect(reopened.getByRole('main').getByText(PRACTICE_OPPONENT, { exact: true }).first()).toBeVisible()
  await expect(reopened.getByRole('region', { name: 'Offline reference' })).toHaveCount(0)
  await expect(reopened.getByRole('button', { name: 'Refresh now' })).toHaveCount(0)
  await reopened.screenshot({ path: test.info().outputPath('saved-home-phone.png') })
  await reopened.getByRole('button', { name: 'Search Praetorium', exact: true }).first().click()
  await reopened.getByPlaceholder('Search everything…').fill(roster)
  await reopened.getByRole('option').filter({ hasText: roster }).click()
  await expect(reopened.getByLabel('List name')).toHaveValue(roster)
  await reopened.goto('/')

  await reopened.getByRole('navigation', { name: 'Application sections' }).getByRole('link', { name: 'Rosters', exact: true }).click()
  await expect(reopened.getByLabel('List name')).toHaveValue(roster)
  await reopened.goto('/rosters')
  await expect(reopened.locator(`[data-roster="${roster}"]`)).toBeVisible()
  await reopened.screenshot({ path: test.info().outputPath('saved-rosters-phone.png') })
  await reopened.goto(rosterPath)
  await expect(reopened.getByLabel('List name')).toHaveValue(roster)
  await reopened.goto('/battles')
  await expect(reopened.getByRole('heading', { name: 'My battles', exact: true })).toBeVisible()
  await expect(reopened.getByRole('main').locator(`a[href="${battlePath}"]`).first()).toBeVisible()
  await reopened.screenshot({ path: test.info().outputPath('saved-battles-phone.png') })
  await reopened.goto(battlePath)
  await expect(reopened.getByText(PRACTICE_OPPONENT, { exact: true }).first()).toBeVisible()
  await reopened.goto('/')
  await context.setOffline(false)
  const other = await context.newPage()
  const newRoster = await createRoster(other, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'New army from another device' })
  const newBattlePath = new URL(await createBattle(other, { practice: true })).pathname
  await reopened.evaluate(() => {
    ;(window as Window & { navigationMarker?: string }).navigationMarker = 'same app'
    window.dispatchEvent(new Event('online'))
  })
  await expect(reopened.getByRole('main').getByText(newRoster, { exact: true })).toBeVisible()
  await expect(reopened.getByRole('main').locator(`a[href="${newBattlePath}"]`).first()).toBeVisible()
  expect(await reopened.evaluate(() => (window as Window & { navigationMarker?: string }).navigationMarker)).toBe('same app')
  await expect(reopened).toHaveURL('/')
  await reopened.goto(rosterPath)
  await reopened.getByLabel('List name').fill('Renamed saved army')
  await reopened.getByLabel('List name').press('Tab')
  await other.goto('/rosters')
  await expect(other.locator('[data-roster="Renamed saved army"]')).toBeVisible()
  await reopened.goto('/')
  await reopened.goto(rosterPath)
  await expect(reopened.getByLabel('List name')).toHaveValue('Renamed saved army')
  await reopened.setViewportSize({ width: 1440, height: 900 })
  await reopened
    .locator('[data-web-app-chrome]')
    .getByRole('button', { name: `Account menu for ${player}` })
    .click()
  await reopened.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(reopened.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible()
  await expect.poll(() => savedState(reopened)).not.toContain('Saved army')
  await expect.poll(() => other.getByRole('button', { name: `Account menu for ${player}`, includeHidden: true }).count()).toBe(0)
  await context.setOffline(true)
  await reopened.reload()
  await expect(reopened.getByRole('heading', { name: `Welcome back, ${player}` })).toHaveCount(0)
  await expect(reopened.getByText(roster, { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
