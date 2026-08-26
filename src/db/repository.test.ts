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
  const firstSnapshot = standardSnapshot('First army', 'First list')
  const secondSnapshot = standardSnapshot('Second army', 'Second list')
  expect(
    (
      await repository.submitLeagueRoster({
        token: 'league-token',
        userId: 'user-001',
        rosterId: 'user-001-roster',
        rosterName: 'First army',
        rosterUpdatedAt: 4,
        snapshot: firstSnapshot,
        now: 5,
      })
    ).outcome,
  ).toBe('sealed')
  expect(await repository.leagueRoster('league-token', 'user-001')).toBeNull()
  expect(await repository.revealLeague('league-token', 'user-000', 6)).toEqual({ outcome: 'not-ready' })
  expect(
    (
      await repository.submitLeagueRoster({
        token: 'league-token',
        userId: 'user-002',
        rosterId: 'user-002-roster',
        rosterName: 'Second army',
        rosterUpdatedAt: 4,
        snapshot: secondSnapshot,
        now: 7,
      })
    ).outcome,
  ).toBe('sealed')
  expect(await repository.revealLeague('league-token', 'user-000', 8)).toEqual({ outcome: 'revealed' })
  expect(await repository.leagueRoster('league-token', 'user-001')).toBe(firstSnapshot)
  expect(await repository.joinLeague('league-token', 'user-000', 9, 128)).toBe('closed')
})

it('pairs doubles entrants atomically and clears every roster affected by re-pairing', async () => {
  const repository = await users(5)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Doubles',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
    now: 1,
  })
  for (const [index, userId] of ['user-001', 'user-002', 'user-003', 'user-004'].entries()) {
    expect(await repository.joinLeague('league-token', userId, index + 2, 128)).toBe('accepted')
  }
  expect(await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')).toBe('updated')
  expect(await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')).toBe('updated')
  await connection!.database
    .update(leagueEventEntries)
    .set({ rosterName: 'Sealed', rosterSnapshot: JSON.stringify({ name: 'Sealed', text: 'List' }), submittedAt: 10 })

  expect(await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-003'], 'team-c')).toBe('updated')
  const entries = await connection!.database
    .select({ userId: leagueEventEntries.userId, teamId: leagueEventEntries.teamId, snapshot: leagueEventEntries.rosterSnapshot })
    .from(leagueEventEntries)

  expect(
    entries.toSorted((left, right) => left.userId.localeCompare(right.userId)).map((entry) => [entry.userId, entry.teamId, entry.snapshot]),
  ).toEqual([
    ['user-001', 'team-c', null],
    ['user-002', null, null],
    ['user-003', 'team-c', null],
    ['user-004', null, null],
  ])
})

it('removes an accepted doubles entrant and clears their former teammate', async () => {
  const repository = await users(3)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Doubles',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    format: '2v2',
    rosterLimit: 2_000,
    now: 1,
  })
  await repository.joinLeague('league-token', 'user-001', 2, 128)
  await repository.joinLeague('league-token', 'user-002', 3, 128)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await connection!.database.update(leagueEventEntries).set({ rosterName: 'Sealed', rosterSnapshot: doublesSnapshot(), submittedAt: 4 })

  expect(await repository.moderateLeagueEntry('league-token', 'user-000', 'user-001', 'rejected', 128)).toBe('updated')
  const entries = await connection!.database
    .select({
      userId: leagueEventEntries.userId,
      status: leagueEventEntries.status,
      teamId: leagueEventEntries.teamId,
      requiredLimit: leagueEventEntries.requiredLimit,
      snapshot: leagueEventEntries.rosterSnapshot,
    })
    .from(leagueEventEntries)
    .orderBy(leagueEventEntries.userId)

  expect(entries).toEqual([
    { userId: 'user-001', status: 'rejected', teamId: null, requiredLimit: null, snapshot: null },
    { userId: 'user-002', status: 'accepted', teamId: null, requiredLimit: null, snapshot: null },
  ])
})

it('orders entrants with tied join times by user id', async () => {
  const repository = await users(3)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Stable teams',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    format: '2v2',
    rosterLimit: 2_000,
    now: 1,
  })
  await repository.joinLeague('league-token', 'user-002', 2, 128)
  await repository.joinLeague('league-token', 'user-001', 2, 128)

  expect((await repository.leagueByToken('league-token', 'user-000'))?.entries.map((entry) => entry.userId)).toEqual([
    'user-001',
    'user-002',
  ])
})

