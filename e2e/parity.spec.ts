import { expect, test, type Page } from './test'
import {
  chooseRosterDefault,
  createRoster,
  signUp,
  uniqueName,
  expectNoPageOverflow,
  openRosterSetup,
  setRosterAccess,
  visitorSetup,
  recordSaves,
  chooseLibraryAction,
  openLibraryShare,
  openRosterShare,
  PHONE,
} from './account'
import { savedWork } from './storage'

/** Turns the open page into a native shell that can share, recording the last message it is sent on the root element. */
const offerNativeShare = (page: Page) =>
  page.evaluate(() => {
    window.PraetoriumNative = { bridgeVersion: 3, capabilities: ['share'] }
    window.ReactNativeWebView = {
      postMessage: (message) => document.documentElement.setAttribute('data-native-message', message),
    }
    window.dispatchEvent(new CustomEvent('praetorium-native-capabilities'))
  })

test('roster visibility controls search indexing and public URL variants', async ({ page }) => {
  await signUp(page, uniqueName('Search roster'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Search roster' })
  const path = new URL(page.url()).pathname

  await setRosterAccess(page, 'Unlisted — anyone with the link', 'unlisted')
  await page.reload()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')

  await setRosterAccess(page, 'Public — listed on your profile', 'public')
  await page.goto(`${path}?print=true`)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(path, page.url()).href)
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('a private roster can be shared and made private again', async ({ browser }) => {
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await signUp(page, uniqueName('Sharer'))
  await page.goto('/profile')
  await expect(page.getByRole('group', { name: 'Roster visibility' }).getByRole('button', { name: /^Public/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await chooseRosterDefault(page, 'Private')
  await page.setViewportSize({ width: 390, height: 900 })
  const creation = await visitorSetup(page)
  await expect(creation.getByRole('combobox', { name: 'Access' }).locator('[data-slot="select-value"]')).toHaveText('Private')
  await expect(creation).toContainText('You, friends you lend it to, and seated players through a battle using this list')
  await creation.locator('#setup-visibility-reach').scrollIntoViewIfNeeded()
  await expect(creation.locator('#setup-visibility-reach')).toBeInViewport()
  await creation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Shareable roster' })
  const privateSetup = await openRosterSetup(page)
  await expect(privateSetup.getByRole('combobox', { name: 'Access' }).locator('[data-slot="select-value"]')).toHaveText('Private')
  await expect(privateSetup).toContainText('You, friends you lend it to, and seated players through a battle using this list')
  await page.setViewportSize({ width: 390, height: 900 })
  await privateSetup.locator('#setup-visibility-reach').scrollIntoViewIfNeeded()
  await expect(privateSetup.locator('#setup-visibility-reach')).toBeInViewport()
  await page.setViewportSize({ width: 1440, height: 900 })
  await privateSetup.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: 'Awakened Dynasty', exact: true }).click()
  await page.getByRole('button', { name: 'Start a roster', exact: true }).click()
  const referenceSetup = page.getByRole('dialog', { name: 'Create roster' })
  await expect(referenceSetup.getByRole('combobox', { name: 'Access' }).locator('[data-slot="select-value"]')).toHaveText('Private')
  await expect(referenceSetup).toContainText('You, friends you lend it to, and seated players through a battle using this list')
  await page.setViewportSize({ width: 390, height: 900 })
  await referenceSetup.locator('#setup-visibility-reach').scrollIntoViewIfNeeded()
  await expect(referenceSetup.locator('#setup-visibility-reach')).toBeInViewport()
  await page.setViewportSize({ width: 1440, height: 900 })
  await referenceSetup.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.goto('/profile')
  const privateDefault = page.getByRole('group', { name: 'Roster visibility' }).getByRole('button', { name: /^Private/ })
  await expect(privateDefault).toContainText('You, friends you lend it to, and seated players through a battle using this list')
  await expect(privateDefault).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/rosters')

  // Scoped to the row, because 'Unlisted' and 'Private' also appear in the menu
  // items that change them and would otherwise match before the change lands, and
  // to the visible label, because a phone reads it in the row's details line instead.
  const row = page.locator('[data-roster="Shareable roster"]')

  await page.setViewportSize({ width: 390, height: 900 })
  await chooseLibraryAction(page, 'Shareable roster', 'Edit roster setup')
  const librarySetup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await expect(librarySetup.getByRole('combobox', { name: 'Access' }).locator('[data-slot="select-value"]')).toHaveText('Private')
  await expect(librarySetup).toContainText('You, friends you lend it to, and seated players through a battle using this list')
  await librarySetup.locator('#setup-visibility-reach').scrollIntoViewIfNeeded()
  await expect(librarySetup.locator('#setup-visibility-reach')).toBeInViewport()
  await librarySetup.getByRole('button', { name: 'Cancel', exact: true }).click()
  // Both the right-click and overflow menus reach the same share dialog, which fits a phone.
  for (const menu of ['context', 'overflow']) {
    if (menu === 'context') await row.click({ button: 'right' })
    else await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
    await page.getByRole('menuitem', { name: /^Share…/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Share Shareable roster' })
    await expect(dialog.getByRole('radio', { name: /^Private/ })).toBeChecked()
    await expect(dialog).toContainText('Copying it makes the roster unlisted.')
    await expect(dialog.getByRole('button', { name: 'Make unlisted and copy', exact: true })).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  const share = await openLibraryShare(page, 'Shareable roster')
  await share.getByRole('button', { name: 'Make unlisted and copy', exact: true }).click()
  await expect(share.getByRole('radio', { name: /^Unlisted/ })).toBeChecked()
  await expect(row.getByText('Unlisted').filter({ visible: true })).toBeVisible()
  // Polled, because the link is copied only once the visibility change comes back.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/rosters\/[^/]+$/)
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText())

  await page.setViewportSize(PHONE)
  await page.goto(sharedUrl)
  await expect((await openRosterShare(page)).getByRole('button', { name: 'Copy link', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await offerNativeShare(page)
  const rosterShare = (await openRosterShare(page)).getByRole('button', { name: 'Share link', exact: true })
  await expect(rosterShare).toBeEnabled()
  await rosterShare.click()
  await expect
    .poll(() => page.locator('html').getAttribute('data-native-message'))
    .toBe(JSON.stringify({ version: 3, type: 'native-share', url: sharedUrl, title: 'Shareable roster' }))

  const anonymous = await (await browser.newContext()).newPage()
  await anonymous.goto(sharedUrl)
  await expect(anonymous.getByRole('textbox', { name: 'List name' })).toHaveValue('Shareable roster')
  const previewPath = `/api/previews${new URL(sharedUrl).pathname}`
  const preview = await anonymous.request.get(previewPath)
  expect(preview.status()).toBe(200)
  expect(preview.headers()['cache-control']).toBe('no-store')

  await page.goto('/rosters')
  const unshare = await openLibraryShare(page, 'Shareable roster')
  await unshare.getByText('Private', { exact: true }).click()
  await expect(unshare.getByRole('radio', { name: /^Private/ })).toBeChecked()
  await expect(row.getByText('Private').filter({ visible: true })).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
  expect((await anonymous.request.get(previewPath)).status()).toBe(404)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/privacy')
  await expectNoPageOverflow(page)
})

test('editable detail waits for public access to save before sharing', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signUp(page, uniqueName('Detail sharer'))
  await chooseRosterDefault(page, 'Private')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Detail share' })
  const sharedUrl = page.url()
  const anonymous = await (await browser.newContext()).newPage()
  const previewPath = `/api/previews${new URL(sharedUrl).pathname}`
  await offerNativeShare(page)

  const { promise: saveHeld, resolve: releaseSave } = Promise.withResolvers<void>()
  const { promise: saveStarted, resolve: markSaveStarted } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    const body = route.request().postData()
    if (route.request().method() === 'POST' && body?.includes('"unlisted"') && body.includes('"picks"')) {
      markSaveStarted()
      await saveHeld
    }
    await route.continue()
  })

  const setup = await openRosterSetup(page)
  await setup.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name: 'Unlisted — anyone with the link' }).click()
  await setup.getByRole('button', { name: 'Review changes' }).click()
  const review = page.getByRole('dialog', { name: 'Review roster changes' })
  try {
    await review.getByRole('button', { name: 'Confirm changes' }).click()
    await saveStarted
    await expect(review.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled()
    expect((await anonymous.request.get(previewPath, { timeout: 5000 })).status()).toBe(404)
    expect(await page.locator('html').getAttribute('data-native-message')).toBeNull()
  } finally {
    releaseSave()
  }
  await expect(review).toBeHidden()
  await (await openRosterShare(page)).getByRole('button', { name: 'Share link', exact: true }).click()
  await expect.poll(() => page.locator('html').getAttribute('data-native-message')).toContain('"type":"native-share"')

  await anonymous.goto(sharedUrl)
  await expect(anonymous.getByLabel('List name')).toHaveValue('Detail share')
})

test('copying a saved roster link reports progress beside the header and copies once per click', async ({ page }) => {
  await signUp(page, uniqueName('Status sharer'))
  await chooseRosterDefault(page, 'Unlisted')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Status share' })
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect.poll(async () => (await savedWork(page))?.operations.length ?? 0).toBe(0)
  const saves = recordSaves(page)
  await page.evaluate(() => {
    const copies: string[] = []
    const { promise: held, resolve: releaseCopy } = Promise.withResolvers<void>()
    Object.assign(window, { copies, releaseCopy })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copies.push(text)
          await held
        },
      },
    })
  })

  const dialog = await openRosterShare(page)
  const copy = dialog.getByRole('button', { name: 'Copy link', exact: true })
  await copy.click()
  // A second press while the first copy is held must not copy again.
  await expect(copy).toBeDisabled()
  await page.evaluate(() => (window as unknown as { releaseCopy: () => void }).releaseCopy())

  await expect(dialog.getByRole('button', { name: 'Link copied', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('status').filter({ hasText: 'Link copied.' })).toBeVisible()
  const { origin, pathname } = new URL(page.url())
  expect(await page.evaluate(() => (window as unknown as { copies: string[] }).copies)).toEqual([`${origin}${pathname}`])
  expect(saves).toEqual([])
  await expect(page.getByText('Link copied.')).toBeHidden()
})
