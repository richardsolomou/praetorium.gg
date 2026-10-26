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
  addUnit,
  PHONE,
} from './account'
import { expectNoHorizontalOverflow } from './builder.harness'
import { productOperator, savedWork, expectWorkSynced } from './storage'
import sharp from 'sharp'
import { collectionPhotoStore } from '../src/server/collectionPhotos'
import { privateObjects } from '../src/server/privateImages'
import { root } from './stackEnv'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Picks a datasheet from one of the shelf's catalogue searches. */
async function pickDatasheet(page: Page, list: 'collection' | 'wishlist', name: string, faction: string) {
  const search = page.getByPlaceholder('Search datasheets…')
  await retryUntilVisible(search, () => page.getByRole('combobox', { name: `Add a datasheet to your ${list}`, exact: true }).click())
  await search.fill(`${name} ${faction}`)
  await page.getByRole('option', { name: new RegExp(`^${name}, ${faction}`) }).click()
}

async function addDatasheet(page: Page, name: string, faction: string) {
  await pickDatasheet(page, 'collection', name, faction)
  await expect(page.locator(`[data-unit="${name}"]`)).toBeVisible()
}

async function removeFromCollection(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click()
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
  await setCount(owned(page, 'Necron Warriors'), '100')
  await expectWorkSynced(page)
  await page.reload()
  await expect(owned(page, 'Necron Warriors')).toHaveValue('100')
})

test('rapid collection steps keep the latest count while earlier saves finish', async ({ page }) => {
  await signUp(page, uniqueName('Rapid collection counts'))
  await page.goto('/collection')
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await expect(owned(page, 'Necron Warriors')).toHaveValue('1')
  const owner = (await savedWork(page))!.owner
  const operator = await productOperator()
  await expect.poll(async () => (await operator.collectionByUser(owner))[0]?.models).toBe(1)
  await pickDatasheet(page, 'wishlist', 'Necron Warriors', 'Necrons')
  await expect(page.getByRole('spinbutton', { name: 'Necron Warriors models wanted', exact: true })).toHaveValue('1')
  await page.evaluate(() => {
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      ...complete,
      set(callback) {
        complete.set!.call(
          this,
          this.db.name === 'praetorium-work' && this.mode === 'readwrite'
            ? (event: Event) => setTimeout(() => callback.call(this, event), 150)
            : callback,
        )
      },
    })
  })
  for (const [kind, initial, increases, decreases] of [
    ['owned', 1, 1, 1],
    ['owned', 1, 12, 4],
    ['built', 0, 7, 2],
    ['painted', 0, 5, 2],
    ['wanted', 1, 8, 3],
  ] as const) {
    const input = page.getByRole('spinbutton', { name: `Necron Warriors models ${kind}`, exact: true })
    const label = `${kind === 'owned' ? '' : `${kind} `}Necron Warriors models`
    let expected = initial
    for (const [action, steps, delta] of [
      ['More', increases, 1],
      ['Fewer', decreases, -1],
    ] as const)
      for (let step = 0; step < steps; step++) {
        await page.getByRole('button', { name: `${action} ${label}`, exact: true }).click({ delay: 20 })
        expected += delta
        await expect(input).toHaveValue(String(expected))
      }
    await expect
      .poll(async () => {
        if (kind === 'wanted') return (await operator.collectionWishesByUser(owner))[0]?.wanted
        const entry = (await operator.collectionByUser(owner))[0]
        return entry?.[kind === 'owned' ? 'models' : kind]
      })
      .toBe(expected)
    await expect(input).toHaveValue(String(expected))
  }
  const entry = (await operator.collectionByUser(owner))[0]
  for (const models of [10, 9]) {
    await operator.setCollectionModels({ userId: owner, entryId: entry.entryId, models, now: Date.now() })
    await expect(owned(page, 'Necron Warriors')).toHaveValue(String(models))
  }
  await page.screenshot({ path: test.info().outputPath('rapid-collection-counts.png'), fullPage: true })
  await page.reload()
  await expect(owned(page, 'Necron Warriors')).toHaveValue('9')
  await expect(progress(page, 'Necron Warriors', 'built')).toHaveValue('5')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('3')
  await expect(page.getByRole('spinbutton', { name: 'Necron Warriors models wanted', exact: true })).toHaveValue('6')
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
  await removeFromCollection(page, 'Intercessor Squad')
  await expect(removal).toContainText('Your count of 1 model will be lost.')
  await removal.getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(owned(page, 'Intercessor Squad')).toHaveValue('1')
  await removeFromCollection(page, 'Intercessor Squad')
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
  await page.setViewportSize(PHONE)
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

