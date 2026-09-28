import { expect, test, type Locator, type Page } from '@playwright/test'
import { z } from 'zod'
import { befriend, createRoster, uniqueName, signUp, waitForRosterSave } from './account'
import { productOperator, productSql, withAuthSql } from './storage'

test.setTimeout(180_000)

async function eventForLeague(leagueToken: string) {
  const [league] = await productSql<{ id: string }>`SELECT id FROM leagues WHERE token = ${leagueToken}`
  if (!league) throw new Error('The league test league is missing.')
  const events = await productSql<{ id: string; number: number }>`SELECT id, number FROM league_events WHERE league_id = ${league.id}`
  const event = events.toSorted((left, right) => right.number - left.number)[0]
  if (!event) throw new Error('The league test event is missing.')
  return event
}

function snapshot(userId: string, limit: number, warlord: boolean, name: string, unitName: string) {
  return JSON.stringify({
    name,
    text: `${limit.toLocaleString()} points`,
    built: {
      catalogueId: 'test-catalogue',
      revision: 'test-revision',
      limit,
      detachment: null,
      disposition: null,
      units: [
        {
          key: `${userId}-unit`,
          name: unitName,
          points: 80,
          models: 1,
          group: 'character',
          warlord,
          warlordEligible: true,
        },
      ],
    },
  })
}

function option<T>(value: [number, T | []]): T | null {
  return value[0] === 0 ? (value[1] as T) : null
}

async function submitFixtureRoster(
  leagueToken: string,
  eventId: string,
  userId: string,
  limit: number,
  warlord: boolean,
  name: string,
  unitName = 'Test unit',
) {
  const product = await productOperator()
  const [league] = await productSql<{ owner_id: string }>`SELECT owner_id FROM leagues WHERE token = ${leagueToken}`
  if (!league) throw new Error('The league test league is missing.')
  const [event] = await productSql<{ token: string }>`SELECT token FROM league_events WHERE id = ${eventId}`
  if (!event) throw new Error('The league test event is missing.')
  const now = Date.now()
  const rosterId = `${eventId}-${userId}-fixture`
  const saved = await product.saveRoster({
    id: rosterId,
    userId,
    name,
    catalogueId: 'test-catalogue',
    detachmentId: null,
    disposition: null,
    limit,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    visibility: 'private',
    source: 'editable',
    now,
  })
  if (!saved) throw new Error('The league fixture roster was refused.')
  const result = await product.leagueCommand(
    {
      op: 'submit',
      token: leagueToken,
      eventToken: event.token,
      ownerId: league.owner_id,
      userId,
      rosterId,
      rosterName: name,
      rosterLimit: limit,
      rosterUpdatedAt: now,
      snapshot: snapshot(userId, limit, warlord, name, unitName),
      now,
    },
    z.object({ outcome: z.string() }),
  )
  return result.outcome
}

