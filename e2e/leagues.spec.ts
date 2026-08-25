import { and, desc, eq } from 'drizzle-orm'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createRoster, uniqueName, signUp, waitForRosterSave } from './account'
import { openDatabase } from '../src/db/connection'
import { leagueEventEntries, leagueEvents, leagues, rosters, user } from '../src/db/schema'
import { postgresPort } from './stackEnv'

async function sealEventRosters(leagueToken: string) {
  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [event] = await connection.database
      .select({ id: leagueEvents.id })
      .from(leagueEvents)
      .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
      .where(eq(leagues.token, leagueToken))
      .orderBy(desc(leagueEvents.number))
      .limit(1)
    if (!event) throw new Error('The league test event is missing.')
    const sealed = await connection.database
      .update(leagueEventEntries)
      .set({ rosterName: 'Sealed roster', rosterSnapshot: '{}', submittedAt: Date.now() })
      .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.status, 'accepted')))
      .returning({ userId: leagueEventEntries.userId })
    if (sealed.length !== 2) throw new Error('The league test entrants are missing.')
  } finally {
    await connection.close()
  }
}

async function seedRosters(playerName: string, values: { name: string; limit: number }[]) {
  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [player] = await connection.database.select({ id: user.id }).from(user).where(eq(user.name, playerName)).limit(1)
    if (!player) throw new Error('The roster test player is missing.')
    const now = Date.now()
    await connection.database.insert(rosters).values(
      values.map((value, index) => ({
        id: `${player.id}-${value.limit}-${index}`,
        userId: player.id,
        name: value.name,
        catalogueId: 'test-catalogue',
        detachmentId: null,
        disposition: null,
        limit: value.limit,
        picks: '[]',
        prep: null,
        tags: '[]',
        visibility: 'private' as const,
        source: 'editable' as const,
        createdAt: now + index,
        updatedAt: now + index,
      })),
    )
  } finally {
    await connection.close()
  }
}

async function sealTeamEventRosters(leagueToken: string) {
  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [event] = await connection.database
      .select({ id: leagueEvents.id })
      .from(leagueEvents)
      .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
      .where(eq(leagues.token, leagueToken))
      .orderBy(desc(leagueEvents.number))
      .limit(1)
    if (!event) throw new Error('The team league event is missing.')
    const entries = await connection.database
      .select({ userId: leagueEventEntries.userId, requiredLimit: leagueEventEntries.requiredLimit })
      .from(leagueEventEntries)
      .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.status, 'accepted')))
    if (entries.length !== 3 || entries.some((entry) => entry.requiredLimit === null)) {
      throw new Error('The team league assignments are incomplete.')
    }
    for (const entry of entries) {
      const limit = entry.requiredLimit!
      await connection.database
        .update(leagueEventEntries)
        .set({
          rosterName: `${limit.toLocaleString()}-point roster`,
          rosterSnapshot: JSON.stringify({
            name: `${limit.toLocaleString()}-point roster`,
            text: `${limit.toLocaleString()} points`,
            built: {
              catalogueId: 'test-catalogue',
              revision: 'test-revision',
              limit,
              detachment: null,
              disposition: null,
              units: [{ key: `${entry.userId}-unit`, name: 'Test unit', points: 80, models: 5 }],
            },
          }),
          submittedAt: Date.now(),
        })
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, entry.userId)))
    }
  } finally {
    await connection.close()
  }
}

async function join(page: Page) {
  await page.getByRole('button', { name: 'Join league' }).click()
}

async function expectNoHorizontalOverflow(page: Page, ...elements: Locator[]) {
  const documentWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(documentWidth.scrollWidth).toBe(documentWidth.clientWidth)
  for (const element of elements) {
    expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  }
}

