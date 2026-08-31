import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PraetoriumConnection, PraetoriumDatabase } from '../db/connection'
import { openTestDatabase } from '../db/testDatabase'
import { Repository } from '../db/repository'
import { battles, battleUsers, leagueEventEntries, leagueEvents, leagues, user } from '../db/schema'
import type { Roster } from '../core/battle'
import { PraetoriumService } from './service'
import type { LoadedRules } from './rules'
import { createBattleSchema } from './schemas'

let connection: PraetoriumConnection
let database: PraetoriumDatabase
let service: PraetoriumService
let now = 0

beforeEach(async () => {
  connection = await openTestDatabase()
  database = connection.database
  now = 0
  service = new PraetoriumService(
    new Repository(database),
    () => ++now,
    { publish: () => {} },
    () => 0,
  )
  await enrol('alice', 'Alice')
  await enrol('bob', 'Bob', 'https://example.test/bob.png')
  await enrol('carol', 'Carol')
  await befriend('alice', 'bob')
  await befriend('alice', 'carol')
})

async function enrol(id: string, name: string, image: string | null = null) {
  const at = new Date(0)
  await database.insert(user).values({ id, name, email: `${id}@example.test`, emailVerified: false, image, createdAt: at, updatedAt: at })
}

async function befriend(left: string, right: string) {
  await service.requestFriend(left, right)
  await service.acceptFriend(right, left)
}

afterEach(() => connection.close())

/** Two players, both lists in, Alice going first. Returns the link and the live seq. */
async function started() {
  const { token } = await service.createBattle('alice', 'bob')
  let seq = 0
  const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const { result } = await service.submit(token, by, seq, command)
    if (result.outcome === 'appended') seq = result.seq
    return result
  }
  await send('alice', { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
  await send('bob', { kind: 'attach-roster', roster: { name: 'Death Guard', text: '10 Plague Marines' } })
  await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })
  return { token, send, seq: () => seq }
}

/** The status a rejected call answered with; reads answer null, so a throw is a real refusal. */
async function refusalStatus(work: () => unknown) {
  try {
    await work()
    return null
  } catch (error) {
    return error instanceof Response ? error.status : null
  }
}

async function view(token: string, playerId: string) {
  const screen = await service.screen(token, playerId)
  if (screen.kind !== 'battle') throw new Error('expected a seat')
  return screen.view
}

const leagueSnapshot = (
  name: string,
  limit = 2_000,
  warlord = true,
  group: 'character' | 'epic-hero' | 'vehicle' = 'character',
  warlordEligible?: boolean,
): Roster => ({
  name,
  text: `${name} · ${limit} pts`,
  built: {
    catalogueId: 'catalogue',
    revision: 'sealed-revision',
    limit,
    detachment: null,
    disposition: null,
    units: [
      {
        key: `${name}-unit`,
        name: `${name} unit`,
        points: 80,
        models: 5,
        group,
        warlord,
        ...(warlordEligible === undefined ? {} : { warlordEligible }),
      },
    ],
  },
})

async function revealedLeague(aliceRoster = leagueSnapshot('Alice sealed'), opponentRoster = leagueSnapshot('Dave sealed')) {
  await enrol('dave', 'Dave')
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await service.joinLeague(token, 'alice')
  await service.joinLeague(token, 'dave')
  for (const [userId, id, roster] of [
    ['alice', 'alice-roster', aliceRoster],
    ['dave', 'dave-roster', opponentRoster],
  ] as const) {
    await service.saveRoster(userId, {
      id,
      name: roster.name,
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: roster.built?.limit ?? 2_000,
      picks: [],
      prep: null,
      visibility: 'private',
      source: 'editable',
    })
    const saved = await service.ownRoster(userId, id)
    if (!saved) throw new Error('expected saved league roster')
    await service.submitLeagueRoster(token, userId, saved, roster)
  }
  await service.revealLeague(token, 'alice')
  return { token, eventToken, aliceRoster, opponentRoster }
}

async function revealedTeamLeague() {
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 3,
    format: '2v1',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob', 'carol']) await service.joinLeague(token, userId)
  await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 2_000)
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 1_000)
  await service.assignLeagueRosterRequirement(token, 'alice', 'carol', 1_000)
  for (const [userId, limit] of [
    ['alice', 2_000],
    ['bob', 1_000],
    ['carol', 1_000],
  ] as const) {
    await saveAndSealLeagueRoster(token, userId, limit)
  }
  await service.revealLeague(token, 'alice')
  return { token, eventToken }
}

async function revealedDoublesLeague() {
  await enrol('dave', 'Dave')
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob', 'carol', 'dave']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await service.assignLeagueTeam(token, 'alice', ['carol', 'dave'])
  for (const userId of ['alice', 'bob', 'carol', 'dave']) {
    await saveAndSealLeagueRoster(token, userId, 1_000, '', userId === 'alice' || userId === 'carol')
  }
  await service.revealLeague(token, 'alice')
  return { token, eventToken }
}

async function saveAndSealLeagueRoster(token: string, userId: string, limit: number, suffix = '', warlord = true) {
  const saved = await saveLeagueRoster(userId, limit, suffix)
  await service.submitLeagueRoster(token, userId, saved, leagueSnapshot(`${userId}${suffix} sealed`, limit, warlord))
}

async function saveLeagueRoster(userId: string, limit: number, suffix = '') {
  const id = `${userId}-${limit}${suffix}-team-roster`
  await service.saveRoster(userId, {
    id,
    name: `${userId} team roster`,
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const saved = await service.ownRoster(userId, id)
  if (!saved) throw new Error('expected saved team roster')
  return saved
}

function withSecondWarlord(snapshot: Roster): Roster {
  const unit = snapshot.built?.units[0]
  if (!snapshot.built || !unit) throw new Error('expected a built roster with one unit')
  return {
    ...snapshot,
    built: {
      ...snapshot.built,
      units: [...snapshot.built.units, { ...unit, key: `${unit.key}-second`, name: `${unit.name} second` }],
    },
  }
}

it('creates a battle from the exact two sealed league snapshots', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)
  const screen = await view(battle.token, 'alice')
  const rosters = await Promise.all([service.leagueRoster(league.token, 'alice'), service.leagueRoster(league.token, 'dave')])

  // The view carries the frozen units once, on the player, and the roster beside them without its copy.
  const withoutUnits = (roster: (typeof rosters)[number]) => {
    if (!roster?.built) return roster
    const { units: _units, ...built } = roster.built
    return { ...roster, built }
  }
  expect(screen.players.map((player) => [player.id, player.roster])).toEqual([
    ['alice', withoutUnits(rosters[0])],
    ['dave', withoutUnits(rosters[1])],
  ])
  expect(screen.players.map((player) => player.units.map((unit) => ({ key: unit.key, points: unit.points })))).toEqual([
    rosters[0]?.built?.units.map((unit) => ({ key: unit.key, points: unit.points })),
    rosters[1]?.built?.units.map((unit) => ({ key: unit.key, points: unit.points })),
  ])
})

it('finds a revealed league for the exact casual battle seats', async () => {
  const league = await revealedLeague()

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([
    {
      token: league.token,
      name: 'League',
      eventToken: league.eventToken,
      eventNumber: 1,
      format: '1v1',
    },
  ])
})

it('treats a legacy revealed league as a 1v1 casual battle match', async () => {
  const league = await revealedLeague()
  await database.update(leagueEvents).set({ format: null, rosterLimit: null }).where(eq(leagueEvents.token, league.eventToken))

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([
    {
      token: league.token,
      name: 'League',
      eventToken: league.eventToken,
      eventNumber: 1,
      format: '1v1',
    },
  ])
})

it('does not advertise a legacy league battle between different roster sizes', async () => {
  const league = await revealedLeague()
  await database.update(leagueEvents).set({ format: null, rosterLimit: null }).where(eq(leagueEvents.token, league.eventToken))
  await database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Dave Incursion', 1_000)) })
    .where(eq(leagueEventEntries.userId, 'dave'))

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([])
})

it('does not advertise a legacy league battle with an unsupported roster size', async () => {
  const league = await revealedLeague()
  await database.update(leagueEvents).set({ format: null, rosterLimit: null }).where(eq(leagueEvents.token, league.eventToken))
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Legacy roster', 1_500)) })

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([])
})

it('requires an explicit casual confirmation for a revealed league matchup', async () => {
  await revealedLeague()
  await befriend('alice', 'dave')

  expect(await refusalStatus(() => service.createBattle('alice', { opponentId: 'dave', limit: 2_000, missionPackId: null }))).toBe(409)
  await expect(
    service.createBattle('alice', { opponentId: 'dave', limit: 2_000, missionPackId: null, casual: true }),
  ).resolves.toMatchObject({ token: expect.any(String) })
})

it('creates a 2v1 league battle when the solo entrant opens it', async () => {
  const league = await revealedTeamLeague()

  const battle = await service.createLeagueBattle('alice', league.token, 'bob', null, league.eventToken, undefined, 'carol')
  const screen = await view(battle.token, 'alice')

  expect(screen.players.map((player) => [player.id, player.side, player.roster?.built?.limit])).toEqual([
    ['alice', 0, 2_000],
    ['bob', 1, 1_000],
    ['carol', 1, 1_000],
  ])
})

it('only offers a 2v1 league for seats that preserve its assigned sides', async () => {
  const league = await revealedTeamLeague()

  await expect(service.leagueBattleOptions('alice', { opponentIds: ['bob', 'carol'] })).resolves.toMatchObject([
    { token: league.token, eventToken: league.eventToken, format: '2v1' },
  ])
  await expect(service.leagueBattleOptions('alice', { opponentId: 'bob', allyId: 'carol' })).resolves.toEqual([])
})

it('creates a 2v1 league battle when an allied entrant opens it', async () => {
  const league = await revealedTeamLeague()

  const battle = await service.createLeagueBattle('bob', league.token, 'alice', null, league.eventToken, 'carol')
  const screen = await view(battle.token, 'bob')

  expect(screen.players.map((player) => [player.id, player.side])).toEqual([
    ['bob', 0],
    ['carol', 0],
    ['alice', 1],
  ])
})

it('refuses a 2v1 battle whose assigned roles do not form one solo side and one allied side', async () => {
  const league = await revealedTeamLeague()

  expect(await refusalStatus(() => service.createLeagueBattle('bob', league.token, 'carol', null, league.eventToken, 'alice'))).toBe(409)
})

it('creates a doubles league battle from fixed teams and sealed half-size rosters', async () => {
  const league = await revealedDoublesLeague()

  const battle = await service.createLeagueBattle('alice', league.token, 'carol', null, league.eventToken)
  const screen = await view(battle.token, 'alice')

  expect(screen.players.map((player) => [player.id, player.side, player.roster?.built?.limit])).toEqual([
    ['alice', 0, 1_000],
    ['bob', 0, 1_000],
    ['carol', 1, 1_000],
    ['dave', 1, 1_000],
  ])
})