it('orders doubles entries used for battle derivation by join time then user id', async () => {
  const repository = await users(5)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Stable battle seats',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    format: '2v2',
    rosterLimit: 2_000,
    now: 1,
  })
  for (const userId of ['user-002', 'user-001', 'user-004', 'user-003']) {
    await repository.joinLeague('league-token', userId, 2, 128)
  }
  await connection!.database.update(leagueEventEntries).set({ rosterSnapshot: '{}' })

  const ordered = await repository.createLeagueBattle(
    {
      id: 'battle',
      token: 'battle-token',
      leagueToken: 'league-token',
      userId: 'user-001',
      userIds: ['user-001', 'user-002', 'user-003', 'user-004'],
      now: 5,
    },
    (league) => ({
      allyIds: ['user-002'],
      opponentIds: ['user-003', 'user-004'],
      initialCommands: [],
      result: league.entries.map((entry) => entry.userId),
    }),
  )

  expect(ordered).toEqual(['user-001', 'user-002', 'user-003', 'user-004'])
})

it('reveals doubles only when every accepted entrant belongs to an exact two-player team', async () => {
  const repository = await users(5)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Doubles',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
    now: 1,
  })
  for (const [index, userId] of ['user-001', 'user-002', 'user-003', 'user-004'].entries()) {
    await repository.joinLeague('league-token', userId, index + 2, 128)
  }
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await sealDoublesSnapshots(['user-001', 'user-003'])
  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'not-ready' })
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-003'])

  expect(await repository.revealLeague('league-token', 'user-000', 11)).toEqual({ outcome: 'revealed' })
})

it('serializes overlapping doubles pair assignments without leaving a partial team', async () => {
  const repository = await users(4)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Doubles',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    format: '2v2',
    rosterLimit: 2_000,
    now: 1,
  })
  for (const [index, userId] of ['user-001', 'user-002', 'user-003'].entries()) {
    await repository.joinLeague('league-token', userId, index + 2, 128)
  }

  await Promise.all([
    repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a'),
    repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-003'], 'team-b'),
  ])
  const rows = await connection!.database.select({ teamId: leagueEventEntries.teamId }).from(leagueEventEntries)
  const counts = new Map<string, number>()
  for (const row of rows) if (row.teamId) counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1)

  expect([...counts.values()]).toEqual([2])
})

function doublesSnapshot(warlord = false, limit = 1_000, group: 'character' | 'epic-hero' | 'infantry' | null = 'character') {
  return JSON.stringify({
    name: 'Doubles roster',
    text: 'List',
    built: {
      catalogueId: 'cat',
      revision: 'rev',
      limit,
      detachment: null,
      disposition: null,
      units: [{ key: 'unit', name: 'Captain', points: 80, models: 1, ...(group ? { group } : {}), warlord }],
    },
  })
}

function standardSnapshot(name = 'Army', text = 'List') {
  return JSON.stringify({
    name,
    text,
    built: {
      catalogueId: 'cat',
      revision: 'rev',
      limit: 2_000,
      detachment: null,
      disposition: null,
      units: [{ key: 'unit', name: 'Captain', points: 80, models: 1, group: 'character', warlord: true }],
    },
  })
}

async function sealDoublesSnapshots(warlordIds: readonly string[], limits: Readonly<Record<string, number>> = {}) {
  const entries = await connection!.database
    .select({ userId: leagueEventEntries.userId })
    .from(leagueEventEntries)
    .where(eq(leagueEventEntries.status, 'accepted'))
  for (const entry of entries) {
    await connection!.database
      .update(leagueEventEntries)
      .set({ rosterSnapshot: doublesSnapshot(warlordIds.includes(entry.userId), limits[entry.userId]) })
      .where(eq(leagueEventEntries.userId, entry.userId))
  }
}

async function doublesEntrants(entrantCount: number, options: { admission?: 'automatic' | 'approval'; playerLimit?: number | null } = {}) {
  const repository = await users(entrantCount + 1)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'Doubles',
    description: '',
    visibility: 'private',
    admission: options.admission ?? 'automatic',
    playerLimit: options.playerLimit ?? null,
    format: '2v2',
    rosterLimit: 2_000,
    now: 1,
  })
  for (let index = 1; index <= entrantCount; index += 1) {
    await repository.joinLeague('league-token', `user-${index.toString().padStart(3, '0')}`, index + 1, 128)
  }
  return repository
}

it('refuses doubles reveal with fewer than four accepted entrants', async () => {
  const repository = await doublesEntrants(2)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await sealDoublesSnapshots(['user-001'])

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'not-ready' })
})

it('refuses doubles reveal with an odd accepted count', async () => {
  const repository = await doublesEntrants(5)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await connection!.database
    .update(leagueEventEntries)
    .set({ teamId: 'team-c', requiredLimit: 1_000 })
    .where(eq(leagueEventEntries.userId, 'user-005'))
  await sealDoublesSnapshots(['user-001', 'user-003', 'user-005'])

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'not-ready' })
})

it('refuses doubles reveal with malformed team cardinality', async () => {
  const repository = await doublesEntrants(4)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await connection!.database.update(leagueEventEntries).set({ teamId: 'team-a' }).where(eq(leagueEventEntries.userId, 'user-003'))
  await sealDoublesSnapshots(['user-001', 'user-004'])

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'not-ready' })
})