async function sealEventRosters(leagueToken: string) {
  const event = await eventForLeague(leagueToken)
  const entries = await productSql<{
    user_id: string
  }>`SELECT user_id FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
  if (entries.length !== 2) throw new Error('The league test entrants are missing.')
  for (const entry of entries) {
    if ((await submitFixtureRoster(leagueToken, event.id, entry.user_id, 2_000, true, 'Sealed roster')) !== 'sealed') {
      throw new Error('The league fixture roster was not sealed.')
    }
  }
}

async function createLegacyLeague(ownerName: string, leagueName: string) {
  const owner = await withAuthSql(
    (database) => database.prepare('SELECT id FROM user WHERE name = ? LIMIT 1').get(ownerName) as { id: string } | undefined,
  )
  if (!owner) throw new Error('The legacy league owner is missing.')
  const token = crypto.randomUUID()
  const product = await productOperator()
  await product.leagueCommand(
    {
      op: 'create',
      id: crypto.randomUUID(),
      token,
      eventId: crypto.randomUUID(),
      eventToken: crypto.randomUUID(),
      ownerId: owner.id,
      name: leagueName,
      description: '',
      visibility: 'public',
      admission: 'automatic',
      playerLimit: null,
      recurring: false,
      format: null,
      rosterLimit: null,
      now: Date.now(),
    },
    z.null(),
  )
  return token
}

async function seedRosters(playerName: string, values: { name: string; limit: number }[]) {
  const player = await withAuthSql(
    (database) => database.prepare('SELECT id FROM user WHERE name = ? LIMIT 1').get(playerName) as { id: string } | undefined,
  )
  if (!player) throw new Error('The roster test player is missing.')
  const now = Date.now()
  const product = await productOperator()
  for (const [index, value] of values.entries()) {
    const id = `${player.id}-${value.limit}-${index}`
    await product.saveRoster({
      id,
      userId: player.id,
      name: value.name,
      catalogueId: 'test-catalogue',
      detachmentId: null,
      disposition: null,
      limit: value.limit,
      picks: '[]',
      prep: null,
      tags: '[]',
      waivedRules: '[]',
      visibility: 'private',
      source: 'editable',
      now: now + index,
    })
  }
}

async function givePlayersTheSameName(existingName: string, playerName: string) {
  return withAuthSql((database) => {
    const existing = database.prepare('SELECT id FROM user WHERE name = ? LIMIT 1').get(existingName) as { id: string } | undefined
    const player = database.prepare('SELECT id FROM user WHERE name = ? LIMIT 1').get(playerName) as { id: string } | undefined
    if (!existing || !player) throw new Error('The duplicate-name test players are missing.')
    database.prepare('UPDATE user SET name = ? WHERE id = ?').run(existingName, player.id)
    return {
      existingLabel: `${existingName} · ${existing.id.slice(0, 8)}`,
      playerLabel: `${existingName} · ${player.id.slice(0, 8)}`,
    }
  })
}

async function sealTeamEventRosters(leagueToken: string) {
  const event = await eventForLeague(leagueToken)
  const entries = await productSql<{
    user_id: string
    required_limit: [number, number | []]
  }>`SELECT user_id, required_limit FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
  if (entries.length !== 3 || entries.some((entry) => option(entry.required_limit) === null)) {
    throw new Error('The team league assignments are incomplete.')
  }
  for (const entry of entries) {
    const limit = option(entry.required_limit)!
    const name = `${limit.toLocaleString()}-point roster`
    const outcome = await submitFixtureRoster(leagueToken, event.id, entry.user_id, limit, true, name)
    if (outcome !== 'sealed') throw new Error(`The team league fixture roster returned ${outcome} for ${entry.user_id}.`)
  }
}