test('suggests datasheets fielded in a battle until they are added', async ({ page }) => {
  await signUp(page, uniqueName('Fielded collection'))
  const roster = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Fielded Guard' })
  await addUnit(page, 'Plague Marines')
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
  await expectWorkSynced(page)
  const owner = (await savedWork(page))!.owner
  const operator = await productOperator()
  const serverCount = async () => (await operator.collectionByUser(owner))[0]?.models
  await expect.poll(serverCount).toBe(1)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'More Overlord models', exact: true }).click()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
  await page.getByRole('button', { name: 'Max built Overlord models', exact: true }).click()
  await expect(progress(page, 'Overlord', 'built')).toHaveValue('2')
  await page.getByRole('button', { name: 'Max painted Overlord models', exact: true }).click()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(3)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/collection')
  await expect(owned(reopened, 'Overlord')).toHaveValue('2')
  await expect(progress(reopened, 'Overlord', 'built')).toHaveValue('2')
  await expect(progress(reopened, 'Overlord', 'painted')).toHaveValue('2')
  expect(await serverCount()).toBe(1)
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(serverCount, { timeout: 30_000 }).toBe(2)
  await expect.poll(async () => (await operator.collectionByUser(owner))[0]?.painted, { timeout: 30_000 }).toBe(2)
  await expectWorkSynced(reopened)
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
  await expectWorkSynced(page)
  await page.reload()
  await expect(count).toHaveValue('31')
})

