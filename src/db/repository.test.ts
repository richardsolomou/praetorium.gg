import { afterEach, expect, it } from 'vitest'
import type { PraetoriumConnection } from './connection'
import { Repository } from './repository'
import { battleUsers, battles, commands, user } from './schema'
import { openTestDatabase } from './testDatabase'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

async function users(count: number) {
  connection = await openTestDatabase()
  const createdAt = new Date('2026-01-01T00:00:00Z')
  await connection.database.insert(user).values(
    Array.from({ length: count }, (_, index) => ({
      id: `user-${index.toString().padStart(3, '0')}`,
      name: index === 0 ? 'Needle Player' : `Player ${index}`,
      email: `player-${index}@example.test`,
      emailVerified: false,
      createdAt: new Date(createdAt.getTime() + index),
      updatedAt: createdAt,
    })),
  )
  return new Repository(connection.database)
}

it('paginates administrator users without overlap', async () => {
  const repository = await users(12)
  const first = await repository.adminUsers({ limit: 5 })
  const second = await repository.adminUsers({ limit: 5, cursor: first.nextCursor })

  expect(new Set([...first.users, ...second.users].map((entry) => entry.id)).size).toBe(10)
})

it('searches users outside the first administrator page', async () => {
  const repository = await users(60)

  const found = await repository.adminUsers({ query: 'Needle', limit: 10 })

  expect(found.users.map((entry) => entry.name)).toEqual(['Needle Player'])
})

it('reads a log past a command kind it does not recognise', async () => {
  const repository = await users(1)
  const database = connection!.database
  await database.insert(battles).values({ id: 'battle-000', token: 'token-000', createdAt: 0 })
  await database.insert(battleUsers).values({ battleId: 'battle-000', userId: 'user-000', side: 0, joinedAt: 0 })
  await database.insert(commands).values([
    { battleId: 'battle-000', seq: 1, userId: 'user-000', at: 1, body: JSON.stringify({ kind: 'reopen-battle' }) },
    { battleId: 'battle-000', seq: 2, userId: 'user-000', at: 2, body: JSON.stringify({ kind: 'command-from-a-newer-release' }) },
    { battleId: 'battle-000', seq: 3, userId: 'user-000', at: 3, body: JSON.stringify({ kind: 'pause-clock' }) },
  ])

  const log = await repository.log('battle-000')
  const history = await repository.battlesByUser('user-000')

  expect(log.map((entry) => entry.command.kind)).toEqual(['reopen-battle', 'pause-clock'])
  expect(history[0]?.log.map((entry) => entry.command.kind)).toEqual(['reopen-battle', 'pause-clock'])
})

it('keeps league rosters sealed until every accepted entrant has submitted', async () => {
  const repository = await users(3)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Grand Tournament',
    description: '',
    visibility: 'public',
    admission: 'automatic',
    playerLimit: 2,
    now: 1,
  })
  expect(await repository.joinLeague('league-token', 'user-001', 2, 128)).toBe('accepted')
  expect(await repository.joinLeague('league-token', 'user-002', 3, 128)).toBe('accepted')
  expect(await repository.joinLeague('league-token', 'user-000', 4, 128)).toBe('full')
  for (const userId of ['user-001', 'user-002']) {
    await repository.saveRoster({
      id: `${userId}-roster`,
      userId,
      name: `${userId} army`,
      catalogueId: 'catalogue',
      detachmentId: null,
      disposition: null,
      limit: 2000,
      picks: '[]',
      prep: null,
      tags: '[]',
      visibility: 'private',
      source: 'editable',
      now: 4,
    })
  }
  expect(
    await repository.submitLeagueRoster({
      token: 'league-token',
      userId: 'user-001',
      rosterId: 'user-001-roster',
      rosterName: 'First army',
      rosterUpdatedAt: 4,
      snapshot: JSON.stringify({ name: 'First army', text: 'First list' }),
      now: 5,
    }),
  ).toBe(true)
  expect(await repository.leagueRoster('league-token', 'user-001')).toBeNull()
  expect(await repository.revealLeague('league-token', 'user-000', 6)).toBe(false)
  expect(
    await repository.submitLeagueRoster({
      token: 'league-token',
      userId: 'user-002',
      rosterId: 'user-002-roster',
      rosterName: 'Second army',
      rosterUpdatedAt: 4,
      snapshot: JSON.stringify({ name: 'Second army', text: 'Second list' }),
      now: 7,
    }),
  ).toBe(true)
  expect(await repository.revealLeague('league-token', 'user-000', 8)).toBe(true)
  expect(await repository.leagueRoster('league-token', 'user-001')).toBe(JSON.stringify({ name: 'First army', text: 'First list' }))
  expect(await repository.joinLeague('league-token', 'user-000', 9, 128)).toBe('closed')
})

