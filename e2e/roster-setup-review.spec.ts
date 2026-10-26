import { waitForOfflineApp } from './offline'
import { expect, test, type Page } from './test'
import {
  confirmRosterSetup,
  retryUntilVisible,
  savedArmy,
  waitForRosterSave,
  openRosterSetup,
  chooseOption,
  desktopContext,
} from './account'
import { expectNoHorizontalOverflow } from './builder.harness'

async function reviewedArmy(page: Page) {
  const { id, operator } = await savedArmy(page, 'Setup review', { name: 'Reviewed army' })
  await page.goto(`/rosters/${id}`)
  await expect(page.getByLabel('List name')).toHaveValue('Reviewed army')
  const loadout = page.locator('aside[aria-label="Loadout"]')
  const enhancement = loadout.getByRole('button', { name: 'Select Mark of the Nekrosor', exact: true })
  await retryUntilVisible(enhancement, () => page.getByRole('button', { name: 'Skorpekh Lord', exact: true }).click())
  await waitForRosterSave(page, () => enhancement.click())
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).toContainText('Mark of the Nekrosor')
  const back = page.getByRole('button', { name: 'Back to roster', exact: true })
  if (await back.isVisible()) await back.click()
  return { id, operator, source: (await operator.roster(id))! }
}
async function shrink(page: Page) {
  const setup = await openRosterSetup(page)
  await chooseOption(page, 'Battle size', /King of the Colosseum/)
  const disposition = setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Purge the Foe', exact: true })
  if (await disposition.isVisible()) await disposition.click()
  await setup.getByRole('button', { name: 'Review changes' }).click()
  const review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review.getByLabel('Roster change preview')).toBeVisible()
  return review
}

const phone = { width: 390, height: 900 }