async function expectOrganizerAvatar(row: Locator, ownerName: string) {
  await expect(row.locator('img')).toHaveAttribute('src', /\/avatars\/[0-9a-f]+\.webp$/)
  const children = await row.evaluate((element) =>
    Array.from(element.children).map((child) => ({ left: child.getBoundingClientRect().left, text: child.textContent })),
  )
  expect(children.map((child) => child.text)).toEqual(['Organized by', '', ownerName])
  const leftEdges = children.map((child) => child.left)
  expect(leftEdges[0]).toBeLessThan(leftEdges[1])
  expect(leftEdges[1]).toBeLessThan(leftEdges[2])
}

async function submitLeagueCreation(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: 'Create league' }).click()
  await expect(page).toHaveURL(/\/leagues\/[^/?]+/)
}

test('an organizer can make a one-off league recurring without replacing its event', async ({ page }) => {
  const ownerName = uniqueName('LeagueOwner')
  const leagueName = uniqueName('Home League')

  await signUp(page, ownerName)
  const rosterName = await createRoster(page, {
    faction: 'Black Templars',
    detachment: /Companions of Vehemence/,
    name: 'Templar roster',
  })
  await page.goto('/leagues')
  await page.getByRole('button', { name: 'New league' }).click()
  const create = page.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(leagueName)
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await submitLeagueCreation(page, create)
  await join(page)
  const eventUrl = page.url()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  const initialResponse = await page.reload()
  if (!initialResponse) throw new Error('The league page did not return a document response.')
  expect(await initialResponse.text()).not.toContain(rosterName)

  await page.getByRole('button', { name: 'Choose roster' }).click()
  const roster = page.getByRole('dialog', { name: 'Seal a roster' }).locator(`[data-roster="${rosterName}"]`)
  await expect(roster.getByText('Black Templars', { exact: true })).toBeVisible()
  await expect(roster.getByText('Companions of Vehemence', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/league-roster-dialog.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/league-roster-dialog-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  await page.getByRole('menuitem', { name: 'Make recurring' }).click()
  await page.screenshot({ path: 'test-results/make-league-recurring-confirm.png', fullPage: true })
  await page.getByRole('alertdialog', { name: 'Make this league recurring?' }).getByRole('button', { name: 'Make recurring' }).click()

  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Event 1/ })).toBeVisible()
  await expect(page.locator(`[data-person="${ownerName}"]`)).toBeVisible()
  expect(page.url()).toBe(eventUrl)
  await page.screenshot({ path: 'test-results/one-off-made-recurring.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/one-off-made-recurring-phone.png', fullPage: true })
})

