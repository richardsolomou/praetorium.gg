import { expect, type Page, test } from './test'
import {
  befriend,
  chooseRosterAction,
  createRoster,
  retryUntilVisible,
  signUp,
  uniqueName,
  waitForRosterSave,
  setRosterAccess,
  addUnit,
  chooseOption,
  PHONE,
} from './account'
import { expectNoHorizontalOverflow, shot, closePicker } from './builder.harness'
import { productOperator, userIdFor, lastPathSegment } from './storage'

const UNIT = 'Immortals'
const NOTE = 'Discovery note stays with the owner'

async function addNotedUnit(page: Page) {
  await addUnit(page, UNIT)
  await closePicker(page)
  await page.locator(`[data-unit="${UNIT}"]`).getByRole('button', { name: UNIT, exact: true }).click()
  const fields = page.getByRole('region', { name: 'Note' })
  await waitForRosterSave(page, () => fields.getByRole('textbox', { name: 'Note', exact: true }).fill(NOTE), NOTE)
  const back = page.getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
}

async function filterTo(page: Page, choices: { faction: string; detachment: string; rules: string }) {
  await expect(page.getByRole('heading', { name: 'Public rosters', exact: true })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Filter rosters' })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'Filter', exact: true }).click())
  for (const [label, option] of [
    ['Faction', choices.faction],
    ['Detachment', choices.detachment],
    ['Rules version', choices.rules],
  ] as const) {
    await chooseOption(page, label, option)
    await expect(dialog.getByRole('combobox', { name: label })).toContainText(option, { timeout: 60_000 })
  }
  await dialog.getByRole('button', { name: 'Done' }).click()
}

for (const [width, label] of [
  [390, 'phone'],
  [1440, 'desktop'],
] as const) {
  test(`a published army is found, duplicated and edited without changing it, and leaves when made private (${label})`, async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const viewport = { width, height: width === 390 ? 844 : 900 }
    const owner = await (await browser.newContext({ viewport })).newPage()
    const ownerName = uniqueName('Publisher')
    await signUp(owner, ownerName)
    await owner.goto('/rosters')
    await expect(owner.getByRole('navigation', { name: 'Rosters' }).getByRole('link', { name: 'Mine' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await shot(owner.locator('main header'), test.info().outputPath(`roster-library-header-${label}.png`))
    const armyName = uniqueName('Found army')
    await createRoster(owner, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: armyName })
    await addNotedUnit(owner)
    await setRosterAccess(owner, 'Public — listed on your profile', 'public')
    const sourceId = lastPathSegment(owner.url())
    const product = await productOperator()
    const source = await product.roster(sourceId)

    const reader = await (await browser.newContext({ viewport })).newPage()
    await signUp(reader, uniqueName('Finder'))
    await reader.goto('/rosters')
    await reader.getByRole('navigation', { name: 'Rosters' }).getByRole('link', { name: 'Public', exact: true }).click()
    await expect(reader).toHaveURL(/\/rosters\?view=public$/)
    await filterTo(reader, { faction: 'Necrons', detachment: 'Awakened Dynasty', rules: 'Current' })
    await expect(reader).toHaveURL(/faction=necrons/)
    // Other tests publish Necrons armies meanwhile, and only these filters keep this one on the first page.
    const filtered = reader.url()
    const card = reader.locator(`[data-discovered-roster="${armyName}"]`)
    await expect(card).toContainText(`By ${ownerName}`)
    await expect(card).toContainText('Awakened Dynasty')
    await expect(card).toContainText('Legal')
    await expect(reader.locator('main')).not.toContainText(NOTE)
    await expectNoHorizontalOverflow(reader.locator('main'))
    await shot(reader.locator('main'), test.info().outputPath(`roster-discovery-${label}.png`))

    if (width === 1440) {
      await reader.goto(`/rosters/${sourceId}`)
      await chooseRosterAction(reader, 'Test targets')
      const simulator = reader.getByRole('dialog', { name: 'Test targets', exact: true })
      await expect(simulator.getByRole('combobox', { name: 'Attacking roster', exact: true })).toContainText('Current roster')
      await simulator.getByRole('button', { name: 'Close', exact: true }).click()
      expect(await product.roster(sourceId)).toEqual(source)
      await reader.goBack()
    }
    await card.getByRole('button', { name: `Duplicate ${armyName}` }).click()
    await reader.waitForURL((url) => /^\/rosters\/[^/]+$/.test(url.pathname))
    const copyId = lastPathSegment(reader.url())
    expect(copyId).not.toBe(sourceId)
    await expect(reader.getByLabel('List name')).toHaveValue(`Copy of ${armyName}`)
    await expect(reader.locator('[data-roster-copied-from]')).toHaveText(`Copied from ${armyName} by ${ownerName}`)
    expect((await product.roster(copyId))?.copiedFromRosterId).toBe(sourceId)
    await waitForRosterSave(reader, () => reader.getByLabel('List name').fill('Edited copy'), 'Edited copy')
    await expect.poll(async () => (await product.roster(copyId))?.name).toBe('Edited copy')
    expect((await product.roster(copyId))?.picks).not.toContain(NOTE)
    expect(await product.roster(sourceId)).toEqual(source)

    await reader.goto(filtered)
    await expect(card).toBeVisible()
    await setRosterAccess(owner, 'Private', 'private')
    await expect(card).toHaveCount(0)
    await reader.reload()
    await expect(reader.getByRole('heading', { name: 'Public rosters', exact: true })).toBeVisible()
    await expect(card).toHaveCount(0)
    await reader.goto(`/rosters/${copyId}`)
    await expect(reader.getByLabel('List name')).toHaveValue('Edited copy')
    await expect(reader.locator('[data-roster-copied-from]')).toHaveCount(0)
  })
}

test('a faction page leads to its public armies, and a filter none match explains how armies are listed (phone)', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE })).newPage()
  await page.goto('/factions/necrons')
  await page.getByRole('link', { name: 'Public armies' }).click()
  await expect(page).toHaveURL(/\/rosters\?view=public&faction=necrons$/)
  await page.goto('/rosters?view=public&rules=preview&faction=necrons')
  await expect(page.getByText('No public rosters match these filters')).toBeVisible()
  await expectNoHorizontalOverflow(page.locator('main'))
  await shot(page.locator('main'), test.info().outputPath('roster-discovery-empty-phone.png'))
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/\/rosters\?view=public$/)
})

