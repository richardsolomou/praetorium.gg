import { waitForOfflineApp } from './offline'
import { expect, test, type Page } from './test'
import {
  befriend,
  createBattle,
  createRoster,
  confirmRosterSetup,
  signUp,
  uniqueName,
  setupStep,
  retryUntilVisible,
  attachRoster,
  startBattle,
  advance,
  openRosterSetup,
  practiceBattle,
  chooseFaction,
  visitorSetup,
  signOut,
  chooseRulesVersion,
  PHONE,
  savedArmy,
} from './account'
import { battleLog, productOperator, savedWork, lastPathSegment, expectWorkSynced } from './storage'
import { chooseCombatUnit } from './combat'
import type { LocalState } from '../src/contracts/localState'

test.use({ actionTimeout: 15_000 })

/** Opens and closes the New battle dialog once online, so its code is cached before the device goes offline. */
async function warmBattleDialog(page: Page) {
  await page.goto('/battles')
  await retryUntilVisible(page.getByRole('combobox', { name: 'Opponent', exact: true }), () =>
    page.getByRole('button', { name: 'New battle' }).click(),
  )
  await page.keyboard.press('Escape')
}

test('simulation and loadout optimization work in a cold offline application', async ({ page, context }) => {
  test.setTimeout(240_000)
  await page.goto('/simulator')
  await waitForOfflineApp(page)
  await context.setOffline(true)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/simulator')
  await expect.poll(() => reopened.evaluate(() => Boolean(window.PraetoriumOffline?.download.reference.parts['combat-units']))).toBe(true)
  await chooseCombatUnit(reopened, 'Attacker', 'Dark Angels', 'Deathwing Knights')
  await chooseCombatUnit(reopened, 'Defender', 'Death Guard', 'Mortarion')
  const attacker = reopened.getByRole('region', { name: 'Attacker', exact: true })
  await expect(reopened.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1)).toHaveText('5.55')
  await expect(reopened.getByRole('region', { name: 'Melee results' }).getByRole('alert')).toHaveCount(0)
  await attacker.getByRole('button', { name: 'Optimize', exact: true }).click()
  await expect(attacker.getByRole('button', { name: 'Optimize', exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(attacker.getByRole('button', { name: 'Optimize', exact: true })).toBeEnabled()
  await expect(reopened.getByRole('region', { name: 'Combined estimate' }).locator('.readout').nth(1)).toHaveText('6.00')
})

test('online saves only show sync status when the queue remains pending', async ({ page }) => {
  await signUp(page, uniqueName('Quiet sync'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Original list' })
  await expectWorkSynced(page)
  for (const slow of [false, true]) {
    const name = `${slow ? 'Slow' : 'Quick'} save`
    const { promise: pending, resolve: release } = Promise.withResolvers<void>()
    await page.route('**/_serverFn/**', async (route) => {
      const body = route.request().postData() ?? ''
      if (body.includes(name) && body.includes('operationId')) await pending
      await route.continue()
    })
    await page.evaluate(() => {
      const banner = () => [...document.querySelectorAll('output')].some((element) => /waiting to sync/.test(element.textContent ?? ''))
      const observation = { seen: banner(), observer: new MutationObserver(() => (observation.seen ||= banner())) }
      observation.observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      Object.assign(window, { syncObservation: observation })
    })
    const before = await page.locator('[data-roster-builder]').boundingBox()
    try {
      await page.getByLabel('List name').fill(name)
      await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
      if (slow) {
        await page.waitForTimeout(5_000)
        await expect(page.getByText('1 change waiting to sync', { exact: true })).toHaveCount(0)
        await expect(page.getByText('1 change waiting to sync', { exact: true })).toBeVisible()
      } else {
        await page.waitForTimeout(150)
        expect(await page.locator('[data-roster-builder]').boundingBox()).toEqual(before)
      }
    } finally {
      release()
    }
    await expectWorkSynced(page)
    await expect(page.getByText('1 change waiting to sync', { exact: true })).toHaveCount(0)
    const seen = await page.evaluate(() => {
      const observation = (window as unknown as { syncObservation: { seen: boolean; observer: MutationObserver } }).syncObservation
      observation.observer.disconnect()
      return observation.seen
    })
    expect(seen).toBe(slow)
    await page.unroute('**/_serverFn/**')
  }
})

test('offline roster edits survive a cold reopen and sync after reconnecting', async ({ page, context }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Plane army'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Before flight' })
  const url = page.url()
  const id = lastPathSegment(url)
  const operator = await productOperator()
  await waitForOfflineApp(page)
  await expectWorkSynced(page)
  await context.setOffline(true)
  await page.getByLabel('List name').fill('Edited on the plane')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await expect.poll(async () => ((await savedWork(page))?.documents[`roster:${id}`]?.data as { picks?: unknown[] })?.picks?.length).toBe(1)
  await expect(page.getByText('1 change waiting to sync', { exact: true })).toBeVisible()
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto(url)
  await expect(reopened.getByLabel('List name')).toHaveValue('Edited on the plane')
  await expect(reopened.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await reopened.setViewportSize(PHONE)
  expect(await operator.roster(id).then((row) => row?.name)).toBe('Before flight')
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await operator.roster(id))?.name, { timeout: 30_000 }).toBe('Edited on the plane')
  await expectWorkSynced(reopened)
  expect(JSON.parse((await operator.roster(id))!.picks)).toHaveLength(1)
  await reopened.reload()
  await expect(reopened.getByLabel('List name')).toHaveValue('Edited on the plane')
})

test('a roster still waiting to sync opens in a new tab and a missing one shows not found', async ({ page, context }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Unsynced tab'))
  await context.route('**/_serverFn/**', (route) =>
    (route.request().postData() ?? '').includes('operationId') ? route.abort() : route.continue(),
  )
  const dialog = await visitorSetup(page)
  await chooseFaction(dialog, 'Necrons')
  await dialog.getByRole('button', { name: /^Select Awakened Dynasty$/ }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  const id = lastPathSegment(page.url())
  const name = await page.getByLabel('List name').inputValue()
  expect(await (await productOperator()).roster(id)).toBeFalsy()
  const tab = await context.newPage()
  await tab.goto(`/rosters/${id}`)
  await expect(tab.getByLabel('List name')).toHaveValue(name)
  await tab.goto(`/rosters/${crypto.randomUUID()}`)
  await expect(tab.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
})

test('a lost save response retains its identity and later edits sync in order', async ({ page, context }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Intermittent connection'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Original army' })
  const id = lastPathSegment(page.url())
  const operator = await productOperator()
  await waitForOfflineApp(page)
  await expectWorkSynced(page)
  // Going offline while the response is still held would fail the request before the handler drops it.
  const { promise: acknowledgementDropped, resolve: dropAcknowledgement } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('Lost acknowledgement') && body.includes('operationId')) {
      await route.fetch()
      await route.abort()
      dropAcknowledgement()
    } else await route.continue()
  })
  await page.getByLabel('List name').fill('Lost acknowledgement')
  await acknowledgementDropped
  await expect.poll(async () => (await operator.roster(id))?.name).toBe('Lost acknowledgement')
  await context.setOffline(true)
  await expect.poll(async () => (await savedWork(page))?.operations[0]?.attempted).toBe(true)
  const identity = (await savedWork(page))!.operations[0].id
  await page.getByLabel('List name').fill('Latest offline edit')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(2)
  expect((await savedWork(page))?.operations[0]?.id).toBe(identity)
  await page.unroute('**/_serverFn/**')
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await operator.roster(id))?.name, { timeout: 30_000 }).toBe('Latest offline edit')
  await expectWorkSynced(page)
})

