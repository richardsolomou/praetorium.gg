import { eq } from 'drizzle-orm'
import { afterEach, expect, it } from 'vitest'
import type { PraetoriumConnection } from './connection'
import { Repository } from './repository'
import { battleUsers, battles, commands, leagueEventEntries, leagueEvents, leagues, user } from './schema'
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

it('treats a league without an event as missing', async () => {
  const repository = await users(1)
  await connection!.database.insert(leagues).values({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
    createdAt: 1,
  })

  expect(await repository.leagueByToken('league-token', 'user-000')).toBeUndefined()
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
    (
      await repository.submitLeagueRoster({
        token: 'league-token',
        userId: 'user-001',
        rosterId: 'user-001-roster',
        rosterName: 'First army',
        rosterUpdatedAt: 4,
        snapshot: JSON.stringify({ name: 'First army', text: 'First list' }),
        now: 5,
      })
    ).outcome,
  ).toBe('sealed')
  expect(await repository.leagueRoster('league-token', 'user-001')).toBeNull()
  expect(await repository.revealLeague('league-token', 'user-000', 6)).toBe(false)
  expect(
    (
      await repository.submitLeagueRoster({
        token: 'league-token',
        userId: 'user-002',
        rosterId: 'user-002-roster',
        rosterName: 'Second army',
        rosterUpdatedAt: 4,
        snapshot: JSON.stringify({ name: 'Second army', text: 'Second list' }),
        now: 7,
      })
    ).outcome,
  ).toBe('sealed')
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
  expect((await repository.submitLeagueRoster({ ...input, snapshot: 'first' })).outcome).toBe('sealed')
  expect((await repository.submitLeagueRoster({ ...input, snapshot: 'replacement' })).outcome).toBe('sealed')
  expect(await repository.revealLeague('league-token', 'user-000', 5)).toBe(true)
  expect(await repository.leagueRoster('league-token', 'user-001')).toBe('replacement')
  expect((await repository.submitLeagueRoster({ ...input, snapshot: 'late' })).outcome).toBe('missing')
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
    (
      await repository.submitLeagueRoster({
        token: 'league-token',
        userId: 'user-001',
        rosterId: 'roster',
        rosterName: 'Army',
        rosterUpdatedAt: 4,
        snapshot: JSON.stringify({ name: 'Army', text: 'List' }),
        now: 5,
      })
    ).outcome,
  ).toBe('sealed')

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
  await repository.joinLeague('league-token', 'user-001', 7, 128)
  const previous = await repository.leagueByToken('league-token', 'user-001', 'league-token')

  expect({
    results,
    eventCount: current?.eventCount,
    eventNumber: current?.eventNumber,
    entries: current?.entries,
    previousRoster,
    listed,
    previousCurrentState: previous
      ? {
          eventNumber: previous.eventNumber,
          revealedAt: previous.revealedAt,
          currentEventFormat: previous.currentEventFormat,
          currentEventRevealedAt: previous.currentEventRevealedAt,
          currentEntrantCount: previous.currentEntrantCount,
          currentAcceptedCount: previous.currentAcceptedCount,
        }
      : null,
  }).toEqual({
    results: ['created', 'open'],
    eventCount: 2,
    eventNumber: 2,
    entries: [],
    previousRoster: 'first snapshot',
    listed: expect.objectContaining({ personal: true, ownEntry: null }),
    previousCurrentState: {
      eventNumber: 1,
      revealedAt: 5,
      currentEventFormat: null,
      currentEventRevealedAt: null,
      currentEntrantCount: 1,
      currentAcceptedCount: 1,
    },
  })
})

it('does not list a league without an event', async () => {
  const repository = await users(1)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'public',
    admission: 'automatic',
    now: 1,
  })
  await connection!.database.delete(leagueEvents)

  expect(await repository.leaguesVisibleTo(null)).toEqual([])
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

