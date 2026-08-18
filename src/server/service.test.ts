import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, type PraetoriumDatabase, openDatabase } from '../db/connection'
import { Repository } from '../db/repository'
import { user } from '../db/schema'
import { PraetoriumService } from './service'
import type { LoadedRules } from './rules'
import { createBattleSchema } from './schemas'

let database: PraetoriumDatabase
let service: PraetoriumService
let now = 0

beforeEach(() => {
  database = openDatabase(':memory:')
  now = 0
  service = new PraetoriumService(new Repository(database), () => ++now, { publish: () => {} })
  enrol('alice', 'Alice')
  enrol('bob', 'Bob')
  enrol('carol', 'Carol')
  befriend('alice', 'bob')
  befriend('alice', 'carol')
})

/**
 * A player with the account behind them, because there is no other kind.
 *
 * The id is fixed so the tests can name who is acting; `playerForUser` mints its
 * own, which is right for the app and useless for reading a test.
 */
function enrol(id: string, name: string) {
  const at = new Date(0)
  database
    .insert(user)
    .values({ id: `user-${id}`, name, email: `${id}@example.test`, emailVerified: false, createdAt: at, updatedAt: at })
    .run()
  new Repository(database).upsertPlayer({ id, name, userId: `user-${id}`, now: ++now })
}

function befriend(left: string, right: string) {
  service.requestFriend(left, right)
  service.acceptFriend(right, left)
}

afterEach(() => closeDatabase(database))

/** Two players, both lists in, Alice going first. Returns the link and the live seq. */
function started() {
  const { token } = service.createBattle('alice')
  service.join(token, 'bob')
  let seq = 0
  const send = (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const { result } = service.submit(token, by, seq, command)
    if (result.outcome === 'appended') seq = result.seq
    return result
  }
  send('alice', { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
  send('bob', { kind: 'attach-roster', roster: { name: 'Death Guard', text: '10 Plague Marines' } })
  send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })
  return { token, send, seq: () => seq }
}

/** The status a rejected call answered with; reads answer null, so a throw is a real refusal. */
function refusalStatus(work: () => unknown) {
  try {
    work()
    return null
  } catch (error) {
    return error instanceof Response ? error.status : null
  }
}

function view(token: string, playerId: string) {
  const screen = service.screen(token, playerId)
  if (screen.kind !== 'battle') throw new Error('expected a seat')
  return screen.view
}

describe('favourite factions', () => {
  it('keeps each player favourites separate', () => {
    service.setFavouriteFaction('alice', 'dark-angels', true)
    expect(service.favouriteFactions('alice')).toEqual(['dark-angels'])
    expect(service.favouriteFactions('bob')).toEqual([])
  })

  it('removes a faction from favourites', () => {
    service.setFavouriteFaction('alice', 'dark-angels', true)
    service.setFavouriteFaction('alice', 'dark-angels', false)
    expect(service.favouriteFactions('alice')).toEqual([])
  })
})

describe('friends', () => {
  it('requires the recipient to accept a request before the sender becomes a friend', () => {
    enrol('dave', 'Dave')
    service.requestFriend('alice', 'dave')

    expect(service.friendships('alice').outgoing).toEqual([{ id: 'dave', name: 'Dave' }])
    service.acceptFriend('dave', 'alice')
    expect(service.opponents('alice')).toContainEqual({ id: 'dave', name: 'Dave' })
  })

  it('does not let another player accept someone else’s request', () => {
    enrol('dave', 'Dave')
    service.requestFriend('alice', 'dave')

    expect(() => service.acceptFriend('bob', 'alice')).toThrow(expect.objectContaining({ status: 404 }))
  })
})

