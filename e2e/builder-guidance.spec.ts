import { expect, test } from '@playwright/test'
import { createRoster, signUp, waitForRosterSave } from './account'
import { add, attach, expectNoHorizontalOverflow, openBuilder, shot } from './builder.harness'

test.use({ hasTouch: true })

for (const width of [1600, 390]) {
  test(`relationship discovery explains current limits and links missions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => window.innerWidth)).toBe(width)
    await openBuilder(page)
    await waitForRosterSave(page, () => add(page, 'Immortals'))
    await page.getByLabel('Add a unit').clear()
    const picker = page.locator('div[data-onboarding="roster-picker"]')
    const relationships = picker.getByRole('combobox', { name: 'Unit relationships' })
    if (width < 500) {
      await relationships.tap()
      await page.getByRole('option', { name: 'Leaders for Immortals (1)', exact: true }).tap()
    } else {
      await relationships.focus()
      await relationships.press('Enter')
      await page.getByRole('option', { name: 'Leaders for Immortals (1)', exact: true }).press('Enter')
    }
    const imotekh = picker.locator('[data-picker-unit="Imotekh the Stormlord"]')
    await expect(imotekh).toContainText('Compatible leader for Immortals')
    await expect(picker.locator('[data-picker-unit="Plasmancer"]')).toHaveCount(0)
    await waitForRosterSave(page, () => imotekh.getByRole('button', { name: 'Add Imotekh the Stormlord', exact: true }).click())
    await expect(imotekh).toContainText('1/1 in roster')
    await expect(imotekh).not.toContainText('Limit reached:')
    await expect(imotekh.getByRole('button', { name: 'Add Imotekh the Stormlord', exact: true })).toBeDisabled()
    if (width < 500) await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).tap()
    await waitForRosterSave(page, () => attach(page, 'Imotekh the Stormlord', 'Immortals'))
    if (width < 500) {
      await page.getByRole('button', { name: 'Add units', exact: true }).tap()
      await relationships.tap()
      await page.getByRole('option', { name: 'Leaders for Immortals (1)', exact: true }).tap()
    }
    await expect(imotekh).toContainText('Leader limit reached on Immortals.')
    await expect(imotekh).not.toContainText('Can be added separately.')
    const otherLeader = picker.locator('[data-picker-unit="Overlord"]')
    await expect(otherLeader).toContainText('Leader limit reached on Immortals. Can be added separately.')
    await expect(otherLeader.getByRole('button', { name: 'Add Overlord', exact: true })).toBeEnabled()
    await expectNoHorizontalOverflow(picker)
    await expectNoHorizontalOverflow(page.locator('html'))
    await shot(picker, `test-results/builder-guidance-leaders-${width}.png`)

    await relationships.click()
    await page.getByRole('option', { name: 'Bodyguards for Imotekh the Stormlord (2)', exact: true }).click()
    await expect(picker.locator('[data-picker-unit="Immortals"]')).toContainText(
      'Already attached; detach before choosing another bodyguard.',
    )
    await shot(picker, `test-results/builder-guidance-bodyguards-${width}.png`)
    await relationships.click()
    await page.getByRole('option', { name: 'All units', exact: true }).click()
    await expect(picker.getByText(/Mission matchups/)).toHaveCount(0)
    if (width < 500) await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).tap()
    const mission = page.getByRole('link', { name: 'Take and Hold', exact: true })
    const rosterURL = page.url()
    await mission.click()
    await expect(page.getByRole('heading', { name: 'Take and Hold', exact: true })).toBeVisible()
    await page.goto(rosterURL)
    await expect(page.locator('[data-unit="Imotekh the Stormlord"]')).toHaveCount(1)
    await expect(page.locator('[data-unit="Imotekh the Stormlord"]')).toContainText('Immortals')
  })
}

test('a relationship with no matches remains distinct from structured search', async ({ page }) => {
  await openBuilder(page)
  await add(page, "C'tan Shard of the Deceiver")
  await page.getByLabel('Add a unit').clear()
  await page.getByRole('combobox', { name: 'Unit relationships' }).click()
  await page.getByRole('option', { name: "Leaders for C'tan Shard of the Deceiver (1)", exact: true }).click()
  await expect(page.getByText('No matching relationships in this rules version.', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Unit relationships' }).click()
  await page.getByRole('option', { name: 'All units', exact: true }).click()
  await page.getByLabel('Add a unit').fill('Leader')
  await expect(page.locator('[data-picker-unit="Imotekh the Stormlord"]')).toBeVisible()
})

test('picker card height stays stable as the roster crosses the points budget', async ({ page }) => {
  await signUp(page, 'Richard')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, size: /Incursion/ })
  await waitForRosterSave(page, () => add(page, "C'tan Shard of the Nightbringer"))
  await page.getByLabel('Add a unit').fill('Monolith')
  const monolith = page.locator('[data-picker-unit="Monolith"]')
  await expect(monolith).toBeVisible()
  const before = (await monolith.boundingBox())!.height
  await waitForRosterSave(page, () => add(page, "C'tan Shard of the Void Dragon"))
  await page.getByLabel('Add a unit').fill('Monolith')
  await expect(monolith).toBeVisible()
  expect((await monolith.boundingBox())!.height).toBe(before)
  await expect(monolith).not.toContainText('over the remaining budget')
  await expect(monolith.getByRole('button', { name: 'Add Monolith', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Points fit', exact: true }).click()
  await expect(monolith).toHaveCount(0)
  await page.getByRole('button', { name: 'Points fit', exact: true }).click()
  await waitForRosterSave(page, () => monolith.getByRole('button', { name: 'Add Monolith', exact: true }).click())
  await expect(page.locator('[data-stat="points"]')).toHaveText('1125/1000')
  await page.reload()
  await expect(page.locator('[data-unit="Monolith"]')).toHaveCount(1)
  await expect(page.locator('[data-stat="points"]')).toHaveText('1125/1000')
  await expect(page.getByText('Over the points limit', { exact: true }).first()).toBeAttached()
})

test('accepts an Add click while the preceding edit is being priced', async ({ page }) => {
  await openBuilder(page)
  await page.getByLabel('Add a unit').clear()
  const immortals = page.getByRole('button', { name: 'Add Immortals', exact: true })
  const overlord = page.getByRole('button', { name: 'Add Overlord', exact: true })
  await expect(immortals).toBeEnabled()
  await expect(overlord).toBeEnabled()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let began!: () => void
  const started = new Promise<void>((resolve) => {
    began = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') {
      began()
      await held
    }
    await route.continue()
  })
  try {
    await immortals.click()
    await started
    await expect(overlord).toBeEnabled()
    await overlord.click()
  } finally {
    release()
  }
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await expect(page.locator('[data-unit="Overlord"]')).toHaveCount(1)
  await expect(page.locator('[data-stat="points"]')).toHaveText('155/2000')
})

test('a picker favourite stays selected throughout a delayed save', async ({ page }) => {
  await openBuilder(page)
  await page.getByLabel('Add a unit').fill('Immortals')
  const row = page.locator('[data-picker-unit="Immortals"]')
  const heart = row.getByRole('button', { name: /Immortals (to|from) favourite datasheets/ })
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await heart.evaluate((button) => {
    const frames: string[] = []
    Object.assign(window, { favouriteFrames: frames })
    new MutationObserver(() => {
      frames.push(button.getAttribute('aria-pressed')!)
    }).observe(button, { attributes: true, attributeFilter: ['aria-pressed'] })
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  try {
    await heart.click()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
    await expect(heart).toBeEnabled()
  } finally {
    release()
  }
  await expect.poll(async () => page.evaluate(() => window.PraetoriumLocalState?.state?.operations.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { favouriteFrames: string[] }).favouriteFrames)).toEqual(['true'])
  await page.reload()
  await page.getByLabel('Add a unit').fill('Immortals')
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
})