test('setup preview cancellation and exact saved result', async ({ page }) => {
  await page.setViewportSize(desktopContext.viewport)
  const { id, operator } = await reviewedArmy(page)
  await page.setViewportSize(phone)
  await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
  await page.getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'No enhancement', exact: true }).click())
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Select Mark of the Nekrosor', exact: true }).click())
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).toContainText('Mark of the Nekrosor')
  await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
  await page.setViewportSize(desktopContext.viewport)
  const source = (await operator.roster(id))!

  const setup = await openRosterSetup(page)
  await setup.getByLabel('Roster name').fill('Name-only review')
  await setup.getByRole('button', { name: 'Review changes' }).click()
  const nameReview = page.getByRole('dialog', { name: 'Review roster changes' })
  const unchanged = nameReview.locator('details')
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(unchanged.locator('summary')).toHaveText('13 unchanged units')
    await expect(unchanged).not.toHaveAttribute('open')
    await expect(nameReview.getByRole('region', { name: 'Unit changes' })).toHaveCount(0)
  }
  await page.setViewportSize(desktopContext.viewport)
  await unchanged.locator('summary').click()
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(unchanged.locator('li')).toHaveCount(13)
    await expect(unchanged.getByText('Kept: Mark of the Nekrosor')).toBeVisible()
    await expectNoHorizontalOverflow(nameReview)
  }
  await page.setViewportSize(desktopContext.viewport)
  await nameReview.getByRole('button', { name: 'Cancel', exact: true }).click()
  let review = await shrink(page)
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(review).toContainText('Removed: Skyshroud Spearhead')
    await expect(review).toContainText('Removed choices: Mark of the Nekrosor')
    await expect(review).toContainText('Over budget by')
    await expect(review).toContainText('Skorpekh Lord')
    await expectNoHorizontalOverflow(review)
    const attention = review.getByRole('region', { name: 'Needs attention' })
    await expect(attention).toContainText('Over budget by')
    await expect(review.getByRole('region', { name: 'Setup changes' })).not.toContainText('Visibility')
    await expect(review.getByRole('region', { name: 'Detachment changes' }).getByText('Removed: Skyshroud Spearhead')).toHaveCSS(
      'color',
      'rgb(245, 122, 122)',
    )
    await attention.scrollIntoViewIfNeeded()
    await review.screenshot({ path: test.info().outputPath(`setup-review-top-${viewport.width}.png`) })
    await review.getByText('Removed choices: Mark of the Nekrosor', { exact: true }).scrollIntoViewIfNeeded()
    await review.screenshot({ path: test.info().outputPath(`setup-review-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktopContext.viewport)
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await operator.roster(id))!.picks).toBe(source.picks)
  expect((await operator.roster(id))!.limit).toBe(source.limit)
  await page.reload()
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).toContainText('Mark of the Nekrosor')
  review = await shrink(page)
  await waitForRosterSave(page, () => review.getByRole('button', { name: 'Confirm changes' }).click())
  await page.reload()
  const saved = (await operator.roster(id))!
  expect(saved.limit).toBe(600)
  expect(JSON.parse(saved.detachmentId)).toHaveLength(1)
  expect(JSON.parse(saved.picks)).toHaveLength(JSON.parse(source.picks).length)
  for (const viewport of [desktopContext.viewport, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
    await page.screenshot({ path: test.info().outputPath(`setup-saved-${viewport.width}.png`) })
  }
})

test('library setup uses the same reviewed enhancement removal and refuses a changed baseline', async ({ page, context }) => {
  const { id, operator } = await reviewedArmy(page)
  await page.goto('/rosters')
  const row = page.locator('[data-roster="Reviewed army"]')
  const editSetup = page.getByRole('menuitem', { name: 'Edit roster setup' })
  await retryUntilVisible(editSetup, () => row.getByRole('button', { name: 'Actions for Reviewed army' }).click())
  await editSetup.click()
  let setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Select Skyshroud Spearhead', pressed: true }).click()
  await setup.getByRole('button', { name: 'Review changes' }).click()
  let review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review).toContainText('Removed choices: Mark of the Nekrosor')
  const second = await context.newPage()
  await second.goto(`/rosters/${id}`)
  // Hydration puts back the saved name over one typed before it, so the name is typed until it saves.
  const concurrentName = second.getByLabel('List name')
  await expect(async () => {
    if ((await concurrentName.inputValue()) !== 'Concurrent edit') await concurrentName.fill('Concurrent edit')
    await expect.poll(async () => (await operator.roster(id))!.name, { timeout: 2_000 }).toBe('Concurrent edit')
  }).toPass({ timeout: 15_000 })
  await review.getByRole('button', { name: 'Confirm changes' }).click()
  await expect(review.getByRole('alert')).toContainText('changed after your review')
  expect((await operator.roster(id))!.name).toBe('Concurrent edit')
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  await second.close()
  await page.reload()
  const renamed = page.locator('[data-roster="Concurrent edit"]')
  await retryUntilVisible(editSetup, () => renamed.getByRole('button', { name: 'Actions for Concurrent edit' }).click())
  await editSetup.click()
  setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Select Skyshroud Spearhead', pressed: true }).click()
  await confirmRosterSetup(setup)
  await expect.poll(async () => JSON.parse((await operator.roster(id))!.detachmentId).length).toBe(1)
  await page.goto(`/rosters/${id}`)
  await page.reload()
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
})

test('reviewed setup survives an offline reload and reconnects with the same selected units', async ({ page, context }) => {
  test.setTimeout(240_000)
  const { id, operator, source } = await reviewedArmy(page)
  await waitForOfflineApp(page)
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
  const { id, operator } = await reviewedArmy(page)
  const base = (await operator.roster(id))!
  const variantId = crypto.randomUUID()
  await operator.saveRoster({ ...base, id: variantId, baseRosterId: id, now: Date.now() })
  await page.goto(`/rosters/${variantId}`)
  const source = (await operator.roster(variantId))!
  const second = await context.newPage()
  await second.goto(`/rosters/${variantId}`)
  const firstSetup = await openRosterSetup(page)
  await firstSetup.getByLabel('Roster name').fill('First reviewed candidate')
  await firstSetup.getByRole('button', { name: 'Review changes' }).click()
  const firstReview = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(firstReview.getByLabel('Roster change preview')).toBeVisible()
  const secondSetup = await openRosterSetup(second)
  await secondSetup.getByLabel('Roster name').fill('Second reviewed candidate')
  await secondSetup.getByRole('button', { name: 'Review changes' }).click()
  const secondReview = second.getByRole('dialog', { name: 'Review roster changes' })
  await expect(secondReview.getByLabel('Roster change preview')).toBeVisible()
  let concurrentWrites = 0
  const { promise: writesHeld, resolve: releaseWrites } = Promise.withResolvers<void>()
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
  const { id, operator } = await reviewedArmy(page)
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
  const setup = await openRosterSetup(page)
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