test('the old discovery address keeps its filters on the public rosters', async ({ page }) => {
  await page.goto('/rosters/discover?faction=necrons&rules=current')
  await expect(page.getByRole('heading', { name: 'Public rosters', level: 2 })).toBeVisible()
  const search = new URL(page.url()).searchParams
  expect([new URL(page.url()).pathname, search.get('view'), search.get('faction'), search.get('rules')]).toEqual([
    '/rosters',
    'public',
    'necrons',
    'current',
  ])
})

test("a friend's public roster is listed to friends, and a player's own stays off the public rosters", async ({ browser }) => {
  test.setTimeout(120_000)
  const owner = await (await browser.newContext()).newPage()
  await signUp(owner, uniqueName('Sharing friend'))
  const friend = await (await browser.newContext()).newPage()
  await signUp(friend, uniqueName('Friend reader'))
  const stranger = await (await browser.newContext()).newPage()
  await signUp(stranger, uniqueName('Stranger reader'))
  await befriend(owner, friend)
  const armyName = uniqueName('Friend army')
  await createRoster(owner, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: armyName })
  await setRosterAccess(owner, 'Public — listed on your profile', 'public')

  await friend.goto('/rosters?view=friends')
  await expect(friend.locator(`[data-discovered-roster="${armyName}"]`)).toBeVisible()
  await stranger.goto('/rosters?view=friends')
  await expect(stranger.locator('[data-friends-empty]')).toBeVisible()
  await owner.goto('/rosters?view=public')
  await filterTo(owner, { faction: 'Necrons', detachment: 'Awakened Dynasty', rules: 'Current' })
  await friend.goto(owner.url())
  await expect(friend.locator(`[data-discovered-roster="${armyName}"]`)).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Public rosters', exact: true })).toBeVisible()
  await expect(owner.locator(`[data-discovered-roster="${armyName}"]`)).toHaveCount(0)
})

for (const [width, label] of [
  [390, 'phone'],
  [1440, 'desktop'],
] as const) {
  test(`a long list of public armies scrolls to Show more (${label})`, async ({ browser }) => {
    const viewport = { width, height: width === 390 ? 844 : 900 }
    const publisher = await (await browser.newContext({ viewport })).newPage()
    const account = await signUp(publisher, uniqueName('Prolific publisher'))
    const userId = await userIdFor(account.email)
    const product = await productOperator()
    const source = (await product.roster('preview-necrons-cursed-skyshroud'))!
    const prefix = uniqueName('Scrolled army')
    for (let index = 0; index < 25; index += 1) {
      await product.saveRoster({
        ...source,
        id: crypto.randomUUID(),
        userId,
        name: `${prefix} ${index}`,
        automaticName: false,
        visibility: 'public',
        now: Date.now(),
      })
    }

    // A visitor, since a player's own rosters stay off the public list.
    const page = await (await browser.newContext({ viewport })).newPage()
    await page.goto('/rosters?view=public')
    const more = page.getByRole('button', { name: 'Show more rosters' })
    await expect(more).toBeAttached()
    await page.mouse.move(width / 2, 400)
    await expect(async () => {
      await page.mouse.wheel(0, 20_000)
      await expect(more).toBeInViewport({ timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await page.screenshot({ path: test.info().outputPath(`roster-discovery-scrolled-${label}.png`) })
    const seeded = page.locator(`[data-discovered-roster^="${prefix} "]`)
    // The last page removes the button, so a slow page must not be asked for again.
    await expect(async () => {
      if (await more.isVisible()) await more.click({ timeout: 1_000 })
      await expect(seeded).toHaveCount(25, { timeout: 2_000 })
    }).toPass({ timeout: 15_000 })
  })
}

test('public rosters keep a chosen order in the address across filter changes', async ({ page }) => {
  await page.goto('/rosters?view=public')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Sort: Recently updated' }).click()
  await page.getByRole('menuitemradio', { name: 'A to Z' }).click()
  await expect(page).toHaveURL(/[?&]sort=name-asc/)
  await page.goto('/rosters?view=public&sort=name-asc&faction=necrons')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Filter 1', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Filter rosters' })
  await dialog.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/\/rosters\?view=public&sort=name-asc$/)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Sort: A to Z' })).toBeVisible()
})
