import { expect, test, type Locator, type Page } from '@playwright/test'
import { attachRoster, createBattle, createRoster, retryUntilVisible, signUp, uniqueName, waitForRosterSave } from './account'
import { expectNoHorizontalOverflow } from './builder.harness'
import { productOperator } from './storage'
import type { LocalState } from '../src/contracts/localState'

async function addDatasheet(page: Page, name: string, faction: string) {
  await page.getByRole('combobox', { name: 'Add a datasheet to your collection', exact: true }).click()
  await page.getByPlaceholder('Search datasheets…').fill(`${name} ${faction}`)
  await page.getByRole('option', { name: new RegExp(`^${name}, ${faction}`) }).click()
  await expect(page.locator(`[data-unit="${name}"]`)).toBeVisible()
}

const owned = (scope: Page | Locator, name: string) => scope.getByRole('combobox', { name: `${name} models owned`, exact: true })

test('starts a datasheet at one model and saves multiple', async ({ page }) => {
  await signUp(page, uniqueName('Collection counts'))
  await page.goto('/collection')
  await expect(page.getByRole('heading', { name: 'Your shelf is empty', exact: true })).toBeVisible()
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await expect(owned(page, 'Necron Warriors')).toHaveText('1')
  await expect(page.getByRole('button', { name: 'Fewer Necron Warriors models', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'More Necron Warriors models', exact: true }).click()
  await expect(owned(page, 'Necron Warriors')).toHaveText('2')
  await owned(page, 'Necron Warriors').click()
  await page.getByRole('option', { name: '20', exact: true }).click()
  await expect(owned(page, 'Necron Warriors')).toHaveText('20')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await expect(owned(page, 'Necron Warriors')).toHaveText('20')
})

test('totals models across datasheets and drops a removed datasheet', async ({ page }) => {
  await signUp(page, uniqueName('Collection total'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  await addDatasheet(page, 'Intercessor Squad', 'Space Marines')
  await owned(page, 'Overlord').click()
  await page.getByRole('option', { name: '2', exact: true }).click()
  await expect(owned(page, 'Intercessor Squad')).toHaveText('1')
  await expect(page.locator('[data-tally="models"]')).toHaveText('3models')
  const removal = page.getByRole('alertdialog')
  await page.getByRole('button', { name: 'Remove Intercessor Squad from your collection', exact: true }).click()
  await expect(removal).toContainText('Your count of 1 model will be lost.')
  await removal.getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(owned(page, 'Intercessor Squad')).toHaveText('1')
  await page.getByRole('button', { name: 'Remove Intercessor Squad from your collection', exact: true }).click()
  await removal.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toHaveCount(0)
  await expect(page.locator('[data-tally="models"]')).toHaveText('2models')
})

test('adds, counts and removes a datasheet from its reference page, and favourites it', async ({ page }) => {
  await signUp(page, uniqueName('Datasheet collection'))
  await page.goto('/factions/necrons/datasheets/overlord')
  const menu = page.getByRole('dialog', { name: 'Add Overlord to' })
  const openMenu = () => retryUntilVisible(menu, () => page.getByRole('button', { name: 'Add to', exact: true }).click())
  await openMenu()
  await menu.getByRole('button', { name: 'Add to collection', exact: true }).click()
  await expect(owned(menu, 'Overlord')).toHaveText('1')
  await menu.getByRole('button', { name: 'More Overlord models', exact: true }).click()
  await expect(owned(menu, 'Overlord')).toHaveText('2')
  await menu.getByRole('button', { name: 'Favourites', exact: true }).click()
  await expect(menu.getByRole('button', { name: 'Favourites', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  // The count joins the saved-work queue only after reading the current counts, so wait for the server instead.
  const owner = (await savedWork(page))!.owner
  const operator = await productOperator()
  await expect.poll(async () => (await operator.collectionByUser(owner))[0]?.models).toBe(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page.locator('main'))
  await page.goto('/collection')
  await expect(owned(page, 'Overlord')).toHaveText('2')
  await expectNoHorizontalOverflow(page.locator('main'))
  await page.goBack()
  await openMenu()
  await menu.getByRole('button', { name: 'Remove Overlord from your collection', exact: true }).click()
  const removal = page.getByRole('alertdialog')
  await expect(removal).toContainText('Your count of 2 models will be lost.')
  await removal.getByRole('button', { name: 'Remove', exact: true }).click()
  await openMenu()
  await expect(menu.getByRole('button', { name: 'Add to collection', exact: true })).toBeVisible()
})

async function savedWork(page: Page) {
  return page.evaluate(
    () =>
      new Promise<LocalState | null>((resolve, reject) => {
        const opened = indexedDB.open('praetorium-work')
        opened.onerror = () => reject(opened.error)
        opened.onsuccess = () => {
          const database = opened.result
          const request = database.transaction('state').objectStore('state').getAll()
          request.onerror = () => {
            database.close()
            reject(request.error)
          }
          request.onsuccess = () => {
            database.close()
            resolve(request.result.find((entry: { state?: LocalState }) => entry.state)?.state ?? null)
          }
        }
      }),
  )
}

test('suggests datasheets fielded in a battle until they are added', async ({ page }) => {
  await signUp(page, uniqueName('Fielded collection'))
  const roster = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Fielded Guard' })
  await page.getByLabel('Add a unit').fill('Plague Marines')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Plague Marines', exact: true }).first().click())
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await page.goto('/collection')
  const suggestion = page.locator('[data-suggestion="Plague Marines"]')
  await expect(suggestion).toContainText('1 battle')
  await suggestion.getByRole('button', { name: 'Add Plague Marines to your collection', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Death Guard' }).locator('[data-unit="Plague Marines"]')).toBeVisible()
  await expect(suggestion).toHaveCount(0)
})

test('collection counts survive a cold offline reopen and reconnect', async ({ page, context }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Offline collection'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  await expect(owned(page, 'Overlord')).toHaveText('1')
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const saved = await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html')
          return Boolean(saved && (await saved.text()).includes('"construction"'))
        }),
      { timeout: 180_000 },
    )
    .toBe(true)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  const owner = (await savedWork(page))!.owner
  const operator = await productOperator()
  const serverCount = async () => (await operator.collectionByUser(owner))[0]?.models
  await expect.poll(serverCount).toBe(1)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'More Overlord models', exact: true }).click()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/collection')
  await expect(owned(reopened, 'Overlord')).toHaveText('2')
  expect(await serverCount()).toBe(1)
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(serverCount, { timeout: 30_000 }).toBe(2)
  await expect.poll(async () => (await savedWork(reopened))?.operations.length).toBe(0)
  await reopened.reload()
  await expect(owned(reopened, 'Overlord')).toHaveText('2')
})
