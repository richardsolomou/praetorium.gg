import { createHash } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import type { SupportRecord } from '../src/core/supportReport'
import { retryUntilVisible, signUp } from './account'

for (const width of [1440, 390]) {
  test(`reviews and cancels a public text report without publishing or saving it at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signUp(page, `Support review ${width}`)
    await page.goto('/support?page=battle')
    await expect(page.getByText('In-app reporting is unavailable.', { exact: false })).toBeVisible()
    await expect(page.getByText('No reports yet.', { exact: true })).toBeVisible()
    await page.getByLabel('Title', { exact: true }).fill('Review cancellation test')
    await page.getByLabel('What happened or what would help?').fill('I am checking the public report preview without submitting it.')
    await page.getByLabel('Rules version (optional)').fill('September update')
    await page.getByLabel('Public text attachment (optional)').fill('Synthetic text only. No private roster or battle details.')
    await page.getByRole('button', { name: 'Review public report', exact: true }).click()
    const review = page.getByRole('dialog', { name: 'Review public report', exact: true })
    await expect(review).toContainText('[bug] Review cancellation test')
    const publicBody = review.locator('pre')
    expect(await publicBody.evaluate((element) => element.closest('.ph-no-capture') !== null)).toBe(true)
    await expect(publicBody).toContainText('Page: battle')
    await expect(publicBody).toContainText('Rules version: September update')
    await expect(publicBody).toContainText('Text attachment:\nSynthetic text only. No private roster or battle details.')
    expect(await publicBody.textContent()).not.toContain('example.test')
    const publish = review.getByRole('button', { name: 'Publish public report' })
    await expect(publish).toBeDisabled()
    await review.getByRole('checkbox').check()
    await expect(publish).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await review.screenshot({ path: `test-results/support-review-${width}.png` })
    await review.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(review).toBeHidden()
    await page.getByRole('button', { name: 'Review public report', exact: true }).click()
    await expect(review.getByRole('checkbox')).not.toBeChecked()
    await review.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.reload()
    await expect(page.getByText('No reports yet.', { exact: true })).toBeVisible()
    await page.screenshot({ path: `test-results/support-unconfigured-${width}.png`, fullPage: true })
  })
}

test('the account menu reports only its page category and keeps private links out of the draft', async ({ page }) => {
  const name = 'Contextual feedback'
  await signUp(page, name)
  await page.goto('/rosters')
  await retryUntilVisible(page.getByRole('menuitem', { name: 'Send feedback' }), () =>
    page
      .getByRole('button', { name: `Account menu for ${name}` })
      .first()
      .click(),
  )
  await page.getByRole('menuitem', { name: 'Send feedback' }).click()
  await expect(page).toHaveURL('/support?page=rosters')
  await expect(page.getByRole('combobox', { name: 'Page', exact: true })).toHaveValue('rosters')
  await expect(page.getByLabel('What happened or what would help?')).toBeEmpty()
  await expect(page.getByLabel('Public text attachment (optional)')).toBeEmpty()
})

test('validates the report before opening a publication preview', async ({ page }) => {
  await signUp(page, 'Support validation')
  await page.goto('/support')
  await page.getByRole('button', { name: 'Review public report', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('title of 3–160 characters')
  await expect(page.getByRole('dialog', { name: 'Review public report', exact: true })).toBeHidden()
})

async function publishWithConfiguredResponses(page: Page, delivery: 'uncertain' | 'refused') {
  let record: SupportRecord | null = null
  let submissions = 0
  // The pinned TanStack build hashes the relative filename and extracted handler name.
  const ids = Object.fromEntries(
    ['supportAvailability', 'ownSupportReports', 'submitSupportReport', 'checkSupportReport'].map((name) => [
      createHash('sha256').update(`src/server/functions/support.ts--${name}_createServerFn_handler`).digest('hex'),
      name,
    ]),
  )
  await page.route('**/_serverFn/**', async (route) => {
    const name = ids[new URL(route.request().url()).pathname.split('/').at(-1)!]
    if (!name) return route.continue()
    let result: unknown
    if (name === 'supportAvailability') result = { configured: true }
    else if (name === 'ownSupportReports') result = record ? [record] : []
    else if (name === 'submitSupportReport') {
      submissions++
      result = record
    } else {
      if (!record) throw new Error('A report must be submitted before checking it')
      record = { ...record, delivery: 'received', issueNumber: 915 }
      result = { record, issue: { state: 'open', reason: null }, replies: [], more: false, checked: true }
    }
    await route.fulfill({ json: { result, context: {} } })
  })
  await page.getByRole('link', { name: 'Support', exact: true }).click()
  await expect(page.getByText('No reports yet.', { exact: true })).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill(`Configured ${delivery} report`)
  await page.getByLabel('What happened or what would help?').fill('Synthetic UI recovery check. No report is published to GitHub.')
  await page.getByRole('button', { name: 'Review public report', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review public report', exact: true })
  const body = await review.locator('pre').innerText()
  const reference = /Report reference: ([0-9a-f-]{36})/.exec(body)?.[1]
  if (!reference) throw new Error('The review must include the stable report reference')
  record = { reference, title: `[bug] Configured ${delivery} report`, body, createdAt: Date.now(), delivery, issueNumber: null }
  await review.getByRole('checkbox').check()
  await review.getByRole('button', { name: 'Publish public report', exact: true }).click()
  await expect(review).toBeHidden()
  return () => submissions
}

test('a confirmed check unlocks a new report after an uncertain submit response', async ({ page }) => {
  await signUp(page, 'Support uncertainty recovery')
  const submissions = await publishWithConfiguredResponses(page, 'uncertain')
  await expect(page.getByText('Delivery is not confirmed. Check this report before sending anything else.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New report', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Check status and replies', exact: true }).click()
  await expect(page.getByText('GitHub received your report. This does not mean the problem is resolved.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New report', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toBeEmpty()
  await expect(page.getByLabel('Title', { exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Review public report', exact: true })).toBeVisible()
  expect(submissions()).toBe(1)
  await page.screenshot({ path: 'test-results/support-reconciled.png', fullPage: true })
})

test('a refused submit response says the report was not sent and allows a new report', async ({ page }) => {
  await signUp(page, 'Support refusal recovery')
  const submissions = await publishWithConfiguredResponses(page, 'refused')
  await expect(page.getByText('GitHub refused delivery. Your report was not sent.', { exact: true })).toBeVisible()
  await expect(page.getByText('Delivery is not confirmed.', { exact: false })).toBeHidden()
  await page.getByRole('button', { name: 'New report', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toBeEmpty()
  await expect(page.getByLabel('Title', { exact: true })).toBeEnabled()
  expect(submissions()).toBe(1)
})