it('edits league registration settings only while the current event allows them', async () => {
  const repository = await users(3)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: 3,
    now: 1,
  })
  const changed = {
    name: 'Renamed league',
    description: 'Updated details',
    visibility: 'public' as const,
    admission: 'automatic' as const,
    playerLimit: 2,
  }
  expect(await repository.updateLeague('league-token', 'user-001', changed)).toBe('forbidden')
  expect(await repository.updateLeague('league-token', 'user-000', changed)).toBe('updated')
  expect(await repository.joinLeague('league-token', 'user-001', 2, 128)).toBe('accepted')
  expect(await repository.updateLeague('league-token', 'user-000', { ...changed, admission: 'approval' })).toBe('joined')
  expect(await repository.joinLeague('league-token', 'user-002', 3, 128)).toBe('accepted')
  expect(await repository.updateLeague('league-token', 'user-000', { ...changed, playerLimit: 1 })).toBe('below-accepted')
  expect(await repository.updateLeague('league-token', 'user-000', { ...changed, name: 'Final name' })).toBe('updated')

  expect(await repository.leagueByToken('league-token', 'user-000')).toEqual(expect.objectContaining({ ...changed, name: 'Final name' }))
})

it('lets the player limit change between recurring events', async () => {
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
  await repository.joinLeague('league-token', 'user-000', 2, 128)
  await repository.saveRoster({
    id: 'roster',
    userId: 'user-000',
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
    userId: 'user-000',
    rosterId: 'roster',
    rosterName: 'Army',
    rosterUpdatedAt: 3,
    snapshot: '{}',
    now: 4,
  })
  await repository.revealLeague('league-token', 'user-000', 5)
  const input = { name: 'After reveal', description: '', visibility: 'public' as const, admission: 'automatic' as const, playerLimit: null }

  expect(await repository.updateLeague('league-token', 'user-000', { ...input, playerLimit: 2 })).toBe('updated')
  expect(await repository.updateLeague('league-token', 'user-000', input)).toBe('updated')
})

it('orders league deletion after an in-flight league battle creation', async () => {
  const repository = await users(2)
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
  await repository.joinLeague('league-token', 'user-000', 2, 128)
  await repository.joinLeague('league-token', 'user-001', 3, 128)
  const [event] = await connection!.database.select({ id: leagueEvents.id }).from(leagueEvents).limit(1)
  if (!event) throw new Error('expected league event')
  await connection!.database.update(leagueEvents).set({ revealedAt: 4 }).where(eq(leagueEvents.id, event.id))
  await connection!.database.update(leagueEventEntries).set({ rosterSnapshot: '{}' }).where(eq(leagueEventEntries.eventId, event.id))
  let enteredPrepare = () => {}
  let releasePrepare = () => {}
  const prepareStarted = new Promise<void>((resolve) => (enteredPrepare = resolve))
  const prepareReleased = new Promise<void>((resolve) => (releasePrepare = resolve))
  const creation = repository.createLeagueBattle(
    {
      id: 'battle',
      token: 'battle-token',
      leagueToken: 'league-token',
      userId: 'user-000',
      userIds: ['user-000', 'user-001'],
      now: 5,
    },
    async (league) => {
      enteredPrepare()
      await prepareReleased
      return { allyIds: [], opponentIds: ['user-001'], initialCommands: [], result: league.eventToken }
    },
  )
  await prepareStarted
  const deletion = repository.deleteLeague('league-token', 'user-000')

  expect(await Promise.race([deletion.then(() => 'deleted'), new Promise((resolve) => setTimeout(() => resolve('blocked'), 100))])).toBe(
    'blocked',
  )
  releasePrepare()
  expect(await creation).toBe('league-token')
  expect(await deletion).toBe('deleted')
  expect(await repository.battleByToken('battle-token')).toBeDefined()
  expect(await repository.leagueByToken('league-token', 'user-000')).toBeUndefined()
})