it('only offers a doubles league for the fixed teams', async () => {
  const league = await revealedDoublesLeague()

  await expect(service.leagueBattleOptions('alice', { allyId: 'bob', opponentIds: ['carol', 'dave'] })).resolves.toMatchObject([
    { token: league.token, eventToken: league.eventToken, format: '2v2' },
  ])
  await expect(service.leagueBattleOptions('alice', { allyId: 'carol', opponentIds: ['bob', 'dave'] })).resolves.toEqual([])
})

it('keeps the selected doubles opponent in the first opposing seat', async () => {
  const league = await revealedDoublesLeague()

  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null, league.eventToken)
  const screen = await view(battle.token, 'alice')

  expect(screen.players.map((player) => player.id)).toEqual(['alice', 'bob', 'dave', 'carol'])
})

it('refuses a doubles battle against the creator’s own fixed team', async () => {
  const league = await revealedDoublesLeague()

  expect(await refusalStatus(() => service.createLeagueBattle('alice', league.token, 'bob', null, league.eventToken))).toBe(409)
})

it('atomically re-pairs doubles entrants and clears every affected seal', async () => {
  await enrol('dave', 'Dave')
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob', 'carol', 'dave']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await service.assignLeagueTeam(token, 'alice', ['carol', 'dave'])
  for (const userId of ['alice', 'bob', 'carol', 'dave']) {
    await saveAndSealLeagueRoster(token, userId, 1_000, '', userId === 'alice' || userId === 'carol')
  }

  await service.assignLeagueTeam(token, 'alice', ['alice', 'carol'])
  const league = await service.league(token, 'alice')

  expect(league?.entries.map((entry) => [entry.userId, entry.teamId !== null, entry.submitted])).toEqual([
    ['alice', true, false],
    ['bob', false, false],
    ['carol', true, false],
    ['dave', false, false],
  ])
})

it('rejects the seal that would complete a doubles team without exactly one Warlord', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await saveAndSealLeagueRoster(token, 'alice', 1_000, '', false)

  let refusal: Response | null = null
  try {
    await saveAndSealLeagueRoster(token, 'bob', 1_000, '', false)
  } catch (error) {
    if (error instanceof Response) refusal = error
  }
  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'a doubles team must seal exactly one Character or Epic Hero Warlord between both rosters',
  })
  expect((await service.league(token, 'bob'))?.entries.find((entry) => entry.userId === 'bob')).toMatchObject({ submitted: false })
})

it('rejects a standard league roster without exactly one eligible Warlord', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    format: '1v1',
    rosterLimit: 2_000,
  })
  await service.joinLeague(token, 'alice')
  await service.saveRoster('alice', {
    id: 'alice-strike-force',
    name: 'Alice Strike Force',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const saved = await service.ownRoster('alice', 'alice-strike-force')
  if (!saved) throw new Error('expected saved Strike Force roster')

  let refusal: Response | null = null
  try {
    await service.submitLeagueRoster(token, 'alice', saved, leagueSnapshot('Alice Strike Force', 2_000, false))
  } catch (error) {
    if (error instanceof Response) refusal = error
  }

  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'a league roster must seal exactly one Character or Epic Hero Warlord',
  })
  expect((await service.league(token, 'alice'))?.entries.find((entry) => entry.userId === 'alice')).toMatchObject({ submitted: false })
})

it('accepts catalogue-derived Warlord eligibility on an upgraded unit', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    format: '1v1',
    rosterLimit: 2_000,
  })
  await service.joinLeague(token, 'alice')
  await service.saveRoster('alice', {
    id: 'alice-tank-ace',
    name: 'Alice Tank Ace',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const saved = await service.ownRoster('alice', 'alice-tank-ace')
  if (!saved) throw new Error('expected saved Tank Ace roster')

  await expect(
    service.submitLeagueRoster(token, 'alice', saved, leagueSnapshot('Alice Tank Ace', 2_000, true, 'vehicle', true)),
  ).resolves.toMatchObject({ outcome: 'sealed' })
})

it('rejects a standard replacement with multiple eligible Warlords', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    format: '1v1',
    rosterLimit: 2_000,
  })
  await service.joinLeague(token, 'alice')
  await saveAndSealLeagueRoster(token, 'alice', 2_000)
  const replacement = await saveLeagueRoster('alice', 2_000, '-replacement')

  const status = await refusalStatus(() =>
    service.submitLeagueRoster(token, 'alice', replacement, withSecondWarlord(leagueSnapshot('alice-replacement sealed', 2_000))),
  )
  const entry = (await service.league(token, 'alice'))?.entries.find((candidate) => candidate.userId === 'alice')

  expect({ status, submitted: entry?.submitted, rosterName: entry?.rosterName }).toEqual({
    status: 409,
    submitted: true,
    rosterName: 'alice sealed',
  })
})

it('rejects a first doubles seal with multiple eligible Warlords', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  const saved = await saveLeagueRoster('alice', 1_000)

  const status = await refusalStatus(() =>
    service.submitLeagueRoster(token, 'alice', saved, withSecondWarlord(leagueSnapshot('alice sealed', 1_000))),
  )
  const entry = (await service.league(token, 'alice'))?.entries.find((candidate) => candidate.userId === 'alice')

  expect({ status, submitted: entry?.submitted }).toEqual({ status: 409, submitted: false })
})

it('revalidates standard Warlords before revealing existing sealed snapshots', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    format: '1v1',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob']) {
    await service.joinLeague(token, userId)
    await saveAndSealLeagueRoster(token, userId, 2_000)
  }
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Old invalid seal', 2_000, false)) })

  let refusal: Response | null = null
  try {
    await service.revealLeague(token, 'alice')
  } catch (error) {
    if (error instanceof Response) refusal = error
  }

  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'each league roster must select exactly one eligible Warlord before reveal',
  })
})

it('reveals an older upgraded Warlord without a frozen eligibility marker', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    format: '1v1',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob']) {
    await service.joinLeague(token, userId)
    await saveAndSealLeagueRoster(token, userId, 2_000)
  }
  await database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Old upgraded Warlord', 2_000, true, 'vehicle')) })

  await expect(service.revealLeague(token, 'alice')).resolves.toBeUndefined()
})

it('rejects a replacement that would give a doubles team two Warlords', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await saveAndSealLeagueRoster(token, 'alice', 1_000, '', false)
  await saveAndSealLeagueRoster(token, 'bob', 1_000, '', true)

  expect(await refusalStatus(() => saveAndSealLeagueRoster(token, 'alice', 1_000, '-replacement', true))).toBe(409)
  expect((await service.league(token, 'alice'))?.entries.find((entry) => entry.userId === 'alice')).toMatchObject({
    submitted: true,
    rosterName: 'alice sealed',
  })
})

it('explains the exact doubles Warlord requirement when reveal is refused', async () => {
  await enrol('dave', 'Dave')
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    format: '2v2',
    rosterLimit: 2_000,
  })
  for (const userId of ['alice', 'bob', 'carol', 'dave']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await service.assignLeagueTeam(token, 'alice', ['carol', 'dave'])
  for (const userId of ['alice', 'bob', 'carol', 'dave']) {
    await saveAndSealLeagueRoster(token, userId, 1_000, '', userId === 'alice' || userId === 'carol')
  }
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Invalid doubles roster', 1_000)) })

  let refusal: Response | null = null
  try {
    await service.revealLeague(token, 'alice')
  } catch (error) {
    if (error instanceof Response) refusal = error
  }

  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'each doubles team must select exactly one eligible Warlord before reveal',
  })
})

it('requires an assigned 2v1 roster size and clears a seal when that assignment changes', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
    format: '2v1',
    rosterLimit: 2_000,
  })
  await service.joinLeague(token, 'bob')
  await service.saveRoster('bob', {
    id: 'bob-team-roster',
    name: 'Bob team roster',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 1_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const saved = await service.ownRoster('bob', 'bob-team-roster')
  if (!saved) throw new Error('expected saved team roster')

  expect(await refusalStatus(() => service.submitLeagueRoster(token, 'bob', saved, leagueSnapshot('Bob sealed', 1_000)))).toBe(409)
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 1_000)
  await service.saveRoster('bob', {
    id: 'bob-wrong-size-roster',
    name: 'Bob wrong size',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const wrongSize = await service.ownRoster('bob', 'bob-wrong-size-roster')
  if (!wrongSize) throw new Error('expected wrong-size roster')
  expect(await refusalStatus(() => service.submitLeagueRoster(token, 'bob', wrongSize, leagueSnapshot('Wrong size', 2_000)))).toBe(409)
  await service.submitLeagueRoster(token, 'bob', saved, leagueSnapshot('Bob sealed', 1_000))
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 2_000)

  expect((await service.league(token, 'bob'))?.entries[0]).toEqual(
    expect.objectContaining({ requiredLimit: 2_000, submitted: false, rosterName: null }),
  )
})

it('only lets the organizer assign sizes before reveal', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
    format: '2v1',
    rosterLimit: 2_000,
  })
  await service.joinLeague(token, 'bob')

  expect(await refusalStatus(() => service.assignLeagueRosterRequirement(token, 'bob', 'bob', 1_000))).toBe(403)

  const revealed = await revealedTeamLeague()
  expect(await refusalStatus(() => service.assignLeagueRosterRequirement(revealed.token, 'alice', 'bob', 2_000))).toBe(409)
})

it('refuses reveal until a 2v1 event has one solo and two allied entrants', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
    format: '2v1',
    rosterLimit: 2_000,
  })
  await service.joinLeague(token, 'alice')
  await service.joinLeague(token, 'bob')
  await service.joinLeague(token, 'carol')
  await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 2_000)
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 2_000)
  await service.assignLeagueRosterRequirement(token, 'alice', 'carol', 1_000)
  await saveAndSealLeagueRoster(token, 'alice', 2_000)
  await saveAndSealLeagueRoster(token, 'bob', 2_000)
  await saveAndSealLeagueRoster(token, 'carol', 1_000)

  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)

  await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 1_000)
  await saveAndSealLeagueRoster(token, 'alice', 1_000, '-allied')
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 1_000)
  await saveAndSealLeagueRoster(token, 'bob', 1_000, '-replacement')

  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)

  await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 2_000)
  await saveAndSealLeagueRoster(token, 'alice', 2_000, '-solo')
  await service.revealLeague(token, 'alice')
  expect((await service.league(token, 'alice'))?.revealedAt).not.toBeNull()
})

