import { swissStandings, type SwissMatch } from '../../../core/swiss'
import type { LeagueArmy } from '../../../core/league'
import type { League } from './leagueEvent'

/** The stages the sample walks, in order; the first is the bare address. */
export const SAMPLE_STAGES = ['sealed', 'reveal', 'rounds', 'results'] as const
export type SampleStage = (typeof SAMPLE_STAGES)[number]

/** The sample's reader, who plays in it. */
export const SAMPLE_VIEWER = 'sample-you'

const DAY = 24 * 60 * 60 * 1_000
const HOUR = 60 * 60 * 1_000

const army = (name: string, catalogueId: string, detachment: string, points: number, unitCount: number): LeagueArmy => ({
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
const PLAYERS = [
  { userId: SAMPLE_VIEWER, name: 'You', army: army('Iron warband', 'chaos-space-marines', 'Veterans of the Long War', 1_985, 11) },
  { userId: 'sample-aurelia', name: 'Aurelia', army: army('Tomb world vanguard', 'necrons', 'Awakened Dynasty', 1_995, 9) },
  { userId: 'sample-brutus', name: 'Brutus', army: army('Big red stompa', 'orks', 'War Horde', 1_990, 14) },
  { userId: 'sample-cassia', name: 'Cassia', army: army('Swarm of the deep', 'tyranids', 'Invasion Fleet', 2_000, 12) },
  // The one roster the reveal waits for at the first stage.
  { userId: 'sample-decimus', name: 'Decimus', army: army('Second company', 'ultramarines', 'Gladius Task Force', 1_995, 10) },
]

type Table = { round: number; a: string; b: string | null; vp?: [number, number]; playing?: true }

/**
 * Three Swiss rounds as the pairing rules draw them: round 1 at random, then by standing, never a rematch, and the
 * lowest-placed player without a bye sitting out. A table without victory points is still being played.
 */
const TABLES: Table[] = [
  { round: 1, a: 'sample-aurelia', b: 'sample-brutus', vp: [72, 58] },
  { round: 1, a: 'sample-cassia', b: SAMPLE_VIEWER, vp: [61, 67] },
  { round: 1, a: 'sample-decimus', b: null },
  { round: 2, a: 'sample-aurelia', b: SAMPLE_VIEWER, vp: [80, 74] },
  { round: 2, a: 'sample-decimus', b: 'sample-cassia', vp: [55, 70] },
  { round: 2, a: 'sample-brutus', b: null },
  { round: 3, a: 'sample-aurelia', b: 'sample-decimus', vp: [66, 66] },
  { round: 3, a: SAMPLE_VIEWER, b: 'sample-brutus', vp: [77, 49] },
  { round: 3, a: 'sample-cassia', b: null },
]

/** The tables each stage has paired: none before the rounds, then round 2 under way with the reader's table still playing. */
function stageTables(stage: SampleStage): Table[] {
  if (stage === 'sealed' || stage === 'reveal') return []
  if (stage === 'results') return TABLES
  return TABLES.filter((table) => table.round <= 2).map((table) =>
    table.round === 2 && (table.a === SAMPLE_VIEWER || table.b === SAMPLE_VIEWER)
      ? { round: table.round, a: table.a, b: table.b, playing: true }
      : table,
  )
}

const battleToken = (table: Table) => `sample-${table.round}-${table.a}`

/** The sample tournament as the reader would open it at one stage. */
export function sampleTournament(stage: SampleStage): League {
  // Dates hang off today, so the deadline is always ahead and nothing reads as stale.
  const today = Math.floor(Date.now() / DAY) * DAY
  const opened = today - 10 * DAY
  const sealBy = today + 3 * DAY + 18 * HOUR
  const revealed = stage !== 'sealed'
  const entries = PLAYERS.map((player, index) => {
    const sealed = revealed || player.userId !== 'sample-decimus'
    return {
      userId: player.userId,
      name: player.name,
      image: null,
      status: 'accepted' as const,
      joinedAt: opened + index * DAY,
      submitted: sealed,
      dropped: false,
      // Before the reveal a reader knows only the name of their own sealed list.
      rosterName: revealed || player.userId === SAMPLE_VIEWER ? player.army.name : null,
      army: revealed ? player.army : null,
      armyFaction: null,
      sealedAt: revealed ? opened + (index + 3) * DAY : null,
      teamId: null,
      requiredLimit: 2_000,
      sealedLimit: sealed ? 2_000 : null,
      dispositionOwed: false,
      warlordOwed: false,
      team: null,
    }
  })
  return {
    token: 'sample',
    eventToken: 'sample',
    kind: 'tournament',
    createdAt: opened,
    remindedAt: null,
    organizer: false,
    tournament: {
      name: 'Autumn Open',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: null,
      ownerId: 'sample-marcus',
      ownerName: 'Marcus',
      ownerImage: null,
      admins: [],
    },
    club: null,
    format: '1v1',
    rosterLimit: 2_000,
    allowances: [],
    pointsBudget: null,
    soloPoints: null,
    allyPoints: null,
    sharedPoints: false,
    rounds: 3,
    playsAt: today + 5 * DAY + 9 * HOUR,
    sealBy,
    revealedAt: revealed ? sealBy : null,
    revealedByName: revealed ? 'Marcus' : null,
    pairings: stageTables(stage).map((table, index, tables) => ({
      key: `${table.round}-${table.a}`,
      round: table.round,
      table: index - tables.findIndex((candidate) => candidate.round === table.round) + 1,
      aId: table.a,
      bId: table.b,
      battleToken: table.b === null ? null : battleToken(table),
    })),
    occupiedCount: entries.length,
    entries,
  }
}

/** The paired tables' battles, as the rounds read them: a score once finished, otherwise still playing. */
export function sampleBattles(stage: SampleStage) {
  return stageTables(stage).flatMap((table) =>
    table.b === null
      ? []
      : [
          {
            token: battleToken(table),
            status: table.vp ? ('finished' as const) : ('playing' as const),
            playerIds: [table.a, table.b],
            scores: table.vp ?? [0, 0],
          },
        ],
  )
}

/** The standings so far, folded by the same rules as a real tournament's. */
export function sampleStandings(stage: SampleStage) {
  const matches: SwissMatch[] = stageTables(stage).map((table) => ({
    round: table.round,
    a: table.a,
    b: table.b,
    outcome: !table.b || !table.vp ? null : table.vp[0] > table.vp[1] ? 'a' : table.vp[0] < table.vp[1] ? 'b' : 'draw',
    vp: table.vp ?? [0, 0],
  }))
  return swissStandings(
    PLAYERS.map((player) => player.userId),
    matches,
  )
}
