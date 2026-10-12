import { expect, test, type Page } from '@playwright/test'
import { confirmRosterSetup, signUp, uniqueName, waitForRosterSave } from './account'
import { productOperator, withAuthSql } from './storage'
import { expectNoHorizontalOverflow } from './builder.harness'

async function savedArmy(page: Page) {
  const account = await signUp(page, uniqueName('Setup review'))
  const operator = await productOperator()
  const source = (await operator.roster('preview-necrons-cursed-skyshroud'))!
  const user = (await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ?').get(account.email))) as {
    id: string
  }
  const id = crypto.randomUUID()
  await operator.saveRoster({
    ...source,
    id,
    userId: user.id,
    name: 'Reviewed army',
    automaticName: false,
    visibility: 'private',
    now: Date.now(),
  })
  await page.goto(`/rosters/${id}`)
  await expect(page.getByLabel('List name')).toHaveValue('Reviewed army')
  await page.getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Select Mark of the Nekrosor', exact: true }).click())
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).toContainText('Mark of the Nekrosor')
  const back = page.getByRole('button', { name: 'Back to roster', exact: true })
  if (await back.isVisible()) await back.click()
  return { id, operator, source: (await operator.roster(id))! }
}
async function openSetup(page: Page) {
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  return page.getByRole('dialog', { name: 'Edit roster setup' })
}
async function shrink(page: Page) {
  const setup = await openSetup(page)
  await setup.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /King of the Colosseum/ }).click()
  const disposition = setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Purge the Foe', exact: true })
  if (await disposition.isVisible()) await disposition.click()
  await setup.getByRole('button', { name: 'Review changes' }).click()
  const review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review.getByLabel('Roster change preview')).toBeVisible()
  return review
}

