import { expect, type Page, test } from './test'
import { chooseRosterAction, confirmRosterSetup, createRoster, signUp, uniqueName, waitForRosterSave } from './account'
import { expectNoHorizontalOverflow, shot } from './builder.harness'
import { productOperator, withAuthSql } from './storage'

const UNIT = 'Immortals'
const NOTE = 'Discovery note stays with the owner'

const rosterId = (page: Page) => new URL(page.url()).pathname.split('/').at(-1)!

async function setAccess(page: Page, name: string, value: string) {
  await chooseRosterAction(page, 'Edit roster setup')
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name }).click()
  await waitForRosterSave(page, () => confirmRosterSetup(setup), `"${value}"`)
}

async function addNotedUnit(page: Page) {
  await page.getByLabel('Add a unit').fill(UNIT)
  await waitForRosterSave(page, () =>
    page
      .getByRole('button', { name: `Add ${UNIT}`, exact: true })
      .first()
      .click(),
  )
  const picker = page.getByRole('dialog', { name: 'Add units' })
  if (await picker.isVisible()) await picker.getByRole('button', { name: 'Close' }).click()
  await page.locator(`[data-unit="${UNIT}"]`).getByRole('button', { name: UNIT, exact: true }).click()
  const fields = page.getByRole('region', { name: 'Note' })
  await waitForRosterSave(page, () => fields.getByRole('textbox', { name: 'Note', exact: true }).fill(NOTE), NOTE)
  const back = page.getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
}

async function filterTo(page: Page, choices: { faction: string; detachment: string; rules: string }) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Filter armies' })
  for (const [label, option] of [
    ['Faction', choices.faction],
    ['Detachment', choices.detachment],
    ['Rules version', choices.rules],
  ] as const) {
    await dialog.getByRole('combobox', { name: label }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
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
    await expect(owner.getByRole('link', { name: 'Discover armies' })).toBeVisible()
    await shot(owner.locator('main header'), `test-results/roster-library-header-${label}.png`)
    const armyName = uniqueName('Found army')
    await createRoster(owner, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: armyName })
    await addNotedUnit(owner)
    await setAccess(owner, 'Public — listed on your profile', 'public')
    const sourceId = rosterId(owner)
    const product = await productOperator()
    const source = await product.roster(sourceId)

    const reader = await (await browser.newContext({ viewport })).newPage()
    await signUp(reader, uniqueName('Finder'))
    await reader.goto('/rosters/discover')
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
    await shot(reader.locator('main'), `test-results/roster-discovery-${label}.png`)

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
    await reader.waitForURL((url) => /^\/rosters\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/discover'))
    const copyId = rosterId(reader)
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
    await setAccess(owner, 'Private', 'private')
    await expect(card).toHaveCount(0)
    await reader.reload()
    await expect(reader.getByRole('heading', { name: 'Armies', exact: true })).toBeVisible()
    await expect(card).toHaveCount(0)
    await reader.goto(`/rosters/${copyId}`)
    await expect(reader.getByLabel('List name')).toHaveValue('Edited copy')
    await expect(reader.locator('[data-roster-copied-from]')).toHaveCount(0)
  })
}

test('a faction page leads to its public armies, and a filter none match explains how armies are listed (phone)', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await page.goto('/factions/necrons')
  await page.getByRole('link', { name: 'Public armies' }).click()
  await expect(page).toHaveURL(/\/rosters\/discover\?faction=necrons$/)
  await page.goto('/rosters/discover?rules=preview&faction=necrons')
  await expect(page.getByText('No public armies match these filters')).toBeVisible()
  await expectNoHorizontalOverflow(page.locator('main'))
  await shot(page.locator('main'), 'test-results/roster-discovery-empty-phone.png')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/\/rosters\/discover$/)
})

for (const [width, label] of [
  [390, 'phone'],
  [1440, 'desktop'],
] as const) {
  test(`a long list of public armies scrolls to Show more (${label})`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })).newPage()
    const account = await signUp(page, uniqueName('Prolific publisher'))
    const { id: userId } = (await withAuthSql((database) =>
      database.prepare('SELECT id FROM user WHERE email = ?').get(account.email),
    )) as { id: string }
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

    await page.goto('/rosters/discover')
    const more = page.getByRole('button', { name: 'Show more armies' })
    await expect(more).toBeAttached()
    await page.mouse.move(width / 2, 400)
    await expect(async () => {
      await page.mouse.wheel(0, 20_000)
      await expect(more).toBeInViewport({ timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await page.screenshot({ path: `test-results/roster-discovery-scrolled-${label}.png` })
    const seeded = page.locator(`[data-discovered-roster^="${prefix} "]`)
    // The last page removes the button, so a slow page must not be asked for again.
    await expect(async () => {
      if (await more.isVisible()) await more.click({ timeout: 1_000 })
      await expect(seeded).toHaveCount(25, { timeout: 2_000 })
    }).toPass({ timeout: 15_000 })
  })
}
