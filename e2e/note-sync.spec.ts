import { expect, test, type Page } from './test'
import type { LocalState } from '../src/contracts/localState'
import { createRoster, signUp, uniqueName, addUnit } from './account'
import { NATIVE_LOCAL_STATE_SCRIPT } from './native.harness'
import { productOperator, savedWork, lastPathSegment, expectWorkSynced } from './storage'
import { closePicker } from './builder.harness'

const UNIT = 'Immortals'
const NOTE = 'Hold the home objective'
const WAITING = /\d+ changes? waiting to sync/

const noteField = (page: Page) => page.getByRole('region', { name: 'Note' }).getByRole('textbox', { name: 'Note', exact: true })

/** The work the emulated shell holds for the signed-in account. */
const nativeWork = (page: Page) =>
  page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([key]) => key.startsWith('e2e-native-local-state:'))
    return entry ? (JSON.parse(entry[1]) as { state: LocalState | null }).state : null
  })

async function rosterWithUnit(page: Page, work: (page: Page) => Promise<LocalState | null> = savedWork) {
  await signUp(page, uniqueName('Note sync'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Noted dynasty' })
  await addUnit(page, UNIT)
  await closePicker(page)
  await expectWorkSynced(page, { timeout: 30_000, work })
}

async function openUnit(page: Page) {
  await page.locator(`[data-unit="${UNIT}"]`).getByRole('button', { name: UNIT, exact: true }).click()
}

async function backToRoster(page: Page) {
  const back = page.getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
}

/** Another open screen of the same account, part way through sending the saved work: it holds the claim and its lock. */
async function syncElsewhere(page: Page, other: Page) {
  const otherHolder = await other.evaluate(() => {
    const id = crypto.randomUUID()
    void navigator.locks.request(`praetorium-sync:${id}`, () => new Promise(() => {}))
    return id
  })
  await page.evaluate(
    (holder) =>
      new Promise<void>((resolve, reject) => {
        const opened = indexedDB.open('praetorium-work')
        opened.onerror = () => reject(opened.error)
        opened.onsuccess = () => {
          const database = opened.result
          const transaction = database.transaction('state', 'readwrite')
          transaction.objectStore('state').openCursor().onsuccess = (event) => {
            const entry = (event.target as IDBRequest<IDBCursorWithValue | null>).result
            if (!entry) return
            const value = entry.value as { state: object | null }
            if (value.state) entry.update({ ...value, state: { ...value.state, syncLease: { holder, expiresAt: Date.now() + 60_000 } } })
            entry.continue()
          }
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => reject(transaction.error)
        }
      }),
    otherHolder,
  )
}

async function savedNote(id: string) {
  const row = await (await productOperator()).roster(id)
  return (JSON.parse(row!.picks) as { note?: string }[])[0]?.note
}

for (const width of [390, 1440]) {
  test(`a note typed in the native app syncs and survives reopening (${width})`, async ({ browser }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    await context.addInitScript({ content: NATIVE_LOCAL_STATE_SCRIPT })
    const page = await context.newPage()
    await rosterWithUnit(page, nativeWork)
    const id = lastPathSegment(page.url())
    await expect(page.locator('html')).toHaveAttribute('data-native-app', 'true')

    await openUnit(page)
    await noteField(page).pressSequentially(NOTE, { delay: 60 })
    await expect.poll(() => savedNote(id), { timeout: 30_000 }).toBe(NOTE)
    await expectWorkSynced(page, { work: nativeWork })
    await expect(page.getByText(WAITING)).toHaveCount(0)

    await page.reload()
    await backToRoster(page)
    await expect(page.locator(`[data-unit="${UNIT}"]`)).toContainText(NOTE)
    await context.close()
  })

  test(`a note edit waiting while another screen syncs can be discarded (${width})`, async ({ browser }) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    await rosterWithUnit(page)
    const id = lastPathSegment(page.url())
    await openUnit(page)
    await expect(noteField(page)).toBeVisible()
    const other = await context.newPage()
    await other.goto('/robots.txt')
    await context.setOffline(true)
    await noteField(page).fill(NOTE)
    await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)
    await syncElsewhere(page, other)
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await backToRoster(page)

    await expect(page.getByText(WAITING)).toBeVisible()
    await page.getByRole('button', { name: 'Details' }).click()
    await page.getByRole('dialog', { name: 'Saved changes' }).getByRole('button', { name: 'Discard all saved changes' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Discard saved changes?' })
    await confirm.getByRole('button', { name: 'Discard changes' }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByRole('dialog', { name: 'Saved changes' })).toBeHidden()
    await expect(page.getByText(WAITING)).toHaveCount(0)
    expect((await savedWork(page))?.operations).toEqual([])
    await expect(page.locator(`[data-unit="${UNIT}"]`)).not.toContainText(NOTE)
    expect(await savedNote(id)).toBeUndefined()
    await page.screenshot({ path: test.info().outputPath(`discarded-note-${width}.png`) })
    await context.close()
  })
}
