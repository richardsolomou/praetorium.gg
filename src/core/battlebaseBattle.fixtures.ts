import type { BattlebaseBattle, ImportedArmy } from './battlebaseBattle'
import type { ImportFaction } from './battlebaseRoster'

export const CREATOR = 'bb-creator'
export const OPPONENT = 'bb-opponent'
const START = Date.parse('2026-08-26T17:43:17.556Z')
const CARD = 'secondary-mission-chapter-approved-2025-26-assassination'

type Event = BattlebaseBattle['eventsJson'][number]
type Step = [type: string, actor: string, value?: number, data?: Event['data']]

/** A turn as BattleBase records it: its phases, then whatever was scored and spent in it. */
const turn = (round: number, actor: string, extra: Step[] = []): Step[] => [
  ['STARTED_TURN', actor, undefined, { turnNumber: round }],
  ['STARTED_COMMAND_PHASE', actor],
  ['GAINED_COMMAND_POINT', CREATOR],
  ['GAINED_COMMAND_POINT', OPPONENT],
  ['STARTED_MOVEMENT_PHASE', actor],
  ['STARTED_SHOOTING_PHASE', actor],
  ['STARTED_CHARGE_PHASE', actor],
  ['STARTED_FIGHT_PHASE', actor],
  ['STARTED_SCORING_END_OF_TURN_PRIMARY_POINTS', actor],
  ...extra,
  ['ENDED_TURN', actor],
]

/**
 * A two-round game the opponent conceded, in the older format that names one detachment a side
 * and pays the battle ready bonus after the last turn. The opponent draws a card, uses a
 * stratagem and loses a unit; the creator scores primary and a card by name.
 */
export function concededBattle(): BattlebaseBattle {
  const steps: Step[] = [
    ...turn(1, CREATOR, [
      ['USED_COMMAND_POINTS', CREATOR, 1, { stratagemId: 'stratagem-core-command-re-roll' }],
      ['GAINED_PRIMARY_VICTORY_POINTS', CREATOR, 5],
    ]),
    ['DREW_SECONDARY_MISSION_CARD', OPPONENT, undefined, { missionId: CARD }],
    ...turn(1, OPPONENT, [
      ['USED_COMMAND_POINTS', OPPONENT, 2, { stratagemId: 'stratagem-necrons-cursed-legion-methodical-murder' }],
      ['MARKED_UNIT_AS_DESTROYED', OPPONENT, undefined, { rosterUnitId: 'bb-warriors' }],
      ['GAINED_SECONDARY_VICTORY_POINTS', OPPONENT, 4, { missionId: CARD }],
      ['ACHIEVED_TACTICAL_SECONDARY_MISSION', OPPONENT, undefined, { missionId: CARD }],
    ]),
    ...turn(2, CREATOR, [
      ['GAINED_PRIMARY_VICTORY_POINTS', CREATOR, 10],
      ['GAINED_SECONDARY_VICTORY_POINTS', CREATOR, 3],
    ]),
    ['CONCEDED_BATTLE', OPPONENT],
    ['GAINED_BONUS_VP_FOR_PAINTED_ARMY', CREATOR, 10],
    ['GAINED_BONUS_VP_FOR_PAINTED_ARMY', OPPONENT, 10],
  ]
  return {
    id: 'bb-battle',
    createdAt: new Date(START).toISOString(),
    isFinished: true,
    createdBy: { id: CREATOR, username: 'creator' },
    opponent: { id: OPPONENT, username: 'opponent' },
    eventsJson: steps.map(([type, actor, value, data], id) => ({ id, type, actor, value, data, timestamp: START + 60_000 * (id + 1) })),
    battleSetupJson: {
      battleSizeId: 'battle-size-strike-force',
      missionPackId: 'mission-pack-chapter-approved-2025-26',
      isAttackerMe: true,
      missionSelection: {
        missionId: 'mission-chapter-approved-2025-26-take-and-hold',
        deploymentId: 'deployment-chapter-approved-2025-26-dawn-of-war',
      },
      secondaryMissionSelections: {
        me: { type: 'SECONDARY_MISSION_SELECTION_TYPE_TACTICAL' },
        opponent: { type: 'SECONDARY_MISSION_SELECTION_TYPE_TACTICAL' },
      },
      playersAndFactions: {
        meFactionId: 'faction-deathwatch',
        meDetachmentId: 'detachment-deathwatch-black-spear-task-force-grotmas',
        opponentFactionId: 'faction-necrons',
        opponentDetachmentId: 'detachment-necons-cursed-legion',
      },
    },
  }
}

/** The opponent's army rebuilt with one unit, and the creator's named only by its faction. */
export const IMPORTED_ARMIES: { creator: ImportedArmy; opponent: ImportedArmy } = {
  creator: { roster: { name: 'Deathwatch', text: 'Deathwatch' }, units: {} },
  opponent: {
    roster: {
      name: 'Necrons',
      text: 'Necrons\nCursed Legion\n\nNecron Warriors (10)',
      built: {
        catalogueId: 'necrons-catalogue',
        revision: 'revision',
        limit: 2000,
        detachment: 'Cursed Legion',
        detachments: [{ name: 'Cursed Legion', points: null }],
        disposition: null,
        units: [{ key: '0-warriors', name: 'Necron Warriors', points: 90, models: 10 }],
      },
    },
    units: { 'bb-warriors': '0-warriors' },
  },
}

export const IMPORT_FACTIONS: ImportFaction[] = [
  { id: 'necrons-catalogue', slug: 'necrons', displayName: 'Necrons', detachments: [{ name: 'Cursed Legion' }] },
  { id: 'deathwatch-catalogue', slug: 'deathwatch', displayName: 'Deathwatch', detachments: [{ name: 'Black Spear Task Force' }] },
  { id: 'space-marines-catalogue', slug: 'space-marines', displayName: 'Space Marines', detachments: [] },
]
