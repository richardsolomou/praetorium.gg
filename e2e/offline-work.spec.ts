import { expect, test, type Page } from '@playwright/test'
import { createBattle, createRoster, signUp, uniqueName, setupStep, retryUntilVisible, attachRoster, startBattle, advance } from './account'
import { productOperator, withAuthSql } from './storage'
import type { LocalState } from '../src/contracts/localState'
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
  await reopened.setViewportSize({ width: 390, height: 844 })
  await reopened.screenshot({ path: test.info().outputPath('offline-simulation-phone.png') })
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
async function waitForOfflineApp(page: Page) {
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
}

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
  await reopened.screenshot({ path: test.info().outputPath('offline-edited-roster-phone.png') })
  expect(await operator.roster(id).then((row) => row?.name)).toBe('Before flight')
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await operator.roster(id))?.name, { timeout: 30_000 }).toBe('Edited on the plane')
  await expect.poll(async () => (await savedWork(reopened))?.operations.length).toBe(0)
  expect(JSON.parse((await operator.roster(id))!.picks)).toHaveLength(1)
  await reopened.reload()
  await expect(reopened.getByLabel('List name')).toHaveValue('Edited on the plane')
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
  await reopened.screenshot({ path: test.info().outputPath('offline-battle.png') })
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

test('concurrent offline favourites survive a cold reopen and reconnect', async ({ page, context }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Offline favourites'))
  await page.goto('/factions')
  await waitForOfflineApp(page)
  const first = page.getByRole('button', { name: 'Add Necrons to favourites', exact: true })
  const second = page.getByRole('button', { name: 'Add Dark Angels to favourites', exact: true })
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const resource = 'query:["favourite-factions"]'
  await expect.poll(async () => (await savedWork(page))?.documents[resource]?.data).toEqual([])
  await context.setOffline(true)
  await page
    .getByRole('button', { name: /^Add (Necrons|Dark Angels) to favourites$/ })
    .evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()))
  await expect.poll(async () => ((await savedWork(page))?.documents[resource]?.data as string[] | undefined)?.length).toBe(2)
  const owner = (await savedWork(page))!.owner
  const operator = await productOperator()
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/factions')
  const favourites = reopened.locator('section').filter({ has: reopened.getByText('Favourites', { exact: true }) })
  await expect(favourites.getByRole('button', { name: 'Remove Necrons from favourites', exact: true })).toBeVisible()
  await expect(favourites.getByRole('button', { name: 'Remove Dark Angels from favourites', exact: true })).toBeVisible()
  await reopened.setViewportSize({ width: 390, height: 844 })
  await reopened.screenshot({ path: test.info().outputPath('offline-favourites-phone.png') })
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await savedWork(reopened))?.operations.length).toBe(0)
  await expect.poll(async () => (await operator.favouriteFactionsByUser(owner)).length).toBe(2)
  await reopened.reload()
  await expect(favourites.getByRole('button', { name: 'Remove Necrons from favourites', exact: true })).toBeVisible()
  await expect(favourites.getByRole('button', { name: 'Remove Dark Angels from favourites', exact: true })).toBeVisible()
})
