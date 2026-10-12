import { expect, test, type Locator, type Page } from './test'
import { attachRoster, createBattle, createRoster, retryUntilVisible, signUp, uniqueName, waitForRosterSave } from './account'
import { expectNoHorizontalOverflow } from './builder.harness'
import { productOperator } from './storage'
import type { LocalState } from '../src/contracts/localState'

async function addDatasheet(page: Page, name: string, faction: string) {
  const search = page.getByPlaceholder('Search datasheets…')
  await retryUntilVisible(search, () => page.getByRole('combobox', { name: 'Add a datasheet to your collection', exact: true }).click())
  await search.fill(`${name} ${faction}`)
  await page.getByRole('option', { name: new RegExp(`^${name}, ${faction}`) }).click()
  await expect(page.locator(`[data-unit="${name}"]`)).toBeVisible()
}

const owned = (scope: Page | Locator, name: string) => scope.getByRole('spinbutton', { name: `${name} models owned`, exact: true })

test('starts a datasheet at one model and saves multiple', async ({ page }) => {
  await signUp(page, uniqueName('Collection counts'))
  await page.goto('/collection')
  await expect(page.getByRole('heading', { name: 'Your shelf is empty', exact: true })).toBeVisible()
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await expect(owned(page, 'Necron Warriors')).toHaveValue('1')
  await expect(page.getByRole('button', { name: 'Fewer Necron Warriors models', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'More Necron Warriors models', exact: true }).click()
  await expect(owned(page, 'Necron Warriors')).toHaveValue('2')
  await owned(page, 'Necron Warriors').fill('100')
  await owned(page, 'Necron Warriors').press('Enter')
  await expect(owned(page, 'Necron Warriors')).toHaveValue('100')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await expect(owned(page, 'Necron Warriors')).toHaveValue('100')
})

test('totals models across datasheets and drops a removed datasheet', async ({ page }) => {
  await signUp(page, uniqueName('Collection total'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  await addDatasheet(page, 'Intercessor Squad', 'Space Marines')
  await owned(page, 'Overlord').fill('2')
  await owned(page, 'Overlord').press('Enter')
  await expect(owned(page, 'Intercessor Squad')).toHaveValue('1')
  await expect(page.locator('[data-tally="models"]')).toHaveText('3models')
  const removal = page.getByRole('alertdialog')
  await page.getByRole('button', { name: 'Remove Intercessor Squad from your collection', exact: true }).click()
  await expect(removal).toContainText('Your count of 1 model will be lost.')
  await removal.getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(owned(page, 'Intercessor Squad')).toHaveValue('1')
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
  await expect(owned(menu, 'Overlord')).toHaveValue('1')
  await menu.getByRole('button', { name: 'More Overlord models', exact: true }).click()
  await expect(owned(menu, 'Overlord')).toHaveValue('2')
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
  await expect(owned(page, 'Overlord')).toHaveValue('2')
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
  await expect(owned(page, 'Overlord')).toHaveValue('1')
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
  await expect(owned(reopened, 'Overlord')).toHaveValue('2')
  expect(await serverCount()).toBe(1)
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(serverCount, { timeout: 30_000 }).toBe(2)
  await expect.poll(async () => (await savedWork(reopened))?.operations.length).toBe(0)
  await reopened.reload()
  await expect(owned(reopened, 'Overlord')).toHaveValue('2')
})

test('direct collection counts reject invalid values and step from an unsaved edit', async ({ page }) => {
  await signUp(page, uniqueName('Direct collection counts'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  const count = owned(page, 'Overlord')
  for (const invalid of ['', '0', '-1', '1.5', '10001']) {
    await count.fill(invalid)
    await count.press('Enter')
    await expect(count).toHaveValue('1')
  }
  await count.fill('30')
  await page.getByRole('button', { name: 'More Overlord models', exact: true }).click()
  await expect(count).toHaveValue('31')
  await expect(page.locator('[data-tally="models"]')).toHaveText('31models')
  await count.fill('100')
  await count.press('Escape')
  await expect(count).toHaveValue('31')
  await count.press('Tab')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await expect(count).toHaveValue('31')
})

for (const width of [390, 1440]) {
  test(`profiles show a new collection by default and settings hide it at ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 900 })
    await signUp(page, uniqueName('Profile collection'))
    await page.goto('/collection')
    await addDatasheet(page, 'Overlord', 'Necrons')
    await owned(page, 'Overlord').fill('30')
    await owned(page, 'Overlord').press('Enter')
    await addDatasheet(page, 'Intercessor Squad', 'Space Marines')
    await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
    const owner = (await savedWork(page))!.owner
    const operator = await productOperator()
    await expect.poll(async () => (await operator.collectionProfile(owner, null))?.entries.length).toBe(2)
    const profileUrl = new URL(`/users/${owner}?tab=collection`, page.url()).href
    const guestContext = await browser.newContext({ viewport: { width, height: 900 } })
    const guest = await guestContext.newPage()
    await guest.goto(profileUrl)
    const shown = guest.locator('[data-player-collection]')
    await expect(shown).toContainText('31 models · 2 datasheets')
    await expect(shown.getByRole('region', { name: 'Necrons', exact: true })).toContainText('30 models')
    await expect(guest.getByRole('switch')).toHaveCount(0)
    await expectNoHorizontalOverflow(guest.locator('main'))

    await page.goto(profileUrl)
    const collection = page.locator('[data-player-collection]')
    await expect(collection).toContainText('Anyone can see your collection here.')
    await expect(page.getByRole('switch')).toHaveCount(0)
    await collection.getByRole('link', { name: 'Privacy settings', exact: true }).click()
    const sharing = page.getByRole('switch', { name: /Show collection on profile/ })
    await expect(sharing).toBeChecked()
    await expect(sharing).toBeEnabled()
    await expectNoHorizontalOverflow(page.locator('main'))
    await sharing.click()
    await expect(sharing).not.toBeChecked()
    await expect.poll(() => operator.collectionProfile(owner, null)).toBeNull()
    await expect(shown).toHaveCount(0)
    await guest.reload()
    await expect(guest.getByRole('tab', { name: 'Collection', exact: true })).toHaveCount(0)
    await expect(guest.locator('[data-collection-unit]')).toHaveCount(0)
    await page.reload()
    await expect(sharing).toBeEnabled()
    await expect(sharing).not.toBeChecked()
    await page.goto(profileUrl)
    await expect(collection).toContainText('31 models · 2 datasheets')
    await expect(collection).toContainText('Only you can see your collection here.')
    await guestContext.close()
  })
}
