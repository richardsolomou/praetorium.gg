import { waitForOfflineApp } from './offline'
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

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function addPhoto(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name: `Your ${name}` })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: `Add a photo of your ${name}`, exact: true }).click())
  await dialog.getByLabel(`Choose a photo of your ${name}`).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(dialog.getByRole('button', { name: 'Replace photo', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
}

const loaded = (image: Locator) => expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)

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
  await waitForOfflineApp(page)
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

test('profiles show a new collection by default and settings hide it', async ({ page, browser }) => {
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
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const guest = await guestContext.newPage()
  await guest.goto(profileUrl)
  const shown = guest.locator('[data-player-collection]')
  for (const width of [1440, 390]) {
    await guest.setViewportSize({ width, height: 900 })
    await expect(shown).toContainText('31 models · 2 datasheets')
    await expect(shown.getByRole('region', { name: 'Necrons', exact: true })).toContainText('30 models')
    await expect(guest.getByRole('switch')).toHaveCount(0)
    await expectNoHorizontalOverflow(guest.locator('main'))
  }
  await guest.setViewportSize({ width: 1440, height: 900 })

  await page.goto(profileUrl)
  const collection = page.locator('[data-player-collection]')
  await expect(collection).toContainText('Anyone can see your collection here.')
  await expect(page.getByRole('switch')).toHaveCount(0)
  await collection.getByRole('link', { name: 'Privacy settings', exact: true }).click()
  const sharing = page.getByRole('switch', { name: /Show collection on profile/ })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(sharing).toBeChecked()
    await expect(sharing).toBeEnabled()
    await expectNoHorizontalOverflow(page.locator('main'))
  }
  await page.setViewportSize({ width: 1440, height: 900 })
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

test('a collection photo is replaced, removed, and shown only while the collection is shared', async ({ page, browser }) => {
  await signUp(page, uniqueName('Collection photo'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  const dialog = page.getByRole('dialog', { name: 'Your Overlord' })
  const choose = (name: string) =>
    dialog.getByLabel('Choose a photo of your Overlord').setInputFiles({ name, mimeType: 'image/png', buffer: PIXEL })
  const shown = dialog.getByRole('img', { name: 'The Overlord in this collection' })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'Add a photo of your Overlord', exact: true }).click())
  await choose('first.png')
  await loaded(shown)
  const first = (await shown.getAttribute('src'))!
  await choose('second.png')
  await expect(shown).not.toHaveAttribute('src', first)
  const second = (await shown.getAttribute('src'))!
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Photo of your Overlord', exact: true })).toBeVisible()

  const owner = (await savedWork(page))!.owner
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const guest = await guestContext.newPage()
  const status = async (reader: Page, src: string) => (await reader.request.get(new URL(src, page.url()).href)).status()
  const served = await guest.request.get(new URL(second, page.url()).href)
  expect([served.status(), served.headers()['cache-control'], await status(guest, first)]).toEqual([200, 'private, no-store', 404])
  await guest.goto(new URL(`/users/${owner}?tab=collection`, page.url()).href)
  const thumbnail = guest.locator('[data-collection-unit="Overlord"]').getByRole('img', { name: 'Overlord', exact: true })
  await loaded(thumbnail)
  await expectNoHorizontalOverflow(guest.locator('main'))

  const operator = await productOperator()
  await operator.setCollectionPublished(owner, false)
  expect([await status(guest, second), await status(page, second)]).toEqual([404, 200])
  await operator.setCollectionPublished(owner, true)

  await page.getByRole('button', { name: 'Photo of your Overlord', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove photo', exact: true }).click()
  await expect(dialog.getByText('No photo yet')).toBeVisible()
  expect(await status(page, second)).toBe(404)
  await guestContext.close()
})

test('datasheet pages and rosters show shared photos, and a player sees their own in their rosters', async ({ page, browser }) => {
  const sharer = uniqueName('Photo sharer')
  await signUp(page, sharer)
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  await addPhoto(page, 'Overlord')

  const builderContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const builder = await builderContext.newPage()
  const builderName = uniqueName('Photo builder')
  await signUp(builder, builderName)
  await builder.goto('/factions/necrons/datasheets/overlord')
  const gallery = builder.locator('[data-datasheet-photos]')
  const shared = gallery.getByRole('button', { name: `Overlord from ${sharer}’s collection`, exact: true })
  await loaded(shared.locator('img'))

  await createRoster(builder, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await waitForRosterSave(builder, () => builder.getByRole('button', { name: 'Add Overlord', exact: true }).first().click())
  await builder.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  const photo = builder.locator('aside[aria-label="Loadout"] [data-unit-photo]')
  await expect(photo).toContainText(`From ${sharer}’s collection`)
  await loaded(photo.locator('img'))

  const rosterUrl = builder.url()
  await builder.goto('/collection')
  await addDatasheet(builder, 'Overlord', 'Necrons')
  await addPhoto(builder, 'Overlord')
  await builder.goto(rosterUrl)
  await builder.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await expect(photo).toContainText('Your models')

  await builder.goto('/factions/necrons/datasheets/overlord')
  const owners = gallery.locator('li span.truncate')
  await expect(owners).toHaveText([builderName, sharer])
  const like = gallery.getByRole('button', { name: /^Like this photo of Overlord, 0 likes$/ })
  await like.click()
  await expect(owners).toHaveText([sharer, builderName])
  await builder.reload()
  await expect(gallery.getByRole('button', { name: 'Like this photo of Overlord, 1 like', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(owners).toHaveText([sharer, builderName])
  await builderContext.close()
})

test('a reported photo is hidden from everyone but its owner until an administrator keeps it', async ({ page, browser }) => {
  const sharer = uniqueName('Reported sharer')
  await signUp(page, sharer)
  await page.goto('/collection')
  await addDatasheet(page, 'Royal Warden', 'Necrons')
  await addPhoto(page, 'Royal Warden')

  const readerContext = await browser.newContext()
  const reader = await readerContext.newPage()
  await signUp(reader, uniqueName('Photo reporter'))
  await reader.goto('/factions/necrons/datasheets/royal-warden')
  const shared = (scope: Page) =>
    scope.locator('[data-datasheet-photos]').getByRole('button', { name: `Royal Warden from ${sharer}’s collection`, exact: true })
  await shared(reader).click()
  const viewer = reader.getByRole('dialog', { name: 'Royal Warden' })
  await viewer.getByRole('button', { name: 'Report', exact: true }).click()
  await viewer.getByLabel('What is wrong with this photo?').fill('Not a model')
  await viewer.getByRole('button', { name: 'Send report', exact: true }).click()
  await expect(viewer.getByText('Thanks. An administrator will review it.')).toBeVisible()
  await reader.keyboard.press('Escape')
  await expect(shared(reader)).toHaveCount(0)

  await page.goto('/factions/necrons/datasheets/royal-warden')
  await expect(shared(page)).toBeVisible()

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await admin.goto('/sign-in')
  // Filling before hydration submits the form natively and never signs in.
  await admin.waitForLoadState('networkidle')
  await admin.getByLabel('Email').fill('preview@praetorium.gg')
  await admin.getByLabel('Password').fill('preview-preview-preview')
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click()
  await admin.waitForURL('/')
  await admin.goto('/admin')
  await admin.getByRole('tab', { name: /^Reported photos/ }).click()
  await expect(admin).toHaveURL(/\/admin\?tab=photos$/)
  await admin.reload()
  const held = admin.getByRole('listitem').filter({ has: admin.getByRole('link', { name: sharer, exact: true }) })
  await loaded(held.getByRole('img'))
  await held.getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(held).toHaveCount(0)

  await reader.reload()
  await expect(shared(reader)).toBeVisible()
  await Promise.all([readerContext.close(), adminContext.close()])
})