test('a revealed roster keeps its selected upgrades and reference metadata', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const owner = await ownerContext.newPage()
  const ownerName = uniqueName('RosterOwner')
  const rosterName = 'Revealed Necrons'

  await signUp(owner, ownerName)
  await createRoster(owner, { faction: 'Necrons', detachment: /Cursed Legion/, name: rosterName })
  await owner.getByLabel('Add a unit').fill('Skorpekh Lord')
  await owner.getByRole('button', { name: 'Add Skorpekh Lord', exact: true }).first().click()
  await owner.locator('[data-unit="Skorpekh Lord"]').getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  await waitForRosterSave(owner, () => owner.getByRole('button', { name: 'Select Mark of the Nekrosor' }).click())

  await owner.getByRole('button', { name: 'Roster actions' }).click()
  await owner.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  const setup = owner.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Select Skyshroud Spearhead' }).click()
  await waitForRosterSave(owner, () => setup.getByRole('button', { name: 'Save changes' }).click())

  await owner.getByLabel('Add a unit').fill('Lokhust Destroyers')
  await owner.getByRole('button', { name: 'Add Lokhust Destroyers', exact: true }).first().click()
  await owner.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', { name: 'Lokhust Destroyers', exact: true }).click()
  await waitForRosterSave(owner, () => owner.getByRole('button', { name: 'Select Deepening Madness' }).click())

  await owner.goto('/leagues')
  await owner.getByRole('button', { name: 'New league' }).click()
  const create = owner.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(uniqueName('Roster reveal'))
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await create.getByRole('button', { name: 'Create league' }).click()
  await join(owner)
  await owner.getByRole('button', { name: 'Choose roster' }).click()
  await owner.getByRole('dialog', { name: 'Seal a roster' }).locator(`[data-roster="${rosterName}"]`).click()
  await expect(owner.getByText(`${rosterName} submitted.`)).toBeVisible()
  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()

  const revealedPage = owner.waitForEvent('popup')
  await owner.getByRole('button', { name: 'View roster' }).click()
  const revealed = await revealedPage
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const guest = await guestContext.newPage()
  await guest.goto(revealed.url())

  const header = guest.locator('[data-roster-builder] > header')
  await expect(header.getByText('Strike Force', { exact: true })).toBeVisible()
  await expect(header.getByRole('link', { name: 'Strike Force' })).toHaveCount(0)
  await expect(header.getByRole('link', { name: /Cursed Legion · \d DP/ })).toHaveAttribute(
    'href',
    '/factions/necrons/detachments/cursed-legion',
  )
  await expect(header.getByText('Purge the Foe', { exact: true })).toHaveClass(/chip/)

  await guest.locator('[data-unit="Skorpekh Lord"]').getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  const unit = guest.locator('aside[aria-label="Datasheet"]')
  await expect(unit.getByText('Mark of the Nekrosor', { exact: true })).toBeVisible()
  await guest.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', { name: 'Lokhust Destroyers', exact: true }).click()
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await guest.screenshot({ path: 'test-results/revealed-roster-details.png', fullPage: true })

  await guest.setViewportSize({ width: 390, height: 844 })
  await unit.getByRole('button', { name: 'Close' }).click()
  const rosterUnits = guest.locator('[data-slot="roster-units"]')
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await rosterUnits.evaluate((element) => element.scrollWidth)).toBe(await rosterUnits.evaluate((element) => element.clientWidth))
  await guest.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', { name: 'Lokhust Destroyers', exact: true }).click()
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await unit.evaluate((element) => element.scrollWidth)).toBe(await unit.evaluate((element) => element.clientWidth))
  await guest.screenshot({ path: 'test-results/revealed-roster-details-phone.png', fullPage: true })

  await guestContext.close()
  await revealed.close()
  await ownerContext.close()
})

