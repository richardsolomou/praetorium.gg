import { waitForOfflineApp } from './offline'
import { expect, test, type Locator, type Page } from './test'
import {
  attachRoster,
  createBattle,
  createRoster,
  retryUntilVisible,
  savedArmy,
  signInAsPreview,
  signUp,
  uniqueName,
  waitForRosterSave,
} from './account'
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

const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PIXEL })

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

test('collection photos are added together, removed only after confirmation, and shown only while the collection is shared', async ({
  page,
  browser,
}) => {
  await signUp(page, uniqueName('Collection photo'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  const dialog = page.getByRole('dialog', { name: 'Your Overlord', exact: true })
  const photo = (index: number) => dialog.getByRole('button', { name: `Your photo ${index} of Overlord`, exact: true })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'Add photos of your Overlord', exact: true }).click())
  await dialog.getByLabel('Choose photos of your Overlord').setInputFiles([png('first.png'), png('second.png')])
  await loaded(photo(2).locator('img'))
  const first = (await photo(1).locator('img').getAttribute('src'))!
  const second = (await photo(2).locator('img').getAttribute('src'))!
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Photos of your Overlord', exact: true })).toHaveText('2')

  const owner = (await savedWork(page))!.owner
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const guest = await guestContext.newPage()
  const status = async (reader: Page, src: string) => (await reader.request.get(new URL(src, page.url()).href)).status()
  const served = await guest.request.get(new URL(second, page.url()).href)
  expect([served.status(), served.headers()['cache-control'], await status(guest, first)]).toEqual([200, 'private, no-cache', 200])
  const etag = served.headers()['etag']
  const revalidated = await guest.request.get(new URL(second, page.url()).href, { headers: { 'If-None-Match': etag } })
  expect([revalidated.status(), await revalidated.text()]).toEqual([304, ''])

  const cachedThumbnail = page.waitForRequest((request) => new URL(request.url()).pathname === first)
  await page.reload()
  expect((await (await cachedThumbnail).allHeaders())['if-none-match']).toBe(`"${first.split('/').at(-1)}"`)
  await loaded(page.getByRole('button', { name: 'Photos of your Overlord', exact: true }).locator('img'))
  const downloaded = await page.evaluate((src) => {
    const resource = performance.getEntriesByName(new URL(src, location.href).href).at(-1) as PerformanceResourceTiming
    return resource.encodedBodySize
  }, first)
  expect(downloaded).toBe(0)
  await guest.goto(new URL(`/users/${owner}?tab=collection`, page.url()).href)
  const thumbnail = guest.locator('[data-collection-unit="Overlord"]').getByRole('img', { name: 'Overlord', exact: true })
  await loaded(thumbnail)
  await expectNoHorizontalOverflow(guest.locator('main'))

  const operator = await productOperator()
  await operator.setCollectionPublished(owner, false)
  expect([await status(guest, second), await status(page, second)]).toEqual([404, 200])
  const hidden = await guest.request.get(new URL(second, page.url()).href, { headers: { 'If-None-Match': etag } })
  expect([hidden.status(), hidden.headers()['cache-control']]).toEqual([404, 'no-store'])
  await operator.setCollectionPublished(owner, true)

  await page.getByRole('button', { name: 'Photos of your Overlord', exact: true }).click()
  await photo(1).click()
  const viewer = page.getByRole('dialog', { name: 'Overlord', exact: true })
  const confirm = page.getByRole('alertdialog', { name: 'Remove this photo?', exact: true })
  await viewer.getByRole('button', { name: 'Remove photo', exact: true }).click()
  await confirm.getByRole('button', { name: 'Keep', exact: true }).click()
  expect(await status(page, first)).toBe(200)
  await viewer.getByRole('button', { name: 'Remove photo', exact: true }).click()
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(viewer).toBeHidden()
  await expect(photo(2)).toHaveCount(0)
  await expect(photo(1).locator('img')).toHaveAttribute('src', second)
  expect(await status(page, first)).toBe(404)
  await guestContext.close()
})