test('an offline practice battle and its commands survive reopening and sync together', async ({ page, context }) => {
  test.setTimeout(240_000)
  const { id: rosterId, operator } = await savedArmy(page, 'Offline battle', { name: 'Flight army' })
  await page.goto('/rosters')
  await page.reload()
  await expect(page.locator('[data-roster="Flight army"]')).toBeVisible()
  await page.goto(`/rosters/${rosterId}`)
  await expect(page.getByLabel('List name')).toHaveValue('Flight army')
  await warmBattleDialog(page)
  await waitForOfflineApp(page)
  await expectWorkSynced(page)
  await context.setOffline(true)
  const url = await practiceBattle(page, 'Flight army')
  const token = lastPathSegment(url)
  await startBattle(page)
  await advance(page)
  await expect(page.getByRole('heading', { name: 'movement phase' })).toBeVisible()
  await expect
    .poll(async () => (await savedWork(page))?.operations.filter((operation) => operation.resource === `battle:${token}`).length)
    .toBeGreaterThanOrEqual(2)
  const history = (
    (await savedWork(page))!.documents[`battle:${token}`].data as {
      log: { seq: number; operationId?: string; command: { kind: string; limit?: number } }[]
    }
  ).log
  expect(history.at(-1)?.operationId).toBeTruthy()
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto(url)
  await expect(reopened.getByRole('heading', { name: 'movement phase' })).toBeVisible()
  await expect(reopened.getByRole('button', { name: 'Open Flight army' }).first()).toBeVisible()
  expect(await operator.battleByToken(token)).toBeUndefined()
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expectWorkSynced(reopened, { timeout: 30_000 })
  const synced = await operator.battleByToken(token)
  expect(synced?.log.at(-1)?.operationId).toBe(history.at(-1)?.operationId)
  expect(synced?.log.find((entry) => entry.command.kind === 'attach-roster')?.command).toMatchObject({
    kind: 'attach-roster',
    roster: { id: rosterId, name: 'Flight army' },
  })
})