test('an organizer edits and deletes a league from its card actions', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const entrantContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('LeagueOwner')
  const entrantName = uniqueName('LeagueEntrant')
  const leagueName = uniqueName('Editable League')
  const renamed = `${leagueName} Updated`

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)
  await owner.goto('/profile')
  await owner.getByLabel('Choose profile picture').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEX/W1e1okn/AAAADElEQVQI12NgIA0AAAAwAAHHqoWOAAAAAElFTkSuQmCC',
      'base64',
    ),
  })
  await owner.getByRole('button', { name: 'Save profile' }).click()
  await expect(owner.getByText('Profile saved.')).toBeVisible()
  await owner.goto('/leagues')
  await owner.getByRole('button', { name: 'New league' }).click()
  const create = owner.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(leagueName)
  await submitLeagueCreation(owner, create)
  const leagueUrl = new URL(owner.url())
  leagueUrl.search = ''
  const leagueToken = leagueUrl.pathname.split('/').at(-1)
  if (!leagueToken) throw new Error('The created league URL has no token.')
  let organizer = owner.getByRole('link', { name: `Organized by ${ownerName}` })
  await expectOrganizerAvatar(organizer, ownerName)
  await owner.screenshot({ path: 'test-results/league-detail-organizer-desktop.png', fullPage: true })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectOrganizerAvatar(organizer, ownerName)
  await expectNoHorizontalOverflow(owner, organizer)
  await owner.screenshot({ path: 'test-results/league-detail-organizer-phone.png', fullPage: true })

  await owner.goto('/leagues')
  await owner.setViewportSize({ width: 1440, height: 900 })
  let card = owner.locator(`[data-league="${leagueToken}"]`)
  organizer = card.getByText('Organized by', { exact: true }).locator('..')
  await expectOrganizerAvatar(organizer, ownerName)
  await expectNoHorizontalOverflow(owner, card)
  await owner.screenshot({ path: 'test-results/league-card-organizer-desktop.png', fullPage: true })
  await owner.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  let dropdown = owner.getByRole('menu')
  await expectNoHorizontalOverflow(owner, card, dropdown)
  await owner.screenshot({ path: 'test-results/league-card-overflow-menu-desktop.png', fullPage: true })
  await owner.keyboard.press('Escape')
  await expect(dropdown).toBeHidden()
  await card.click({ button: 'right', position: { x: 2, y: 2 } })
  let contextMenu = owner.getByRole('menu')
  await expectNoHorizontalOverflow(owner, card, contextMenu)
  await owner.screenshot({ path: 'test-results/league-card-context-menu-desktop.png', fullPage: true })
  await contextMenu.getByRole('menuitem', { name: 'Edit league' }).click()
  let edit = owner.getByRole('dialog', { name: 'Edit league' })
  await expectNoHorizontalOverflow(owner, card, edit)
  await owner.screenshot({ path: 'test-results/edit-league-dialog-desktop.png', fullPage: true })
  await edit.getByRole('button', { name: 'Cancel' }).click()
  await expect(edit).toBeHidden()

  await owner.setViewportSize({ width: 390, height: 844 })
  await expectOrganizerAvatar(organizer, ownerName)
  await expectNoHorizontalOverflow(owner, card)
  await owner.screenshot({ path: 'test-results/league-card-organizer-phone.png', fullPage: true })
  await owner.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  dropdown = owner.getByRole('menu')
  await expect(dropdown.getByRole('menuitem', { name: 'View league' })).toBeVisible()
  await expectNoHorizontalOverflow(owner, card, dropdown)
  await owner.screenshot({ path: 'test-results/league-card-overflow-menu-phone.png', fullPage: true })
  await owner.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) },
    })
  })
  await dropdown.getByRole('menuitem', { name: 'Copy invite link' }).click()
  await expect(dropdown).toBeHidden()
  const copyError = owner.getByText('Could not copy the invite link. Try again.', { exact: true })
  await expect(copyError).toBeVisible()
  await expect(copyError).toHaveAttribute('aria-live', 'polite')
  await owner.screenshot({ path: 'test-results/league-invite-copy-error-phone.png', fullPage: true })
  await owner.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  await owner.getByRole('menuitem', { name: 'Edit league' }).click()
  await expect(copyError).toBeHidden()
  edit = owner.getByRole('dialog', { name: 'Edit league' })
  await edit.getByRole('button', { name: 'Cancel' }).click()
  await expect(edit).toBeHidden()

  await owner.reload()
  await card.click({ button: 'right', position: { x: 2, y: 2 } })
  contextMenu = owner.getByRole('menu')
  await expect(contextMenu.getByRole('menuitem', { name: 'Edit league' })).toBeVisible()
  await expectNoHorizontalOverflow(owner, card, contextMenu)
  await owner.screenshot({ path: 'test-results/league-card-context-menu-phone.png', fullPage: true })
  await owner.getByRole('menuitem', { name: 'Edit league' }).click()
  edit = owner.getByRole('dialog', { name: 'Edit league' })
  await expectNoHorizontalOverflow(owner, card, edit)
  await owner.screenshot({ path: 'test-results/edit-league-dialog-phone.png', fullPage: true })
  await edit.getByLabel('Name').fill(renamed)
  await edit.getByLabel('Details').fill('Updated event details')
  await edit.getByLabel('Player limit').fill('4')
  await edit.getByRole('button', { name: /^Public/ }).click()
  await edit.getByRole('button', { name: /^Automatic/ }).click()
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(owner.getByRole('heading', { name: renamed })).toBeVisible()
  card = owner.locator(`[data-league="${leagueToken}"]`)
  await expect(card.getByText('Updated event details', { exact: true })).toBeVisible()
  await expect(card.getByText('Public', { exact: true })).toBeVisible()
  await expect(card.getByText('0 / 4 accepted', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(owner, card)

  await owner.goto(leagueUrl.toString())
  await expect(owner.getByText('Updated event details', { exact: true })).toBeVisible()
  await expect(owner.getByText('Public', { exact: true })).toBeVisible()
  await expect(owner.getByText('Automatic entry', { exact: true })).toBeVisible()
  await expect(owner.getByText('0 / 4 accepted', { exact: true })).toBeVisible()

  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await expect(entrant.getByText('Automatic entry', { exact: true })).toBeVisible()
  await expect(entrant.getByText('1 / 4 accepted', { exact: true })).toBeVisible()
  await expect(entrant.locator(`[data-person="${entrantName}"]`).getByText('Accepted · roster pending', { exact: true })).toBeVisible()
  await owner.goto(leagueUrl.toString())
  organizer = owner.getByRole('link', { name: `Organized by ${ownerName}` })
  await expectOrganizerAvatar(organizer, ownerName)
  await owner.getByRole('button', { name: `Actions for ${renamed}` }).click()
  await owner.getByRole('menuitem', { name: 'Edit league' }).click()
  edit = owner.getByRole('dialog', { name: 'Edit league' })
  await expect(edit.getByRole('button', { name: /^Require approval/ })).toBeDisabled()
  await edit.getByRole('button', { name: 'Cancel' }).click()
  await expect(edit).toBeHidden()

  const ownerMirror = await ownerContext.newPage()
  await ownerMirror.goto(leagueUrl.toString())
  await expect(ownerMirror.getByRole('heading', { name: renamed })).toBeVisible()
  await owner.setViewportSize({ width: 1440, height: 900 })
  await owner.getByRole('button', { name: `Actions for ${renamed}` }).click()
  await owner.getByRole('menuitem', { name: 'Delete league' }).click()
  let confirmation = owner.getByRole('alertdialog', { name: `Delete ${renamed}?` })
  await expect(confirmation.getByText('Battles already started from this league stay available.', { exact: false })).toBeVisible()
  await expectNoHorizontalOverflow(owner, confirmation)
  await owner.screenshot({ path: 'test-results/delete-league-confirm-desktop.png', fullPage: true })
  await confirmation.getByRole('button', { name: 'Cancel' }).click()
  await owner.setViewportSize({ width: 390, height: 844 })
  await owner.getByRole('button', { name: `Actions for ${renamed}` }).click()
  await owner.getByRole('menuitem', { name: 'Delete league' }).click()
  confirmation = owner.getByRole('alertdialog', { name: `Delete ${renamed}?` })
  await expectNoHorizontalOverflow(owner, confirmation)
  await owner.screenshot({ path: 'test-results/delete-league-confirm-phone.png', fullPage: true })
  await confirmation.getByRole('button', { name: 'Delete league' }).click()
  await expect(owner).toHaveURL(/\/leagues\/?$/)
  await expect(owner.getByRole('heading', { name: renamed })).toHaveCount(0)
  await expect(ownerMirror).toHaveURL(/\/leagues\/?$/, { timeout: 10_000 })
  await expect(ownerMirror.getByRole('heading', { name: renamed })).toHaveCount(0)

  await ownerContext.close()
  await entrantContext.close()
})

