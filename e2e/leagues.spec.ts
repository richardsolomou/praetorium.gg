import { and, desc, eq } from 'drizzle-orm'
import { expect, test, type Page } from '@playwright/test'
import { createRoster, uniqueName, signUp } from './account'
import { openDatabase } from '../src/db/connection'
import { leagueEventEntries, leagueEvents, leagues } from '../src/db/schema'
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

async function join(page: Page) {
  await page.getByRole('button', { name: 'Join league' }).click()
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
  await create.getByRole('button', { name: 'Create league' }).click()
  await join(page)
  const eventUrl = page.url()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)

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

  await page.getByRole('button', { name: 'Make recurring' }).click()
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
  await create.getByRole('button', { name: 'Create league' }).click()
  await expect(owner.getByRole('heading', { name: leagueName })).toBeVisible()
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