test('profiles show a new collection', async ({ page, browser }) => {
  await signUp(page, uniqueName('Profile collection'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  await owned(page, 'Overlord').fill('30')
  await owned(page, 'Overlord').press('Enter')
  await addDatasheet(page, 'Intercessor Squad', 'Space Marines')
  await expectWorkSynced(page)
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
    await expect(
      shown.getByRole('region', { name: 'Necrons', exact: true }).getByLabel('Overlord: 30 owned', { exact: true }),
    ).toBeVisible()
    await expect(guest.getByRole('switch')).toHaveCount(0)
    await expectNoHorizontalOverflow(guest.locator('main'))
  }
  await guest.setViewportSize({ width: 1440, height: 900 })

  await page.goto(profileUrl)
  const collection = page.locator('[data-player-collection]')
  await expect(collection).toContainText('31 models · 2 datasheets')
  await expect(page.getByRole('switch')).toHaveCount(0)
  await guestContext.close()
})

test('collection photos are added together and removed only after confirmation', async ({ page, browser }) => {
  await signUp(page, uniqueName('Collection photo'))
  await page.goto('/collection')
  await addDatasheet(page, 'Overlord', 'Necrons')
  const dialog = page.getByRole('dialog', { name: 'Your Overlord', exact: true })
  const photo = (index: number) => dialog.getByRole('button', { name: `Your photo ${index} of Overlord`, exact: true })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'Add photos of your Overlord', exact: true }).click())
  const largePhoto = await sharp({ create: { width: 960, height: 1280, channels: 3, background: '#596943' } })
    .png()
    .toBuffer()
  await dialog
    .getByLabel('Choose photos of your Overlord')
    .setInputFiles([{ name: 'first.png', mimeType: 'image/png', buffer: largePhoto }, png('second.png')])
  await loaded(photo(2).locator('img'))
  const first = (await photo(1).locator('img').getAttribute('src'))!
  const second = (await photo(2).locator('img').getAttribute('src'))!
  expect(new URL(first, page.url()).searchParams.get('size')).toBe('thumbnail')
  const originalPath = new URL(first, page.url()).pathname
  const original = await page.request.get(new URL(originalPath, page.url()).href)
  const originalImage = await sharp(await original.body()).metadata()
  const thumbnailImage = await sharp(await (await page.request.get(new URL(first, page.url()).href)).body()).metadata()
  expect([originalImage.width, originalImage.height, thumbnailImage.width, thumbnailImage.height]).toEqual([960, 1280, 240, 320])
  const objects = privateObjects({ PRAETORIUM_LOCAL_DEV: 'true', LOCAL_OBJECT_DIR: join(root, 'objects') })!
  const firstId = originalPath.split('/').at(-1)!
  await objects.delete(`collection-photos/${firstId}.thumbnail.webp`)
  const maintenance = collectionPhotoStore(Object.assign(await productOperator(), { namesByIds: async () => new Map() }), () => objects)
  expect((await maintenance.backfillThumbnails()).generated).toBeGreaterThan(0)
  expect(await objects.head(`collection-photos/${firstId}.thumbnail.webp`)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Photos of your Overlord', exact: true })).toHaveText('2')

  const owner = (await savedWork(page))!.owner
  const guestContext = await browser.newContext({ viewport: PHONE })
  const guest = await guestContext.newPage()
  const status = async (reader: Page, src: string) => (await reader.request.get(new URL(src, page.url()).href)).status()
  const served = await guest.request.get(new URL(second, page.url()).href)
  expect([served.status(), served.headers()['cache-control'], await status(guest, first)]).toEqual([200, 'private, no-cache', 200])
  const etag = served.headers()['etag']
  const revalidated = await guest.request.get(new URL(second, page.url()).href, { headers: { 'If-None-Match': etag } })
  expect([revalidated.status(), await revalidated.text()]).toEqual([304, ''])

  const cachedThumbnail = page.waitForRequest((request) => request.url() === new URL(first, page.url()).href)
  await page.reload()
  expect((await (await cachedThumbnail).allHeaders())['if-none-match']).toBe(`"${firstId}-thumbnail-v1"`)
  await loaded(page.getByRole('button', { name: 'Photos of your Overlord', exact: true }).locator('img'))
  const downloaded = await page.evaluate((src) => {
    const resource = performance.getEntriesByName(new URL(src, location.href).href).at(-1) as PerformanceResourceTiming
    return resource.encodedBodySize
  }, first)
  expect(downloaded).toBe(0)
  await guest.goto(new URL(`/users/${owner}?tab=collection`, page.url()).href)
  const thumbnail = guest
    .locator('[data-collection-unit="Overlord"]')
    .getByRole('button', { name: 'Photos of Overlord', exact: true })
    .locator('img')
  await loaded(thumbnail)
  await expectNoHorizontalOverflow(guest.locator('main'))

  await page.getByRole('button', { name: 'Photos of your Overlord', exact: true }).click()
  await photo(1).click()
  const viewer = page.getByRole('dialog', { name: 'Overlord', exact: true })
  const shownPhoto = viewer.getByRole('img', { name: /^Overlord from / })
  await expect(shownPhoto).toHaveAttribute('src', originalPath)
  await expect(viewer.getByRole('button', { name: 'Previous photo', exact: true })).toBeDisabled()
  await expect(viewer.getByRole('link')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(shownPhoto).toHaveAttribute('src', new URL(second, page.url()).pathname)
  await viewer.getByRole('button', { name: 'Previous photo', exact: true }).click()
  await expect(shownPhoto).toHaveAttribute('src', originalPath)
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
  expect(await status(page, originalPath)).toBe(404)
  await maintenance.drainDeletions()
  expect([await objects.head(`collection-photos/${firstId}`), await objects.head(`collection-photos/${firstId}.thumbnail.webp`)]).toEqual([
    false,
    false,
  ])
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
  await loaded(sharers('Reported').locator('img'))
  await sharers('Reported')
    .getByRole('button', { name: `Keep Royal Warden from ${sharer}`, exact: true })
    .click()
  await expect(sharers('Reported')).toHaveCount(0)
  await expect(sharers('Recently uploaded')).toHaveCount(1)
  await reader.reload()
  await expect(shared(reader)).toBeVisible()

  await sharers('Recently uploaded')
    .getByRole('button', { name: `Royal Warden from ${sharer}’s collection`, exact: true })
    .click()
  await expect(admin.getByRole('dialog', { name: 'Royal Warden', exact: true }).getByRole('img')).toBeVisible()
  await admin.keyboard.press('Escape')
  await expect(sharers('Recently uploaded').getByRole('link', { name: sharer, exact: true })).toHaveAttribute(
    'href',
    /^\/users\/[^/?]+\?tab=collection$/,
  )

  const confirm = admin.getByRole('alertdialog', { name: 'Remove this photo?', exact: true })
  await sharers('Recently uploaded')
    .getByRole('button', { name: `Remove Royal Warden from ${sharer}`, exact: true })
    .click()
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(sharers('Recently uploaded')).toHaveCount(1)
  await sharers('Recently uploaded')
    .getByRole('button', { name: `Remove Royal Warden from ${sharer}`, exact: true })
    .click()
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
async function exportCsv(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV', exact: true }).click(),
  ])
  return readFile(await download.path(), 'utf8')
}

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
  await expectWorkSynced(page)
  await page.reload()
  await expect(progress(page, 'Necron Warriors', 'built')).toHaveValue('5')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('5')
  await expect(faction.locator('[data-collection-total="painted"]')).toHaveText('7')
})

