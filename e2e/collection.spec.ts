import { expect, test, type Page } from '@playwright/test'
import { createRoster, signUp, uniqueName } from './account'
import { add, expectNoHorizontalOverflow } from './builder.harness'
import { productOperator } from './storage'
import type { LocalState } from '../src/contracts/localState'
import { offlineContext } from '../src/server/offlineContext'

async function openCollection(page: Page) {
  await page.getByRole('button', { name: 'Roster actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Physical collection', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Physical collection', exact: true })
  await expect(dialog.getByRole('region', { name: 'Roster stock requirements' })).toBeVisible()
  return dialog
}

test('counts saved zero, one and multiple models against two simultaneous roster units', async ({ page }) => {
  await signUp(page, uniqueName('Physical stock'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await add(page, 'Overlord')
  await add(page, 'Overlord')
  await page.getByRole('button', { name: 'Add Overlord to your collection', exact: true }).click()
  const dialog = await openCollection(page)
  await expect(dialog.getByText(/Previously marked ownership has no recorded quantity/)).toBeVisible()
  await expect(dialog.getByText('Needed 2 · Recorded 0 · Unaccounted 2', { exact: true })).toBeVisible()
  await dialog
    .getByRole('button', { name: /^Record stock for / })
    .first()
    .click()
  const editor = dialog.getByRole('form').first()
  await editor.getByLabel('Stock name', { exact: true }).fill('Shared Overlords')
  for (const models of [0, 1, 2]) {
    await dialog.getByLabel('Physical model count', { exact: true }).fill(String(models))
    await dialog.getByRole('button', { name: 'Save stock', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Save stock', exact: true })).toBeEnabled()
    await expect(dialog.getByText(`Needed 2 · Recorded ${models} · Unaccounted ${2 - models}`, { exact: true })).toBeVisible()
  }
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await expect(dialog.getByRole('button', { name: 'Save stock', exact: true })).toBeEnabled()
  await page.screenshot({ path: test.info().outputPath('collection-desktop.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(dialog)
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= -1 && bounds.right <= innerWidth + 1
      }),
    )
    .toBe(true)
  await page.screenshot({ path: test.info().outputPath('collection-phone.png'), animations: 'disabled' })
  await page.reload()
  const reloaded = await openCollection(page)
  await expect(reloaded.getByLabel('Physical model count', { exact: true })).toHaveValue('2')
  await expect(reloaded.getByText('Needed 2 · Recorded 2 · Unaccounted 0', { exact: true })).toBeVisible()
})

test('keeps physical inventory scoped and rejects concurrent server writes', async () => {
  const operator = await productOperator()
  const userId = crypto.randomUUID()
  const stock = {
    id: crypto.randomUUID(),
    name: 'Physical models',
    models: 1,
    builds: Array.from({ length: 16 }, (_, index) => String(index).padEnd(2048, 'a')),
  }
  const savedAction = { id: crypto.randomUUID(), owner: userId, fingerprint: 'a'.repeat(64), createdAt: Date.now(), identifiers: {} }
  const insert = () =>
    offlineContext.run({ ...savedAction, wrote: false }, () =>
      operator.updateCollectionLot(userId, { lot: stock, expected: null, remove: false }),
    )
  await expect(insert()).resolves.toBe(true)
  await expect(insert()).resolves.toBe(true)
  await expect(operator.collectionStock('another-user')).resolves.toEqual([])
  await expect(operator.updateCollectionLot(userId, { lot: { ...stock, models: 2 }, expected: stock, remove: false })).resolves.toBe(true)
  await expect(operator.updateCollectionLot(userId, { lot: { ...stock, models: 3 }, expected: stock, remove: false })).resolves.toBe(false)
  await expect(operator.collectionStock(userId)).resolves.toEqual([{ ...stock, models: 2 }])
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

test('physical stock edits survive a cold offline reopen and reconnect', async ({ page, context }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Offline physical stock'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await add(page, 'Overlord')
  const url = page.url()
  const dialog = await openCollection(page)
  await dialog
    .getByRole('button', { name: /^Record stock for / })
    .first()
    .click()
  await dialog.getByLabel('Physical model count', { exact: true }).fill('1')
  await dialog.getByRole('button', { name: 'Save stock', exact: true }).click()
  await expect(dialog.getByText('Needed 1 · Recorded 1 · Unaccounted 0', { exact: true })).toBeVisible()
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
  await expect.poll(async () => (await operator.collectionStock(owner))[0]?.models).toBe(1)
  await context.setOffline(true)
  await dialog.getByLabel('Physical model count', { exact: true }).fill('2')
  await dialog.getByRole('button', { name: 'Save stock', exact: true }).click()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
  await expect(dialog.getByLabel('Physical model count', { exact: true })).toHaveValue('2')
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto(url)
  const cold = await openCollection(reopened)
  await expect(cold.getByLabel('Physical model count', { exact: true })).toHaveValue('2')
  expect((await operator.collectionStock(owner))[0]?.models).toBe(1)
  await reopened.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      cold.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= -1 && bounds.right <= innerWidth + 1
      }),
    )
    .toBe(true)
  await reopened.screenshot({ path: test.info().outputPath('collection-offline-phone.png'), animations: 'disabled' })
  await context.setOffline(false)
  await reopened.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await operator.collectionStock(owner))[0]?.models, { timeout: 30_000 }).toBe(2)
  await expect.poll(async () => (await savedWork(reopened))?.operations.length).toBe(0)
  await reopened.reload()
  const reloaded = await openCollection(reopened)
  await expect(reloaded.getByLabel('Physical model count', { exact: true })).toHaveValue('2')
})
