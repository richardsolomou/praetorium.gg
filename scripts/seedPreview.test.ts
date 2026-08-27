import { count, eq } from 'drizzle-orm'
import { afterEach, expect, it } from 'vitest'
import type { Roster } from '../src/core/battle'
import type { PraetoriumConnection } from '../src/db/connection'
import { Repository } from '../src/db/repository'
import {
  battleUsers,
  battles,
  collection,
  favouriteDetachments,
  favouriteFactions,
  friendships,
  leagueEventBattles,
  leagueEventEntries,
  leagueEvents,
  leagues,
  rosters,
  user,
} from '../src/db/schema'
import { openTestDatabase } from '../src/db/testDatabase'
import { PREVIEW_ACCOUNTS, PREVIEW_EMAIL, PREVIEW_OPPONENT_EMAIL, PREVIEW_ROSTERS, type PreviewSnapshots, seedPreview } from './seedPreview'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

function snapshots(): PreviewSnapshots {
  return new Map(
    PREVIEW_ACCOUNTS.flatMap((account) =>
      account.rosters.map((saved) => {
        const snapshot: Roster = {
          id: saved.id,
          name: saved.name,
          text: `${saved.limit} pts`,
          built: {
            catalogueId: saved.catalogueId,
            revision: 'preview-test',
            limit: saved.limit,
            detachment: null,
            disposition: saved.disposition,
            units: [
              {
                key: `${saved.id}-character`,
                name: `${saved.name} character`,
                points: 100,
                models: 1,
                group: 'character',
                warlord: saved.warlord,
                warlordEligible: true,
              },
            ],
          },
        }
        return [saved.id, snapshot] as const
      }),
    ),
  )
}

it('creates an idempotent preview world with varied rosters, battles, leagues, and preferences', async () => {
  connection = await openTestDatabase()
  const database = connection.database
  const previewSnapshots = snapshots()

  await seedPreview(database, previewSnapshots)
  await seedPreview(database, previewSnapshots)

  const accounts = await new Repository(database).adminUsers({ limit: 10 })
  expect(accounts.users).toHaveLength(4)
  expect(accounts.users.find((entry) => entry.email === PREVIEW_EMAIL)).toMatchObject({
    role: 'admin',
    rosterCount: 8,
    battleCount: 7,
    signInMethods: ['credential'],
  })
  expect(accounts.users.find((entry) => entry.email === PREVIEW_OPPONENT_EMAIL)).toMatchObject({
    rosterCount: 4,
    battleCount: 7,
    signInMethods: ['credential'],
  })

  const [savedAccounts] = await database.select({ count: count() }).from(user)
  const [savedFriendships] = await database.select({ count: count() }).from(friendships)
  const [savedRosters] = await database.select({ count: count() }).from(rosters)
  expect({ accounts: savedAccounts?.count, friendships: savedFriendships?.count, rosters: savedRosters?.count }).toEqual({
    accounts: 6,
    friendships: 6,
    rosters: 16,
  })

  const previewAccount = accounts.users.find((entry) => entry.email === PREVIEW_EMAIL)
  if (!previewAccount) throw new Error('preview account was not created')
  expect(await database.select().from(favouriteFactions).where(eq(favouriteFactions.userId, previewAccount.id))).toHaveLength(3)
  expect(await database.select().from(favouriteDetachments).where(eq(favouriteDetachments.userId, previewAccount.id))).toHaveLength(4)
  expect(await database.select().from(collection).where(eq(collection.userId, previewAccount.id))).toHaveLength(7)

  const saved = await database.select().from(rosters)
  for (const roster of PREVIEW_ROSTERS) {
    expect(saved.filter((row) => row.id === roster.id)).toEqual([
      expect.objectContaining({
        name: roster.name,
        catalogueId: roster.catalogueId,
        detachmentId: JSON.stringify(roster.detachmentIds),
        disposition: roster.disposition,
        limit: roster.limit,
        picks: JSON.stringify(roster.picks),
      }),
    ])
  }

  const [savedBattles] = await database.select({ count: count() }).from(battles)
  const [savedSeats] = await database.select({ count: count() }).from(battleUsers)
  const [savedLeagues] = await database.select({ count: count() }).from(leagues)
  const [savedEvents] = await database.select({ count: count() }).from(leagueEvents)
  const [savedLeagueBattles] = await database.select({ count: count() }).from(leagueEventBattles)
  expect({ battles: savedBattles?.count, seats: savedSeats?.count, leagues: savedLeagues?.count, events: savedEvents?.count }).toEqual({
    battles: 7,
    seats: 20,
    leagues: 4,
    events: 4,
  })
  expect(savedLeagueBattles?.count).toBe(3)

  const repository = new Repository(database)
  const casualFormats = await Promise.all(
    ['preview-casual-incursion', 'preview-casual-strike-force', 'preview-casual-solo-pair', 'preview-casual-doubles'].map(async (token) => {
      const history = await repository.battleHistoryByToken(token)
      const configured = history?.log.find((entry) => entry.command.kind === 'configure-battle')?.command
      return {
        players: history?.players.length,
        limit: configured?.kind === 'configure-battle' ? configured.limit : null,
        team: configured?.kind === 'configure-battle' ? Boolean(configured.teamBattle) : null,
      }
    }),
  )
  expect(casualFormats).toEqual([
    { players: 2, limit: 1_000, team: false },
    { players: 2, limit: 2_000, team: false },
    { players: 3, limit: 2_000, team: true },
    { players: 4, limit: 2_000, team: true },
  ])

  for (const [token, format, players] of [
    ['preview-league-duel', '1v1', 2],
    ['preview-league-solo-pair', '2v1', 3],
    ['preview-league-doubles', '2v2', 4],
  ] as const) {
    const league = await repository.leagueByToken(token, previewAccount.id)
    expect(league).toMatchObject({ format, revealedAt: expect.any(Number) })
    expect(league?.entries).toHaveLength(players)
  }

  const registration = await repository.leagueByToken('preview-league-registration', previewAccount.id)
  expect(registration?.entries.map((entry) => ({ status: entry.status, submitted: entry.submitted }))).toEqual([
    { status: 'pending', submitted: false },
    { status: 'accepted', submitted: true },
  ])
  const organizerId = accounts.users.find((entry) => entry.email === 'ally@praetorium.gg')?.id
  if (!organizerId) throw new Error('preview ally account was not created')
  const organizedRegistration = await repository.leagueByToken('preview-league-registration', organizerId)
  expect(organizedRegistration?.entries.map((entry) => ({ status: entry.status, submitted: entry.submitted }))).toEqual([
    { status: 'pending', submitted: false },
    { status: 'accepted', submitted: true },
  ])
  expect(
    (await database.select({ status: leagueEventEntries.status }).from(leagueEventEntries)).filter((entry) => entry.status === 'rejected'),
  ).toHaveLength(1)
})
