import { describe, expect, it } from 'vitest'
import { battles, battleUsers, practiceOpponents } from '../db/schema'
import type { Roster } from '../core/battle'
import type { RosterVisibility } from '../core/savedRoster'
import type { LoadedRules } from './rules'
import { createBattleSchema } from './schemas'
import type { PraetoriumService } from './service'
import { befriend, database, enrol, leagueSnapshot, refusalStatus, service, started, view } from './serviceTestHarness'

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
  it('shows anybody a player, signed in or not', async () => {
    expect(await service.userProfile('bob')).toEqual({ id: 'bob', name: 'Bob', image: 'https://example.test/bob.png' })
  })

  it('shows a player who shares nothing with the reader', async () => {
    await enrol('dave', 'Dave')

    // Dave is nobody's friend and sits in no battle with anyone.
    expect(await service.userProfile('dave')).toEqual({ id: 'dave', name: 'Dave', image: null })
  })

  it('has nothing to show for an account that does not exist', async () => {
    expect(await service.userProfile('nobody')).toBeNull()
  })

  it('names a player whose battles are private, because a name is not a battle', async () => {
    await service.setBattleAudience('bob', 'private')
    const battle = await service.createBattle('alice', { opponentId: 'bob', limit: 2000, missionPackId: null })

    expect(await service.userProfile('bob')).toEqual({ id: 'bob', name: 'Bob', image: 'https://example.test/bob.png' })
    // The battle itself stays shut, which is the thing they actually withheld.
    expect(await service.screen(battle.token, 'carol')).toEqual({ kind: 'unavailable' })
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
    expect(await send({ kind: 'end-battle', reason: 'conceded', concededBy: 'practice-opponent-1' })).toEqual({
      outcome: 'refused',
      reason: 'a practice opponent cannot concede',
    })
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
      actions: [],
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
    const card = { name: 'Card', text: null, actions: [], whenDrawn: null }
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
    const card = { name: 'Card', text: null, actions: [], whenDrawn: null }
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
    const card = { name: 'Card', text: null, awards: [fixedAward], actions: [], whenDrawn: null }
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
    const card = { name: 'Card', text: null, actions: [], whenDrawn: null }
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
        { key: 'mission-a', name: 'Mission A', text: null, actions: [], whenDrawn: null, awards: [commandAward] },
        { key: 'mission-b', name: 'Mission B', text: null, actions: [], whenDrawn: null, awards: [movementAward] },
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
    const card = { name: 'Card', text: null, awards: [], actions: [], whenDrawn: null }
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
  const save = (visibility: RosterVisibility = 'private') =>
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
      picks: [{ entryId: 'warriors' }, { entryId: 'overlord', attachedTo: 0 }, { entryId: 'plasmacyte', attachedTo: 0 }],
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

  it('shows a public roster to a link holder with no account', async () => {
    const { id } = await save('public')

    expect(await service.sharedRoster(id, null)).toMatchObject({ id })
  })

  it('lists a public roster on its owner profile', async () => {
    const { id } = await save('public')

    expect((await service.publicRosters('alice')).summaries.map((roster) => roster.id)).toEqual([id])
  })

  it('keeps an unlisted roster off the profile, because a link is not a listing', async () => {
    await save('unlisted')

    expect((await service.publicRosters('alice')).summaries).toEqual([])
  })

  it('keeps a private roster off the profile', async () => {
    await save('private')

    expect((await service.publicRosters('alice')).summaries).toEqual([])
  })

  it('takes a roster off the profile when it stops being public', async () => {
    const { id } = await save('public')
    await service.setRosterVisibility('alice', id, 'unlisted')

    expect((await service.publicRosters('alice')).summaries).toEqual([])
  })

  it('lists nothing from a player who has published none', async () => {
    await save('public')

    expect((await service.publicRosters('bob')).summaries).toEqual([])
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

  it('lets a seated player record another participant conceding', async () => {
    const { token, seq } = await started()
    const answer = await service.submit(token, 'alice', seq(), { kind: 'end-battle', reason: 'conceded', concededBy: 'bob' })

    expect(answer.result.outcome).toBe('appended')
    expect(answer.screen.view.result).toEqual({ reason: 'conceded', concededBy: 'bob' })
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

describe("a player's profile", () => {
  it('lists a public battle to a stranger with no account', async () => {
    const { token, send } = await started()
    await send('alice', { kind: 'end-battle' })

    const profile = await service.playerProfile('alice', null)

    expect(profile.battles.map((battle) => battle.token)).toEqual([token])
  })

  it('lists nothing to a stranger once a player at the table went private', async () => {
    const { send } = await started()
    await send('alice', { kind: 'end-battle' })
    await service.setBattleAudience('bob', 'private')

    expect(await service.playerProfile('alice', null)).toMatchObject({ battles: [], record: { battles: 0 } })
  })

  it('still lists the battle to the player whose own it is, however they withheld it', async () => {
    const { token, send } = await started()
    await send('alice', { kind: 'end-battle' })
    await service.setBattleAudience('alice', 'private')

    expect((await service.playerProfile('alice', 'alice')).battles.map((battle) => battle.token)).toEqual([token])
  })

  it('withholds a friends-only battle from a stranger', async () => {
    const { send } = await started()
    await send('alice', { kind: 'end-battle' })
    await service.setBattleAudience('alice', 'friends')

    expect((await service.playerProfile('alice', 'dave')).battles).toEqual([])
  })

  it('shows a friends-only battle to a confirmed friend', async () => {
    const { token, send } = await started()
    await send('alice', { kind: 'end-battle' })
    await service.setBattleAudience('alice', 'friends')

    expect((await service.playerProfile('alice', 'carol')).battles.map((battle) => battle.token)).toEqual([token])
  })

  it('folds the record from the profile owner’s side of the table', async () => {
    const { send } = await started()
    await send('alice', { kind: 'score', category: 'primary', delta: 10 })
    await send('alice', { kind: 'end-battle' })

    const [alice, bob] = await Promise.all([service.playerProfile('alice', null), service.playerProfile('bob', null)])

    expect([alice.record.won, bob.record.won]).toEqual([1, 0])
  })

  it('separates the record by who took the first turn', async () => {
    const { send } = await started()
    await send('alice', { kind: 'score', category: 'primary', delta: 10 })
    await send('alice', { kind: 'end-battle' })

    const { record } = await service.playerProfile('alice', null)

    expect({ first: record.goingFirst.battles, second: record.goingSecond.battles }).toEqual({ first: 1, second: 0 })
  })

  it('offers the opponents they have faced as something to narrow by', async () => {
    const { send } = await started()
    await send('alice', { kind: 'end-battle' })

    expect((await service.playerProfile('alice', null)).facets.opponents.map((facet) => facet.label)).toEqual(['Bob'])
  })

  it('narrows the record to the battles against one opponent', async () => {
    const { send } = await started()
    await send('alice', { kind: 'end-battle' })

    const [against, elsewhere] = await Promise.all([
      service.playerProfile('alice', null, { opponentId: 'bob' }),
      service.playerProfile('alice', null, { opponentId: 'carol' }),
    ])

    expect([against.record.battles, elsewhere.record.battles]).toEqual([1, 0])
  })

  it('leaves a practice game out of the record and the list', async () => {
    await enrol('sparring', 'Sparring partner')
    await database.insert(practiceOpponents).values({ userId: 'sparring' })
    const { token } = await service.createBattle('alice', 'sparring')
    await service.submit(token, 'alice', 0, { kind: 'end-battle' })

    expect(await service.playerProfile('alice', 'alice')).toMatchObject({ battles: [], record: { battles: 0 } })
  })

  it('puts the player where the leaderboard puts them, out of everyone it counted', async () => {
    const { send } = await started()
    await send('alice', { kind: 'score', category: 'primary', delta: 10 })
    await send('alice', { kind: 'end-battle' })

    const rankings = await service.playerRankings('alice')

    expect({ place: rankings.overall?.place, of: rankings.overall?.of }).toEqual({ place: 1, of: 2 })
  })

  it('gives a player the leaderboard has not counted no place at all', async () => {
    expect(await service.playerRankings('dave')).toMatchObject({ overall: null, factions: [] })
  })
})

describe('standings', () => {
  it('counts a finished battle and leaves a running one out', async () => {
    const running = await started()
    const finished = await started()
    await finished.send('alice', { kind: 'end-battle' })

    const table = await service.standings()

    expect(running.token).not.toBe(finished.token)
    expect(table.overall.rows.map((row) => ({ name: row.name, image: row.image, battles: row.battles }))).toEqual([
      { name: 'Alice', image: null, battles: 1 },
      { name: 'Bob', image: 'https://example.test/bob.png', battles: 1 },
    ])
  })

  it('leaves out a battle its players withheld', async () => {
    const battle = await started()
    await battle.send('alice', { kind: 'end-battle' })
    await service.setBattleAudience('bob', 'private')

    expect((await service.standings()).overall.rows).toEqual([])
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

    const table = await service.standings([{ id: 'catalogue', slug: 'ultramarines', displayName: 'Ultramarines', icon: null }])

    // One table per faction played, ranking the players who fielded it.
    expect(table.factions).toEqual([
      {
        faction: { slug: 'ultramarines', displayName: 'Ultramarines', icon: null },
        players: 2,
        rows: [expect.objectContaining({ name: 'Alice', won: 1 }), expect.objectContaining({ name: 'Bob', lost: 1 })],
      },
    ])
    expect(table.overall.rows.map((row) => row.name)).toEqual(['Alice', 'Bob'])
  })
})