test('a recurring league starts each event with fresh registration', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const entrantContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('LeagueOwner')
  const entrantName = uniqueName('LeagueEntrant')
  const leagueName = uniqueName('Thursday League')

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)

  await owner.goto('/leagues')
  await owner.getByRole('button', { name: 'New league' }).click()
  const create = owner.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(leagueName)
  await create.getByRole('button', { name: /^Recurring/ }).click()
  await owner.screenshot({ path: 'test-results/recurring-league-create.png', fullPage: true })
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await submitLeagueCreation(owner, create)
  await expect(owner.getByRole('heading', { name: leagueName })).toBeVisible()
  await expect(owner.getByRole('link', { name: `Organized by ${ownerName}` })).toHaveAttribute('href', /^\/users\/[^/?]+$/)
  const leagueUrl = new URL(owner.url())
  leagueUrl.search = ''
  const leagueToken = leagueUrl.pathname.split('/').at(-1)
  if (!leagueToken) throw new Error('The created league URL has no token.')

  await join(owner)
  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await sealEventRosters(leagueToken)

  await owner.reload()
  await expect(owner.getByText('2 accepted')).toBeVisible()
  await expect(owner.locator(`[data-person="${entrantName}"]`).getByRole('link', { name: entrantName })).toHaveAttribute(
    'href',
    /^\/users\/[^/?]+$/,
  )
  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()
  await expect(owner.getByRole('button', { name: 'Start new event' })).toBeVisible()
  await owner.screenshot({ path: 'test-results/recurring-league-event-1.png', fullPage: true })

  await owner.getByRole('button', { name: 'Start new event' }).click()
  await owner.getByRole('alertdialog', { name: 'Start event 2?' }).getByRole('button', { name: 'Start new event' }).click()
  await expect(owner.getByText('Event 2 · Registration open')).toBeVisible()
  await expect(owner.getByText('No entrants yet', { exact: true })).toBeVisible()
  expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await owner.screenshot({ path: 'test-results/recurring-league-event-2.png', fullPage: true })

  await entrant.goto(leagueUrl.toString())
  await expect(entrant.getByText('Event 2 · Registration open')).toBeVisible()
  await entrant.getByRole('button', { name: 'Join league' }).click()
  await expect(entrant.locator(`[data-person="${entrantName}"]`)).toBeVisible()

  await entrant.getByRole('link', { name: /Event 1/ }).click()
  await expect(entrant.locator(`[data-person="${ownerName}"]`)).toBeVisible()
  await expect(entrant.locator(`[data-person="${entrantName}"]`)).toBeVisible()

  await owner.setViewportSize({ width: 390, height: 844 })
  await owner.goto(leagueUrl.toString())
  expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await owner.screenshot({ path: 'test-results/recurring-league-phone.png', fullPage: true })

  await ownerContext.close()
  await entrantContext.close()
})