test('players add photos from datasheet pages and rosters, which show shared photos and a player’s own', async ({ page, browser }) => {
  const sharer = uniqueName('Photo sharer')
  await signUp(page, sharer)
  await page.goto('/factions/necrons/datasheets/overlord')
  const sharerGallery = page.locator('[data-datasheet-photos]')
  await sharerGallery.getByLabel('Choose photos of your Overlord').setInputFiles(png('photo.png'))
  await loaded(sharerGallery.getByRole('button', { name: `Overlord from ${sharer}’s collection`, exact: true }).locator('img'))
  await page.goto('/collection')
  await expect(page.locator('[data-unit="Overlord"]')).toBeVisible()

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
  // Closing the system file dialog returns focus to the hidden input, which must not scroll the pane's clipping root.
  await photo.getByLabel('Choose photos of your Overlord').focus()
  await expect(builder.locator('aside[aria-label="Loadout"] [data-slot="scroll-area"]')).toHaveJSProperty('scrollTop', 0)

  await photo.getByLabel('Choose photos of your Overlord').setInputFiles(png('photo.png'))
  await expect(photo).toContainText('Your models')
  await loaded(photo.getByRole('button', { name: 'Your photo 1 of Overlord', exact: true }).locator('img'))

  await builder.goto('/factions/necrons/datasheets/overlord')
  // Other tests share Overlord photos in the same database.
  const owners = gallery.locator('li span.truncate').filter({ hasText: new RegExp(`^(${builderName}|${sharer})$`) })
  await expect(owners).toHaveText([builderName, sharer])
  const like = gallery
    .locator('li')
    .filter({ has: builder.getByText(sharer, { exact: true }) })
    .getByRole('button', { name: 'Like this photo of Overlord, 0 likes', exact: true })
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

test('a reported photo is hidden from everyone but its owner until an administrator keeps it, and removal asks first', async ({
  page,
  browser,
}) => {
  const sharer = uniqueName('Reported sharer')
  await signUp(page, sharer)
  const shared = (scope: Page) =>
    scope.locator('[data-datasheet-photos]').getByRole('button', { name: `Royal Warden from ${sharer}’s collection`, exact: true })
  await page.goto('/factions/necrons/datasheets/royal-warden')
  await page.locator('[data-datasheet-photos]').getByLabel('Choose photos of your Royal Warden').setInputFiles(png('photo.png'))
  await loaded(shared(page).locator('img'))

  const readerContext = await browser.newContext()
  const reader = await readerContext.newPage()
  await signUp(reader, uniqueName('Photo reporter'))
  await reader.goto('/factions/necrons/datasheets/royal-warden')
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
  await signInAsPreview(admin)
  await admin.goto('/admin')
  await admin.getByRole('tab', { name: /^Photos/ }).click()
  await expect(admin).toHaveURL(/\/admin\?tab=photos$/)
  await admin.reload()
  const sharers = (section: string) =>
    admin
      .getByRole('region', { name: section, exact: true })
      .getByRole('listitem')
      .filter({ has: admin.getByRole('link', { name: sharer, exact: true }) })
  await expect(sharers('Recently uploaded')).toHaveCount(0)
  await loaded(sharers('Reported').getByRole('img'))
  await sharers('Reported').getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(sharers('Reported')).toHaveCount(0)
  await expect(sharers('Recently uploaded')).toHaveCount(1)
  await reader.reload()
  await expect(shared(reader)).toBeVisible()

  const confirm = admin.getByRole('alertdialog', { name: 'Remove this photo?', exact: true })
  await sharers('Recently uploaded').getByRole('button', { name: 'Remove', exact: true }).click()
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(sharers('Recently uploaded')).toHaveCount(1)
  await sharers('Recently uploaded').getByRole('button', { name: 'Remove', exact: true }).click()
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(sharers('Recently uploaded')).toHaveCount(0)
  await reader.reload()
  await expect(shared(reader)).toHaveCount(0)
  await Promise.all([readerContext.close(), adminContext.close()])
})

const progress = (page: Page, name: string, field: 'built' | 'painted') =>
  page.getByRole('spinbutton', { name: `${name} models ${field}`, exact: true })

async function setCount(field: Locator, value: string) {
  await field.fill(value)
  await field.press('Enter')
  await expect(field).toHaveValue(value)
}

/** Built models are bounded by those owned, so the built count is ready once its bound follows the saved total. */
async function setOwned(page: Page, name: string, value: string) {
  await setCount(owned(page, name), value)
  await expect(progress(page, name, 'built')).toHaveAttribute('max', value)
}

/** Painted models are bounded by those built, so the painted count is ready once its bound follows the built count. */
async function setBuilt(page: Page, name: string, value: string) {
  await setCount(progress(page, name, 'built'), value)
  await expect(progress(page, name, 'painted')).toHaveAttribute('max', value)
}

test('built and painted counts stay within the models owned', async ({ page }) => {
  await signUp(page, uniqueName('Collection progress'))
  await page.goto('/collection')
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await setOwned(page, 'Necron Warriors', '20')
  await setBuilt(page, 'Necron Warriors', '12')
  await setCount(progress(page, 'Necron Warriors', 'painted'), '8')
  const faction = page.getByRole('region', { name: 'Necrons', exact: true })
  await expect(faction.locator('[data-collection-total="owned"]')).toHaveText('20')
  await expect(faction.locator('[data-collection-total="built"]')).toHaveText('12')
  await expect(faction.locator('[data-collection-total="painted"]')).toHaveText('8')
  await progress(page, 'Necron Warriors', 'painted').fill('13')
  await progress(page, 'Necron Warriors', 'painted').press('Enter')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('8')
  await setOwned(page, 'Necron Warriors', '5')
  await expect(progress(page, 'Necron Warriors', 'built')).toHaveValue('5')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('5')
  await addDatasheet(page, 'Immortals', 'Necrons')
  await setOwned(page, 'Immortals', '10')
  await setBuilt(page, 'Immortals', '6')
  await setCount(progress(page, 'Immortals', 'painted'), '2')
  await expect(faction.locator('[data-collection-total="owned"]')).toHaveText('15')
  await expect(faction.locator('[data-collection-total="built"]')).toHaveText('11')
  await expect(faction.locator('[data-collection-total="painted"]')).toHaveText('7')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await expect(progress(page, 'Necron Warriors', 'built')).toHaveValue('5')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('5')
  await expect(faction.locator('[data-collection-total="painted"]')).toHaveText('7')
})

test('faction collection rows keep every counter reachable across screen and text sizes', async ({ page }) => {
  await signUp(page, uniqueName('Collection layout'))
  await page.goto('/collection')
  for (const name of ['Necron Warriors', 'Technomancer', 'Lokhust Heavy Destroyers', 'Canoptek Wraiths'])
    await addDatasheet(page, name, 'Necrons')
  await addDatasheet(page, 'Intercessor Squad', 'Space Marines')
  await setOwned(page, 'Necron Warriors', '20')
  await setBuilt(page, 'Necron Warriors', '12')
  await setCount(progress(page, 'Necron Warriors', 'painted'), '8')
  const necrons = page.getByRole('region', { name: 'Necrons', exact: true })
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expectNoHorizontalOverflow(page.locator('main'))
    for (const row of await necrons.locator('[data-unit]').all()) await expectNoHorizontalOverflow(row)
    await necrons.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`faction-collection-${width}.png`), fullPage: true })
  }
  await page.addStyleTag({ content: 'html { font-size: 200% }' })
  await expectNoHorizontalOverflow(page.locator('main'))
  await expectNoHorizontalOverflow(necrons)
  await progress(page, 'Necron Warriors', 'painted').fill('9')
  await progress(page, 'Necron Warriors', 'painted').press('Enter')
  await expect(necrons.locator('[data-collection-total="painted"]')).toHaveText('9')
  await page.getByRole('button', { name: 'More built Necron Warriors models', exact: true }).click()
  await expect(progress(page, 'Necron Warriors', 'built')).toHaveValue('13')
})

