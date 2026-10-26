import { expect, test, type Page } from './test'
import {
  chooseRosterAction,
  chooseRosterDefault,
  createRoster,
  retryUntilVisible,
  signUp,
  uniqueName,
  expectNoPageOverflow,
  openRosterSetup,
  setRosterAccess,
  visitorSetup,
  recordSaves,
  chooseLibraryAction,
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
  for (const menu of ['context', 'overflow']) {
    if (menu === 'context') await row.click({ button: 'right' })
    else await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
    const sharing = page.getByRole('menuitem', { name: /^Make unlisted and copy link/ })
    await expect(sharing).toContainText('Anyone with the link can read this roster.')
    await expect(row.getByText('Private').filter({ visible: true })).toBeVisible()
    expect(
      await sharing.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
      }),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(sharing).toBeHidden()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await chooseLibraryAction(page, 'Shareable roster', /^Make unlisted and copy link/)
  await expect(row.getByText('Unlisted').filter({ visible: true })).toBeVisible()
  // Polled, because the link is copied only once the visibility change comes back.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/rosters\/[^/]+$/)
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText())

  await page.setViewportSize(PHONE)
  await page.goto(sharedUrl)
  await retryUntilVisible(page.getByRole('menuitem', { name: 'Copy link' }), () =>
    page.getByRole('button', { name: 'Roster actions', exact: true }).click(),
  )
  await page.keyboard.press('Escape')
  await offerNativeShare(page)
  await page.getByRole('button', { name: 'Roster actions' }).click()
  const rosterShare = page.getByRole('menuitem', { name: 'Share link' })
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
  await chooseLibraryAction(page, 'Shareable roster', 'Make private')
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
  await chooseRosterAction(page, 'Share link')
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

  await chooseRosterAction(page, 'Copy link')
  await expect(page.getByRole('status').filter({ hasText: 'Copying link…' })).toBeVisible()
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Copy link' })).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await page.evaluate(() => (window as unknown as { releaseCopy: () => void }).releaseCopy())

  await expect(page.getByRole('status').filter({ hasText: 'Link copied.' })).toBeVisible()
  const { origin, pathname } = new URL(page.url())
  expect(await page.evaluate(() => (window as unknown as { copies: string[] }).copies)).toEqual([`${origin}${pathname}`])
  expect(saves).toEqual([])
  await expect(page.getByText('Link copied.')).toBeHidden()
})