test('a guest battle created offline keeps the guest’s seat when it syncs', async ({ page, context }) => {
  test.setTimeout(240_000)
  const { operator } = await savedArmy(page, 'Offline guest host', { name: 'Guest army' })
  await warmBattleDialog(page)
  await waitForOfflineApp(page)
  await expectWorkSynced(page)
  await context.setOffline(true)
  const token = lastPathSegment(await createBattle(page, { guest: 'Offline Guest' }))
  await attachRoster(page, 'Guest army', { forPlayer: 'Offline Guest' })
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expectWorkSynced(page, { timeout: 30_000 })
  const synced = (await operator.battleByToken(token))!
  const guest = synced.seats.find((seat) => seat.guestName === 'Offline Guest')
  expect(synced.log.find((entry) => entry.command.kind === 'attach-roster')?.command).toMatchObject({ playerId: guest?.id })
})

test('a battle link opened before its offline creation syncs opens once the battle arrives', async ({ page, context, browser }) => {
  test.setTimeout(240_000)
  const opponentName = uniqueName('Early opponent')
  const opponent = await (await browser.newContext()).newPage()
  await signUp(opponent, opponentName)
  await signUp(page, uniqueName('Offline host'))
  await befriend(page, opponent)
  await warmBattleDialog(page)
  await waitForOfflineApp(page)
  await expectWorkSynced(page)
  await context.setOffline(true)
  const url = await createBattle(page, { opponent: opponentName })
  const token = lastPathSegment(url)
  expect(await (await productOperator()).battleByToken(token)).toBeUndefined()

  await opponent.goto(url)
  await expect(opponent.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expectWorkSynced(page, { timeout: 30_000 })
  // The link the opponent already opened finds the battle without a reload.
  await expect(opponent.getByRole('heading', { name: 'Set up the battle' })).toBeVisible({ timeout: 30_000 })
  await setupStep(opponent, 'Armies')
})

test('a battle conflict awaiting review does not stop connected play', async ({ page, context }) => {
  test.setTimeout(240_000)
  const { operator } = await savedArmy(page, 'Battle conflict', { name: 'Flight army' })
  const token = lastPathSegment(await practiceBattle(page, 'Flight army'))
  await startBattle(page)
  await waitForOfflineApp(page)
  const otherDevice = await battleLog(page)
  await context.setOffline(true)
  await advance(page)
  await expect
    .poll(async () => (await savedWork(page))?.operations.filter((operation) => operation.resource === `battle:${token}`).length)
    .toBe(1)
  await otherDevice.append(otherDevice.first, { kind: 'advance' })
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('Review saved changes', { exact: true })).toBeVisible({ timeout: 30_000 })
  const before = (await operator.battleByToken(token))!.log.length
  await advance(page)
  await expect(page.getByRole('heading', { name: 'shooting phase' })).toBeVisible()
  expect((await operator.battleByToken(token))!.log.length).toBe(before + 1)
})

