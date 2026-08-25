import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PraetoriumConnection, PraetoriumDatabase } from '../db/connection'
import { openTestDatabase } from '../db/testDatabase'
import { Repository } from '../db/repository'
import { battles, battleUsers, user } from '../db/schema'
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
  const { token } = await service.createBattle('alice')
  await service.join(token, 'bob')
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

const leagueSnapshot = (name: string, limit = 2_000): Roster => ({
  name,
  text: `${name} · ${limit} pts`,
  built: {
    catalogueId: 'catalogue',
    revision: 'sealed-revision',
    limit,
    detachment: null,
    disposition: null,
    units: [{ key: `${name}-unit`, name: `${name} unit`, points: 80, models: 5 }],
  },
})

async function revealedLeague(
  aliceRoster = leagueSnapshot('Alice sealed'),
  opponentRoster = leagueSnapshot('Dave sealed'),
  recurring = false,
) {
  await enrol('dave', 'Dave')
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
    recurring,
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

it('links a sealed-roster battle back to its league', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)
  const battleView = await view(battle.token, 'alice')

  expect({ leagueToken: battleView.leagueToken, eventToken: battleView.leagueEventToken }).toEqual({
    leagueToken: league.token,
    eventToken: league.eventToken,
  })
})

it('keeps prior event entrants out of a new recurring event', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed'), true)
  const next = await service.createLeagueEvent(league.token, 'alice')

  const current = await service.league(league.token, 'dave', next.eventToken)
  const previous = await service.league(league.token, 'dave', league.eventToken)

  expect({ currentEntries: current?.entries, currentNumber: current?.eventNumber, previousEntries: previous?.entries.length }).toEqual({
    currentEntries: [],
    currentNumber: 2,
    previousEntries: 2,
  })
})

it('turns a revealed one-off league into a recurring league without changing event one', async () => {
  const league = await revealedLeague()

  await service.makeLeagueRecurring(league.token, 'alice')
  const first = await service.league(league.token, 'alice', league.eventToken)
  const next = await service.createLeagueEvent(league.token, 'alice')
  const current = await service.league(league.token, 'alice', next.eventToken)

  expect({ recurring: first?.recurring, firstEntries: first?.entries.length, currentNumber: current?.eventNumber }).toEqual({
    recurring: true,
    firstEntries: 2,
    currentNumber: 2,
  })
})

it('only lets the organizer make a league recurring', async () => {
  const league = await revealedLeague()

  expect(await refusalStatus(() => service.makeLeagueRecurring(league.token, 'dave'))).toBe(403)
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

it('requires league battle rosters to use the same battle size', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed', 1_000))

  expect(await refusalStatus(() => service.createLeagueBattle('alice', league.token, 'dave', null))).toBe(409)
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
      units: [{ key: 'unit', entryId: 'unit', name: 'Intercessors', points: 80, models: 5, group: 'character' }],
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
      units: [{ key: 'unit', entryId: 'unit', name: 'Intercessors', points: 80, models: 5, group: 'character' }],
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
  const { token } = await service.createBattle('alice')
  await service.join(token, 'bob')
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

  it('refuses a fourth player', async () => {
    await enrol('dave', 'Dave')
    await befriend('alice', 'dave')

    await expect(
      service.createBattle('alice', { opponentIds: ['bob', 'carol'], allyId: 'dave', limit: 2000, missionPackId: null }),
    ).rejects.toThrow(expect.objectContaining({ status: 400 }))
  })

  it('preserves an opponent-only legacy creation request', async () => {
    const { token } = await service.createBattle('alice', createBattleSchema.parse({ opponentId: 'bob' }))

    expect(await view(token, 'alice')).toMatchObject({ settings: { limit: null }, players: [{ id: 'alice' }, { id: 'bob' }] })
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

  it('seats whoever opened the battle', async () => {
    const { token } = await service.createBattle('alice')
    expect((await view(token, 'alice')).players).toHaveLength(1)
  })

  it('seats the second player who follows the link', async () => {
    const { token } = await service.createBattle('alice')
    expect(await service.join(token, 'bob')).toBe('joined')
  })

  it('turns a third player away', async () => {
    const { token } = await service.createBattle('alice')
    await service.join(token, 'bob')
    expect(await service.join(token, 'carol')).toBe('full')
  })

  it('shows a link holder the invitation rather than the battle', async () => {
    const { token } = await service.createBattle('alice')
    expect((await service.screen(token, 'carol')).kind).toBe('invitation')
  })

  it('does not seat someone merely for reading the link', async () => {
    const { token } = await service.createBattle('alice')
    await service.screen(token, 'carol')
    expect(await service.join(token, 'bob')).toBe('joined')
  })

  it('refuses a command from someone without a seat', async () => {
    const { token } = await service.createBattle('alice')
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

  const configured = async () => {
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
          rules(),
        )
      ).result
      if (result.outcome === 'appended') seq = result.seq
    }
    await attach('alice', 'Alice army', 'reconnaissance')
    await attach('bob', 'Bob army', 'disruption')
    return {
      token,
      send: async (by: string, command: Parameters<PraetoriumService['submit']>[3]) =>
        (await service.submit(token, by, seq, command, rules())).result,
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

  it('gives each side its directional primary mission', async () => {
    const battle = await configured()
    const alice = await service.screen(battle.token, 'alice', rules())
    const bob = await service.screen(battle.token, 'bob', rules())

    expect(alice.kind === 'battle' ? alice.mission?.name : null).toBe('Mission A')
    expect(bob.kind === 'battle' ? bob.mission?.name : null).toBe('Mission B')
  })

  it('corrects primaries recorded before directional ownership was enforced', async () => {
    const battle = await configured()
    let result = await battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = await battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)

    const alice = await service.screen(battle.token, 'alice', rules())
    const bob = await service.screen(battle.token, 'bob', rules())
    expect(alice.kind === 'battle' ? alice.view.players.find((player) => player.id === 'alice')?.primaryCard?.name : null).toBe('Mission A')
    expect(bob.kind === 'battle' ? bob.view.players.find((player) => player.id === 'bob')?.primaryCard?.name : null).toBe('Mission B')
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

  it('shows a private roster to another player seated in the battle where it is fielded', async () => {
    const { id } = await save()
    const { token } = await service.createBattle('alice')
    await service.join(token, 'bob')
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
    await service.createBattle('bob')
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
    const { token } = await service.createBattle('alice')
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