for (const width of [1440, 390]) {
  test(`setup preview cancellation and exact saved result at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const { id, operator, source } = await savedArmy(page)
    let review = await shrink(page)
    await expect(review).toContainText('Removed: Skyshroud Spearhead')
    await expect(review).toContainText('Removed choices: Mark of the Nekrosor')
    await expect(review).toContainText('Over budget by')
    await expect(review).toContainText('Skorpekh Lord')
    await expectNoHorizontalOverflow(review)
    await review.getByText('Review the exact roster that will be saved.', { exact: false }).scrollIntoViewIfNeeded()
    await review.screenshot({ path: test.info().outputPath(`setup-review-top-${width}.png`) })
    await review.getByText('Removed choices: Mark of the Nekrosor', { exact: true }).scrollIntoViewIfNeeded()
    await review.screenshot({ path: test.info().outputPath(`setup-review-${width}.png`) })
    await review.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect((await operator.roster(id))!.picks).toBe(source.picks)
    expect((await operator.roster(id))!.limit).toBe(source.limit)
    await page.reload()
    await expect(page.locator('[data-unit="Skorpekh Lord"]')).toContainText('Mark of the Nekrosor')
    review = await shrink(page)
    await waitForRosterSave(page, () => review.getByRole('button', { name: 'Confirm changes' }).click())
    await page.reload()
    await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
    const saved = (await operator.roster(id))!
    expect(saved.limit).toBe(600)
    expect(JSON.parse(saved.detachmentId)).toHaveLength(1)
    expect(JSON.parse(saved.picks)).toHaveLength(JSON.parse(source.picks).length)
    await page.screenshot({ path: test.info().outputPath(`setup-saved-${width}.png`) })
  })
}

test('library setup uses the same reviewed enhancement removal and refuses a changed baseline', async ({ page, context }) => {
  const { id, operator } = await savedArmy(page)
  await page.goto('/rosters')
  const row = page.locator('[data-roster="Reviewed army"]')
  await row.getByRole('button', { name: 'Actions for Reviewed army' }).click()
  await page.getByRole('menuitem', { name: 'Edit setup' }).click()
  let setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Remove Skyshroud Spearhead' }).click()
  await setup.getByRole('button', { name: 'Review changes' }).click()
  let review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review).toContainText('Removed choices: Mark of the Nekrosor')
  const second = await context.newPage()
  await second.goto(`/rosters/${id}`)
  await second.getByLabel('List name').fill('Concurrent edit')
  await expect.poll(async () => (await operator.roster(id))!.name).toBe('Concurrent edit')
  await review.getByRole('button', { name: 'Confirm changes' }).click()
  await expect(review.getByRole('alert')).toContainText('changed after your review')
  expect((await operator.roster(id))!.name).toBe('Concurrent edit')
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  await second.close()
  await page.reload()
  const renamed = page.locator('[data-roster="Concurrent edit"]')
  await renamed.getByRole('button', { name: 'Actions for Concurrent edit' }).click()
  await page.getByRole('menuitem', { name: 'Edit setup' }).click()
  setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Remove Skyshroud Spearhead' }).click()
  await confirmRosterSetup(setup)
  await expect.poll(async () => JSON.parse((await operator.roster(id))!.detachmentId).length).toBe(1)
  await page.goto(`/rosters/${id}`)
  await page.reload()
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
})

test('reviewed setup survives an offline reload and reconnects with the same selected units', async ({ page, context }) => {
  test.setTimeout(240_000)
  const { id, operator, source } = await savedArmy(page)
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
  await context.setOffline(true)
  const review = await shrink(page)
  await review.getByRole('button', { name: 'Confirm changes' }).click()
  await expect(review).toBeHidden()
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
  expect((await operator.roster(id))!.limit).toBe(source.limit)
  await page.reload()
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await operator.roster(id))!.limit, { timeout: 30_000 }).toBe(600)
  const saved = (await operator.roster(id))!
  expect(JSON.parse(saved.picks)).toHaveLength(JSON.parse(source.picks).length)
  await page.reload()
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
})

test('native-v3 concurrent setup confirmations save only one exact variant candidate', async ({ page, context }) => {
  await context.addInitScript(() => {
    window.PraetoriumNative = { bridgeVersion: 3, capabilities: [] }
  })
  const { id, operator } = await savedArmy(page)
  const base = (await operator.roster(id))!
  const variantId = crypto.randomUUID()
  await operator.saveRoster({ ...base, id: variantId, baseRosterId: id, now: Date.now() })
  await page.goto(`/rosters/${variantId}`)
  const source = (await operator.roster(variantId))!
  const second = await context.newPage()
  await second.goto(`/rosters/${variantId}`)
  const firstSetup = await openSetup(page)
  await firstSetup.getByLabel('Roster name').fill('First reviewed candidate')
  await firstSetup.getByRole('button', { name: 'Review changes' }).click()
  const firstReview = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(firstReview.getByLabel('Roster change preview')).toBeVisible()
  const secondSetup = await openSetup(second)
  await secondSetup.getByLabel('Roster name').fill('Second reviewed candidate')
  await secondSetup.getByRole('button', { name: 'Review changes' }).click()
  const secondReview = second.getByRole('dialog', { name: 'Review roster changes' })
  await expect(secondReview.getByLabel('Roster change preview')).toBeVisible()
  let concurrentWrites = 0
  let releaseWrites: () => void = () => undefined
  const writesHeld = new Promise<void>((resolve) => {
    releaseWrites = resolve
  })
  await context.route('**/_serverFn/**', async (route) => {
    const body = route.request().postData()
    if (body?.includes('"operationId"') && body.includes('reviewed candidate')) {
      concurrentWrites++
      await writesHeld
    }
    await route.continue()
  })
  await Promise.all([
    firstReview.getByRole('button', { name: 'Confirm changes' }).click(),
    secondReview.getByRole('button', { name: 'Confirm changes' }).click(),
  ])
  await expect.poll(() => concurrentWrites).toBe(2)
  expect((await operator.roster(variantId))!.name).toBe(source.name)
  releaseWrites()
  await expect.poll(async () => (await firstReview.isVisible()) !== (await secondReview.isVisible())).toBe(true)
  const refused = (await firstReview.isVisible()) ? firstReview : secondReview
  await expect(refused.getByRole('alert')).toContainText('changed on another device')
  const saved = (await operator.roster(variantId))!
  expect(saved.baseRosterId).toBe(id)
  expect(['First reviewed candidate', 'Second reviewed candidate']).toContain(saved.name)
  expect({ picks: saved.picks, limit: saved.limit, detachments: saved.detachmentId, disposition: saved.disposition }).toEqual({
    picks: source.picks,
    limit: source.limit,
    detachments: source.detachmentId,
    disposition: source.disposition,
  })
  await refused.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await second.reload()
  await expect(page.getByLabel('List name')).toHaveValue(saved.name)
  await expect(second.getByLabel('List name')).toHaveValue(saved.name)
  await second.close()
})

test('native-v3 lost save acknowledgement cannot overwrite a later source edit on retry', async ({ page, context }) => {
  await context.addInitScript(() => {
    window.PraetoriumNative = { bridgeVersion: 3, capabilities: [] }
  })
  const { id, operator } = await savedArmy(page)
  const second = await context.newPage()
  await second.goto(`/rosters/${id}`)
  let loseAcknowledgement = true
  await page.route('**/_serverFn/**', async (route) => {
    const body = route.request().postData()
    if (loseAcknowledgement && body?.includes('"operationId"') && body.includes('Unacknowledged candidate')) {
      loseAcknowledgement = false
      await route.fetch()
      await route.abort('failed')
    } else await route.continue()
  })
  const setup = await openSetup(page)
  await setup.getByLabel('Roster name').fill('Unacknowledged candidate')
  await setup.getByRole('button', { name: 'Review changes' }).click()
  const review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review.getByLabel('Roster change preview')).toBeVisible()
  await review.getByRole('button', { name: 'Confirm changes' }).click()
  await expect(review.getByRole('alert')).toBeVisible()
  await expect.poll(async () => (await operator.roster(id))!.name).toBe('Unacknowledged candidate')
  await second.reload()
  await second.getByLabel('List name').fill('Later source edit')
  await expect.poll(async () => (await operator.roster(id))!.name).toBe('Later source edit')
  const beforeRetry = (await operator.roster(id))!
  await review.getByRole('button', { name: 'Confirm changes' }).click()
  await expect(review.getByRole('alert')).toContainText('changed after your review')
  expect(await operator.roster(id)).toEqual(beforeRetry)
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('List name')).toHaveValue('Later source edit')
  await second.close()
})