it('refuses reveal when a frozen roster does not match its event size', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Sized league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    format: '1v1',
    rosterLimit: 2_000,
  })
  await service.joinLeague(token, 'alice')
  await service.joinLeague(token, 'bob')
  await database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Wrong size', 1_000)), rosterName: 'Wrong size', submittedAt: 1 })

  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)
})

it('does not let league edits reduce an open 2v1 event below three places', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 3,
    format: '2v1',
    rosterLimit: 2_000,
  })

  expect(
    await refusalStatus(() =>
      service.updateLeague(token, 'alice', {
        name: 'Team league',
        description: '',
        visibility: 'private',
        admission: 'automatic',
        playerLimit: 2,
      }),
    ),
  ).toBe(409)
})

it('lets a revealed 2v1 event lower the future player limit', async () => {
  const { token } = await revealedTeamLeague()

  await service.updateLeague(token, 'alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })

  expect(await service.league(token, 'alice')).toEqual(expect.objectContaining({ playerLimit: 2 }))
})

it('links a sealed-roster battle back to its league', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)
  const battleView = await view(battle.token, 'alice')

  expect({ leagueToken: battleView.leagueToken, eventToken: battleView.leagueEventToken }).toEqual({
    leagueToken: league.token,
    eventToken: league.eventToken,
  })
})

it('lists an event battle and gives a non-player a read-only spectator screen', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null, league.eventToken)

  const page = await service.leagueBattles(league.token, league.eventToken, { limit: 25 })
  const screen = await service.screen(battle.token, 'carol')

  expect(page).toEqual(
    expect.objectContaining({
      nextCursor: null,
      battles: [expect.objectContaining({ token: battle.token, players: ['Alice', 'Dave'], armies: ['Alice sealed', 'Dave sealed'] })],
    }),
  )
  expect(screen).toEqual(
    expect.objectContaining({
      kind: 'spectator',
      view: expect.objectContaining({
        leagueToken: league.token,
        leagueEventToken: league.eventToken,
        players: [
          expect.objectContaining({ id: 'alice', isViewer: false, roster: expect.objectContaining({ name: 'Alice sealed' }) }),
          expect.objectContaining({ id: 'dave', isViewer: false, roster: expect.objectContaining({ name: 'Dave sealed' }) }),
        ],
      }),
      report: expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('Alice sealed') })]),
    }),
  )
})

it('keeps league battle history scoped to its event', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed'))
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null, league.eventToken)
  const next = await service.createLeagueEvent(league.token, 'alice', { format: '1v1', rosterLimit: 600 })

  expect((await service.leagueBattles(league.token, league.eventToken, { limit: 25 })).battles.map((entry) => entry.token)).toEqual([
    battle.token,
  ])
  expect((await service.leagueBattles(league.token, next.eventToken, { limit: 25 })).battles).toEqual([])
})

it('normalizes a legacy one-off create payload to reusable events', async () => {
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    recurring: false,
  })

  expect((await service.league(token, 'alice', eventToken))?.recurring).toBe(true)
})

it('converts a persisted one-off league for legacy replicas', async () => {
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await database.update(leagues).set({ recurring: false }).where(eq(leagues.token, token))

  await service.makeLeagueRecurring(token, 'alice')

  expect((await service.league(token, 'alice', eventToken))?.recurring).toBe(true)
})

it('only lets the organizer convert a persisted one-off league', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await database.update(leagues).set({ recurring: false }).where(eq(leagues.token, token))

  expect(await refusalStatus(() => service.makeLeagueRecurring(token, 'bob'))).toBe(403)
})

it('rechecks the event size when creating a 1v1 league battle', async () => {
  const league = await revealedLeague()
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Changed snapshot', 1_000)) })

  expect(await refusalStatus(() => service.createLeagueBattle('alice', league.token, 'dave', null))).toBe(409)
})

it('keeps prior event entrants out of a new event', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed'))
  const next = await service.createLeagueEvent(league.token, 'alice', { format: '1v1', rosterLimit: 600 })

  const current = await service.league(league.token, 'dave', next.eventToken)
  const previous = await service.league(league.token, 'dave', league.eventToken)

  expect({
    currentEntries: current?.entries,
    currentNumber: current?.eventNumber,
    currentFormat: current?.format,
    currentLimit: current?.rosterLimit,
    previousEntries: previous?.entries.length,
    previousFormat: previous?.format,
    previousLimit: previous?.rosterLimit,
  }).toEqual({
    currentEntries: [],
    currentNumber: 2,
    currentFormat: '1v1',
    currentLimit: 600,
    previousEntries: 2,
    previousFormat: '1v1',
    previousLimit: 2_000,
  })
})

it('lets a two-player league raise its limit before starting a 2v1 event', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed'))
  await service.updateLeague(league.token, 'alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 3,
  })

  const next = await service.createLeagueEvent(league.token, 'alice', { format: '2v1', rosterLimit: 2_000 })

  expect(await service.league(league.token, 'alice', next.eventToken)).toEqual(
    expect.objectContaining({ format: '2v1', playerLimit: 3, rosterLimit: 2_000 }),
  )
})

it('only lets the organizer edit and delete a league', async () => {
  await enrol('dave', 'Dave')
  const league = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: null,
  })
  const update = {
    name: 'Renamed league',
    description: 'New details',
    visibility: 'public' as const,
    admission: 'automatic' as const,
    playerLimit: 4,
  }

  expect(await refusalStatus(() => service.updateLeague(league.token, 'dave', update))).toBe(403)
  await service.updateLeague(league.token, 'alice', update)
  expect(await service.league(league.token, 'alice')).toEqual(expect.objectContaining(update))
  expect(await refusalStatus(() => service.deleteLeague(league.token, 'dave'))).toBe(403)
  await service.deleteLeague(league.token, 'alice')
  expect(await service.league(league.token, 'alice')).toBeNull()
})

it('deletes league history while preserving a battle made from its sealed rosters', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)

  await service.deleteLeague(league.token, 'alice')

  const [screen, events, entries] = await Promise.all([
    view(battle.token, 'alice'),
    database.select().from(leagueEvents),
    database.select().from(leagueEventEntries),
  ])
  expect({ league: await service.league(league.token, 'alice'), events, entries }).toEqual({ league: null, events: [], entries: [] })
  expect(screen.players.map((player) => [player.id, player.roster?.name])).toEqual([
    ['alice', league.aliceRoster.name],
    ['dave', league.opponentRoster.name],
  ])
})

it('refuses to replace a league roster through the battle service', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)
  const screen = await view(battle.token, 'alice')
  const { result } = await service.submit(battle.token, 'alice', screen.seq, {
    kind: 'attach-roster',
    roster: leagueSnapshot('Replacement'),
  })

  expect(result).toEqual({ outcome: 'refused', reason: 'league rosters are sealed' })
})

it('requires sealed 1v1 rosters to use the event size', async () => {
  expect(await refusalStatus(() => revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed', 1_000)))).toBe(409)
})

it('stores a readable league snapshot without the saved roster capability', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
  })
  await service.joinLeague(token, 'bob')
  await service.saveRoster('bob', {
    id: 'bob-roster',
    name: 'Bob army',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const roster = await service.ownRoster('bob', 'bob-roster')
  if (!roster) throw new Error('expected saved roster')
  await service.submitLeagueRoster(token, 'bob', roster, {
    id: 'bob-roster',
    name: 'Bob army',
    text: '2,000 pts',
    built: {
      catalogueId: 'catalogue',
      revision: 'revision',
      limit: 2_000,
      detachment: null,
      disposition: null,
      picks: [],
      units: [{ key: 'unit', entryId: 'unit', name: 'Intercessors', points: 80, models: 5, group: 'character', warlord: true }],
    },
  })
  await service.revealLeague(token, 'alice')

  expect(await service.leagueRoster(token, 'bob')).toEqual({
    name: 'Bob army',
    text: '2,000 pts',
    built: {
      catalogueId: 'catalogue',
      revision: 'revision',
      limit: 2_000,
      detachment: null,
      disposition: null,
      picks: [],
      units: [{ key: 'unit', entryId: 'unit', name: 'Intercessors', points: 80, models: 5, group: 'character', warlord: true }],
    },
  })
})

it('rejects a league snapshot that cannot be read back', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
  })
  await service.joinLeague(token, 'bob')
  await service.saveRoster('bob', {
    id: 'bob-roster',
    name: 'Bob army',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const roster = await service.ownRoster('bob', 'bob-roster')
  if (!roster) throw new Error('expected saved roster')

  await expect(
    service.submitLeagueRoster(token, 'bob', roster, {
      name: 'Bob army',
      text: '2,000 pts',
      built: {
        catalogueId: 'catalogue',
        revision: 'revision',
        limit: 2_000,
        detachment: null,
        disposition: null,
        units: [{ key: 'unit', name: 'x'.repeat(81), points: 80, models: 5 }],
      },
    }),
  ).rejects.toThrow()
  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)
})

it('chooses tactical draws on the server instead of trusting the submitted card', async () => {
  const { token } = await service.createBattle('alice', 'bob')
  let seq = 0
  const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, by, seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send('alice', { kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await send('bob', { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } })
  const first = { key: 'first', name: 'First card' }
  const chosenByClient = { key: 'chosen', name: 'Chosen card' }
  expect(
    (
      await send('alice', {
        kind: 'set-prep',
        stratagems: [],
        secondaries: [],
        secondaryDeck: [first, chosenByClient],
        primary: null,
        secondaryMode: 'tactical',
      })
    ).result.outcome,
  ).toBe('appended')
  expect((await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).result.outcome).toBe('appended')

  expect((await send('alice', { kind: 'draw-secondary', secondary: chosenByClient })).result.outcome).toBe('appended')

  expect((await view(token, 'alice')).players.find((player) => player.id === 'alice')?.secondaries).toContainEqual(
    expect.objectContaining({ key: 'first' }),
  )
})

it('chooses a complete tactical refill atomically on the server', async () => {
  const { token } = await service.createBattle('alice', { opponentId: 'bob', missionPackId: null })
  let seq = 0
  const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, by, seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send('alice', { kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await send('bob', { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } })
  const cards = [
    { key: 'first', name: 'First card' },
    { key: 'second', name: 'Second card' },
  ]
  await send('alice', { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: cards, primary: null, secondaryMode: 'tactical' })
  await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })

  const clientChoices = [
    { key: 'chosen-first', name: 'Chosen first' },
    { key: 'chosen-second', name: 'Chosen second' },
  ]
  expect((await send('alice', { kind: 'draw-secondaries', secondaries: clientChoices })).result.outcome).toBe('appended')
  const drawn = (await view(token, 'alice')).players.find((player) => player.id === 'alice')?.secondaries
  expect(drawn?.map((card) => card.key).sort()).toEqual(['first', 'second'])
})