async function sealDoublesEventRosters(leagueToken: string, invalidWarlords = false) {
  const event = await eventForLeague(leagueToken)
  const entries = await productSql<{
    user_id: string
    team_id: [number, string | []]
  }>`SELECT user_id, team_id FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
  if (entries.length !== 4 || entries.some((entry) => option(entry.team_id) === null)) throw new Error('The doubles teams are incomplete.')
  const warlords = new Set<string>()
  let teammate: (typeof entries)[number] | undefined
  for (const entry of entries) {
    const teamId = option(entry.team_id)!
    const warlord = !warlords.has(teamId)
    if (!warlord) teammate = entry
    warlords.add(teamId)
    const outcome = await submitFixtureRoster(
      leagueToken,
      event.id,
      entry.user_id,
      1_000,
      warlord,
      '1,000-point doubles roster',
      'Test character',
    )
    if (outcome !== 'sealed') {
      throw new Error(`The doubles league fixture roster returned ${outcome}.`)
    }
  }
  if (invalidWarlords && teammate) {
    const outcome = await submitFixtureRoster(
      leagueToken,
      event.id,
      teammate.user_id,
      1_000,
      true,
      '1,000-point doubles roster',
      'Test character',
    )
    if (outcome !== 'invalid-warlords') throw new Error(`A doubles team accepted two Warlords: ${outcome}.`)
  }
}

async function sealOwnRoster(page: Page, rosterName: string) {
  await page.getByRole('button', { name: /^(?:Choose|Change) roster$/ }).click()
  await page.getByRole('dialog', { name: 'Seal a roster' }).locator(`[data-roster="${rosterName}"]`).click()
  await expect(page.getByRole('dialog', { name: 'Seal a roster' })).toBeHidden()
}

/** A roster a league accepts: one Warlord, plus whatever else it is asked to field. */
async function sealableRoster(page: Page, name: string, extraUnit?: string) {
  await createRoster(page, { faction: 'Necrons', detachment: /Cursed Legion/, name })
  await page.getByLabel('Add a unit').fill('Skorpekh Lord')
  await page.getByRole('button', { name: 'Add Skorpekh Lord', exact: true }).first().click()
  await page.locator('[data-unit="Skorpekh Lord"]').getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Make Skorpekh Lord Warlord' }).click())
  if (!extraUnit) return
  await page.getByLabel('Add a unit').fill(extraUnit)
  await waitForRosterSave(page, () =>
    page
      .getByRole('button', { name: `Add ${extraUnit}`, exact: true })
      .first()
      .click(),
  )
}

async function join(page: Page) {
  const button = page.getByRole('button', { name: 'Join league' })
  await button.click()
  await expect(button).toBeHidden()
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

async function openLeagueCreation(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Create league' })
  await expect(async () => {
    await page.getByRole('button', { name: 'New league' }).click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  return dialog
}

/** The organizer settles the shape of the games on the league page, before anyone seals a list. */
async function chooseBattleFormat(page: Page, format: RegExp) {
  await page.getByRole('button', { name: 'Change format and points' }).click()
  const rules = page.getByRole('alertdialog', { name: 'Change the battle format?' })
  await rules.getByRole('button', { name: format }).click()
  await rules.getByRole('button', { name: 'Save format' }).click()
  await expect(rules).toBeHidden()
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
  const create = await openLeagueCreation(page)
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
  await expect(page.getByRole('alert')).toHaveText('a league roster must seal exactly one Character or Epic Hero Warlord')
  await page.screenshot({ path: 'test-results/league-roster-warlord-error.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/league-roster-dialog-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('Escape')

  await expect(page.getByRole('heading', { name: 'League events' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Event 1 Open' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator(`[data-person="${ownerName}"]`)).toBeVisible()
  await page.screenshot({ path: 'test-results/league-first-event.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/league-first-event-phone.png', fullPage: true })
})

test('only a changed roster in an open league event offers replacement', async ({ page }) => {
  await signUp(page, uniqueName('RosterOwner'))
  await sealableRoster(page, 'Original league list')
  const rosterUrl = page.url()
  await page.goto('/leagues')
  const create = await openLeagueCreation(page)
  await create.getByLabel('Name').fill(uniqueName('Replacement league'))
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await submitLeagueCreation(page, create)
  await join(page)
  await sealOwnRoster(page, 'Original league list')

  const editorResponse = await page.goto(rosterUrl)
  expect(await editorResponse?.text()).not.toContain('League roster out of date')
  await expect(page.getByRole('button', { name: 'League roster out of date' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/league-roster-current-phone.png', fullPage: true })
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Updated league list'), 'Updated league list')
  const footer = page.locator('footer')
  const update = footer.getByRole('button', { name: 'League roster out of date' })
  await expect(update).toBeVisible()
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Original league list'), 'Original league list')
  await expect(update).toHaveCount(0)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Updated league list'), 'Updated league list')
  await expect(update).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/league-roster-editor-phone.png', fullPage: true })
  const footerHeight = (await footer.boundingBox())?.height
  await update.click()
  await expect(page.getByText('Your changes are not in the league roster yet.')).toBeVisible()
  expect((await footer.boundingBox())?.height).toBe(footerHeight)
  await page.screenshot({ path: 'test-results/league-roster-details-phone.png', fullPage: true })
  await page.getByRole('link', { name: 'Replace league roster' }).click()
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await expect(chooser).toBeVisible()
  await expect(page.getByText('Original league list is sealed.')).toBeVisible()
  await chooser.locator('[data-roster="Updated league list"]').click()
  await expect(page.getByText('Updated league list is sealed.')).toBeVisible()
  await page.goto(rosterUrl)
  await expect(page.getByRole('button', { name: 'League roster out of date' })).toHaveCount(0)
})

test('the organizer unseals a revealed roster so its entrant can seal a corrected one', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const entrantContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('UnsealOwner')
  const entrantName = uniqueName('UnsealEntrant')

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)
  await sealableRoster(owner, 'Organizer list')
  const organizerRosterUrl = owner.url()
  await sealableRoster(entrant, 'Mistaken list')
  await sealableRoster(entrant, 'Corrected list', 'Lokhust Destroyers')
  await owner.goto('/leagues')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Unseal League'))
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await submitLeagueCreation(owner, create)
  const leagueUrl = new URL(owner.url())
  leagueUrl.search = ''
  await join(owner)
  await sealOwnRoster(owner, 'Organizer list')
  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await sealOwnRoster(entrant, 'Mistaken list')
  await owner.reload()
  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.goto(organizerRosterUrl)
  await waitForRosterSave(owner, () => owner.getByLabel('List name').fill('Organizer list revised'), 'Organizer list revised')
  await expect(owner.getByRole('button', { name: 'League roster out of date' })).toHaveCount(0)
  await owner.goto(leagueUrl.toString())
  const entrantRow = owner.locator(`[data-person="${entrantName}"]`)
  await expect(entrantRow.getByText('List revealed')).toBeVisible()
  await owner.screenshot({ path: 'test-results/league-unseal-revealed.png', fullPage: true })
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner)
  await owner.screenshot({ path: 'test-results/league-unseal-revealed-phone.png', fullPage: true })
  await owner.setViewportSize({ width: 1440, height: 900 })

  await entrantRow.getByRole('button', { name: `Unseal ${entrantName}’s roster` }).click()
  const confirm = owner.getByRole('alertdialog', { name: `Unseal ${entrantName}’s roster?` })
  await expectNoHorizontalOverflow(owner, confirm)
  await owner.screenshot({ path: 'test-results/league-unseal-confirm.png', fullPage: true })
  await confirm.getByRole('button', { name: 'Unseal roster' }).click()

  await expect(entrantRow.getByText('No list')).toBeVisible()
  await expect(entrantRow.getByRole('button', { name: 'View roster' })).toHaveCount(0)
  await owner.screenshot({ path: 'test-results/league-unseal-reopened.png', fullPage: true })

  await entrant.reload()
  await expect(entrant.getByText('The organizer unsealed your list.')).toBeVisible()
  await expect(entrant.getByRole('button', { name: 'Start 1 vs 1 battle' })).toHaveCount(0)
  await expect(entrant.getByRole('button', { name: /^Unseal / })).toHaveCount(0)
  await expectNoHorizontalOverflow(entrant)
  await entrant.screenshot({ path: 'test-results/league-unseal-entrant.png', fullPage: true })

  await sealOwnRoster(entrant, 'Corrected list')
  await expect(entrant.getByRole('button', { name: 'Start 1 vs 1 battle' })).toBeVisible()
  await owner.reload()
  await expect(entrantRow.getByText('List revealed')).toBeVisible()
  const revealedPage = owner.waitForEvent('popup')
  await entrantRow.getByRole('button', { name: 'View roster' }).click()
  const revealed = await revealedPage

  await expect(revealed.locator('[data-unit="Lokhust Destroyers"]')).toBeVisible()
  await owner.screenshot({ path: 'test-results/league-unseal-resealed.png', fullPage: true })
  await revealed.close()
  await ownerContext.close()
  await entrantContext.close()
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
  const leagueToken = await createLegacyLeague(ownerName, leagueName)
  const leagueUrl = new URL(`/leagues/${leagueToken}`, owner.url())
  await owner.goto(leagueUrl.toString())

  await join(owner)
  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await sealEventRosters(leagueToken)
  await owner.reload()
  await owner.getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Start 1 vs 1 battle' })).toBeVisible()
  expect(await owner.locator('aside h2').allTextContents()).toEqual(['Sealed rosters', 'League events'])
  await expectNoHorizontalOverflow(owner)
  await owner.screenshot({ path: 'test-results/legacy-league-battle-button.png', fullPage: true })

  await owner.goto('/battles')
  await owner.getByRole('button', { name: 'New battle' }).click()
  const casual = owner.getByRole('dialog', { name: 'Start a battle' })
  await casual.getByRole('combobox', { name: 'Opponent' }).click()
  await owner.getByRole('option', { name: entrantName, exact: true }).click()
  await casual.getByRole('button', { name: 'Start battle' }).click()
  const warning = owner.getByRole('dialog', { name: 'You are both in a league event' })
  await expect(warning.getByRole('button', { name: 'Play it casually' })).toBeVisible()
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
  await waitForRosterSave(owner, () => owner.getByRole('button', { name: 'Make Skorpekh Lord Warlord' }).click())

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
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Roster reveal'))
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await create.getByRole('button', { name: 'Create league' }).click()
  await join(owner)
  await owner.getByRole('button', { name: 'Choose roster' }).click()
  await owner.getByRole('dialog', { name: 'Seal a roster' }).locator(`[data-roster="${rosterName}"]`).click()
  await expect(owner.getByText(`${rosterName} is sealed.`)).toBeVisible()
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
  const unit = guest.locator('aside[aria-label="Loadout"]')
  await expect(unit.getByText('Mark of the Nekrosor', { exact: true })).toBeVisible()
  await guest.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', { name: 'Lokhust Destroyers', exact: true }).click()
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await guest.screenshot({ path: 'test-results/revealed-roster-details.png', fullPage: true })

  const rosterUrl = guest.url()
  const lokhustButton = guest.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', {
    name: 'Lokhust Destroyers',
    exact: true,
  })
  await guest.setViewportSize({ width: 390, height: 844 })
  const rosterUnits = guest.locator('[data-slot="roster-units"]')
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await rosterUnits.evaluate((element) => element.scrollWidth)).toBe(await rosterUnits.evaluate((element) => element.clientWidth))
  await expect(unit).toHaveCSS('position', 'fixed')
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await unit.evaluate((element) => element.scrollWidth)).toBe(await unit.evaluate((element) => element.clientWidth))
  await guest.screenshot({ path: 'test-results/revealed-roster-details-phone.png', fullPage: true })

  await guest.goBack()
  await expect(guest).toHaveURL(rosterUrl)
  await expect(unit).toBeHidden()
  await expect(lokhustButton).toBeFocused()

  await guest.goForward()
  await expect(unit).toBeVisible()
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()

  await guest.setViewportSize({ width: 1024, height: 768 })
  await expect(unit).toHaveCSS('position', 'static')
  await expect(guest).toHaveURL(rosterUrl)
  await expect(lokhustButton).toBeFocused()

  await guest.setViewportSize({ width: 390, height: 844 })
  await expect(unit).toHaveCSS('position', 'fixed')
  await expect(unit.getByRole('button', { name: 'Back to roster' })).toBeFocused()
  await unit.getByRole('button', { name: 'Back to roster' }).click()
  await expect(guest).toHaveURL(rosterUrl)
  await expect(unit).toBeHidden()

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
  const create = await openLeagueCreation(owner)
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
  await dropdown.getByRole('menuitem', { name: 'Share invite' }).click()
  await expect(dropdown).toBeHidden()
  const copyError = owner.getByText('Could not share the invite. Try again.', { exact: true })
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
  await expect(entrant.locator(`[data-person="${entrantName}"]`).getByText('Accepted · no list yet', { exact: true })).toBeVisible()
  await owner.goto(leagueUrl.toString())
  organizer = owner.getByRole('link', { name: `Organized by ${ownerName}` })
  await expectOrganizerAvatar(organizer, ownerName)
  await owner.getByRole('button', { name: `Actions for ${renamed}` }).click()
  await owner.getByRole('menuitem', { name: 'Edit league' }).click()
  edit = owner.getByRole('dialog', { name: 'Edit league' })
  await edit.getByRole('button', { name: /^Require approval/ }).click()
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()
  await expect(owner.getByText('Approval required', { exact: true })).toBeVisible()

  const ownerMirror = await ownerContext.newPage()
  await ownerMirror.goto(leagueUrl.toString())
  await expect(ownerMirror.getByRole('heading', { name: renamed })).toBeVisible()
  await owner.setViewportSize({ width: 1440, height: 900 })
  await owner.getByRole('button', { name: `Actions for ${renamed}` }).click()
  await owner.getByRole('menuitem', { name: 'Delete league' }).click()
  let confirmation = owner.getByRole('alertdialog', { name: `Delete ${renamed}?` })
  await expect(confirmation.getByText('Battles already started from it stay where they are.', { exact: false })).toBeVisible()
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
  const create = await openLeagueCreation(owner)
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
  await expect(owner.getByRole('link', { name: 'Event 1 Open' })).toHaveAttribute('aria-current', 'page')
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
  await expect(events.getByRole('link', { name: 'Event 2 Current Open' })).toHaveAttribute('aria-current', 'page')
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
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(leagueName)
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner, create)
  await owner.screenshot({ path: 'test-results/create-2v1-league-phone.png', fullPage: true })
  await submitLeagueCreation(owner, create)
  await owner.getByRole('button', { name: 'Change format and points' }).click()
  const rules = owner.getByRole('alertdialog', { name: 'Change the battle format?' })
  await rules.getByRole('button', { name: /^Solo vs pair/ }).click()
  await expect(rules.getByText('Roster size', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(owner, rules)
  await owner.screenshot({ path: 'test-results/create-2v1-league-rule-phone.png', fullPage: true })
  await rules.getByRole('button', { name: 'Save format' }).click()
  await expect(rules).toBeHidden()
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
  const ownerAssignment = owner.getByRole('button', { name: `Assign ${ownerName} a solo roster` })
  await ownerAssignment.click()
  await expect(ownerAssignment).toHaveAttribute('aria-pressed', 'true')
  const alliedAssignment = owner.getByRole('button', { name: `Assign ${alliedLabel} a solo roster` })
  await alliedAssignment.click()
  await expect(alliedAssignment).toHaveAttribute('aria-pressed', 'true')
  const secondAlliedAssignment = owner.getByRole('button', { name: `Assign ${secondAlliedLabel} an allied roster` })
  await secondAlliedAssignment.click()
  await expect(secondAlliedAssignment).toHaveAttribute('aria-pressed', 'true')
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toBeDisabled()
  await expect(owner.getByText('Two entrants have to be allied.')).toBeVisible()
  const assignmentRows = owner.locator('[data-person]')
  await expectNoHorizontalOverflow(owner, ...(await assignmentRows.all()))
  await owner.screenshot({ path: 'test-results/league-2v1-assignments-phone.png', fullPage: true })

  await owner.getByRole('button', { name: `Assign ${alliedLabel} an allied roster` }).click()
  const reassignment = owner.getByRole('alertdialog', { name: `Change ${alliedLabel}’s roster size?` })
  await expectNoHorizontalOverflow(owner, reassignment)
  await reassignment.getByRole('button', { name: 'Change size' }).click()
  await expect
    .poll(async () => {
      const event = await eventForLeague(leagueToken)
      const entries = await productSql<{
        required_limit: [number, number | []]
      }>`SELECT required_limit FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
      return entries.map((entry) => option(entry.required_limit)).toSorted((left, right) => (left ?? 0) - (right ?? 0))
    })
    .toEqual([1_000, 1_000, 2_000])
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toBeEnabled()

  await allied.setViewportSize({ width: 390, height: 844 })
  await allied.reload()
  const ownEntrantRow = allied.locator(`[data-person="${alliedName}"]`).filter({ hasText: alliedLabel })
  await expect(ownEntrantRow.getByText('1,000-point roster · allied', { exact: true })).toBeVisible()
  // A 2v1 seats the allied rosters together and never against each other, so each ally reads the other's
  // before reveal, while the solo roster they will both face stays sealed.
  const secondAlliedRow = allied.locator(`[data-person="${alliedName}"]`).filter({ hasText: secondAlliedLabel })
  await expect(secondAlliedRow.getByRole('button', { name: 'View roster' })).toBeVisible()
  await expect(ownEntrantRow.getByRole('button', { name: 'View roster' })).toHaveCount(0)
  await expect(allied.locator(`[data-person="${ownerName}"]`).getByRole('button', { name: 'View roster' })).toHaveCount(0)
  await expect(allied.getByText(`${secondAlliedLabel} sees your list, because you field a force together.`)).toBeVisible()
  await expectNoHorizontalOverflow(allied, ...(await allied.locator('[data-person]').all()))
  await allied.screenshot({ path: 'test-results/league-2v1-ally-roster-phone.png', fullPage: true })
  const allyRosterTab = allied.waitForEvent('popup')
  await secondAlliedRow.getByRole('button', { name: 'View roster' }).click()
  const allyRoster = await allyRosterTab
  await expect(allyRoster.locator('[data-unit="Test unit"]')).toBeVisible()
  await allyRoster.close()

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
  await expect(spectator.getByRole('button', { name: 'Open 2,000-point roster' })).toBeVisible()
  await expect(spectator.getByRole('button', { name: 'Open 1,000-point roster' })).toHaveCount(2)
  await expect(spectator.getByRole('button', { name: 'Begin battle' })).toHaveCount(0)
  const spectatorPlayer = spectator.getByRole('link', { name: ownerName, exact: true })
  await expect(spectatorPlayer).toHaveAttribute('href', /^\/users\/[^/?]+$/)
  const spectatorRosterLink = spectator.getByRole('link', { name: '2,000-point roster', exact: true })
  await expect(spectatorRosterLink).toHaveAttribute('href', /^\/rosters\/[^/?]+\?battle=/)
  await expectNoHorizontalOverflow(spectator)
  await spectator.screenshot({ path: 'test-results/league-battle-spectator-desktop.png', fullPage: true })
  await spectatorPlayer.click()
  await expect(spectator.getByRole('heading', { name: ownerName })).toBeVisible()
  await spectator.goBack()
  await expect(spectator.getByText('Battle setup', { exact: true })).toBeVisible()
  await spectator.getByRole('link', { name: '2,000-point roster', exact: true }).click()
  await expect(spectator.locator('[data-roster-builder]').getByRole('textbox', { name: 'List name' })).toHaveValue('2,000-point roster')
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
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Doubles League'))
  await create.getByLabel('Player limit').fill('4')
  await create.getByRole('button', { name: /^Automatic/ }).click()
  await owner.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(owner, create)
  await owner.screenshot({ path: 'test-results/create-doubles-league-phone.png', fullPage: true })
  await submitLeagueCreation(owner, create)
  await chooseBattleFormat(owner, /^Doubles/)
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
  // A sealed list reaches the one entrant who will field a force alongside it, before any reveal.
  await teammate.reload()
  const teammateRow = (name: string) => teammate.locator(`[data-person="${name}"]`)
  await expect(teammateRow(names[0]).getByRole('button', { name: 'View roster' })).toBeVisible()
  for (const sealed of [names[1], names[2], names[3]]) {
    await expect(teammateRow(sealed).getByRole('button', { name: 'View roster' })).toHaveCount(0)
  }
  await expect(teammate.getByRole('button', { name: /^Unseal / })).toHaveCount(0)
  await expect(teammate.getByText(`${names[0]} sees your list, because you field a force together.`)).toBeVisible()
  await expectNoHorizontalOverflow(teammate, ...(await teammate.locator('[data-person]').all()))
  await teammate.screenshot({ path: 'test-results/doubles-ally-roster-phone.png', fullPage: true })
  const allyRosterTab = teammate.waitForEvent('popup')
  await teammateRow(names[0]).getByRole('button', { name: 'View roster' }).click()
  const allyRoster = await allyRosterTab
  await expect(allyRoster.locator('[data-unit="Test character"]')).toBeVisible()
  await allyRoster.close()

  // The organizer's row carries pairing, removal and the sealed lists together at both widths.
  await owner.reload()
  await expect(owner.getByRole('button', { name: `Remove ${names[0]}`, exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(owner, ...(await owner.locator('[data-person]').all()))
  await owner.screenshot({ path: 'test-results/doubles-organizer-entrant-controls-phone.png', fullPage: true })
  await owner.setViewportSize({ width: 1440, height: 900 })
  await owner.screenshot({ path: 'test-results/doubles-organizer-entrant-controls-desktop.png', fullPage: true })
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
  await expect(removeEntrant).toContainText(`This also unpairs ${names[1]} and clears both their sealed lists.`)
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
  await expect(reveal).toBeHidden()
  await owner.unrouteAll({ behavior: 'wait' })
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
