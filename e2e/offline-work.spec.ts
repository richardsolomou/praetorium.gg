import { waitForOfflineApp } from './offline'
import { expect, test } from '@playwright/test'
import { createBattle, createRoster, signUp, uniqueName, setupStep, retryUntilVisible, attachRoster, startBattle, advance } from './account'
import { battleLog, productOperator, savedWork, withAuthSql } from './storage'
import { chooseCombatUnit } from './combat'

test.use({ actionTimeout: 15_000 })

test('simulation and loadout optimization work in a cold offline application', async ({ page, context }) => {
  test.setTimeout(240_000)
  await page.goto('/simulator')
  await waitForOfflineApp(page)
  await context.setOffline(true)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/simulator')
  await expect
    .poll(() => reopened.evaluate(() => window.PraetoriumOffline?.queries.some((entry) => entry.key[0] === 'combat-units')))
    .toBe(true)
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
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  for (const slow of [false, true]) {
    const name = `${slow ? 'Slow' : 'Quick'} save`
    let release!: () => void
    const pending = new Promise<void>((resolve) => (release = resolve))
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
    await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
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
  const id = new URL(url).pathname.split('/').at(-1)!
  const operator = await productOperator()
  await waitForOfflineApp(page)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
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
  await reopened.setViewportSize({ width: 390, height: 844 })
  expect(await operator.roster(id).then((row) => row?.name)).toBe('Before flight')
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await operator.roster(id))?.name, { timeout: 30_000 }).toBe('Edited on the plane')
  await expect.poll(async () => (await savedWork(reopened))?.operations.length).toBe(0)
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
  await page.goto('/rosters')
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'Create roster', exact: true }).click())
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await dialog.getByRole('button', { name: /^Select Awakened Dynasty$/ }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  const id = new URL(page.url()).pathname.split('/').at(-1)!
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
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  const operator = await productOperator()
  await waitForOfflineApp(page)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.route('**/_serverFn/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('Lost acknowledgement') && body.includes('operationId')) {
      await route.fetch()
      await route.abort()
    } else await route.continue()
  })
  await page.getByLabel('List name').fill('Lost acknowledgement')
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
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
})

test('an offline practice battle and its commands survive reopening and sync together', async ({ page, context }) => {
  test.setTimeout(240_000)
  const account = await signUp(page, uniqueName('Offline battle'))
  const operator = await productOperator()
  const source = (await operator.roster('preview-necrons-cursed-skyshroud'))!
  const user = (await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ?').get(account.email))) as {
    id: string
  }
  const rosterId = crypto.randomUUID()
  await operator.saveRoster({ ...source, id: rosterId, userId: user.id, name: 'Flight army', automaticName: false, now: Date.now() })
  await page.goto('/rosters')
  await page.reload()
  await expect(page.locator('[data-roster="Flight army"]')).toBeVisible()
  await page.goto(`/rosters/${rosterId}`)
  await expect(page.getByLabel('List name')).toHaveValue('Flight army')
  await page.goto('/battles')
  await retryUntilVisible(page.getByRole('combobox', { name: 'Opponent', exact: true }), () =>
    page.getByRole('button', { name: 'New battle' }).click(),
  )
  await page.keyboard.press('Escape')
  await waitForOfflineApp(page)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await context.setOffline(true)
  const url = await createBattle(page, { practice: true })
  const token = new URL(url).pathname.split('/').at(-1)!
  await setupStep(page, 'Armies')
  const chooser = page.getByRole('button', { name: /^(Choose|Change) roster/ }).first()
  await expect(chooser).toBeVisible({ timeout: 15_000 })
  await chooser.click()
  const dialog = page.getByRole('dialog', { name: /roster$/ })
  await dialog.getByRole('button', { name: /^Flight army\b/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Flight army', { exact: true }).first()).toBeVisible()
  await attachRoster(page, 'Flight army', { forPlayer: 'Practice Opponent' })
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
  await expect.poll(async () => (await savedWork(reopened))?.operations.length, { timeout: 30_000 }).toBe(0)
  const synced = await operator.battleByToken(token)
  expect(synced?.log.at(-1)?.operationId).toBe(history.at(-1)?.operationId)
  expect(synced?.log.find((entry) => entry.command.kind === 'attach-roster')?.command).toMatchObject({
    kind: 'attach-roster',
    roster: { id: rosterId, name: 'Flight army' },
  })
})

test('a battle conflict awaiting review does not stop connected play', async ({ page, context }) => {
  test.setTimeout(240_000)
  const account = await signUp(page, uniqueName('Battle conflict'))
  const operator = await productOperator()
  const source = (await operator.roster('preview-necrons-cursed-skyshroud'))!
  const user = (await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ?').get(account.email))) as {
    id: string
  }
  await operator.saveRoster({
    ...source,
    id: crypto.randomUUID(),
    userId: user.id,
    name: 'Flight army',
    automaticName: false,
    now: Date.now(),
  })
  const url = await createBattle(page, { practice: true })
  const token = new URL(url).pathname.split('/').at(-1)!
  await attachRoster(page, 'Flight army')
  await attachRoster(page, 'Flight army', { forPlayer: 'Practice Opponent' })
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
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  const operator = await productOperator()
  await waitForOfflineApp(page)
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await context.setOffline(true)
  await page.getByLabel('List name').fill('Plane edit')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
  await page
    .getByRole('button', { name: /Account menu for/ })
    .first()
    .click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
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
  await page.setViewportSize({ width: 390, height: 844 })
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
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByLabel('List name')).toHaveValue('Other device edit')
})
