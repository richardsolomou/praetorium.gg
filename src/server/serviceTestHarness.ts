import { afterEach, beforeEach } from 'vitest'
import type { PraetoriumConnection, PraetoriumDatabase } from '../db/connection'
import { openTestDatabase } from '../db/testDatabase'
import { Repository } from '../db/repository'
import { user } from '../db/schema'
import type { Roster } from '../core/battle'
import { PraetoriumService } from './service'

let connection: PraetoriumConnection
export let database: PraetoriumDatabase
export let service: PraetoriumService
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

export async function enrol(id: string, name: string, image: string | null = null) {
  const at = new Date(0)
  await database.insert(user).values({ id, name, email: `${id}@example.test`, emailVerified: false, image, createdAt: at, updatedAt: at })
}

export async function befriend(left: string, right: string) {
  await service.requestFriend(left, right)
  await service.acceptFriend(right, left)
}

afterEach(() => connection.close())

/** Two players, both lists in, Alice going first. Returns the link and the live seq. */
export async function started() {
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
export async function refusalStatus(work: () => unknown) {
  try {
    await work()
    return null
  } catch (error) {
    return error instanceof Response ? error.status : null
  }
}

export async function view(token: string, playerId: string) {
  const screen = await service.screen(token, playerId)
  if (screen.kind !== 'battle') throw new Error('expected a seat')
  return screen.view
}

export const leagueSnapshot = (
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

export async function revealedLeague(aliceRoster = leagueSnapshot('Alice sealed'), opponentRoster = leagueSnapshot('Dave sealed')) {
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

export async function revealedTeamLeague() {
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 3,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 })
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

export async function revealedDoublesLeague() {
  await enrol('dave', 'Dave')
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 })
  for (const userId of ['alice', 'bob', 'carol', 'dave']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await service.assignLeagueTeam(token, 'alice', ['carol', 'dave'])
  for (const userId of ['alice', 'bob', 'carol', 'dave']) {
    await saveAndSealLeagueRoster(token, userId, 1_000, '', userId === 'alice' || userId === 'carol')
  }
  await service.revealLeague(token, 'alice')
  return { token, eventToken }
}

export async function saveAndSealLeagueRoster(token: string, userId: string, limit: number, suffix = '', warlord = true) {
  const saved = await saveLeagueRoster(userId, limit, suffix)
  await service.submitLeagueRoster(token, userId, saved, leagueSnapshot(`${userId}${suffix} sealed`, limit, warlord))
}

export async function saveLeagueRoster(userId: string, limit: number, suffix = '') {
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

export function withSecondWarlord(snapshot: Roster): Roster {
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
