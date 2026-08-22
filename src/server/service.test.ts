import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PraetoriumConnection, PraetoriumDatabase } from '../db/connection'
import { openTestDatabase } from '../db/testDatabase'
import { Repository } from '../db/repository'
import { user } from '../db/schema'
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

describe('friends', () => {
  it('requires the recipient to accept a request before the sender becomes a friend', async () => {
    await enrol('dave', 'Dave')
    await service.requestFriend('alice', 'dave')

    expect((await service.friendships('alice')).outgoing).toEqual([{ id: 'dave', name: 'Dave' }])
    await service.acceptFriend('dave', 'alice')
    expect(await service.opponents('alice')).toContainEqual({ id: 'dave', name: 'Dave' })
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

    // A friend is a friend whether or not anyone asks who else is on the instance.
    expect(await service.opponents('alice')).toEqual([
      { id: 'bob', name: 'Bob' },
      { id: 'carol', name: 'Carol' },
    ])
    expect((await service.friendships('alice')).friends).toEqual(await service.opponents('alice'))
  })

  it('does not let another player accept someone else’s request', async () => {
    await enrol('dave', 'Dave')
    await service.requestFriend('alice', 'dave')

    await expect(service.acceptFriend('bob', 'alice')).rejects.toThrow(expect.objectContaining({ status: 404 }))
  })
})

describe('player profiles', () => {
  it('shows a profile after the viewer has shared a battle with that player', async () => {
    expect(await service.userProfile('alice', 'bob')).toBeNull()
    await service.createBattle('alice', { opponentId: 'bob', solo: false, limit: 2000, missionPackId: null })

    expect(await service.userProfile('alice', 'bob')).toEqual({ id: 'bob', name: 'Bob', image: 'https://example.test/bob.png' })
  })

  it('shows a player their own profile before their first battle', async () => {
    expect(await service.userProfile('alice', 'alice')).toEqual({ id: 'alice', name: 'Alice', image: null })
  })

  it('includes profile pictures in the battle view', async () => {
    const { token } = await service.createBattle('alice', { opponentId: 'bob', solo: false, limit: 2000, missionPackId: null })

    expect((await view(token, 'alice')).players[1]?.image).toBe('https://example.test/bob.png')
  })
})

describe('seats', () => {
  it('refuses to create a battle with someone who is not a friend', async () => {
    await enrol('dave', 'Dave')

    await expect(service.createBattle('alice', { opponentId: 'dave', solo: false, limit: 2000, missionPackId: null })).rejects.toThrow(
      expect.objectContaining({ status: 403 }),
    )
  })

  it('creates a 2v1 battle with two allied opponents', async () => {
    const { token } = await service.createBattle(
      'alice',
      createBattleSchema.parse({
        opponentIds: ['bob', 'carol'],
        solo: false,
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

  it('preserves an opponent-only legacy creation request', async () => {
    const { token } = await service.createBattle('alice', createBattleSchema.parse({ opponentId: 'bob' }))

    expect(await view(token, 'alice')).toMatchObject({ settings: { limit: null, solo: false }, players: [{ id: 'alice' }, { id: 'bob' }] })
  })

  it('creates a solo battle with one account and no joinable seat', async () => {
    const { token } = await service.createBattle('alice', {
      solo: true,
      limit: 2000,
      missionPackId: null,
    })

    expect(await view(token, 'alice')).toMatchObject({ settings: { solo: true } })
    expect(await service.screen(token, 'bob')).toEqual({ kind: 'invitation', free: false })
    expect(await service.join(token, 'bob')).toBe('full')
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
      solo: false,
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
      solo: false,
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
      solo: false,
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
    }) as unknown as LoadedRules

  const configured = async () => {
    const { token } = await service.createBattle('alice', { solo: true, limit: 2000, missionPackId: 'pack-a' })
    let seq = 1
    const send = async (command: Parameters<PraetoriumService['submit']>[3]) => {
      const answer = await service.submit(token, 'alice', seq, command, rules())
      if (answer.result.outcome === 'appended') seq = answer.result.seq
      return answer.result
    }
    await send({
      kind: 'attach-roster',
      roster: {
        name: 'Alice army',
        text: 'Alice army',
        built: {
          catalogueId: 'cat',
          revision: 'rev',
          limit: 2000,
          detachment: null,
          disposition: 'reconnaissance',
          units: [],
        },
      },
    })
    await send({ kind: 'set-deployment', patternId: 'valid-deployment' })
    await send({ kind: 'begin-battle', firstPlayerId: 'alice' })
    return { send }
  }

  it('refuses a primary score that would pass this round’s cap', async () => {
    const battle = await configured()
    expect(await battle.send({ kind: 'score', category: 'primary', delta: 6, playerId: 'alice' })).toEqual({
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

  it('allows a score that stays within both caps', async () => {
    const battle = await configured()
    expect((await battle.send({ kind: 'score', category: 'primary', delta: 5, playerId: 'alice' })).outcome).toBe('appended')
  })

  it('refuses a score that stays under the round cap but would pass the game cap', async () => {
    const battle = await configured()
    await battle.send({ kind: 'score', category: 'primary', delta: 5, playerId: 'alice' })
    for (let i = 0; i < 6; i += 1) await battle.send({ kind: 'advance', playerId: 'alice' })

    expect(await battle.send({ kind: 'score', category: 'primary', delta: 4, playerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that would score past the battle’s 8 VP cap for primary mission',
    })
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
    expect(await service.battles('alice')).toHaveLength(1)
  })

  it('folds the current status and scores from the log', async () => {
    const { send } = await started()
    await send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect((await service.battles('alice'))[0]).toMatchObject({
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