describe('seats', () => {
  it('refuses to create a battle with someone who is not a friend', () => {
    enrol('dave', 'Dave')

    expect(() => service.createBattle('alice', { opponentId: 'dave', solo: false, limit: 2000, missionPackId: null })).toThrow(
      expect.objectContaining({ status: 403 }),
    )
  })

  it('creates a 2v1 battle with two allied opponents', () => {
    const { token } = service.createBattle(
      'alice',
      createBattleSchema.parse({
        opponentIds: ['bob', 'carol'],
        solo: false,
        limit: 2000,
        missionPackId: null,
      }),
    )

    expect(view(token, 'alice')).toMatchObject({
      settings: { teamBattle: true },
      players: [
        { id: 'alice', side: 0 },
        { id: 'bob', side: 1 },
        { id: 'carol', side: 1 },
      ],
    })
  })

  it('preserves an opponent-only legacy creation request', () => {
    const { token } = service.createBattle('alice', createBattleSchema.parse({ opponentId: 'bob' }))

    expect(view(token, 'alice')).toMatchObject({ settings: { limit: null, solo: false }, players: [{ id: 'alice' }, { id: 'bob' }] })
  })

  it('creates a solo battle with one account and no joinable seat', () => {
    const { token } = service.createBattle('alice', {
      solo: true,
      limit: 2000,
      missionPackId: null,
    })

    expect(view(token, 'alice')).toMatchObject({ settings: { solo: true } })
    expect(service.screen(token, 'bob')).toEqual({ kind: 'invitation', free: false })
    expect(service.join(token, 'bob')).toBe('full')
  })

  it('seats whoever opened the battle', () => {
    const { token } = service.createBattle('alice')
    expect(view(token, 'alice').players).toHaveLength(1)
  })

  it('seats the second player who follows the link', () => {
    const { token } = service.createBattle('alice')
    expect(service.join(token, 'bob')).toBe('joined')
  })

  it('turns a third player away', () => {
    const { token } = service.createBattle('alice')
    service.join(token, 'bob')
    expect(service.join(token, 'carol')).toBe('full')
  })

  it('shows a link holder the invitation rather than the battle', () => {
    const { token } = service.createBattle('alice')
    expect(service.screen(token, 'carol').kind).toBe('invitation')
  })

  it('does not seat someone merely for reading the link', () => {
    const { token } = service.createBattle('alice')
    service.screen(token, 'carol')
    expect(service.join(token, 'bob')).toBe('joined')
  })

  it('refuses a command from someone without a seat', () => {
    const { token } = service.createBattle('alice')
    expect(refusalStatus(() => service.submit(token, 'carol', 0, { kind: 'advance' }))).toBe(403)
  })
})