test('max built and painted match their preceding collection counts', async ({ page }) => {
  await signUp(page, uniqueName('Collection max'))
  await page.goto('/collection')
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await setOwned(page, 'Necron Warriors', '20')
  await setBuilt(page, 'Necron Warriors', '12')
  await setCount(progress(page, 'Necron Warriors', 'painted'), '8')
  const maxBuilt = page.getByRole('button', { name: 'Max built Necron Warriors models', exact: true })
  const maxPainted = page.getByRole('button', { name: 'Max painted Necron Warriors models', exact: true })
  await expect(maxBuilt).toBeEnabled()
  await expect(maxPainted).toBeEnabled()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expectNoHorizontalOverflow(page.locator('main'))
    await page.screenshot({ path: test.info().outputPath(`collection-max-${width}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: 'More built Necron Warriors models', exact: true }).click()
  await maxBuilt.click()
  await expect(progress(page, 'Necron Warriors', 'built')).toHaveValue('20')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('8')
  await expect(maxBuilt).toBeDisabled()
  await page.getByRole('button', { name: 'More painted Necron Warriors models', exact: true }).click()
  await maxPainted.click()
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('20')
  await expect(maxPainted).toBeDisabled()
  const owner = (await savedWork(page))!.owner
  const operator = await productOperator()
  await expect.poll(async () => (await operator.collectionByUser(owner))[0]?.painted).toBe(20)
  await page.reload()
  await expect(progress(page, 'Necron Warriors', 'built')).toHaveValue('20')
  await expect(progress(page, 'Necron Warriors', 'painted')).toHaveValue('20')
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
  await expectWorkSynced(page)
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
  await expectWorkSynced(page)
  const exported = await exportCsv(page)
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
  await expectWorkSynced(page)
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Readiness' })
  for (let copy = 0; copy < 2; copy++) {
    await addUnit(page, 'Necron Warriors')
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

test('models that can also be another datasheet fill it in a roster and show as owned in the picker', async ({ page }) => {
  await signUp(page, uniqueName('Can also be'))
  await page.goto('/collection')
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  await setOwned(page, 'Necron Warriors', '20')
  const card = page.locator('[data-unit="Necron Warriors"]')
  await expect(card.locator('[data-counts-as]')).toHaveCount(0)
  await card.getByRole('button', { name: 'Actions for Necron Warriors', exact: true }).click()
  await page.screenshot({ path: test.info().outputPath('counts-as-menu.png') })
  await page.getByRole('menuitem', { name: 'Can also be…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'What else can these Necron Warriors models be?' })
  await dialog.getByLabel('Search this army’s datasheets').fill('immortals')
  await dialog.getByRole('checkbox', { name: 'Immortals', exact: true }).check()
  await page.screenshot({ path: test.info().outputPath('counts-as-dialog.png') })
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(card.locator('[data-counts-as]')).toContainText('Can also be Immortals')
  await expectWorkSynced(page)
  await page.reload()
  await expect(card.locator('[data-counts-as]')).toContainText('Can also be Immortals')
  await page.setViewportSize(PHONE)
  await expectNoHorizontalOverflow(page.locator('main'))
  await card.screenshot({ path: test.info().outputPath('counts-as-card-phone.png') })
  await page.setViewportSize({ width: 1440, height: 900 })
  const exported = await exportCsv(page)
  expect(exported).toMatch(/Necrons,Necron Warriors,[^,]+,20,0,0,0,[^,\r\n]+/)

  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Can also be' })
  await page.getByRole('button', { name: 'Owned', exact: true }).click()
  await addUnit(page, 'Immortals')
  const panel = page.locator('[data-roster-readiness]')
  await expect(panel.locator('[data-readiness-summary]')).not.toContainText('short')
  await panel.getByRole('button', { name: 'Toggle Your collection', exact: true }).click()
  await expect(panel.locator('[data-readiness-unit="Immortals"] [data-readiness-from]')).toHaveText(/^\d+ from your Necron Warriors$/)
  await page.setViewportSize(PHONE)
  await expectNoHorizontalOverflow(page.locator('main'))
  await page.screenshot({ path: test.info().outputPath('counts-as-readiness-phone.png'), fullPage: true })
})

test('photos of another build stay with the models they show and appear on that build’s datasheet', async ({ page }) => {
  const player = uniqueName('Build photos')
  await signUp(page, player)
  await page.goto('/collection')
  await addDatasheet(page, 'Necron Warriors', 'Necrons')
  const card = page.locator('[data-unit="Necron Warriors"]')
  await card.getByRole('button', { name: 'Actions for Necron Warriors', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Can also be…', exact: true }).click()
  const linking = page.getByRole('dialog', { name: 'What else can these Necron Warriors models be?' })
  await linking.getByLabel('Search this army’s datasheets').fill('immortals')
  await linking.getByRole('checkbox', { name: 'Immortals', exact: true }).check()
  await linking.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.locator('[data-counts-as]')).toContainText('Can also be Immortals')

  const dialog = page.getByRole('dialog', { name: 'Your Necron Warriors', exact: true })
  await retryUntilVisible(dialog, () => card.getByRole('button', { name: 'Add photos of your Necron Warriors', exact: true }).click())
  const immortals = dialog.getByRole('region', { name: 'Immortals', exact: true })
  await immortals.getByLabel('Choose photos of your Immortals').setInputFiles(png('immortals.png'))
  await loaded(immortals.getByRole('button', { name: 'Your photo 1 of Immortals', exact: true }).locator('img'))
  await expect(
    dialog.getByRole('region', { name: 'Necron Warriors', exact: true }).getByRole('button', { name: /^Your photo/ }),
  ).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('build-photos-dialog.png') })
  await page.keyboard.press('Escape')

  await page.goto('/factions/necrons/datasheets/immortals')
  const gallery = page.locator('[data-datasheet-photos]')
  await expect(gallery.getByRole('button', { name: `Immortals from ${player}’s collection`, exact: true })).toBeVisible()
  await gallery.getByLabel('Choose photos of your Immortals').setInputFiles(png('second.png'))
  await expect(gallery.getByRole('button', { name: `Immortals from ${player}’s collection`, exact: true })).toHaveCount(2)
  await page.goto('/collection')
  await expect(page.locator('[data-unit]')).toHaveCount(1)
  await expect(card.getByRole('button', { name: 'Photos of your Necron Warriors', exact: true })).toHaveText('2')

  await card.getByRole('button', { name: 'Actions for Necron Warriors', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Can also be…', exact: true }).click()
  await linking.getByRole('checkbox', { name: 'Immortals', exact: true }).uncheck()
  await linking.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.locator('[data-counts-as]')).toHaveCount(0)
  await card.getByRole('button', { name: 'Photos of your Necron Warriors', exact: true }).click()
  const unlinked = dialog.getByRole('region', { name: 'Immortals', exact: true })
  await expect(unlinked.getByRole('button', { name: /^Your photo \d of Immortals$/ })).toHaveCount(2)
  await expect(unlinked.getByLabel('Choose photos of your Immortals')).toHaveCount(0)
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
  await expect(page.locator('[data-wish-suggestion]')).toHaveCount(6)
  await expect(suggestion).toContainText(/In \d+ of \d+ recent public Necrons rosters?/)
  await expect(page.locator('[data-wish-suggestion="Necron Warriors"]')).toHaveCount(0)
  await addDatasheet(page, 'Immortals', 'Necrons')
  await expect(suggestion).toBeHidden()
  await expect(page.locator('[data-wish-suggestion]')).toHaveCount(6)
  await expectWorkSynced(page)
  await page.reload()
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await expect(suggestion).toBeHidden()
  await page.screenshot({ path: test.info().outputPath('owned-wishlist-desktop.png'), fullPage: true })
  await page.setViewportSize(PHONE)
  await expect(suggestion).toBeHidden()
  await expectNoHorizontalOverflow(page.locator('main'))
  await page.screenshot({ path: test.info().outputPath('owned-wishlist-phone.png'), fullPage: true })
  await removeFromCollection(page, 'Immortals')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(suggestion).toBeVisible()
  await suggestion.getByRole('button', { name: 'Add Immortals to your wishlist', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Immortals models wanted', exact: true })).toHaveValue('1')
  await expect(suggestion).toBeHidden()
  await addDatasheet(page, 'Immortals', 'Necrons')
  await expect(page.getByRole('spinbutton', { name: 'Immortals models wanted', exact: true })).toHaveValue('1')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expectNoHorizontalOverflow(page.locator('main'))
    await expect(page.locator('[data-wish-suggestion]')).toHaveCount(6)
    await page.locator('[aria-labelledby="wishlist-heading"]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`wishlist-${width}.png`), fullPage: true })
  }
  await page.addStyleTag({ content: 'html { font-size: 200% }' })
  await expectNoHorizontalOverflow(page.locator('main'))
  await page.getByRole('button', { name: 'More wanted Immortals models', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Immortals models wanted', exact: true })).toHaveValue('2')
})

test('an army whose every roster is archived keeps its collection but leaves the wishlist suggestions', async ({ page }) => {
  const { id, userId, operator } = await savedArmy(page, 'Archived wishlist', { name: 'Retired Necrons' })
  await operator.setRosterArchived(id, userId, true, Date.now())
  await operator.addToCollection({ userId, entryId: '821d-665-499f-e895', now: Date.now() })
  await page.goto('/collection', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await expect(page.locator('[data-wish-suggestion]')).toHaveCount(0)
})