it('keeps explicitly selected tactical secondaries', async () => {
  const { token } = await service.createBattle('alice', { opponentId: 'bob', missionPackId: null })
  let seq = 0
  const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, by, seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send('alice', { kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await send('bob', { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } })
  const cards = [
    { key: 'first', name: 'First card' },
    { key: 'second', name: 'Second card' },
    { key: 'third', name: 'Third card' },
  ]
  await send('alice', { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: cards, primary: null, secondaryMode: 'tactical' })
  await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })

  const selected = cards.slice(1)
  expect((await send('alice', { kind: 'draw-secondaries', secondaries: selected, selected: true })).result.outcome).toBe('appended')
  const drawn = (await view(token, 'alice')).players.find((player) => player.id === 'alice')?.secondaries
  expect(drawn?.map((card) => card.key)).toEqual(['second', 'third'])
})

it('chooses the New Orders replacement on the server', async () => {
  const { token } = await service.createBattle('alice', { opponentId: 'bob', missionPackId: null })
  let seq = 0
  const send = async (command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, 'alice', seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send({ kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await service.submit(token, 'bob', seq, { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } }).then((answer) => {
    if (answer.result.outcome === 'appended') seq = answer.result.seq
  })
  const cards = [
    { key: 'first', name: 'First card' },
    { key: 'second', name: 'Second card' },
    { key: 'replacement', name: 'Replacement card' },
  ]
  await send({
    kind: 'set-prep',
    stratagems: [{ key: 'new-orders', name: 'New Orders', cp: 1, limit: 'unlimited', phases: ['command'], turn: 'your-turn' }],
    secondaries: [],
    secondaryDeck: cards,
    primary: null,
    secondaryMode: 'tactical',
  })
  await send({ kind: 'begin-battle', firstPlayerId: 'alice' })
  await send({ kind: 'draw-secondaries', secondaries: cards.slice(0, 2), selected: true })

  const answer = await send({
    kind: 'use-new-orders',
    stratagemKey: 'new-orders',
    secondaryKey: 'first',
    secondary: { key: 'client-choice', name: 'Client choice' },
  })

  expect(answer.result.outcome).toBe('appended')
  const player = answer.screen.kind === 'battle' ? answer.screen.view.players.find((candidate) => candidate.id === 'alice') : undefined
  expect(player?.secondaries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: 'first', status: 'discarded' }),
      expect.objectContaining({ key: 'replacement', status: 'active' }),
    ]),
  )
})

describe('favourite factions', () => {
  it('keeps each player favourites separate', async () => {
    await service.setFavouriteFaction('alice', 'dark-angels', true)
    expect(await service.favouriteFactions('alice')).toEqual(['dark-angels'])
    expect(await service.favouriteFactions('bob')).toEqual([])
  })

  it('removes a faction from favourites', async () => {
    await service.setFavouriteFaction('alice', 'dark-angels', true)
    await service.setFavouriteFaction('alice', 'dark-angels', false)
    expect(await service.favouriteFactions('alice')).toEqual([])
  })
})

describe('favourite detachments', () => {
  it('keeps each player favourites separate', async () => {
    await service.setFavouriteDetachment('alice', 'space-marines', 'gladius-task-force', true)
    expect(await service.favouriteDetachments('alice')).toEqual([{ catalogueId: 'space-marines', detachmentId: 'gladius-task-force' }])
    expect(await service.favouriteDetachments('bob')).toEqual([])
  })

  it('removes a detachment from favourites', async () => {
    await service.setFavouriteDetachment('alice', 'space-marines', 'gladius-task-force', true)
    await service.setFavouriteDetachment('alice', 'space-marines', 'gladius-task-force', false)
    expect(await service.favouriteDetachments('alice')).toEqual([])
  })
})

describe('friends', () => {
  it('requires the recipient to accept a request before the sender becomes a friend', async () => {
    await enrol('dave', 'Dave')
    await service.requestFriend('alice', 'dave')

    expect((await service.friendships('alice')).outgoing).toEqual([{ id: 'dave', name: 'Dave', image: null }])
    await service.acceptFriend('dave', 'alice')
    expect(await service.opponents('alice')).toContainEqual({ id: 'dave', name: 'Dave', image: null, automated: false })
  })

  it('offers only players with no relationship yet, and does not run out of them', async () => {
    // More strangers than a page, so a page filtered after the fact would come
    // back short — or empty — rather than simply excluding the connections.
    for (let index = 0; index < 120; index += 1) await enrol(`p${index}`, `Player ${String(index).padStart(3, '0')}`)

    const { people } = await service.friendships('alice')

    expect(people).toHaveLength(100)
    expect(people.map((player) => player.id)).not.toContain('bob')
    expect(people.map((player) => player.id)).not.toContain('carol')
    expect(people.map((player) => player.id)).not.toContain('alice')
  })

  it('names an opponent without reading the players nobody is connected to', async () => {
    await enrol('dave', 'Dave')

    // A friend is a friend whether or not anyone asks who else is on the instance,
    // and the practice opponents the instance seats come after them.
    expect(await service.opponents('alice')).toEqual([
      { id: 'bob', name: 'Bob', image: 'https://example.test/bob.png', automated: false },
      { id: 'carol', name: 'Carol', image: null, automated: false },
      { id: 'practice-opponent-1', name: 'Practice Opponent', image: null, automated: true },
      { id: 'practice-opponent-2', name: 'Practice Opponent II', image: null, automated: true },
    ])
    expect((await service.friendships('alice')).friends).toEqual([
      { id: 'bob', name: 'Bob', image: 'https://example.test/bob.png' },
      { id: 'carol', name: 'Carol', image: null },
    ])
  })

  it('does not offer a practice opponent as someone to befriend', async () => {
    const { people } = await service.friendships('alice')

    expect(people.map((player) => player.id)).not.toContain('practice-opponent-1')
    expect(people.map((player) => player.id)).not.toContain('practice-opponent-2')
  })

  it('does not let another player accept someone else’s request', async () => {
    await enrol('dave', 'Dave')
    await service.requestFriend('alice', 'dave')

    await expect(service.acceptFriend('bob', 'alice')).rejects.toThrow(expect.objectContaining({ status: 404 }))
  })
})

describe('player profiles', () => {
  it('shows a confirmed friend before their first shared battle', async () => {
    expect(await service.userProfile('alice', 'carol')).toEqual({ id: 'carol', name: 'Carol', image: null })
  })

  it('keeps showing a friend after the viewer shares a battle with them', async () => {
    expect(await service.userProfile('alice', 'bob')).toEqual({ id: 'bob', name: 'Bob', image: 'https://example.test/bob.png' })
    await service.createBattle('alice', { opponentId: 'bob', limit: 2000, missionPackId: null })

    expect(await service.userProfile('alice', 'bob')).toEqual({ id: 'bob', name: 'Bob', image: 'https://example.test/bob.png' })
  })

  it('shows a player their own profile before their first battle', async () => {
    expect(await service.userProfile('alice', 'alice')).toEqual({ id: 'alice', name: 'Alice', image: null })
  })

  it('shows players named by a revealed league battle to its spectators', async () => {
    const league = await revealedLeague()
    const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)

    expect(await service.userProfile(null, 'dave', battle.token)).toEqual({ id: 'dave', name: 'Dave', image: null })
  })

  it('names the players of a battle anyone may watch to whoever opens its link', async () => {
    const battle = await service.createBattle('alice', { opponentId: 'bob', limit: 2000, missionPackId: null })

    expect(await service.userProfile(null, 'bob', battle.token)).toEqual({ id: 'bob', name: 'Bob', image: 'https://example.test/bob.png' })
  })

  it('does not let the token of a withheld battle reveal a player profile', async () => {
    await service.setBattleAudience('bob', 'private')
    const battle = await service.createBattle('alice', { opponentId: 'bob', limit: 2000, missionPackId: null })

    expect(await service.userProfile(null, 'bob', battle.token)).toBeNull()
  })

  it('includes profile pictures in the battle view', async () => {
    const { token } = await service.createBattle('alice', { opponentId: 'bob', limit: 2000, missionPackId: null })

    expect((await view(token, 'alice')).players[1]?.image).toBe('https://example.test/bob.png')
  })
})