test('a 2v1 event assigns entrant sizes, filters rosters, and prepares a battle', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const alliedContext = await browser.newContext()
  const secondAlliedContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const allied = await alliedContext.newPage()
  const secondAllied = await secondAlliedContext.newPage()
  const ownerName = uniqueName('SoloEntrant')
  const alliedName = uniqueName('AlliedEntrant')
  const secondAlliedName = uniqueName('SecondAlliedEntrant')

  await signUp(owner, ownerName)
  await signUp(allied, alliedName)
  await signUp(secondAllied, secondAlliedName)
  const alliedRoster = 'Allied 1,000 roster'
  const wrongRoster = 'Solo 2,000 roster'
  await seedRosters(alliedName, [
    { name: alliedRoster, limit: 1_000 },
    { name: wrongRoster, limit: 2_000 },
  ])

  await owner.goto('/leagues')
  await owner.getByRole('button', { name: 'New league' }).click()
  const create = owner.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(uniqueName('Team League'))
  await create.getByRole('button', { name: /^2 vs 1/ }).click()
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner, create)
  await owner.screenshot({ path: 'test-results/create-2v1-league-phone.png', fullPage: true })
  await create.getByText('Battle format', { exact: true }).scrollIntoViewIfNeeded()
  await expect(create.getByText('Roster size', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(owner, create)
  await owner.screenshot({ path: 'test-results/create-2v1-league-rule-phone.png', fullPage: true })
  await submitLeagueCreation(owner, create)
  const leagueUrl = owner.url()
  const leagueToken = new URL(leagueUrl).pathname.split('/').at(-1)
  if (!leagueToken) throw new Error('The created team league URL has no token.')

  await join(owner)
  await allied.goto(leagueUrl)
  await join(allied)
  await secondAllied.goto(leagueUrl)
  await join(secondAllied)
  await owner.reload()
  await owner.getByRole('button', { name: `Assign ${ownerName} a solo roster` }).click()
  await owner.getByRole('button', { name: `Assign ${alliedName} a solo roster` }).click()
  await owner.getByRole('button', { name: `Assign ${secondAlliedName} an allied roster` }).click()
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toBeDisabled()
  await expect(owner.getByText('Assign at least two allied entrants.')).toBeVisible()
  const assignmentRows = owner.locator('[data-person]')
  await expectNoHorizontalOverflow(owner, ...(await assignmentRows.all()))
  await owner.screenshot({ path: 'test-results/league-2v1-assignments-phone.png', fullPage: true })

  await owner.getByRole('button', { name: `Assign ${alliedName} an allied roster` }).click()
  const reassignment = owner.getByRole('alertdialog', { name: `Change ${alliedName}’s roster size?` })
  await expectNoHorizontalOverflow(owner, reassignment)
  await reassignment.getByRole('button', { name: 'Change size' }).click()
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toBeEnabled()

  await allied.setViewportSize({ width: 390, height: 844 })
  await allied.reload()
  await expect(allied.locator(`[data-person="${alliedName}"]`).getByText('1,000-point roster · allied', { exact: true })).toBeVisible()
  await allied.getByRole('button', { name: 'Change roster' }).click()
  const chooser = allied.getByRole('dialog', { name: 'Seal a roster' })
  await expect(chooser.locator(`[data-roster="${alliedRoster}"]`)).toBeVisible()
  await expect(chooser.locator(`[data-roster="${wrongRoster}"]`)).toHaveCount(0)
  await expectNoHorizontalOverflow(allied, chooser)
  await allied.screenshot({ path: 'test-results/league-2v1-roster-filter.png', fullPage: true })
  await allied.keyboard.press('Escape')

  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('button', { name: 'Start 2v1 battle' }).click()
  const battleChooser = owner.getByRole('dialog', { name: 'Start 2v1 battle' })
  await expectNoHorizontalOverflow(owner, battleChooser)
  await battleChooser.getByLabel('Second allied opponent').click()
  await owner.getByRole('option', { name: secondAlliedName }).click()
  await expect(battleChooser.getByLabel('Second allied opponent')).toHaveText(secondAlliedName)
  await battleChooser.getByLabel('First allied opponent').click()
  await owner.getByRole('option', { name: alliedName }).click()
  await expect(battleChooser.getByRole('button', { name: 'Start battle' })).toBeEnabled()
  await owner.screenshot({ path: 'test-results/league-2v1-battle-chooser-phone.png', fullPage: true })
  await battleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(owner).toHaveURL(/\/battles\/[^/?]+$/)
  await expect(owner.locator('[data-players]').filter({ hasText: alliedName })).toContainText(secondAlliedName)
  await expect(owner.locator('[data-players]').filter({ hasText: ownerName })).toHaveCount(1)

  await allied.reload()
  await allied.getByRole('button', { name: 'Start 2v1 battle' }).click()
  const alliedBattleChooser = allied.getByRole('dialog', { name: 'Start 2v1 battle' })
  await expectNoHorizontalOverflow(allied, alliedBattleChooser)
  await alliedBattleChooser.getByLabel('Solo opponent').click()
  await allied.getByRole('option', { name: ownerName }).click()
  await alliedBattleChooser.getByLabel('Allied teammate').click()
  await allied.getByRole('option', { name: secondAlliedName }).click()
  await alliedBattleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(allied).toHaveURL(/\/battles\/[^/?]+$/)
  await expect(allied.locator('[data-players]').filter({ hasText: alliedName })).toContainText(secondAlliedName)
  await expect(allied.locator('[data-players]').filter({ hasText: ownerName })).toHaveCount(1)

  await ownerContext.close()
  await alliedContext.close()
  await secondAlliedContext.close()
})