describe('battle deletion', () => {
  it('lets the creator delete a battle', () => {
    const { token } = service.createBattle('alice', 'bob')
    service.deleteBattle(token, 'alice')
    expect(refusalStatus(() => service.screen(token, 'alice'))).toBe(404)
  })

  it('does not let the opponent delete a battle', () => {
    const { token } = service.createBattle('alice', 'bob')
    expect(refusalStatus(() => service.deleteBattle(token, 'bob'))).toBe(403)
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

  const configured = () => {
    const { token } = service.createBattle('alice', {
      opponentId: 'bob',
      solo: false,
      limit: 2000,
      missionPackId: 'pack-a',
    })
    let seq = 1
    const attach = (by: string, name: string, disposition: string) => {
      const result = service.submit(
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
              selections: [],
              units: [],
            },
          },
        },
        rules(),
      ).result
      if (result.outcome === 'appended') seq = result.seq
    }
    attach('alice', 'Alice army', 'reconnaissance')
    attach('bob', 'Bob army', 'disruption')
    return {
      token,
      send: (by: string, command: Parameters<PraetoriumService['submit']>[3]) => service.submit(token, by, seq, command, rules()).result,
      setSeq: (next: number) => (seq = next),
    }
  }

  it('refuses a deployment outside the selected pack matchup', () => {
    const battle = configured()
    const deployment = battle.send('alice', { kind: 'set-deployment', patternId: 'other-deployment' })
    if (deployment.outcome === 'appended') battle.setSeq(deployment.seq)

    expect(battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that deployment does not match the mission',
    })
  })

  it('refuses terrain that belongs to another deployment', () => {
    const battle = configured()
    let result = battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = battle.send('alice', {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: 'pack-a',
      terrainLayoutId: 'wrong-terrain',
      twistId: null,
      solo: false,
      clockLimitMinutes: null,
    })
    if (result.outcome === 'appended') battle.setSeq(result.seq)

    expect(battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'that terrain layout does not match the deployment',
    })
  })

  it('refuses a selected terrain layout without its exact geometry', () => {
    const battle = configured()
    let result = battle.send('alice', { kind: 'set-deployment', patternId: 'valid-deployment' })
    if (result.outcome === 'appended') battle.setSeq(result.seq)
    result = battle.send('alice', {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: 'pack-a',
      terrainLayoutId: 'valid-terrain',
      twistId: null,
      solo: false,
      clockLimitMinutes: null,
    })
    if (result.outcome === 'appended') battle.setSeq(result.seq)

    expect(battle.send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).toEqual({
      outcome: 'refused',
      reason: 'exact terrain data is not available yet',
    })
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

  it('keeps roster metadata', () => {
    save()
    expect(service.savedRosters('alice')[0]).toMatchObject({
      disposition: 'reconnaissance',
      visibility: 'private',
      source: 'editable',
    })
  })

  it('hides a private roster from another player', () => {
    const { id } = save()
    expect(service.sharedRoster(id, 'bob')).toBeNull()
  })

  it('shows a private roster to its owner', () => {
    const { id } = save()
    expect(service.sharedRoster(id, 'alice')?.name).toBe('Recon force')
  })

  it('shows an unlisted roster to a link holder', () => {
    const { id } = save('unlisted')
    expect(service.sharedRoster(id, null)?.name).toBe('Recon force')
  })

  it('can make a roster unlisted', () => {
    const { id } = save()
    service.setRosterVisibility('alice', id, 'unlisted')
    expect(service.sharedRoster(id, null)?.name).toBe('Recon force')
  })

  it('revokes an unlisted link when the roster becomes private', () => {
    const { id } = save('unlisted')
    service.setRosterVisibility('alice', id, 'private')
    expect(service.sharedRoster(id, null)).toBeNull()
  })

  it('does not let another player change roster access', () => {
    const { id } = save()
    expect(refusalStatus(() => service.setRosterVisibility('bob', id, 'unlisted'))).toBe(403)
    expect(service.sharedRoster(id, null)).toBeNull()
  })

  it('does not let another player overwrite a roster', () => {
    const { id } = save('unlisted')
    expect(
      refusalStatus(() =>
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
  })
})

describe('battle history', () => {
  it('lists only battles the player is seated in', () => {
    service.createBattle('bob')
    started()
    expect(service.battles('alice')).toHaveLength(1)
  })

  it('folds the current status and scores from the log', () => {
    const { send } = started()
    send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect(service.battles('alice')[0]).toMatchObject({
      status: 'playing',
      round: 1,
      phase: 'command',
      scores: [5, 0],
      armies: ['Ultramarines', 'Death Guard'],
    })
  })
})

describe('the command log', () => {
  it('numbers commands from one', () => {
    const { token } = service.createBattle('alice')
    const answer = service.submit(token, 'alice', 0, { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
    expect(answer.result).toEqual({ outcome: 'appended', seq: 1 })
  })

  it('derives the score from the log alone', () => {
    const { token, send } = started()
    send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect(view(token, 'alice').players.find((player) => player.isViewer)?.total).toBe(5)
  })

  it('shows both players the same numbers', () => {
    const { token, send } = started()
    send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect(view(token, 'bob').players.find((player) => player.id === 'alice')?.total).toBe(5)
  })
})

/**
 * A command's answer has to describe the battle the command produced, because it
 * is what the sender's next command is conditional on. A page left to learn that
 * from a refetch acts on a view older than its own last command.
 */
describe('the answer to a command', () => {
  it('carries the state that command produced', () => {
    const { token, seq } = started()
    const answer = service.submit(token, 'alice', seq(), { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.seq).toBe(seq() + 1)
  })

  it('names the command just sent as the one to undo', () => {
    const { token, seq } = started()
    const answer = service.submit(token, 'alice', seq(), { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.undoable).toBe(answer.screen.view.seq)
  })

  it('corrects a sender that had fallen behind', () => {
    const { token, send, seq } = started()
    const shared = seq()
    send('alice', { kind: 'advance' })
    const answer = service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.seq).toBe(shared + 1)
  })
})

describe('two players acting at once', () => {
  it('appends the command that arrived first', () => {
    const { token, seq } = started()
    const shared = seq()
    expect(service.submit(token, 'alice', shared, { kind: 'advance' }).result).toEqual({ outcome: 'appended', seq: shared + 1 })
  })

  it('refuses the one that was built on history it had already lost', () => {
    const { token, seq } = started()
    const shared = seq()
    service.submit(token, 'alice', shared, { kind: 'advance' })
    expect(service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 }).result).toEqual({
      outcome: 'stale',
      seq: shared + 1,
    })
  })

  it('leaves a stale command out of the log entirely', () => {
    const { token, send, seq } = started()
    const shared = seq()
    send('alice', { kind: 'advance' })
    service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 })
    expect(view(token, 'bob').players.find((player) => player.id === 'bob')?.total).toBe(0)
  })

  it('accepts the loser’s command once it has caught up', () => {
    const { token, send, seq } = started()
    send('alice', { kind: 'advance' })
    expect(service.submit(token, 'bob', seq(), { kind: 'score', category: 'primary', delta: 5 }).result.outcome).toBe('appended')
  })

  it('requires an explicit retry for a stale roster attachment', () => {
    const { token } = service.createBattle('alice', 'bob')
    service.submit(token, 'alice', 0, { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
    const stale = service.submit(token, 'bob', 0, { kind: 'attach-roster', roster: { name: 'Death Guard', text: '10 Plague Marines' } })

    expect(stale.result).toEqual({ outcome: 'stale', seq: 1 })
    expect(view(token, 'bob').players.find((player) => player.id === 'bob')?.roster).toBeNull()
    expect(
      service.submit(token, 'bob', 1, { kind: 'attach-roster', roster: { name: 'Death Guard', text: '10 Plague Marines' } }).result,
    ).toEqual({ outcome: 'appended', seq: 2 })
  })
})

describe('refusals', () => {
  it('explain themselves in the domain’s words', () => {
    const { token, seq } = started()
    expect(service.submit(token, 'bob', seq(), { kind: 'advance' }).result).toEqual({ outcome: 'refused', reason: 'it is not your turn' })
  })

  it('write nothing, so the seq does not move', () => {
    const { token, seq } = started()
    const before = seq()
    service.submit(token, 'bob', before, { kind: 'advance' })
    expect(view(token, 'bob').seq).toBe(before)
  })
})