describe('seats', () => {
  it('refuses to create a battle with someone who is not a friend', async () => {
    await enrol('dave', 'Dave')

    await expect(service.createBattle('alice', { opponentId: 'dave', limit: 2000, missionPackId: null })).rejects.toThrow(
      expect.objectContaining({ status: 403 }),
    )
  })

  it('creates a 2v1 battle with two allied opponents', async () => {
    const { token } = await service.createBattle(
      'alice',
      createBattleSchema.parse({
        opponentIds: ['bob', 'carol'],
        limit: 2000,
        missionPackId: null,
      }),
    )

    expect(await view(token, 'alice')).toMatchObject({
      settings: { teamBattle: true },
      players: [
        { id: 'alice', side: 0 },
        { id: 'bob', side: 1 },
        { id: 'carol', side: 1 },
      ],
    })
  })

  it('seats the creator beside their own ally, so either of a pair can open the 2v1', async () => {
    const { token } = await service.createBattle(
      'alice',
      createBattleSchema.parse({
        opponentIds: ['bob'],
        allyId: 'carol',
        limit: 2000,
        missionPackId: null,
      }),
    )

    // Alice keeps the first seat, which is what says the battle is hers to delete.
    expect(await view(token, 'alice')).toMatchObject({
      settings: { teamBattle: true },
      creatorId: 'alice',
      players: [
        { id: 'alice', side: 0 },
        { id: 'carol', side: 0 },
        { id: 'bob', side: 1 },
      ],
    })
  })

  it('refuses an ally with nobody to play against', async () => {
    await expect(service.createBattle('alice', { allyId: 'carol', limit: 2000, missionPackId: null })).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })

  it('refuses an ally who is also across the table', async () => {
    await expect(
      service.createBattle('alice', { opponentIds: ['bob', 'carol'], allyId: 'carol', limit: 2000, missionPackId: null }),
    ).rejects.toThrow(expect.objectContaining({ status: 400 }))
  })

  it('creates a 2v2 battle with two armies on each side', async () => {
    await enrol('dave', 'Dave')
    await befriend('alice', 'dave')

    const { token } = await service.createBattle('alice', {
      opponentIds: ['bob', 'carol'],
      allyId: 'dave',
      limit: 2000,
      missionPackId: null,
    })

    expect(await view(token, 'alice')).toMatchObject({
      settings: { teamBattle: true, playerCount: 4 },
      players: [
        { id: 'alice', side: 0 },
        { id: 'dave', side: 0 },
        { id: 'bob', side: 1 },
        { id: 'carol', side: 1 },
      ],
    })
  })

  it('preserves an opponent-only legacy creation request', async () => {
    const { token } = await service.createBattle('alice', createBattleSchema.parse({ opponentId: 'bob' }))

    expect(await view(token, 'alice')).toMatchObject({ settings: { limit: null }, players: [{ id: 'alice' }, { id: 'bob' }] })
  })

  it('refuses an unconfigured team battle before writing it', async () => {
    await expect(service.createBattle('alice', { opponentIds: ['bob', 'carol'], missionPackId: null })).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    )
    await expect(service.createBattle('alice', { opponentId: 'bob', allyId: 'carol', missionPackId: null })).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    )

    expect(await database.select().from(battles)).toHaveLength(0)
  })

  it('refuses to open a battle with nobody in the other seat', async () => {
    await expect(service.createBattle('alice', { limit: 2000, missionPackId: null })).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })

  it('seats a practice opponent without a friendship, and marks the seat', async () => {
    const { token } = await service.createBattle('alice', {
      opponentId: 'practice-opponent-1',
      limit: 2000,
      missionPackId: null,
    })

    expect(await view(token, 'alice')).toMatchObject({
      settings: { teamBattle: false },
      players: [
        { id: 'alice', automated: false },
        { id: 'practice-opponent-1', automated: true },
      ],
    })
  })

  it('lets the table bring the army a practice opponent fields and settle its cards', async () => {
    const { token } = await service.createBattle('alice', {
      opponentId: 'practice-opponent-1',
      limit: 2000,
      missionPackId: null,
    })
    let seq = 1
    const send = async (command: Parameters<PraetoriumService['submit']>[3]) => {
      const { result } = await service.submit(token, 'alice', seq, command)
      if (result.outcome === 'appended') seq = result.seq
      return result
    }

    await send({ kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
    await send({
      kind: 'attach-roster',
      playerId: 'practice-opponent-1',
      roster: { name: 'Death Guard', text: '10 Plague Marines' },
    })
    await send({
      kind: 'set-prep',
      playerId: 'practice-opponent-1',
      stratagems: [],
      secondaries: [],
      secondaryDeck: [{ key: 'a', name: 'Area Denial' }],
      primary: null,
      secondaryMode: 'tactical',
    })
    expect((await send({ kind: 'begin-battle', firstPlayerId: 'alice' })).outcome).toBe('appended')

    const seen = await view(token, 'alice')
    expect(seen.players.map((player) => player.roster?.name)).toEqual(['Ultramarines', 'Death Guard'])
    // Nobody signs in to it, so its deck has to be readable by the people playing it.
    expect(seen.players[1]?.remainingSecondaries).toEqual([{ key: 'a', name: 'Area Denial' }])
  })

  it('deals a practice opponent’s hand off its own deck rather than the drawing player’s', async () => {
    const { token } = await service.createBattle('alice', {
      opponentId: 'practice-opponent-1',
      limit: 2000,
      missionPackId: null,
    })
    let seq = 1
    const send = async (command: Parameters<PraetoriumService['submit']>[3]) => {
      const { result } = await service.submit(token, 'alice', seq, command)
      if (result.outcome === 'appended') seq = result.seq
      return result
    }
    const deckOf = (name: string) => [{ key: `${name}-card`, name }]

    await send({ kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
    await send({ kind: 'attach-roster', playerId: 'practice-opponent-1', roster: { name: 'Death Guard', text: '10 Plague Marines' } })
    for (const [playerId, deck] of [
      ['alice', deckOf('Yours')],
      ['practice-opponent-1', deckOf('Theirs')],
    ] as const) {
      await send({
        kind: 'set-prep',
        playerId,
        stratagems: [],
        secondaries: [],
        secondaryDeck: deck,
        primary: null,
        secondaryMode: 'tactical',
      })
    }
    await send({ kind: 'begin-battle', firstPlayerId: 'practice-opponent-1' })
    // The client only says how many cards it needs; the server chooses them.
    await send({
      kind: 'draw-secondaries',
      playerId: 'practice-opponent-1',
      secondaries: [{ key: 'placeholder', name: 'Placeholder' }],
    })

    const seen = await view(token, 'alice')
    expect(seen.players[1]?.secondaries.map((card) => card.name)).toEqual(['Theirs'])
    expect(seen.players[0]?.secondaries).toEqual([])
  })

  it('seats the whole table when the battle is created', async () => {
    const { token } = await service.createBattle('alice', 'bob')

    expect((await view(token, 'alice')).players.map((player) => player.id)).toEqual(['alice', 'bob'])
  })

  it('refuses to open a battle with nobody to play', async () => {
    expect(await refusalStatus(() => service.createBattle('alice'))).toBe(400)
  })

  it('does not seat someone for reading the link', async () => {
    const { token } = await service.createBattle('alice', 'bob')

    await service.screen(token, 'carol')

    expect((await view(token, 'alice')).players.map((player) => player.id)).toEqual(['alice', 'bob'])
  })

  it('refuses a command from someone without a seat', async () => {
    const { token } = await service.createBattle('alice', 'bob')
    expect(await refusalStatus(() => service.submit(token, 'carol', 0, { kind: 'advance' }))).toBe(403)
  })
})

describe('battle deletion', () => {
  it('lets the creator delete a battle', async () => {
    const { token } = await service.createBattle('alice', 'bob')
    await service.deleteBattle(token, 'alice')
    expect(await refusalStatus(() => service.screen(token, 'alice'))).toBe(404)
  })

  it('does not let the opponent delete a battle', async () => {
    const { token } = await service.createBattle('alice', 'bob')
    expect(await refusalStatus(() => service.deleteBattle(token, 'bob'))).toBe(403)
  })

  // Seats taken before allies were seated share a timestamp, so the earliest seat alone
  // does not name the opener either.
  it('does not let the opponent of a battle opened before allies were seated delete it', async () => {
    const token = 'legacy-token'
    await database.insert(battles).values({ id: 'legacy', token, createdAt: 1 })
    await database.insert(battleUsers).values([
      { battleId: 'legacy', userId: 'alice', side: 0, joinedAt: 1 },
      { battleId: 'legacy', userId: 'bob', side: 1, joinedAt: 1 },
    ])
    expect(await refusalStatus(() => service.deleteBattle(token, 'bob'))).toBe(403)
    await service.deleteBattle(token, 'alice')
    expect(await refusalStatus(() => service.screen(token, 'alice'))).toBe(404)
  })

  // The ally sits on the opener's own side, so a seat on side 0 no longer says whose battle it is.
  it('does not let an ally on the creator side delete a battle', async () => {
    const { token } = await service.createBattle(
      'alice',
      createBattleSchema.parse({ opponentIds: ['bob'], allyId: 'carol', limit: 2000, missionPackId: null }),
    )
    expect(await refusalStatus(() => service.deleteBattle(token, 'carol'))).toBe(403)
    await service.deleteBattle(token, 'alice')
    expect(await refusalStatus(() => service.screen(token, 'alice'))).toBe(404)
  })
})

describe('battle setup references', () => {
  const rules = (): LoadedRules =>
    ({
      missions: new Map([
        [
          'pack-a|reconnaissance|disruption',
          {
            id: 'mission-a',
            name: 'Mission A',
            roundCap: null,
            gameCap: null,
            secondaryRoundCap: null,
            secondaryGameCap: null,
            source: 'Pack A',
            packId: 'pack-a',
            deploymentIds: ['valid-deployment'],
          },
        ],
        [
          'pack-a|disruption|reconnaissance',
          {
            id: 'mission-b',
            name: 'Mission B',
            roundCap: null,
            gameCap: null,
            secondaryRoundCap: null,
            secondaryGameCap: null,
            source: 'Pack A',
            packId: 'pack-a',
            deploymentIds: ['valid-deployment'],
          },
        ],
      ]),
      deployments: [
        { id: 'valid-deployment', name: 'Valid', description: null, zones: [], objectives: [] },
        { id: 'other-deployment', name: 'Other', description: null, zones: [], objectives: [] },
      ],
      terrainLayouts: [
        {
          id: 'valid-terrain',
          name: 'Valid terrain',
          description: null,
          matchupId: 'reconnaissance-vs-disruption',
          variant: null,
          deploymentId: 'valid-deployment',
          pieces: [],
          geometry: null,
        },
        {
          id: 'wrong-terrain',
          name: 'Wrong terrain',
          description: null,
          matchupId: 'reconnaissance-vs-disruption',
          variant: null,
          deploymentId: 'other-deployment',
          pieces: [],
          geometry: null,
        },
      ],
    }) as unknown as LoadedRules

  const fixedAward = {
    vp: 1,
    per: null,
    mode: 'fixed',
    max: null,
    group: null,
    cumulative: false,
    criteria: 'Complete the objective.',
    trigger: { timing: 'end-of-phase', phase: 'end', playerTurn: 'your-turn', roundMin: null, roundMax: null },
  } as const

  const configured = async (loadedRules = rules()) => {
    const { token } = await service.createBattle('alice', {
      opponentId: 'bob',
      limit: 2000,
      missionPackId: 'pack-a',
    })
    let seq = 1
    const attach = async (by: string, name: string, disposition: string) => {
      const result = (
        await service.submit(
          token,
          by,
          seq,
          {
            kind: 'attach-roster',
            roster: {
              name,
              text: name,
              built: {
                catalogueId: 'cat',
                revision: 'rev',
                limit: 2000,
                detachment: null,
                disposition,
                units: [],
              },
            },
          },
          loadedRules,
        )
      ).result
      if (result.outcome === 'appended') seq = result.seq
    }
    await attach('alice', 'Alice army', 'reconnaissance')
    await attach('bob', 'Bob army', 'disruption')
    return {
      token,
      seq: () => seq,
      send: async (by: string, command: Parameters<PraetoriumService['submit']>[3]) =>
        (await service.submit(token, by, seq, command, loadedRules)).result,
      setSeq: (next: number) => (seq = next),
    }
  }

  it('refuses a deployment outside the selected pack matchup', async () => {
    const battle = await configured()
    const deployment = await battle.send('alice', { kind: 'set-deployment', patternId: 'other-deployment' })
    if (deployment.outcome === 'appended') battle.setSeq(deployment.seq)

    expect(await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that deployment does not match the mission',
    })
  })

  it('refuses to begin when fixed cards are selected without the full secondary deck', async () => {
    const card = {
      name: 'Card',
      text: null,
      awards: [],
      whenDrawn: null,
    }
    const battle = await configured({
      ...rules(),
      primaries: [
        { ...card, key: 'mission-a' },
        { ...card, key: 'mission-b' },
      ],
      secondaries: [
        { ...card, key: 'secondary-a', awards: [fixedAward] },
        { ...card, key: 'secondary-b', awards: [fixedAward] },
      ],
    })
    for (const [playerId, primary] of [
      ['alice', 'mission-a'],
      ['bob', 'mission-b'],
    ] as const) {
      const result = await battle.send('alice', {
        kind: 'set-prep',
        playerId,
        stratagems: [],
        secondaries: [
          { key: 'secondary-a', name: 'Secondary A' },
          { key: 'secondary-b', name: 'Secondary B' },
        ],
        primary: { key: primary, name: primary },
        secondaryMode: 'fixed',
      })
      if (result.outcome === 'appended') battle.setSeq(result.seq)
    }
    const deployment = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (deployment.outcome === 'appended') battle.setSeq(deployment.seq)

    expect(await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'every side must prepare its mission cards',
    })
  })

  it('records mission timing from the server rules instead of the submitted card', async () => {
    const authoritative = {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Control an objective marker.',
      trigger: { timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn', roundMin: 2, roundMax: null },
    }
    const card = { name: 'Card', text: null, whenDrawn: null }
    const loaded = {
      ...rules(),
      primaries: [
        { ...card, key: 'mission-a', awards: [authoritative] },
        { ...card, key: 'mission-b', awards: [authoritative] },
      ],
      secondaries: [{ ...card, key: 'secondary-a', awards: [authoritative] }],
    }
    const battle = await configured(loaded)
    const submitted = { ...authoritative, trigger: { ...authoritative.trigger, phase: 'fight' } }
    const result = await battle.send('alice', {
      kind: 'set-prep',
      stratagems: [],
      secondaries: [],
      secondaryDeck: [{ key: 'secondary-a', name: 'Altered', awards: [submitted] }],
      primary: { key: 'mission-a', name: 'Altered', awards: [submitted] },
      secondaryMode: 'tactical',
    })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    const screen = await service.screen(battle.token, 'alice', loaded)

    expect(screen.kind === 'battle' ? screen.view.players[0]?.primaryCard?.awards : null).toEqual([authoritative])

    const changed = {
      ...loaded,
      primaries: loaded.primaries.map((primary) => ({ ...primary, awards: [{ ...authoritative, vp: 10 }] })),
    }
    const unchanged = await service.screen(battle.token, 'alice', changed)
    expect(unchanged.kind === 'battle' ? unchanged.view.players[0]?.primaryCard?.awards : null).toEqual([authoritative])
  })

  it('restores authoritative scoring timing for battles prepared before timing was frozen', async () => {
    const commandAward = {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Control an objective marker.',
      trigger: { timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn', roundMin: 1, roundMax: null },
    }
    const timingFixedAward = { ...commandAward, mode: 'fixed', trigger: { ...commandAward.trigger, phase: 'movement' } }
    const card = { name: 'Card', text: null, whenDrawn: null }
    const loaded = {
      ...rules(),
      primaries: [
        { ...card, key: 'mission-a', awards: [commandAward] },
        { ...card, key: 'mission-b', awards: [commandAward] },
      ],
      secondaries: [
        { ...card, key: 'secondary-a', awards: [timingFixedAward] },
        { ...card, key: 'secondary-b', awards: [timingFixedAward] },
      ],
    }
    const battle = await configured(loaded)
    for (const [playerId, primary] of [
      ['alice', 'mission-a'],
      ['bob', 'mission-b'],
    ] as const) {
      const { result } = await service.submit(battle.token, 'alice', battle.seq(), {
        kind: 'set-prep',
        playerId,
        stratagems: [],
        secondaries: [
          { key: 'secondary-a', name: 'Secondary A' },
          { key: 'secondary-b', name: 'Secondary B' },
        ],
        secondaryDeck: [
          { key: 'secondary-a', name: 'Secondary A' },
          { key: 'secondary-b', name: 'Secondary B' },
        ],
        primary: { key: primary, name: 'Primary' },
        secondaryMode: 'fixed',
      })
      if (result.outcome === 'appended') battle.setSeq(result.seq)
    }
    for (const command of [
      { kind: 'set-deployment', patternId: 'valid-deployment' },
      { kind: 'begin-battle', firstPlayerId: 'alice' },
    ] as const) {
      const result = await battle.send('alice', command)
      if (result.outcome === 'appended') battle.setSeq(result.seq)
    }

    const screen = await service.screen(battle.token, 'alice', loaded)
    expect(screen.kind === 'battle' ? screen.view.players[0]?.primaryCard?.awards : null).toEqual([commandAward])
    expect(await battle.send('alice', { kind: 'advance' })).toEqual({
      outcome: 'refused',
      reason: 'review mission scoring before ending the phase',
    })
  })

  it('refuses to begin with a fixed mission outside the server deck', async () => {
    const card = { name: 'Card', text: null, awards: [fixedAward], whenDrawn: null }
    const loaded = {
      ...rules(),
      primaries: [
        { ...card, key: 'mission-a' },
        { ...card, key: 'mission-b' },
      ],
      secondaries: [
        { ...card, key: 'secondary-a' },
        { ...card, key: 'secondary-b' },
      ],
    }
    const battle = await configured(loaded)
    for (const [playerId, primary, secondaries] of [
      ['alice', 'mission-a', ['secondary-a', 'made-up']],
      ['bob', 'mission-b', ['secondary-a', 'secondary-b']],
    ] as const) {
      const result = await battle.send('alice', {
        kind: 'set-prep',
        playerId,
        stratagems: [],
        secondaries: secondaries.map((key) => ({ key, name: key })),
        secondaryDeck: [...new Set(['secondary-a', 'secondary-b', ...secondaries])].map((key) => ({ key, name: key })),
        primary: { key: primary, name: primary },
        secondaryMode: 'fixed',
      })
      if (result.outcome === 'appended') battle.setSeq(result.seq)
    }
    const deployment = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (deployment.outcome === 'appended') battle.setSeq(deployment.seq)

    expect(await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'every side must prepare its mission cards',
    })
  })

  it('refuses to begin with tactical-only cards selected as fixed missions', async () => {
    const card = { name: 'Card', text: null, whenDrawn: null }
    const tacticalAward = {
      vp: 5,
      per: null,
      mode: 'tactical',
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Complete the objective.',
      trigger: { timing: 'end-of-phase', phase: 'end', playerTurn: 'your-turn', roundMin: null, roundMax: null },
    }
    const loaded = {
      ...rules(),
      primaries: [
        { ...card, key: 'mission-a', awards: [] },
        { ...card, key: 'mission-b', awards: [] },
      ],
      secondaries: [
        { ...card, key: 'secondary-a', awards: [tacticalAward] },
        { ...card, key: 'secondary-b', awards: [tacticalAward] },
      ],
    }
    const battle = await configured(loaded)
    for (const [playerId, primary] of [
      ['alice', 'mission-a'],
      ['bob', 'mission-b'],
    ] as const) {
      const result = await battle.send('alice', {
        kind: 'set-prep',
        playerId,
        stratagems: [],
        secondaries: [
          { key: 'secondary-a', name: 'Secondary A' },
          { key: 'secondary-b', name: 'Secondary B' },
        ],
        secondaryDeck: [
          { key: 'secondary-a', name: 'Secondary A' },
          { key: 'secondary-b', name: 'Secondary B' },
        ],
        primary: { key: primary, name: primary },
        secondaryMode: 'fixed',
      })
      if (result.outcome === 'appended') battle.setSeq(result.seq)
    }
    const deployment = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (deployment.outcome === 'appended') battle.setSeq(deployment.seq)

    expect(await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'every side must prepare its mission cards',
    })
  })

  it('gives each side its directional primary mission', async () => {
    const battle = await configured()
    const alice = await service.screen(battle.token, 'alice', rules())
    const bob = await service.screen(battle.token, 'bob', rules())

    expect(alice.kind === 'battle' ? alice.mission?.name : null).toBe('Mission A')
    expect(bob.kind === 'battle' ? bob.mission?.name : null).toBe('Mission B')
  })

  it('corrects the identity and timing of primaries recorded before directional ownership was enforced', async () => {
    const commandAward = {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Control an objective marker.',
      trigger: { timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn', roundMin: 1, roundMax: null },
    }
    const movementAward = { ...commandAward, trigger: { ...commandAward.trigger, phase: 'movement' } }
    const loaded = {
      ...rules(),
      primaries: [
        { key: 'mission-a', name: 'Mission A', text: null, whenDrawn: null, awards: [commandAward] },
        { key: 'mission-b', name: 'Mission B', text: null, whenDrawn: null, awards: [movementAward] },
      ],
    }
    const battle = await configured()
    let result = await battle.send('alice', {
      kind: 'set-prep',
      stratagems: [],
      secondaries: [],
      primary: { key: 'mission-b', name: 'Mission B' },
      secondaryMode: 'fixed',
    })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)

    const alice = await service.screen(battle.token, 'alice', loaded)
    expect(alice.kind === 'battle' ? alice.view.players.find((player) => player.id === 'alice')?.primaryCard : null).toMatchObject({
      key: 'mission-a',
      name: 'Mission A',
      awards: [commandAward],
    })
    expect((await service.submit(battle.token, 'alice', battle.seq(), { kind: 'advance' }, loaded)).result).toEqual({
      outcome: 'refused',
      reason: 'review mission scoring before ending the phase',
    })
  })

  it('only restores the resolved mission cards to a running battle', async () => {
    const battle = await configured()
    let result = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    const card = { name: 'Card', text: null, awards: [], whenDrawn: null }
    const loadedRules = {
      ...rules(),
      primaries: [
        { ...card, key: 'mission-a' },
        { ...card, key: 'mission-b' },
      ],
      secondaries: [{ ...card, key: 'secondary-a' }],
    }
    const repair = {
      kind: 'set-prep' as const,
      stratagems: [],
      secondaries: [],
      secondaryDeck: [{ key: 'secondary-a', name: 'Card' }],
      primary: { key: 'mission-a', name: 'Mission A' },
      secondaryMode: 'tactical' as const,
    }

    expect(
      (
        await service.submit(
          battle.token,
          'alice',
          battle.seq(),
          { ...repair, secondaryDeck: [{ key: 'made-up', name: 'Made up' }] },
          loadedRules,
        )
      ).result,
    ).toEqual({ outcome: 'refused', reason: 'those mission cards do not match this battle' })
    expect((await service.submit(battle.token, 'alice', battle.seq(), repair, loadedRules)).result.outcome).toBe('appended')
  })

  it('refuses terrain that belongs to another deployment', async () => {
    const battle = await configured()
    let result = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = await battle.send('alice', {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: 'pack-a',
      terrainLayoutId: 'wrong-terrain',
      twistId: null,
      clockLimitMinutes: null,
    })
    if (result.outcome === 'appended') battle.setSeq(result.seq)

    expect(await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that terrain layout does not match the deployment',
    })
  })

  it('refuses a selected terrain layout without its exact geometry', async () => {
    const battle = await configured()
    let result = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = await battle.send('alice', {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: 'pack-a',
      terrainLayoutId: 'valid-terrain',
      twistId: null,
      clockLimitMinutes: null,
    })
    if (result.outcome === 'appended') battle.setSeq(result.seq)

    expect(await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'exact terrain data is not available yet',
    })
  })
})

