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
  expect(history.battles[0]?.log.map((entry) => entry.command.kind)).toEqual(['reopen-battle', 'pause-clock'])
})

async function seedBattles(count: number, seatUser = 'user-000') {
  const database = connection!.database
  for (let index = 0; index < count; index += 1) {
    const id = `battle-${index.toString().padStart(3, '0')}`
    await database.insert(battles).values({ id, token: `token-${index}`, createdAt: index })
    await database.insert(battleUsers).values({ battleId: id, userId: seatUser, side: 0, joinedAt: index })
  }
}

it('orders battles by their newest command rather than creation', async () => {
  const repository = await users(1)
  await seedBattles(2)
  // The older battle is the one still being played.
  await connection!.database
    .insert(commands)
    .values({ battleId: 'battle-000', seq: 1, userId: 'user-000', at: 100, body: JSON.stringify({ kind: 'reopen-battle' }) })

  const { battles: page } = await repository.battlesByUser('user-000', { limit: 10 })

  expect(page.map(({ battle }) => battle.id)).toEqual(['battle-000', 'battle-001'])
})

it('walks battle pages without skipping or repeating across the boundary', async () => {
  const repository = await users(1)
  await seedBattles(5)

  const first = await repository.battlesByUser('user-000', { limit: 2 })
  expect(first.battles).toHaveLength(2)
  expect(first.nextCursor).not.toBeNull()
  const second = await repository.battlesByUser('user-000', { limit: 2, before: first.nextCursor! })
  const third = await repository.battlesByUser('user-000', { limit: 2, before: second.nextCursor! })

  const seen = [...first.battles, ...second.battles, ...third.battles].map(({ battle }) => battle.id)
  expect(new Set(seen).size).toBe(5)
  expect(third.nextCursor).toBeNull()
})

it('breaks battle activity ties by id so a page boundary stays stable', async () => {
  const repository = await users(1)
  const database = connection!.database
  for (let index = 0; index < 4; index += 1) {
    const id = `battle-${index.toString().padStart(3, '0')}`
    await database.insert(battles).values({ id, token: `token-${index}`, createdAt: 7 })
    await database.insert(battleUsers).values({ battleId: id, userId: 'user-000', side: 0, joinedAt: 0 })
  }

  const first = await repository.battlesByUser('user-000', { limit: 3 })
  const second = await repository.battlesByUser('user-000', { limit: 3, before: first.nextCursor! })

  const seen = [...first.battles, ...second.battles].map(({ battle }) => battle.id)
  expect(new Set(seen).size).toBe(4)
})

it('filters battles to the ones shared with one other player', async () => {
  const repository = await users(2)
  await seedBattles(2)
  await connection!.database.insert(battleUsers).values({ battleId: 'battle-001', userId: 'user-001', side: 1, joinedAt: 0 })

  const { battles: page } = await repository.battlesByUser('user-000', { limit: 10, withUserId: 'user-001' })

  expect(page.map(({ battle }) => battle.id)).toEqual(['battle-001'])
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

it('starts a recurring league event without copying prior entrants', async () => {
  const repository = await users(2)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    recurring: true,
    now: 1,
  })
  await repository.joinLeague('league-token', 'user-001', 2, 128)
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
    now: 3,
  })
  await repository.submitLeagueRoster({
    token: 'league-token',
    eventToken: 'league-token',
    userId: 'user-001',
    rosterId: 'roster',
    rosterName: 'First army',
    rosterUpdatedAt: 3,
    snapshot: 'first snapshot',
    now: 4,
  })
  await repository.revealLeague('league-token', 'user-000', 5, 'league-token')

  const results = (
    await Promise.all([
      repository.createLeagueEvent({
        id: 'event-2',
        token: 'event-token-2',
        leagueToken: 'league-token',
        ownerId: 'user-000',
        now: 6,
      }),
      repository.createLeagueEvent({
        id: 'event-3',
        token: 'event-token-3',
        leagueToken: 'league-token',
        ownerId: 'user-000',
        now: 6,
      }),
    ])
  ).toSorted()
  const current = await repository.leagueByToken('league-token', 'user-001')
  const previousRoster = await repository.leagueRoster('league-token', 'user-001', 'league-token')
  const [listed] = await repository.leaguesVisibleTo('user-001')

  expect({
    results,
    eventCount: current?.eventCount,
    eventNumber: current?.eventNumber,
    entries: current?.entries,
    previousRoster,
    listed,
  }).toEqual({
    results: ['created', 'open'],
    eventCount: 2,
    eventNumber: 2,
    entries: [],
    previousRoster: 'first snapshot',
    listed: expect.objectContaining({ personal: true, ownEntry: null }),
  })
})

it('does not start another event for a one-off league', async () => {
  const repository = await users(1)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    now: 1,
  })

  expect(
    await repository.createLeagueEvent({
      id: 'event-2',
      token: 'event-token-2',
      leagueToken: 'league-token',
      ownerId: 'user-000',
      now: 2,
    }),
  ).toBe('one-off')
})

it('does not start another recurring event before reveal', async () => {
  const repository = await users(1)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    recurring: true,
    now: 1,
  })

  expect(
    await repository.createLeagueEvent({
      id: 'event-2',
      token: 'event-token-2',
      leagueToken: 'league-token',
      ownerId: 'user-000',
      now: 2,
    }),
  ).toBe('open')
})

it('only lets the recurring league organizer start an event', async () => {
  const repository = await users(2)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    recurring: true,
    now: 1,
  })

  expect(
    await repository.createLeagueEvent({
      id: 'event-2',
      token: 'event-token-2',
      leagueToken: 'league-token',
      ownerId: 'user-001',
      now: 2,
    }),
  ).toBe('forbidden')
})
