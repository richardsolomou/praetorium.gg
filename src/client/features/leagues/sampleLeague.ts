import { leagueResults } from '../../../core/leagueResults'
import type { StandingBattle } from '../../../core/standings'
import type { EntryStage, League } from './leagueEvent'

/** The sample walks the stages a duel entrant's progress names; a duel has no 2v1 size or doubles team to assign. */
export const LEAGUE_SAMPLE_STAGES = ['join', 'seal', 'reveal', 'play'] as const satisfies readonly EntryStage[]
export type LeagueSampleStage = (typeof LEAGUE_SAMPLE_STAGES)[number]

/** The sample's reader, who plays in it from the second stage on. */
export const LEAGUE_SAMPLE_VIEWER = 'sample-you'

const DAY = 24 * 60 * 60 * 1_000
const OPENED = Date.UTC(2026, 8, 1)
const REVEALED = Date.UTC(2026, 8, 12)

type SamplePlayer = {
  userId: string
  name: string
  joinedAt: number
  sealedAt: number
  army: NonNullable<League['entries'][number]['army']>
}

const army = (name: string, catalogueId: string, detachment: string, points: number, unitCount: number) => ({
  name,
  catalogueId,
  detachments: [{ id: `sample-${catalogueId}`, name: detachment }],
  disposition: null,
  pointsBudget: null,
  waivedRules: [],
  points,
  limit: 2_000,
  unitCount,
})

/** Made-up players; each army's catalogue id is a faction slug the faction index resolves, so its card reads like any revealed roster. */
const PLAYERS: SamplePlayer[] = [
  {
    userId: 'sample-aurelia',
    name: 'Aurelia',
    joinedAt: OPENED,
    sealedAt: OPENED + 3 * DAY,
    army: army('Tomb world vanguard', 'necrons', 'Awakened Dynasty', 1_995, 9),
  },
  {
    userId: 'sample-brutus',
    name: 'Brutus',
    joinedAt: OPENED + DAY,
    sealedAt: OPENED + 10 * DAY,
    army: army('Big red stompa', 'orks', 'War Horde', 1_990, 14),
  },
  {
    userId: 'sample-cassia',
    name: 'Cassia',
    joinedAt: OPENED + DAY,
    sealedAt: OPENED + 4 * DAY,
    army: army('Swarm of the deep', 'tyranids', 'Invasion Fleet', 2_000, 12),
  },
  {
    userId: LEAGUE_SAMPLE_VIEWER,
    name: 'You',
    joinedAt: OPENED + 2 * DAY,
    sealedAt: OPENED + 5 * DAY,
    army: army('Iron warband', 'chaos-space-marines', 'Veterans of the Long War', 1_985, 11),
  },
]

const finished = (one: string, other: string, scores: [number, number]): StandingBattle => ({
  status: 'finished',
  playerIds: [one, other],
  players: [one, other],
  sides: [0, 1],
  scores,
  factions: [null, null],
  result: null,
  lastActivity: REVEALED,
})

/** The battles played by the last stage, which leave the reader one opponent still to meet. */
export const LEAGUE_SAMPLE_BATTLES: readonly StandingBattle[] = [
  finished(LEAGUE_SAMPLE_VIEWER, 'sample-brutus', [68, 51]),
  finished('sample-aurelia', LEAGUE_SAMPLE_VIEWER, [74, 62]),
  finished('sample-aurelia', 'sample-cassia', [60, 60]),
  finished('sample-brutus', 'sample-cassia', [45, 81]),
]

/**
 * The sample league as the reader would open it at one stage: a four-player duel in which the reader
 * has not joined yet, then has sealed while one player has not, then sees every roster revealed.
 */
export function sampleLeague(stage: LeagueSampleStage): League {
  const revealed = stage === 'reveal' || stage === 'play'
  const entries = PLAYERS.filter((player) => stage !== 'join' || player.userId !== LEAGUE_SAMPLE_VIEWER).map((player) => {
    return {
      userId: player.userId,
      name: player.name,
      image: null,
      status: 'accepted' as const,
      joinedAt: player.joinedAt,
      // Brutus is the one roster the reveal waits for.
      submitted: revealed || player.userId !== 'sample-brutus',
      rosterName: revealed || player.userId === LEAGUE_SAMPLE_VIEWER ? player.army.name : null,
      army: revealed ? player.army : null,
      armyFaction: null,
      sealedAt: revealed ? player.sealedAt : null,
      teamId: null,
      requiredLimit: 2_000,
      sealedLimit: null,
      dispositionOwed: false,
      team: null,
    }
  })
  return {
    id: 'sample',
    token: 'sample',
    name: 'Autumn league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
    recurring: false,
    ownerId: 'sample-aurelia',
    ownerName: 'Aurelia',
    ownerImage: null,
    createdAt: OPENED,
    admins: [],
    eventToken: 'sample',
    eventNumber: 1,
    eventCreatedAt: OPENED,
    format: '1v1',
    rosterLimit: 2_000,
    revealedAt: revealed ? REVEALED : null,
    revealedByName: revealed ? 'Aurelia' : null,
    eventCount: 1,
    currentEventFormat: '1v1',
    currentEventRevealedAt: revealed ? REVEALED : null,
    currentEntrantCount: entries.length,
    currentAcceptedCount: entries.length,
    events: [
      {
        token: 'sample',
        number: 1,
        format: '1v1',
        rosterLimit: 2_000,
        createdAt: OPENED,
        revealedAt: revealed ? REVEALED : null,
        revealedBy: revealed ? 'sample-aurelia' : null,
      },
    ],
    occupiedCount: entries.length,
    entries,
  }
}

/** The results table and meetings at a stage, folded by the same authority as a real event's. */
export function sampleLeagueResults(stage: LeagueSampleStage) {
  return leagueResults(
    PLAYERS.map((player) => player.userId),
    stage === 'play' ? LEAGUE_SAMPLE_BATTLES : [],
  )
}