describe('scoring caps', () => {
  const rules = (): LoadedRules =>
    ({
      missions: new Map([
        [
          'pack-a|reconnaissance|reconnaissance',
          {
            id: 'mission-a',
            name: 'Mission A',
            roundCap: 5,
            gameCap: 8,
            secondaryRoundCap: 3,
            secondaryGameCap: 6,
            source: 'Pack A',
            packId: 'pack-a',
            deploymentIds: [],
          },
        ],
      ]),
      deployments: [{ id: 'valid-deployment', name: 'Valid', description: null, zones: [], objectives: [] }],
      terrainLayouts: [],
      // What one fixed card may bank all battle, which the pack states and the mission does not.
      fixedSecondaryCaps: new Map([['pack-a', 4]]),
    }) as unknown as LoadedRules

  /** Both sides field the same disposition, which is the matchup the pack above names. */
  const army = (name: string) => ({
    name,
    text: name,
    built: {
      catalogueId: 'cat',
      revision: 'rev',
      limit: 2000,
      detachment: null,
      disposition: 'reconnaissance',
      units: [],
    },
  })

  const configured = async (beforeStart?: Parameters<PraetoriumService['submit']>[3]) => {
    const { token } = await service.createBattle('alice', { opponentId: 'bob', limit: 2000, missionPackId: 'pack-a' })
    let seq = 1
    const send = async (command: Parameters<PraetoriumService['submit']>[3]) => {
      const answer = await service.submit(token, 'alice', seq, command, rules())
      if (answer.result.outcome === 'appended') seq = answer.result.seq
      return answer.result
    }
    await send({ kind: 'attach-roster', roster: army('Alice army') })
    await send({ kind: 'attach-roster', playerId: 'bob', roster: army('Bob army') })
    await send({ kind: 'set-deployment', patternId: 'valid-deployment' })
    // Cards are settled before the battle begins, so a hand under test is dealt here.
    if (beforeStart) await send(beforeStart)
    await send({ kind: 'begin-battle', firstPlayerId: 'alice' })
    /** Both sides take a turn before the round turns over, so both are played out. */
    const nextRound = async () => {
      for (const playerId of ['alice', 'bob'] as const) {
        if (playerId === 'bob') await send({ kind: 'settle-opponent-turn' })
        for (let phase = 0; phase < 6; phase += 1) await send({ kind: 'advance', playerId })
      }
    }
    return { send, nextRound }
  }

  it('refuses a primary score that would pass this round’s cap', async () => {
    const battle = await configured()
    expect(await battle.send({ kind: 'score', category: 'primary', delta: 6, playerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that would score past this round’s 5 VP cap for primary mission',
    })
  })

  it('applies mission caps to an atomic scoring settlement', async () => {
    const battle = await configured()
    expect(
      await battle.send({
        kind: 'score-settlement',
        scores: [{ category: 'primary', delta: 6 }],
        playerId: 'alice',
      }),
    ).toEqual({
      outcome: 'refused',
      reason: 'that would score past this round’s 5 VP cap for primary mission',
    })
  })

  it('refuses a secondary score that would pass this round’s cap', async () => {
    const battle = await configured()
    expect(await battle.send({ kind: 'score', category: 'secondary', delta: 4, playerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that would score past this round’s 3 VP cap for secondary missions',
    })
  })

  /**
   * A fixed card carries a ceiling of its own. The per-round and per-battle secondary
   * caps do not cover it, because a card paying per model destroyed can reach the
   * whole allowance on its own.
   */
  it('refuses a fixed secondary that would pass one card’s own cap', async () => {
    const battle = await configured({
      kind: 'set-prep',
      playerId: 'alice',
      stratagems: [],
      primary: null,
      secondaryMode: 'fixed',
      secondaries: [{ key: 'bring-it-down', name: 'Bring It Down' }],
    })
    expect(await battle.send({ kind: 'score-secondary', key: 'bring-it-down', delta: 3, playerId: 'alice' })).toMatchObject({
      outcome: 'appended',
    })
    expect(await battle.send({ kind: 'score-secondary', key: 'bring-it-down', delta: 2, playerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that would score past the 4 VP cap for one fixed secondary mission',
    })
  })

  it('allows a score that stays within both caps', async () => {
    const battle = await configured()
    expect((await battle.send({ kind: 'score', category: 'primary', delta: 5, playerId: 'alice' })).outcome).toBe('appended')
  })

  it('refuses a score that stays under the round cap but would pass the game cap', async () => {
    const battle = await configured()
    await battle.send({ kind: 'score', category: 'primary', delta: 5, playerId: 'alice' })
    await battle.nextRound()

    expect(await battle.send({ kind: 'score', category: 'primary', delta: 4, playerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that would score past the battle’s 8 VP cap for primary mission',
    })
  })

  it('charges what a previous turn owed to that turn’s round rather than the one now playing', async () => {
    const battle = await configured()
    await battle.send({ kind: 'score', category: 'primary', delta: 5, playerId: 'alice' })
    await battle.nextRound()

    expect(
      await battle.send({ kind: 'score-settlement', round: 1, scores: [{ category: 'primary', delta: 1 }], playerId: 'alice' }),
    ).toEqual({
      outcome: 'refused',
      reason: 'that would score past battle round 1’s 5 VP cap for primary mission',
    })
  })

  it('allows what a previous turn owed while that turn’s round still has room', async () => {
    const battle = await configured()
    await battle.send({ kind: 'score', category: 'primary', delta: 3, playerId: 'alice' })
    await battle.nextRound()

    expect(
      (await battle.send({ kind: 'score-settlement', round: 1, scores: [{ category: 'primary', delta: 2 }], playerId: 'alice' })).outcome,
    ).toBe('appended')
  })

  it('charges a settlement naming no round to the round being played, the way every earlier log meant it', async () => {
    const battle = await configured()
    await battle.send({ kind: 'score', category: 'primary', delta: 5, playerId: 'alice' })
    await battle.nextRound()

    expect((await battle.send({ kind: 'score-settlement', scores: [{ category: 'primary', delta: 3 }], playerId: 'alice' })).outcome).toBe(
      'appended',
    )
  })

  it('never refuses a correction that reduces a score', async () => {
    const battle = await configured()
    await battle.send({ kind: 'score', category: 'primary', delta: 5, playerId: 'alice' })
    expect((await battle.send({ kind: 'score', category: 'primary', delta: -2, playerId: 'alice' })).outcome).toBe('appended')
  })
})

describe('saved rosters', () => {
  const save = (visibility: 'private' | 'unlisted' = 'private') =>
    service.saveRoster('alice', {
      name: 'Recon force',
      catalogueId: 'necrons',
      detachmentIds: ['awakened-dynasty'],
      disposition: 'reconnaissance',
      limit: 2000,
      picks: [],
      prep: null,
      visibility,
      source: 'editable',
    })

  it('keeps roster metadata', async () => {
    await save()
    expect((await service.savedRosters('alice'))[0]).toMatchObject({
      disposition: 'reconnaissance',
      visibility: 'private',
      source: 'editable',
    })
  })

  it('summarises saved rosters without returning their picks', async () => {
    await service.saveRoster('alice', {
      name: 'Recon force',
      catalogueId: 'necrons',
      detachmentIds: ['awakened-dynasty'],
      disposition: 'reconnaissance',
      limit: 2000,
      picks: [{ entryId: 'warriors' }],
      prep: null,
      visibility: 'private',
      source: 'editable',
    })

    expect((await service.savedRosterSummaries('alice'))[0]).toEqual({
      id: expect.any(String),
      waivedRules: [],
      optionalRules: [],
      borrowedDetachmentId: null,
      name: 'Recon force',
      catalogueId: 'necrons',
      detachmentIds: ['awakened-dynasty'],
      disposition: 'reconnaissance',
      limit: 2000,
      unitCount: 1,
      visibility: 'private',
      source: 'editable',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
  })

  it('mints a compact URL-safe id', async () => {
    expect((await save()).id).toMatch(/^[A-Za-z0-9_-]{11}$/)
  })

  it('hides a private roster from another player', async () => {
    const { id } = await save()
    expect(await service.sharedRoster(id, 'bob')).toBeNull()
  })

  it('shows a private roster to its owner', async () => {
    const { id } = await save()
    expect((await service.sharedRoster(id, 'alice'))?.name).toBe('Recon force')
  })

  it('reports whether a roster viewer may edit it', async () => {
    const { id } = await save('unlisted')

    expect(await service.rosterAccess(id, 'alice')).toMatchObject({ editable: true, roster: { name: 'Recon force' } })
    expect(await service.rosterAccess(id, 'bob')).toMatchObject({ editable: false, roster: { name: 'Recon force' } })
  })

  it('shows a private roster to another player seated in the battle where it is fielded', async () => {
    const { id } = await save()
    const { token } = await service.createBattle('alice', 'bob')
    await service.submit(token, 'alice', 0, {
      kind: 'attach-roster',
      roster: { id, name: 'Recon force', text: 'Recon force' },
    })

    expect((await service.sharedRoster(id, 'bob', token))?.name).toBe('Recon force')
    expect(await service.sharedRoster(id, 'carol', token)).toBeNull()
  })

  it('shows an unlisted roster to a link holder', async () => {
    const { id } = await save('unlisted')
    expect((await service.sharedRoster(id, null))?.name).toBe('Recon force')
  })

  it('can make a roster unlisted', async () => {
    const { id } = await save()
    await service.setRosterVisibility('alice', id, 'unlisted')
    expect((await service.sharedRoster(id, null))?.name).toBe('Recon force')
  })

  it('revokes an unlisted link when the roster becomes private', async () => {
    const { id } = await save('unlisted')
    await service.setRosterVisibility('alice', id, 'private')
    expect(await service.sharedRoster(id, null)).toBeNull()
  })

  it('does not let another player change roster access', async () => {
    const { id } = await save()
    expect(await refusalStatus(() => service.setRosterVisibility('bob', id, 'unlisted'))).toBe(403)
    expect(await service.sharedRoster(id, null)).toBeNull()
  })

  it('does not let another player overwrite a roster', async () => {
    const { id } = await save('unlisted')
    expect(
      await refusalStatus(() =>
        service.saveRoster('bob', {
          id,
          name: 'Stolen force',
          catalogueId: 'necrons',
          detachmentIds: [],
          disposition: null,
          limit: 2000,
          picks: [],
          prep: null,
          visibility: 'private',
          source: 'editable',
        }),
      ),
    ).toBe(403)
    expect((await service.sharedRoster(id, 'alice'))?.name).toBe('Recon force')
  })
})

describe('battle history', () => {
  it('lists only battles the player is seated in', async () => {
    // A battle between two other people, which Alice has no seat in.
    await befriend('bob', 'carol')
    await service.createBattle('bob', 'carol')
    await started()
    expect((await service.battles('alice')).battles).toHaveLength(1)
  })

  it('folds the current status and scores from the log', async () => {
    const { send } = await started()
    await send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect((await service.battles('alice')).battles[0]).toMatchObject({
      status: 'playing',
      round: 1,
      phase: 'command',
      scores: [5, 0],
      armies: ['Ultramarines', 'Death Guard'],
    })
  })
})

describe('the command log', () => {
  it('numbers commands from one', async () => {
    const { token } = await service.createBattle('alice', 'bob')
    const answer = await service.submit(token, 'alice', 0, {
      kind: 'attach-roster',
      roster: { name: 'Ultramarines', text: '10 Intercessors' },
    })
    expect(answer.result).toEqual({ outcome: 'appended', seq: 1 })
  })

  it('derives the score from the log alone', async () => {
    const { token, send } = await started()
    await send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect((await view(token, 'alice')).players.find((player) => player.isViewer)?.total).toBe(5)
  })

  it('shows both players the same numbers', async () => {
    const { token, send } = await started()
    await send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect((await view(token, 'bob')).players.find((player) => player.id === 'alice')?.total).toBe(5)
  })
})

/**
 * A command's answer has to describe the battle the command produced, because it
 * is what the sender's next command is conditional on. A page left to learn that
 * from a refetch acts on a view older than its own last command.
 */
describe('the answer to a command', () => {
  it('carries the state that command produced', async () => {
    const { token, seq } = await started()
    const answer = await service.submit(token, 'alice', seq(), { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.seq).toBe(seq() + 1)
  })

  it('names the command just sent as the one to undo', async () => {
    const { token, seq } = await started()
    const answer = await service.submit(token, 'alice', seq(), { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.undoable).toBe(answer.screen.view.seq)
  })

  it('lets a seated player submit an action for another participant', async () => {
    const { token, seq } = await started()
    const answer = await service.submit(token, 'bob', seq(), { kind: 'advance', playerId: 'alice' })

    expect(answer.result.outcome).toBe('appended')
    expect(answer.screen.view.phase).toBe('movement')
    expect((await service.report(token, 'alice')).at(-1)).toMatchObject({ by: 'bob', text: 'Bob ends the command phase for Alice' })
  })

  it('corrects a sender that had fallen behind', async () => {
    const { token, send, seq } = await started()
    const shared = seq()
    await send('alice', { kind: 'advance' })
    const answer = await service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.seq).toBe(shared + 1)
  })
})

describe('two players acting at once', () => {
  it('appends the command that arrived first', async () => {
    const { token, seq } = await started()
    const shared = seq()
    expect((await service.submit(token, 'alice', shared, { kind: 'advance' })).result).toEqual({ outcome: 'appended', seq: shared + 1 })
  })

  it('refuses the one that was built on history it had already lost', async () => {
    const { token, seq } = await started()
    const shared = seq()
    await service.submit(token, 'alice', shared, { kind: 'advance' })
    expect((await service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 })).result).toEqual({
      outcome: 'stale',
      seq: shared + 1,
    })
  })

  it('leaves a stale command out of the log entirely', async () => {
    const { token, send, seq } = await started()
    const shared = seq()
    await send('alice', { kind: 'advance' })
    await service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 })
    expect((await view(token, 'bob')).players.find((player) => player.id === 'bob')?.total).toBe(0)
  })

  it('accepts the loser’s command once it has caught up', async () => {
    const { token, send, seq } = await started()
    await send('alice', { kind: 'advance' })
    expect((await service.submit(token, 'bob', seq(), { kind: 'score', category: 'primary', delta: 5 })).result.outcome).toBe('appended')
  })

  it('requires an explicit retry for a stale roster attachment', async () => {
    const { token } = await service.createBattle('alice', 'bob')
    await service.submit(token, 'alice', 0, { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
    const stale = await service.submit(token, 'bob', 0, {
      kind: 'attach-roster',
      roster: { name: 'Death Guard', text: '10 Plague Marines' },
    })

    expect(stale.result).toEqual({ outcome: 'stale', seq: 1 })
    expect((await view(token, 'bob')).players.find((player) => player.id === 'bob')?.roster).toBeNull()
    expect(
      (await service.submit(token, 'bob', 1, { kind: 'attach-roster', roster: { name: 'Death Guard', text: '10 Plague Marines' } })).result,
    ).toEqual({ outcome: 'appended', seq: 2 })
  })
})

describe('refusals', () => {
  it('explain themselves in the domain’s words', async () => {
    const { token, seq } = await started()
    expect((await service.submit(token, 'bob', seq(), { kind: 'advance' })).result).toEqual({
      outcome: 'refused',
      reason: 'it is not your turn',
    })
  })

  it('write nothing, so the seq does not move', async () => {
    const { token, seq } = await started()
    const before = seq()
    await service.submit(token, 'bob', before, { kind: 'advance' })
    expect((await view(token, 'bob')).seq).toBe(before)
  })
})

describe('who may watch a battle', () => {
  it('lists a battle publicly and gives a stranger a read-only spectator screen', async () => {
    const { token } = await started()

    const page = await service.publicBattles(null)
    const screen = await service.screen(token, 'carol')

    expect(page.battles.map((battle) => battle.token)).toEqual([token])
    expect(screen).toEqual(expect.objectContaining({ kind: 'spectator' }))
  })

  it('shows a signed-out visitor the public list', async () => {
    const { token } = await started()

    expect((await service.publicBattles(null)).battles.map((battle) => battle.token)).toEqual([token])
    expect(await service.screen(token, null)).toEqual(expect.objectContaining({ kind: 'spectator' }))
  })

  it('leaves the viewer’s own battles out of the public list, since their own page shows them', async () => {
    const { token } = await started()

    expect((await service.publicBattles('alice')).battles).toEqual([])
    expect((await service.battles('alice')).battles.map((battle) => battle.token)).toEqual([token])
  })

  it('withholds a battle from everyone once one of its players says so', async () => {
    const { token } = await started()
    await service.setBattleAudience('bob', 'private')

    expect((await service.publicBattles(null)).battles).toEqual([])
    expect(await service.screen(token, 'carol')).toEqual({ kind: 'unavailable' })
  })

  it('shows a battle kept to friends to a friend and to nobody else', async () => {
    await enrol('dave', 'Dave')
    const { token } = await started()
    await service.setBattleAudience('alice', 'friends')

    // Carol is Alice's friend; Dave is nobody's.
    expect(await service.screen(token, 'carol')).toEqual(expect.objectContaining({ kind: 'spectator' }))
    expect(await service.screen(token, 'dave')).toEqual({ kind: 'unavailable' })
    expect(await service.screen(token, null)).toEqual({ kind: 'unavailable' })
    expect((await service.publicBattles(null)).battles).toEqual([])
  })

  it('shows a stranger the battle to watch, never a way into it', async () => {
    await enrol('dave', 'Dave')
    const { token } = await service.createBattle('alice', 'bob')

    const screen = await service.screen(token, 'dave')

    expect(screen).toEqual(expect.objectContaining({ kind: 'spectator' }))
    // Watching is the whole of it: a stranger has no command to send either.
    expect(await refusalStatus(() => service.submit(token, 'dave', 0, { kind: 'advance' }))).toBe(403)
  })

  it('lists a friend’s battle to a player who is not in it', async () => {
    const { token } = await started()

    // Carol is Alice's friend and sits in nothing.
    expect((await service.friendBattles('carol')).battles.map((battle) => battle.token)).toEqual([token])
    expect((await service.friendBattles('alice')).battles).toEqual([])
  })

  it('keeps a friend’s battle out of the friends list once they make it private', async () => {
    await started()
    await service.setBattleAudience('bob', 'private')

    expect((await service.friendBattles('carol')).battles).toEqual([])
  })

  it('lists watchable battles newest-started first, finished ones among them', async () => {
    await enrol('dave', 'Dave')
    await befriend('alice', 'dave')
    // Older, but finished last, so an activity ordering would put it on top.
    const older = await started()
    const newer = await service.createBattle('alice', 'dave')
    await older.send('alice', { kind: 'end-battle' })

    const page = await service.publicBattles(null)

    expect(page.battles.map((battle) => battle.token)).toEqual([newer.token, older.token])
    expect(page.battles.map((battle) => battle.status)).toEqual(['setup', 'finished'])
  })

  it('remembers the audience a player chose', async () => {
    expect(await service.battleAudience('alice')).toBe('public')

    await service.setBattleAudience('alice', 'friends')

    expect(await service.battleAudience('alice')).toBe('friends')
  })
})

describe('standings', () => {
  it('counts a finished battle and leaves a running one out', async () => {
    const running = await started()
    const finished = await started()
    await finished.send('alice', { kind: 'end-battle' })

    const table = await service.standings()

    expect(running.token).not.toBe(finished.token)
    expect(table.overall.map((row) => ({ name: row.name, battles: row.battles }))).toEqual([
      { name: 'Alice', battles: 1 },
      { name: 'Bob', battles: 1 },
    ])
  })

  it('leaves out a battle its players withheld', async () => {
    const battle = await started()
    await battle.send('alice', { kind: 'end-battle' })
    await service.setBattleAudience('bob', 'private')

    expect((await service.standings()).overall).toEqual([])
  })

  it('ranks the players of each faction played, naming the faction from the catalogue', async () => {
    const { token } = await service.createBattle('alice', 'bob')
    let seq = 0
    const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
      const { result } = await service.submit(token, by, seq, command)
      if (result.outcome === 'appended') seq = result.seq
    }
    const withDetachment = (name: string, detachment: string): Roster => {
      const roster = leagueSnapshot(name)
      return { ...roster, built: { ...roster.built!, detachments: [{ name: detachment, points: null }] } }
    }
    await send('alice', { kind: 'attach-roster', roster: withDetachment('Alice army', 'Gladius Task Force') })
    await send('bob', { kind: 'attach-roster', roster: withDetachment('Bob army', 'Plague Company') })
    await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })
    await send('alice', { kind: 'score', category: 'primary', delta: 10 })
    await send('alice', { kind: 'end-battle' })

    const table = await service.standings(new Map([['catalogue', 'Ultramarines']]))

    // One table per faction played, ranking the players who fielded it.
    expect(table.factions).toEqual([
      {
        id: 'catalogue',
        name: 'Ultramarines',
        standings: [expect.objectContaining({ name: 'Alice', won: 1 }), expect.objectContaining({ name: 'Bob', lost: 1 })],
      },
    ])
    expect(table.overall.map((row) => row.name)).toEqual(['Alice', 'Bob'])
  })
})
