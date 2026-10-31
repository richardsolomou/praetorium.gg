import { describe, expect, it } from 'vitest'
import type { Roster } from '../core/battle'
import { buildSealedEventBattle, type SealedEventBattleSetup } from './sealedEventBattle'

const offered = ['take-and-hold', 'priority-assets', 'purge-the-foe']
const roster = (limit: number, disposition: string): string =>
  JSON.stringify({
    name: `List ${limit}`,
    text: 'List',
    built: { catalogueId: 'army', revision: 'r', limit, detachment: null, disposition, dispositions: offered, units: [] },
  } satisfies Roster)

const entrant = (
  userId: string,
  limit: number,
  disposition: string,
  teamId: string | null = null,
  teamDisposition: string | null = null,
  teamWarlord: string | null = null,
) => ({
  userId,
  requiredLimit: limit,
  snapshot: roster(limit, disposition),
  teamId,
  teamDisposition,
  teamWarlord,
})

const trial = (entries: SealedEventBattleSetup['entries']): SealedEventBattleSetup => ({
  token: 'league',
  eventToken: 'event',
  format: '2v1',
  rosterLimit: 2_000,
  soloPoints: null,
  allyPoints: null,
  sharedPoints: false,
  rounds: null,
  paired: false,
  revealedAt: 1,
  entries,
})

const paired = trial([
  entrant('solo', 2_000, 'take-and-hold'),
  entrant('ally', 1_000, 'take-and-hold', 'pair', 'priority-assets'),
  entrant('partner', 1_000, 'purge-the-foe', 'pair', 'priority-assets'),
  entrant('other', 1_000, 'take-and-hold', 'second-pair', 'take-and-hold'),
  entrant('other-partner', 1_000, 'take-and-hold', 'second-pair', 'take-and-hold'),
])
const build = (sealedEvent: SealedEventBattleSetup, userId: string, opponentId: string, allyId?: string, secondOpponentId?: string) =>
  buildSealedEventBattle(sealedEvent, userId, opponentId, null, 'battle', allyId, secondOpponentId)
const lock = (prepared: ReturnType<typeof build>) => prepared.initialCommands.find((command) => command.kind === 'lock-league-rosters')

describe('2v1 sealed event battles', () => {
  it('seats a solo entrant against the whole pair of the ally they chose', () => {
    expect(build(paired, 'solo', 'ally').opponentIds).toEqual(['ally', 'partner'])
  })

  it('seats an allied entrant beside their fixed partner', () => {
    expect(build(paired, 'ally', 'solo').allyIds).toEqual(['partner'])
  })

  it('carries the event’s points per army into the battle, creator’s side first', () => {
    const uneven = { ...paired, soloPoints: 1_750, allyPoints: 800 }
    const configure = build(uneven, 'ally', 'solo').initialCommands.find((command) => command.kind === 'configure-battle')
    expect(configure).toMatchObject({ armyPoints: [800, 1_750] })
  })

  it('refuses an ally whose list was built bigger than the event’s size', () => {
    const oversized = trial([
      entrant('solo', 2_000, 'take-and-hold'),
      { ...entrant('ally', 1_000, 'take-and-hold', 'pair'), snapshot: roster(3_000, 'take-and-hold') },
      entrant('partner', 1_000, 'purge-the-foe', 'pair'),
    ])
    expect(() => build(oversized, 'solo', 'ally')).toThrow('a sealed roster does not fit its seat')
  })

  it('refuses an ally who is not the creator’s partner', () => {
    expect(() => build(paired, 'ally', 'solo', 'other')).toThrow('an allied entrant must choose one allied teammate and one solo opponent')
  })

  it('seals the pair’s card into the sealed event lock', () => {
    expect(lock(build(paired, 'solo', 'ally'))).toMatchObject({ dispositions: [{ side: 1, disposition: 'priority-assets' }] })
  })

  it('seals whose Warlord leads the allied side', () => {
    const led = trial([
      entrant('solo', 2_000, 'take-and-hold'),
      entrant('ally', 1_000, 'take-and-hold', 'pair', 'take-and-hold', 'partner'),
      entrant('partner', 1_000, 'take-and-hold', 'pair', 'take-and-hold', 'partner'),
    ])
    expect(lock(build(led, 'solo', 'ally'))).toMatchObject({ warlords: [{ side: 1, playerId: 'partner' }] })
  })

  it('leaves every Warlord to setup unless each allied side sealed one', () => {
    const doubles: SealedEventBattleSetup = {
      ...trial([
        entrant('a', 1_000, 'take-and-hold', 'one', 'take-and-hold', 'b'),
        entrant('b', 1_000, 'take-and-hold', 'one', 'take-and-hold', 'b'),
        entrant('c', 1_000, 'take-and-hold', 'two', 'take-and-hold'),
        entrant('d', 1_000, 'take-and-hold', 'two', 'take-and-hold'),
      ]),
      format: '2v2',
    }
    expect(lock(build(doubles, 'a', 'c'))).not.toHaveProperty('warlords')
  })

  it('leaves the Warlord to setup for an event revealed before pairs sealed one', () => {
    expect(lock(build(paired, 'solo', 'ally'))).not.toHaveProperty('warlords')
  })

  it('leaves the card to setup for an event revealed before pairs sealed one', () => {
    const unpaired = trial([
      entrant('solo', 2_000, 'take-and-hold'),
      entrant('ally', 1_000, 'recon'),
      entrant('partner', 1_000, 'purge-the-foe'),
    ])
    expect(lock(build(unpaired, 'ally', 'solo', 'partner'))).not.toHaveProperty('dispositions')
  })
})

describe('doubles sealed event battles', () => {
  const doubles: SealedEventBattleSetup = {
    token: 'league',
    eventToken: 'event',
    format: '2v2',
    rosterLimit: 2_000,
    soloPoints: null,
    allyPoints: null,
    sharedPoints: false,
    rounds: null,
    paired: false,
    revealedAt: 1,
    entries: [
      entrant('a', 1_000, 'take-and-hold', 'one', 'take-and-hold'),
      entrant('b', 1_000, 'purge-the-foe', 'one', 'take-and-hold'),
      entrant('c', 1_000, 'take-and-hold', 'two', 'purge-the-foe'),
      entrant('d', 1_000, 'purge-the-foe', 'two', 'purge-the-foe'),
    ],
  }

  it('seals both teams’ cards into the sealed event lock', () => {
    expect(lock(build(doubles, 'a', 'c'))).toMatchObject({
      dispositions: [
        { side: 0, disposition: 'take-and-hold' },
        { side: 1, disposition: 'purge-the-foe' },
      ],
    })
  })
})
