import { and, desc, eq } from 'drizzle-orm'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { befriend, createRoster, uniqueName, signUp, waitForRosterSave } from './account'
import { openDatabase } from '../src/db/connection'
import { leagueEventEntries, leagueEvents, leagues, rosters, user } from '../src/db/schema'
import { postgresPort } from './stackEnv'

test.setTimeout(180_000)

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
      .set({
        rosterName: 'Sealed roster',
        rosterSnapshot: JSON.stringify({
          name: 'Sealed roster',
          text: '2,000 points',
          built: {
            catalogueId: 'test-catalogue',
            revision: 'test-revision',
            limit: 2_000,
            detachment: null,
            disposition: null,
            units: [{ key: 'test-unit', name: 'Test unit', points: 80, models: 5 }],
          },
        }),
        submittedAt: Date.now(),
      })
      .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.status, 'accepted')))
      .returning({ userId: leagueEventEntries.userId })
    if (sealed.length !== 2) throw new Error('The league test entrants are missing.')
  } finally {
    await connection.close()
  }
}

async function makeLeagueEventLegacy(leagueToken: string) {
  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [event] = await connection.database
      .select({ id: leagueEvents.id })
      .from(leagueEvents)
      .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
      .where(eq(leagues.token, leagueToken))
      .orderBy(desc(leagueEvents.number))
      .limit(1)
    if (!event) throw new Error('The legacy league test event is missing.')
    const updated = await connection.database
      .update(leagueEvents)
      .set({ format: null, rosterLimit: null })
      .where(eq(leagueEvents.id, event.id))
      .returning({ id: leagueEvents.id })
    if (updated.length !== 1) throw new Error('The legacy league test event is missing.')
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

async function givePlayersTheSameName(existingName: string, playerName: string) {
  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [existing] = await connection.database.select({ id: user.id }).from(user).where(eq(user.name, existingName)).limit(1)
    const [player] = await connection.database.select({ id: user.id }).from(user).where(eq(user.name, playerName)).limit(1)
    if (!existing || !player) throw new Error('The duplicate-name test players are missing.')
    await connection.database.update(user).set({ name: existingName }).where(eq(user.id, player.id))
    return {
      existingLabel: `${existingName} · ${existing.id.slice(0, 8)}`,
      playerLabel: `${existingName} · ${player.id.slice(0, 8)}`,
    }
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

async function sealDoublesEventRosters(leagueToken: string, invalidWarlords = false) {
  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [event] = await connection.database
      .select({ id: leagueEvents.id })
      .from(leagueEvents)
      .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
      .where(eq(leagues.token, leagueToken))
      .orderBy(desc(leagueEvents.number))
      .limit(1)
    if (!event) throw new Error('The doubles league event is missing.')
    const entries = await connection.database
      .select({ userId: leagueEventEntries.userId, teamId: leagueEventEntries.teamId })
      .from(leagueEventEntries)
      .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.status, 'accepted')))
    if (entries.length !== 4 || entries.some((entry) => entry.teamId === null)) throw new Error('The doubles teams are incomplete.')
    const warlords = new Set<string>()
    for (const entry of entries) {
      const warlord = invalidWarlords || !warlords.has(entry.teamId!)
      warlords.add(entry.teamId!)
      await connection.database
        .update(leagueEventEntries)
        .set({
          rosterName: '1,000-point doubles roster',
          rosterSnapshot: JSON.stringify({
            name: '1,000-point doubles roster',
            text: '1,000 points',
            built: {
              catalogueId: 'test-catalogue',
              revision: 'test-revision',
              limit: 1_000,
              detachment: null,
              disposition: null,
              units: [{ key: `${entry.userId}-unit`, name: 'Test character', points: 80, models: 1, group: 'character', warlord }],
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
  const overflow = await page.locator('body *').evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const element = node as HTMLElement
        const bounds = element.getBoundingClientRect()
        return { className: element.className, left: bounds.left, right: bounds.right, scrollWidth: element.scrollWidth }
      })
      .filter((element) => element.left < 0 || element.right > document.documentElement.clientWidth)
      .slice(0, 12),
  )
  expect(documentWidth.scrollWidth, JSON.stringify(overflow)).toBe(documentWidth.clientWidth)
  for (const element of elements) {
    const visibleOverflow = await element.evaluate((node) => {
      const container = node.getBoundingClientRect()
      return [...node.querySelectorAll('*')]
        .map((child) => {
          const bounds = child.getBoundingClientRect()
          return { className: child.className, height: bounds.height, left: bounds.left, right: bounds.right, width: bounds.width }
        })
        .filter((child) => child.height > 1 && child.width > 1 && (child.left < container.left || child.right > container.right))
        .slice(0, 12)
    })
    expect(visibleOverflow).toEqual([])
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

test('a new league starts with its first event and can seal a roster', async ({ page }) => {
  const ownerName = uniqueName('LeagueOwner')
  const leagueName = uniqueName('Home League')

  await signUp(page, ownerName)
  const rosterName = await createRoster(page, {
    faction: 'Black Templars',
    detachment: /Companions of Vehemence/,
    name: 'Templar roster',
  })
  await page.getByLabel('Add a unit').fill('Captain')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Captain', exact: true }).first().click())
  await page.goto('/leagues')
  await page.getByRole('button', { name: 'New league' }).click()
  const create = page.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(leagueName)
  await expect(create.getByText('One-off', { exact: true })).toHaveCount(0)
  await expect(create.getByText('Recurring', { exact: true })).toHaveCount(0)
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await submitLeagueCreation(page, create)
  await join(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  const initialResponse = await page.reload()
  if (!initialResponse) throw new Error('The league page did not return a document response.')
  expect(await initialResponse.text()).not.toContain(rosterName)

  await page.getByRole('button', { name: 'Choose roster' }).click()
  const roster = page.getByRole('dialog', { name: 'Seal a roster' }).locator(`[data-roster="${rosterName}"]`)
  await expect(roster.getByText('Black Templars', { exact: true })).toBeVisible()
  await expect(roster.getByText('Companions of Vehemence', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/league-roster-dialog.png', fullPage: true })
  await roster.click()
  await expect(page.getByRole('dialog', { name: 'Seal a roster' })).toContainText(
    'a league roster must seal exactly one Character or Epic Hero Warlord',
  )
  await page.screenshot({ path: 'test-results/league-roster-warlord-error.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/league-roster-dialog-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('Escape')

  await expect(page.getByRole('heading', { name: 'League events' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Current event/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Event 1/ })).toHaveCount(0)
  await expect(page.locator(`[data-person="${ownerName}"]`)).toBeVisible()
  await page.screenshot({ path: 'test-results/league-first-event.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/league-first-event-phone.png', fullPage: true })
})

test('an eligible casual matchup is directed through its league event', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const entrantContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('LeagueOwner')
  const entrantName = uniqueName('LeagueEntrant')
  const leagueName = uniqueName('Guarded League')

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)
  await befriend(owner, entrant)
  await owner.goto('/leagues')
  await owner.getByRole('button', { name: 'New league' }).click()
  const create = owner.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(leagueName)
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await submitLeagueCreation(owner, create)
  const leagueUrl = new URL(owner.url())
  leagueUrl.search = ''
  const leagueToken = leagueUrl.pathname.split('/').at(-1)
  if (!leagueToken) throw new Error('The created league URL has no token.')

  await join(owner)
  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await sealEventRosters(leagueToken)
  await owner.reload()
  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()
  await makeLeagueEventLegacy(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Start 1 vs 1 battle' })).toBeVisible()
  expect(await owner.locator('aside h2').allTextContents()).toEqual(['Sealed rosters', 'League events'])
  await expectNoHorizontalOverflow(owner)
  await owner.screenshot({ path: 'test-results/legacy-league-battle-button.png', fullPage: true })

  await owner.goto('/battles')
  await owner.getByRole('button', { name: 'New casual battle' }).click()
  const casual = owner.getByRole('dialog', { name: 'Start a casual battle' })
  await casual.getByRole('combobox', { name: 'Opponent' }).click()
  await owner.getByRole('option', { name: entrantName, exact: true }).click()
  await casual.getByRole('button', { name: 'Create casual battle' }).click()
  const warning = owner.getByRole('dialog', { name: 'League battle available' })
  await expect(warning.getByRole('button', { name: 'Start casual instead' })).toBeVisible()
  await expectNoHorizontalOverflow(owner, warning)
  await owner.screenshot({ path: 'test-results/league-battle-guard-desktop.png', fullPage: true })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner, warning)
  await owner.screenshot({ path: 'test-results/league-battle-guard-phone.png', fullPage: true })
  await warning.getByRole('button', { name: new RegExp(leagueName) }).click()

  const leagueChooser = owner.getByRole('dialog', { name: 'Start 1 vs 1 battle' })
  await expect(leagueChooser).toBeVisible()
  await leagueChooser.getByRole('combobox', { name: 'Opponent' }).click()
  await owner.getByRole('option', { name: entrantName, exact: true }).click()
  await leagueChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(owner).toHaveURL(/\/battles\/[^/?]+$/)
  await owner.goto(leagueUrl.toString())
  await expect(owner.locator('[data-battle-shelf="Battles"]')).toContainText(entrantName)

  await ownerContext.close()
  await entrantContext.close()
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

test('a league starts each event with fresh registration', async ({ browser }) => {
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
  await expect(create.getByText('One-off', { exact: true })).toHaveCount(0)
  await expect(create.getByText('Recurring', { exact: true })).toHaveCount(0)
  await owner.screenshot({ path: 'test-results/league-create.png', fullPage: true })
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await submitLeagueCreation(owner, create)
  await expect(owner.getByRole('heading', { name: leagueName })).toBeVisible()
  await expect(owner.getByRole('link', { name: `Organized by ${ownerName}` })).toHaveAttribute('href', /^\/users\/[^/?]+$/)
  await expect(owner.getByText('Current event · Registration open')).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'League events' })).toBeVisible()
  await expect(owner.getByRole('link', { name: 'Current event Active' })).toBeVisible()
  await expect(owner.getByRole('link', { name: /Event 1/ })).toHaveCount(0)
  await owner.screenshot({ path: 'test-results/league-current-event.png', fullPage: true })
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
  await expect(owner.getByRole('button', { name: 'Create new event' })).toBeVisible()
  await owner.screenshot({ path: 'test-results/league-event-1.png', fullPage: true })

  await owner.getByRole('button', { name: 'Create new event' }).click()
  await owner.getByRole('alertdialog', { name: 'Create a new event?' }).getByRole('button', { name: 'Create event' }).click()
  await expect(owner.getByText('Current event · Registration open')).toBeVisible()
  await expect(owner.getByText('No entrants yet', { exact: true })).toBeVisible()
  expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await owner.screenshot({ path: 'test-results/league-event-2.png', fullPage: true })

  await owner.goto('/leagues')
  await expect(owner.locator(`[data-league="${leagueToken}"]`).getByText('2 events', { exact: true })).toBeVisible()

  await owner.goto(leagueUrl.toString())
  const events = owner.getByRole('heading', { name: 'League events' }).locator('..').locator('..')
  await expect(events.getByText('Current', { exact: true })).toBeVisible()
  await expect(events.getByRole('link', { name: 'Current event Active' })).toBeVisible()
  await expect(events.getByText('Archive', { exact: true })).toBeVisible()
  await events.getByRole('link', { name: 'Event 1 Revealed' }).click()
  await expect(owner.getByText('Archived event 1 · Rosters revealed')).toBeVisible()

  await entrant.goto(leagueUrl.toString())
  await expect(entrant.getByText('Current event · Registration open')).toBeVisible()
  await entrant.getByRole('button', { name: 'Join league' }).click()
  await expect(entrant.locator(`[data-person="${entrantName}"]`)).toBeVisible()

  await entrant.getByRole('link', { name: /Event 1/ }).click()
  await expect(entrant.locator(`[data-person="${ownerName}"]`)).toBeVisible()
  await expect(entrant.locator(`[data-person="${entrantName}"]`)).toBeVisible()

  await owner.setViewportSize({ width: 390, height: 844 })
  await owner.goto(leagueUrl.toString())
  expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await owner.screenshot({ path: 'test-results/league-events-phone.png', fullPage: true })

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
  const secondAlliedAccountName = uniqueName('SecondAlliedEntrant')
  const leagueName = uniqueName('Team League')

  await signUp(owner, ownerName)
  await signUp(allied, alliedName)
  await signUp(secondAllied, secondAlliedAccountName)
  const alliedRoster = 'Allied 1,000 roster'
  const wrongRoster = 'Solo 2,000 roster'
  await seedRosters(alliedName, [
    { name: alliedRoster, limit: 1_000 },
    { name: wrongRoster, limit: 2_000 },
  ])

  await owner.goto('/leagues')
  await owner.getByRole('button', { name: 'New league' }).click()
  const create = owner.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(leagueName)
  await create.getByRole('button', { name: /^Solo vs pair/ }).click()
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
  const { existingLabel: alliedLabel, playerLabel: secondAlliedLabel } = await givePlayersTheSameName(alliedName, secondAlliedAccountName)
  await owner.reload()
  await owner.getByRole('button', { name: `Assign ${ownerName} a solo roster` }).click()
  await owner.getByRole('button', { name: `Assign ${alliedLabel} a solo roster` }).click()
  await owner.getByRole('button', { name: `Assign ${secondAlliedLabel} an allied roster` }).click()
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toBeDisabled()
  await expect(owner.getByText('Assign at least two allied entrants.')).toBeVisible()
  const assignmentRows = owner.locator('[data-person]')
  await expectNoHorizontalOverflow(owner, ...(await assignmentRows.all()))
  await owner.screenshot({ path: 'test-results/league-2v1-assignments-phone.png', fullPage: true })

  await owner.getByRole('button', { name: `Assign ${alliedLabel} an allied roster` }).click()
  const reassignment = owner.getByRole('alertdialog', { name: `Change ${alliedLabel}’s roster size?` })
  await expectNoHorizontalOverflow(owner, reassignment)
  await reassignment.getByRole('button', { name: 'Change size' }).click()
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toBeEnabled()

  await allied.setViewportSize({ width: 390, height: 844 })
  await allied.reload()
  const ownEntrantRow = allied.locator(`[data-person="${alliedName}"]`).filter({ hasText: alliedLabel })
  await expect(ownEntrantRow.getByText('1,000-point roster · allied', { exact: true })).toBeVisible()
  await allied.getByRole('button', { name: 'Change roster' }).click()
  const chooser = allied.getByRole('dialog', { name: 'Seal a roster' })
  await expect(chooser.locator(`[data-roster="${alliedRoster}"]`)).toBeVisible()
  await expect(chooser.locator(`[data-roster="${wrongRoster}"]`)).toHaveCount(0)
  await expectNoHorizontalOverflow(allied, chooser)
  await allied.screenshot({ path: 'test-results/league-2v1-roster-filter.png', fullPage: true })
  await allied.keyboard.press('Escape')

  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  await owner.getByRole('menuitem', { name: 'Edit league' }).click()
  const edit = owner.getByRole('dialog', { name: 'Edit league' })
  await expect(edit.getByLabel('Player limit')).toHaveAttribute('min', '2')
  await edit.getByLabel('Player limit').fill('2')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()
  await owner.getByRole('button', { name: 'Create new event' }).click()
  await owner.getByRole('alertdialog', { name: 'Create a new event?' }).getByRole('button', { name: 'Create event' }).click()
  await expect(owner.getByText('Current event · Registration open')).toBeVisible()
  await owner.getByRole('link', { name: /Event 1/ }).click()
  await owner.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  await owner.getByRole('menuitem', { name: 'Edit league' }).click()
  const historicalEdit = owner.getByRole('dialog', { name: 'Edit league' })
  await expect(historicalEdit.getByLabel('Player limit')).toHaveAttribute('min', '2')
  await historicalEdit.getByRole('button', { name: 'Cancel' }).click()
  await owner.getByRole('button', { name: 'Start 2 vs 1 battle' }).click()
  const battleChooser = owner.getByRole('dialog', { name: 'Start 2 vs 1 battle' })
  await expectNoHorizontalOverflow(owner, battleChooser)
  await battleChooser.getByLabel('Second opponent').click()
  await owner.getByRole('option', { name: secondAlliedLabel }).click()
  await expect(battleChooser.getByLabel('Second opponent')).toContainText(secondAlliedLabel)
  await battleChooser.getByLabel('First opponent').click()
  await owner.getByRole('option', { name: alliedLabel }).click()
  await expect(battleChooser.getByRole('button', { name: 'Start battle' })).toBeEnabled()
  await owner.screenshot({ path: 'test-results/league-2v1-battle-chooser-phone.png', fullPage: true })
  await battleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(owner).toHaveURL(/\/battles\/[^/?]+$/)
  await expect(owner.locator('[data-players]').filter({ hasText: alliedName }).getByText(alliedName, { exact: true })).toHaveCount(2)
  await expect(owner.locator('[data-players]').filter({ hasText: ownerName })).toHaveCount(1)

  const spectatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const spectator = await spectatorContext.newPage()
  await spectator.goto(leagueUrl)
  const eventBattle = spectator.locator('a[href^="/battles/"]').first()
  await expect(eventBattle).toContainText(ownerName)
  await eventBattle.click()
  await expect(spectator.getByText('Battle setup', { exact: true })).toBeVisible()
  await expect(spectator.getByText('Spectators can follow the score, armies, and event log without changing the battle.')).toBeVisible()
  await expect(spectator.getByRole('button', { name: 'Open 2,000-point roster' })).toBeVisible()
  await expect(spectator.getByRole('button', { name: 'Open 1,000-point roster' })).toHaveCount(2)
  await expect(spectator.getByRole('button', { name: 'Begin battle' })).toHaveCount(0)
  const spectatorPlayer = spectator.getByRole('link', { name: ownerName, exact: true })
  await expect(spectatorPlayer).toHaveAttribute('href', /^\/users\/[^/?]+\?battle=/)
  const spectatorRosterLink = spectator.getByRole('link', { name: '2,000-point roster', exact: true })
  await expect(spectatorRosterLink).toHaveAttribute('href', /^\/rosters\/[^/?]+\?battle=/)
  await expectNoHorizontalOverflow(spectator)
  await spectator.screenshot({ path: 'test-results/league-battle-spectator-desktop.png', fullPage: true })
  await spectatorPlayer.click()
  await expect(spectator.getByRole('heading', { name: ownerName })).toBeVisible()
  await spectator.goBack()
  await expect(spectator.getByText('Battle setup', { exact: true })).toBeVisible()
  await spectator.getByRole('link', { name: '2,000-point roster', exact: true }).click()
  await expect(spectator.locator('[data-roster-builder]').getByText('2,000 points', { exact: true })).toBeVisible()
  await spectator.goBack()
  await expect(spectator.getByText('Battle setup', { exact: true })).toBeVisible()
  await spectator.getByRole('button', { name: 'Open 2,000-point roster' }).click()
  const spectatorRoster = spectator.locator('[data-army-roster]')
  await expect(spectatorRoster.locator('[data-unit="Test unit"]')).toBeVisible()
  await expect(spectatorRoster.getByRole('button', { name: /Mark .* lost/ })).toHaveCount(0)
  await expectNoHorizontalOverflow(spectator, spectatorRoster)
  await spectator.screenshot({ path: 'test-results/league-battle-spectator-roster-desktop.png', fullPage: true })
  await spectator.keyboard.press('Escape')
  await expect(spectatorRoster).toBeHidden()
  await spectator.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(spectator)
  await spectator.screenshot({ path: 'test-results/league-battle-spectator-phone.png', fullPage: true })
  await spectator.getByRole('button', { name: 'Open 2,000-point roster' }).click()
  await expectNoHorizontalOverflow(spectator, spectatorRoster)
  await spectator.screenshot({ path: 'test-results/league-battle-spectator-roster-phone.png', fullPage: true })
  await spectator.keyboard.press('Escape')
  await expect(spectatorRoster).toBeHidden()

  await allied.reload()
  await allied.getByRole('button', { name: 'Start 2 vs 1 battle' }).click()
  const alliedBattleChooser = allied.getByRole('dialog', { name: 'Start 2 vs 1 battle' })
  await expectNoHorizontalOverflow(allied, alliedBattleChooser)
  await alliedBattleChooser.getByLabel('Opponent').click()
  await allied.getByRole('option', { name: ownerName }).click()
  await alliedBattleChooser.getByLabel('Your ally').click()
  await allied.getByRole('option', { name: secondAlliedLabel }).click()
  await alliedBattleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(allied).toHaveURL(/\/battles\/[^/?]+$/)
  await expect(allied.locator('[data-players]').filter({ hasText: alliedName }).getByText(alliedName, { exact: true })).toHaveCount(2)
  await expect(allied.locator('[data-players]').filter({ hasText: ownerName })).toHaveCount(1)

  await ownerContext.close()
  await alliedContext.close()
  await secondAlliedContext.close()
  await spectatorContext.close()
})

test('a doubles event pairs teams, filters half-size rosters, and starts a four-seat battle', async ({ browser, page: owner }) => {
  const names = ['Doubles owner', 'Doubles teammate', 'Doubles opponent', 'Doubles opponent teammate'].map(uniqueName)
  const contexts = []
  const pages = [owner]
  await signUp(owner, names[0])
  for (let index = 1; index < 4; index++) {
    const context = await browser.newContext()
    contexts.push(context)
    const participant = await context.newPage()
    pages.push(participant)
    await signUp(participant, names[index])
  }
  const [, teammate] = pages
  await seedRosters(names[1], [
    { name: 'Eligible doubles roster', limit: 1_000 },
    { name: 'Wrong doubles roster', limit: 2_000 },
  ])

  await owner.goto('/leagues')
  await owner.getByRole('button', { name: 'New league' }).click()
  const create = owner.getByRole('dialog', { name: 'Create league' })
  await create.getByLabel('Name').fill(uniqueName('Doubles League'))
  await create.getByRole('button', { name: /^Doubles/ }).click()
  await create.getByLabel('Player limit').fill('4')
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner, create)
  await owner.screenshot({ path: 'test-results/create-doubles-league-phone.png', fullPage: true })
  await submitLeagueCreation(owner, create)
  const leagueUrl = owner.url()
  const leagueToken = new URL(leagueUrl).pathname.split('/').at(-1)
  if (!leagueToken) throw new Error('The created doubles league URL has no token.')

  await join(owner)
  for (const page of pages.slice(1)) {
    await page.goto(leagueUrl)
    await join(page)
  }
  await owner.reload()
  const pair = async (captain: string, partner: string) => {
    await owner.getByRole('button', { name: `Pair ${captain}`, exact: true }).click()
    const dialog = owner.getByRole('dialog', { name: `Assign ${captain}’s team` })
    await dialog.getByLabel(`Teammate for ${captain}`).click()
    await owner.getByRole('option', { name: partner, exact: true }).click()
    await dialog.getByRole('button', { name: 'Assign team' }).click()
    await expect(dialog).toBeHidden()
  }
  await pair(names[0], names[1])
  await pair(names[2], names[3])
  await expect(owner.locator(`[data-person="${names[0]}"]`)).toContainText(`paired with ${names[1]}`)
  await expect(owner.locator(`[data-person="${names[2]}"]`)).toContainText(`paired with ${names[3]}`)
  await owner.reload()
  await expect(owner.locator(`[data-person="${names[0]}"]`)).toContainText(`paired with ${names[1]}`)
  await expect(owner.locator(`[data-person="${names[2]}"]`)).toContainText(`paired with ${names[3]}`)
  expect(await owner.locator('aside h2').allTextContents()).toEqual(['Sealed rosters', 'Organizer', 'League events'])
  await owner.setViewportSize({ width: 1440, height: 900 })
  await owner.screenshot({ path: 'test-results/doubles-team-assignments-desktop.png', fullPage: true })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner, ...(await owner.locator('[data-person]').all()))
  await owner.screenshot({ path: 'test-results/doubles-team-assignments-phone.png', fullPage: true })

  await teammate.setViewportSize({ width: 390, height: 844 })
  await teammate.reload()
  await teammate.getByRole('button', { name: 'Choose roster' }).click()
  const rosterChooser = teammate.getByRole('dialog', { name: 'Seal a roster' })
  await expect(rosterChooser.locator('[data-roster="Eligible doubles roster"]')).toBeVisible()
  await expect(rosterChooser.locator('[data-roster="Wrong doubles roster"]')).toHaveCount(0)
  await expectNoHorizontalOverflow(teammate, rosterChooser)
  await teammate.keyboard.press('Escape')

  await sealDoublesEventRosters(leagueToken, true)
  await owner.reload()
  await owner.getByRole('button', { name: `Re-pair ${names[0]}`, exact: true }).click()
  const rePair = owner.getByRole('dialog', { name: `Assign ${names[0]}’s team` })
  await expect(rePair).toContainText(`Currently paired with ${names[1]}`)
  await rePair.getByLabel(`Teammate for ${names[0]}`).click()
  await owner.getByRole('option', { name: new RegExp(`${names[2]}.*paired with ${names[3]}`) }).click()
  await rePair.getByRole('button', { name: 'Assign team' }).click()
  const clearRosters = owner.getByRole('alertdialog', { name: 'Clear sealed doubles rosters?' })
  for (const name of names) await expect(clearRosters).toContainText(name)
  await owner.setViewportSize({ width: 1440, height: 900 })
  await expectNoHorizontalOverflow(
    owner,
    clearRosters.locator('[data-slot="alert-dialog-header"]'),
    clearRosters.locator('[data-slot="alert-dialog-footer"]'),
  )
  await owner.screenshot({ path: 'test-results/doubles-repair-confirmation-desktop.png', fullPage: true })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(
    owner,
    clearRosters.locator('[data-slot="alert-dialog-header"]'),
    clearRosters.locator('[data-slot="alert-dialog-footer"]'),
  )
  await owner.screenshot({ path: 'test-results/doubles-repair-confirmation-phone.png', fullPage: true })
  await clearRosters.getByRole('button', { name: 'Keep current teams' }).click()
  await rePair.getByRole('button', { name: 'Cancel' }).click()

  await owner.getByRole('button', { name: `Remove ${names[0]}`, exact: true }).click()
  const removeEntrant = owner.getByRole('alertdialog', { name: `Remove ${names[0]}?` })
  await expect(removeEntrant).toContainText(`This also unpairs ${names[1]}. Both teammates’ sealed rosters will be cleared.`)
  await owner.setViewportSize({ width: 1440, height: 900 })
  await expectNoHorizontalOverflow(
    owner,
    removeEntrant.locator('[data-slot="alert-dialog-header"]'),
    removeEntrant.locator('[data-slot="alert-dialog-footer"]'),
  )
  await owner.screenshot({ path: 'test-results/doubles-remove-confirmation-desktop.png', fullPage: true })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(
    owner,
    removeEntrant.locator('[data-slot="alert-dialog-header"]'),
    removeEntrant.locator('[data-slot="alert-dialog-footer"]'),
  )
  await owner.screenshot({ path: 'test-results/doubles-remove-confirmation-phone.png', fullPage: true })
  let releaseRemoval = () => {}
  const removalReleased = new Promise<void>((resolve) => (releaseRemoval = resolve))
  await owner.route('**/*', async (route) => {
    if (route.request().method() === 'POST') {
      await removalReleased
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await removeEntrant.getByRole('button', { name: 'Remove entrant' }).click()
  await expect(removeEntrant).toHaveAttribute('aria-busy', 'true')
  await expect(removeEntrant.getByRole('button', { name: 'Keep entrant' })).toBeDisabled()
  await expect(removeEntrant.getByRole('button', { name: 'Removing…' })).toBeDisabled()
  releaseRemoval()
  await expect(removeEntrant.getByRole('alert')).toBeVisible()
  await owner.unrouteAll({ behavior: 'wait' })
  await removeEntrant.getByRole('button', { name: 'Keep entrant' }).click()

  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  const reveal = owner.getByRole('alertdialog', { name: 'Reveal every roster?' })
  let releaseReveal = () => {}
  const revealReleased = new Promise<void>((resolve) => (releaseReveal = resolve))
  await owner.route('**/*', async (route) => {
    if (route.request().method() === 'POST') await revealReleased
    await route.continue()
  })
  await reveal.getByRole('button', { name: 'Reveal all rosters' }).click()
  await expect(reveal).toHaveAttribute('aria-busy', 'true')
  await expect(reveal.getByRole('button', { name: 'Keep rosters sealed' })).toBeDisabled()
  await expect(reveal.getByRole('button', { name: 'Revealing…' })).toBeDisabled()
  releaseReveal()
  await expect(reveal.getByRole('alert')).toHaveText('each doubles team must select exactly one Warlord before reveal')
  await owner.unrouteAll({ behavior: 'wait' })
  await sealDoublesEventRosters(leagueToken)
  await reveal.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('button', { name: 'Start 2 vs 2 battle' }).click()
  const battleChooser = owner.getByRole('dialog', { name: 'Start 2 vs 2 battle' })
  await battleChooser.getByLabel('Opposing team').click()
  const opposingTeam = owner.getByRole('option', { name: `${names[2]} & ${names[3]}`, exact: true })
  await expect(opposingTeam).toBeVisible()
  await opposingTeam.click()
  await expectNoHorizontalOverflow(owner, battleChooser)
  await owner.screenshot({ path: 'test-results/doubles-battle-chooser-phone.png', fullPage: true })
  await battleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(owner).toHaveURL(/\/battles\/[^/?]+$/)
  const sides = owner.locator('[data-players]')
  await expect(sides).toHaveCount(2)
  await expect(sides.nth(0)).toContainText(names[0])
  await expect(sides.nth(0)).toContainText(names[1])
  await expect(sides.nth(1)).toContainText(names[2])
  await expect(sides.nth(1)).toContainText(names[3])
  await expectNoHorizontalOverflow(owner)
  await owner.setViewportSize({ width: 1440, height: 900 })
  await owner.screenshot({ path: 'test-results/doubles-league-battle-desktop.png', fullPage: true })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner)
  await owner.screenshot({ path: 'test-results/doubles-league-battle-phone.png', fullPage: true })

  await Promise.all(contexts.map((context) => context.close()))
})