it('refuses doubles reveal while a request remains pending', async () => {
  const repository = await doublesEntrants(5, { admission: 'approval', playerLimit: 4 })
  for (const userId of ['user-001', 'user-002', 'user-003', 'user-004']) {
    await repository.moderateLeagueEntry('league-token', 'user-000', userId, 'accepted', 128)
  }
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-003'])

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'not-ready' })
})

it('refuses doubles reveal while configured places remain open', async () => {
  const repository = await doublesEntrants(4, { playerLimit: 6 })
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-003'])

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'not-ready' })
})

it('refuses doubles reveal when a sealed roster has the wrong size', async () => {
  const repository = await doublesEntrants(4)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-003'], { 'user-004': 2_000 })

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'not-ready' })
})

it('refuses doubles reveal unless each team selected exactly one Warlord', async () => {
  const repository = await doublesEntrants(4)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-002', 'user-003'])

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'invalid-warlords', format: '2v2' })
})

it('accepts one frozen eligible Character Warlord per doubles team', async () => {
  const repository = await doublesEntrants(4)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-003'])
  await connection!.database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: doublesSnapshot(true, 1_000, 'epic-hero') })
    .where(eq(leagueEventEntries.userId, 'user-003'))

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'revealed' })
})

it('refuses a frozen doubles Warlord marked on a non-Character unit', async () => {
  const repository = await doublesEntrants(4)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-003'])
  await connection!.database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: doublesSnapshot(true, 1_000, 'infantry') })
    .where(eq(leagueEventEntries.userId, 'user-001'))

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'invalid-warlords', format: '2v2' })
})

it('refuses a frozen doubles Warlord whose unit group is missing', async () => {
  const repository = await doublesEntrants(4)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-003', 'user-004'], 'team-b')
  await sealDoublesSnapshots(['user-001', 'user-003'])
  await connection!.database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: doublesSnapshot(true, 1_000, null) })
    .where(eq(leagueEventEntries.userId, 'user-001'))

  expect(await repository.revealLeague('league-token', 'user-000', 10)).toEqual({ outcome: 'invalid-warlords', format: '2v2' })
})

it('unpairs both former partners and clears both sealed rosters from one entrant ID', async () => {
  const repository = await doublesEntrants(2)
  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001', 'user-002'], 'team-a')
  await connection!.database.update(leagueEventEntries).set({ rosterName: 'Sealed', rosterSnapshot: doublesSnapshot(), submittedAt: 5 })

  await repository.assignLeagueTeam('league-token', 'user-000', ['user-001'], 'unused-team-id')
  const entries = await connection!.database
    .select({ userId: leagueEventEntries.userId, teamId: leagueEventEntries.teamId, snapshot: leagueEventEntries.rosterSnapshot })
    .from(leagueEventEntries)
    .orderBy(leagueEventEntries.userId)

  expect(entries.map((entry) => [entry.userId, entry.teamId, entry.snapshot])).toEqual([
    ['user-001', null, null],
    ['user-002', null, null],
  ])
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
  const firstSnapshot = standardSnapshot('First')
  const replacementSnapshot = standardSnapshot('Replacement')
  expect((await repository.submitLeagueRoster({ ...input, snapshot: firstSnapshot })).outcome).toBe('sealed')
  expect((await repository.submitLeagueRoster({ ...input, snapshot: replacementSnapshot })).outcome).toBe('sealed')
  expect(await repository.revealLeague('league-token', 'user-000', 5)).toEqual({ outcome: 'revealed' })
  expect(await repository.leagueRoster('league-token', 'user-001')).toBe(replacementSnapshot)
  expect((await repository.submitLeagueRoster({ ...input, snapshot: standardSnapshot('Late') })).outcome).toBe('missing')
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
        snapshot: standardSnapshot(),
        now: 5,
      })
    ).outcome,
  ).toBe('sealed')

  expect(await repository.revealLeague('league-token', 'user-000', 6)).toEqual({ outcome: 'revealed' })
  expect((await repository.leagueByToken('league-token', 'user-002'))?.entries.find((entry) => entry.userId === 'user-002')?.status).toBe(
    'rejected',
  )
})

it('starts a league event without copying prior entrants', async () => {
  const repository = await users(2)
  await repository.createLeague({
    id: 'league',
    token: 'league-token',
    ownerId: 'user-000',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    recurring: false,
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
    snapshot: standardSnapshot('First army'),
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
    previousRoster: standardSnapshot('First army'),
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

it('does not start another event before reveal', async () => {
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
  ).toBe('open')
})

it('only lets the league organizer start an event', async () => {
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

it('lets the player limit change between events', async () => {
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
    snapshot: standardSnapshot(),
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