test('conflicting roster edits stay saved and export before choosing the server version', async ({ page, context }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Offline conflict'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Original list' })
  const id = lastPathSegment(page.url())
  const operator = await productOperator()
  await waitForOfflineApp(page)
  await expectWorkSynced(page)
  await context.setOffline(true)
  await page.getByLabel('List name').fill('Plane edit')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
  await signOut(page)
  await expect(page.getByRole('dialog', { name: 'Saved changes', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Account menu for/ }).first()).toBeVisible()
  expect((await savedWork(page))?.operations.length).toBe(1)
  const original = (await operator.roster(id))!
  await operator.saveRoster({ ...original, name: 'Other device edit', automaticName: false, now: Date.now() + 1 })
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('Review saved changes', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('List name')).toHaveValue('Plane edit')
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Saved changes', exact: true })
  await dialog.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText(
    'Some saved changes need review. Choose how to keep or discard them below before they can sync.',
  )
  await page.setViewportSize(PHONE)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export saved changes' }).click()
  const file = await download
  const stream = await file.createReadStream()
  const buffers: Buffer[] = []
  for await (const chunk of stream) buffers.push(Buffer.from(chunk))
  const exported = JSON.parse(Buffer.concat(buffers).toString()) as LocalState
  expect((exported.documents[`roster:${id}`].data as { name: string }).name).toBe('Plane edit')
  expect(exported.operations[0].status).toBe('conflict')
  await dialog.getByRole('button', { name: 'Use server version' }).click()
  await page
    .getByRole('alertdialog', { name: 'Discard saved changes?' })
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click()
  await expectWorkSynced(page)
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByLabel('List name')).toHaveValue('Other device edit')
})

test('a roster on another rules version saves that version for offline edits', async ({ page, context, request }) => {
  test.setTimeout(300_000)
  const { construction } = await (await request.get('/offline-reference-version.json')).json()
  await signUp(page, uniqueName('Older rules'))
  await createRoster(page, { faction: 'Adeptus Custodes', detachment: /Aquilan Shield/, name: 'Archived army' })
  await waitForOfflineApp(page)
  // A device without rosters on other versions saves construction data for the current rules alone.
  expect(await page.evaluate(() => window.PraetoriumReferenceCache?.version === 2 && window.PraetoriumReferenceCache.editions)).toEqual([])
  const dialog = await openRosterSetup(page)
  await chooseRulesVersion(dialog, 'MFM 1.5 · Archived', 'Shield Host')
  await confirmRosterSetup(dialog)
  await expect(page.locator('[data-rules-version]')).toHaveAttribute('aria-label', 'Rules version: MFM 1.5 · Archived')
  // Saving the roster names its rules version, which the device then saves construction data for alone.
  await expect
    .poll(() => page.evaluate(() => window.PraetoriumReferenceCache?.version === 2 && window.PraetoriumReferenceCache.editions.length), {
      timeout: 180_000,
    })
    .toBe(1)
  const [edition] = await page.evaluate(() =>
    window.PraetoriumReferenceCache?.version === 2 ? window.PraetoriumReferenceCache.editions : [],
  )
  expect(Object.keys(construction.editions)).toContain(edition)
  await context.setOffline(true)
  await page.getByLabel('Add a unit').fill('Allarus Custodians')
  await page.getByRole('button', { name: 'Add Allarus Custodians', exact: true }).first().click()
  await expect(page.locator('[data-unit="Allarus Custodians"]')).toHaveCount(1)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
})