const csv = (text: string) => ({ name: 'collection.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })

test('imports a reviewed collection file without overwriting saved counts unless asked', async ({ page }) => {
  await signUp(page, uniqueName('Collection import'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  const file = [
    'faction,datasheet,models,built,painted,wanted',
    'Necrons,Necron Warriors,20,10,5,',
    'Necrons,Overlord,3,,,',
    ',Rhino,1,,,',
    ',Squiggoth,1,,,',
    'Necrons,Necron Warriors,5,,,',
    'Necrons,Immortals,5,6,,',
    'Necrons,Skorpekh Destroyers,,,,3',
  ].join('\n')
  const review = page.getByRole('dialog', { name: 'Import collection' })
  await page.locator('input[type=file]').setInputFiles(csv(file))
  await expect(review.locator('[data-import-summary]')).toHaveText('3 recognised · 1 to choose · 3 skipped')
  await expect(review.locator('[data-import-row="Overlord"]')).toContainText('Differs')
  await expect(review.locator('[data-import-row="Squiggoth"]')).toContainText('No current datasheet has this name.')
  await review.getByRole('combobox', { name: /Which Rhino/ }).selectOption({ label: 'Rhino (Space Marines)' })
  await review.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(review.locator('output')).toHaveText('Imported: 3 added, 0 replaced, 1 kept as saved.')
  await review.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(owned(page, 'Overlord')).toHaveValue('1')
  await expect(owned(page, 'Necron Warriors')).toHaveValue('20')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('5')
  await expect(page.locator('[data-wish="Skorpekh Destroyers"]')).toBeVisible()

  await page.locator('input[type=file]').setInputFiles(csv(file))
  await review.getByLabel(/Replace my saved counts/).check()
  await review.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(review.locator('output')).toHaveText('Imported: 0 added, 1 replaced, 0 kept as saved.')
  await review.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(owned(page, 'Overlord')).toHaveValue('3')
})

test('exports a collection that imports back unchanged', async ({ page }) => {
  await signUp(page, uniqueName('Collection export'))
  await page.goto('/collection')
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await setOwned(page, 'Necron Warriors', '10')
  await setCount(progress(page, 'Necron Warriors', 'built'), '4')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV', exact: true }).click(),
  ])
  const exported = await download.path().then((path) => import('node:fs/promises').then((fs) => fs.readFile(path, 'utf8')))
  expect(exported).toContain('Necrons,Necron Warriors,')
  await page.locator('input[type=file]').setInputFiles(csv(exported))
  const review = page.getByRole('dialog', { name: 'Import collection' })
  await expect(review.locator('[data-import-row="Necron Warriors"]')).toContainText('Unchanged')
  await expect(review.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
})

test('a saved roster shows shortages its units share and adds them to the wishlist', async ({ page }) => {
  await signUp(page, uniqueName('Roster readiness'))
  await page.goto('/collection')
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await setOwned(page, 'Necron Warriors', '15')
  await setCount(progress(page, 'Necron Warriors', 'built'), '15')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Readiness' })
  for (let copy = 0; copy < 2; copy++) {
    await page.getByLabel('Add a unit').fill('Necron Warriors')
    await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Necron Warriors', exact: true }).first().click())
  }
  const panel = page.locator('[data-roster-readiness]')
  await expect(panel.locator('[data-readiness-summary]')).toHaveText('5 models short')
  await panel.getByRole('button', { name: 'Toggle Your collection', exact: true }).click()
  const row = panel.locator('[data-readiness-unit="Necron Warriors"]')
  await expect(row).toContainText('20 needed · 15 owned · 15 built · 0 painted')
  await row.getByRole('button', { name: 'Add 5 to wishlist', exact: true }).click()
  await expect(row).toContainText('5 on your wishlist')
  await page.goto('/collection')
  await expect(page.getByRole('spinbutton', { name: 'Necron Warriors models wanted', exact: true })).toHaveValue('5')
})

test('the wishlist suggests unowned datasheets other players field that none of the player’s rosters use', async ({ page, browser }) => {
  const publisher = await browser.newPage()
  await savedArmy(publisher, 'Wishlist publisher', { name: 'Published', visibility: 'public' })
  await publisher.close()
  const source = (await (await productOperator()).roster('preview-necrons-cursed-skyshroud'))!
  const picks = (JSON.parse(source.picks) as { entryId: string }[]).filter((pick) => pick.entryId !== '821d-665-499f-e895')
  await savedArmy(page, 'Wishlist suggestions', { name: 'Without Immortals', picks: JSON.stringify(picks) })
  await page.goto('/collection')
  const suggestion = page.locator('[data-wish-suggestion="Immortals"]')
  await expect(suggestion).toContainText(/In \d+ of \d+ recent public Necrons rosters?/)
  await expect(page.locator('[data-wish-suggestion="Necron Warriors"]')).toHaveCount(0)
  await addDatasheet(page, 'Immortals', 'Necrons')
  await expect(suggestion).toBeHidden()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.reload()
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await expect(suggestion).toBeHidden()
  await page.screenshot({ path: test.info().outputPath('owned-wishlist-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(suggestion).toBeHidden()
  await expectNoHorizontalOverflow(page.locator('main'))
  await page.screenshot({ path: test.info().outputPath('owned-wishlist-phone.png'), fullPage: true })
  await page.getByRole('button', { name: 'Remove Immortals from your collection', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(suggestion).toBeVisible()
  await suggestion.getByRole('button', { name: 'Add Immortals to your wishlist', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Immortals models wanted', exact: true })).toHaveValue('1')
  await expect(suggestion).toBeHidden()
  await addDatasheet(page, 'Immortals', 'Necrons')
  await expect(page.getByRole('spinbutton', { name: 'Immortals models wanted', exact: true })).toHaveValue('1')
})

test('an army whose every roster is archived keeps its collection but leaves the wishlist suggestions', async ({ page }) => {
  const { id, userId, operator } = await savedArmy(page, 'Archived wishlist', { name: 'Retired Necrons' })
  await operator.setRosterArchived(id, userId, true, Date.now())
  await operator.addToCollection({ userId, entryId: '821d-665-499f-e895', now: Date.now() })
  await page.goto('/collection', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await expect(page.locator('[data-wish-suggestion]')).toHaveCount(0)
})