it('replaces a league roster snapshot until reveal', async () => {
  const repository = await users(2)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    now: 1,
  })
  expect(await repository.joinLeague('league-token', 'user-001', 2, 128)).toBe('pending')
  expect(await repository.moderateLeagueEntry('league-token', 'user-001', 'user-001', 'accepted', 128)).toBe('forbidden')
  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-001', 'accepted', 128)).toBe('updated')
  await repository.saveRoster({
    id: 'roster',
    userId: 'user-001',
    name: 'Army',
    catalogueId: 'catalogue',
    detachmentId: null,
    disposition: null,
    limit: 2000,
    picks: '[]',
    prep: null,
    tags: '[]',
    visibility: 'private',
    source: 'editable',
    now: 3,
  })
  const input = { token: 'league-token', userId: 'user-001', rosterId: 'roster', rosterName: 'Army', rosterUpdatedAt: 3, now: 4 }
  expect(await repository.submitLeagueRoster({ ...input, snapshot: 'first' })).toBe(true)
  expect(await repository.submitLeagueRoster({ ...input, snapshot: 'replacement' })).toBe(true)
  expect(await repository.revealLeague('league-token', 'user-000', 5)).toBe(true)
  expect(await repository.leagueRoster('league-token', 'user-001')).toBe('replacement')
  expect(await repository.submitLeagueRoster({ ...input, snapshot: 'late' })).toBe(false)
})

it('does not re-accept an entrant after their place has been filled', async () => {
  const repository = await users(4)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: 2,
    now: 1,
  })
  expect(await repository.joinLeague('league-token', 'user-001', 2, 128)).toBe('pending')
  expect(await repository.joinLeague('league-token', 'user-002', 3, 128)).toBe('pending')
  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-001', 'rejected', 128)).toBe('updated')
  expect(await repository.joinLeague('league-token', 'user-003', 4, 128)).toBe('pending')
  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-002', 'accepted', 128)).toBe('updated')
  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-003', 'accepted', 128)).toBe('updated')

  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-001', 'accepted', 128)).toBe('full')
})

it('lets the organizer remove an accepted entrant and free their place', async () => {
  const repository = await users(3)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'public',
    admission: 'automatic',
    playerLimit: 2,
    now: 1,
  })
  expect(await repository.joinLeague('league-token', 'user-001', 2, 128)).toBe('accepted')
  expect(await repository.joinLeague('league-token', 'user-002', 3, 128)).toBe('accepted')

  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-001', 'rejected', 128)).toBe('updated')
  expect(await repository.joinLeague('league-token', 'user-000', 4, 128)).toBe('accepted')
})

it('keeps approval requests outside the configured player count but bounds their total', async () => {
  const repository = await users(5)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'public',
    admission: 'approval',
    playerLimit: 2,
    now: 1,
  })
  expect(await repository.joinLeague('league-token', 'user-001', 2, 3)).toBe('pending')
  expect(await repository.joinLeague('league-token', 'user-002', 3, 3)).toBe('pending')
  expect(await repository.joinLeague('league-token', 'user-003', 4, 3)).toBe('pending')
  expect(await repository.joinLeague('league-token', 'user-004', 5, 3)).toBe('full')
  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-001', 'accepted', 128)).toBe('updated')
  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-002', 'accepted', 128)).toBe('updated')

  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-003', 'accepted', 128)).toBe('full')
})

it('rejects unresolved approval requests when rosters are revealed', async () => {
  const repository = await users(3)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    now: 1,
  })
  expect(await repository.joinLeague('league-token', 'user-001', 2, 128)).toBe('pending')
  expect(await repository.joinLeague('league-token', 'user-002', 3, 128)).toBe('pending')
  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-001', 'accepted', 128)).toBe('updated')
  await repository.saveRoster({
    id: 'roster',
    userId: 'user-001',
    name: 'Army',
    catalogueId: 'catalogue',
    detachmentId: null,
    disposition: null,
    limit: 2_000,
    picks: '[]',
    prep: null,
    tags: '[]',
    visibility: 'private',
    source: 'editable',
    now: 4,
  })
  expect(
    await repository.submitLeagueRoster({
      token: 'league-token',
      userId: 'user-001',
      rosterId: 'roster',
      rosterName: 'Army',
      rosterUpdatedAt: 4,
      snapshot: JSON.stringify({ name: 'Army', text: 'List' }),
      now: 5,
    }),
  ).toBe(true)

  expect(await repository.revealLeague('league-token', 'user-000', 6)).toBe(true)
  expect((await repository.leagueByToken('league-token', 'user-002'))?.entries.find((entry) => entry.userId === 'user-002')?.status).toBe(
    'rejected',
  )
})
