import { z } from 'zod'
import { printedTransportSchema } from './transport'
import { catalogueEditionSummarySchema } from './catalogueEdition'
import {
  BATTLE_ROUNDS,
  type Command,
  DETACHMENTS_MAX,
  FORMAT_RULE_IDS,
  NOTE_MAX_LENGTH,
  PHASES,
  POINTS_BUDGET_MAX,
  POINTS_BUDGET_MIN,
  ROSTER_MAX_LENGTH,
  ROSTER_NAME_MAX_LENGTH,
  SCORE_SETTLEMENT_MAX,
  SECONDARIES_MAX,
  SECONDARY_DECK_MAX,
  SECONDARY_MODES,
  SETUP_STEP_MAX,
  STRATAGEM_CP_MAX,
  STRATAGEM_LIMITS,
  STRATAGEM_SOURCE_MAX_LENGTH,
  STRATAGEMS_MAX,
  TURN_SCOPES,
  UNIT_FORMATIONS,
  type Roster,
} from './battle'
import { UNIT_GROUPS } from './unitGroups'
import { rosterReminderSchema, ROSTER_REMINDERS_MAX } from './reminders'
import { MISSION_SELECTION_KINDS } from './missionSelections'
import { currentCommand } from './releasedNames'
import { UNIT_NICKNAME_MAX_LENGTH, UNIT_NOTE_MAX_LENGTH } from './unitNotes'
import { PROFILE_NAME_MAX_LENGTH } from './profileName'

const id = z.string().min(1).max(64)
const rosterLimit = z.number().int().min(0).max(POINTS_BUDGET_MAX)
const name = z.string().min(1).max(ROSTER_NAME_MAX_LENGTH)
export { id as idSchema, name as nameSchema, rosterLimit as rosterLimitSchema }
export const detachmentIdSchema = z.string().min(1).max(128)
export const rosterPickSchema = z.object({
  entryId: id,
  catalogueId: id.optional(),
  models: z.number().int().min(1).max(60).optional(),
  choices: z.record(z.string().max(400), id).optional(),
  spreads: z.record(z.string().max(400), z.record(z.string().max(64), z.number().int().min(0).max(60))).optional(),
  toggles: z.record(z.string().max(400), z.number().int().min(0).max(1)).optional(),
  attachedTo: z.number().int().min(0).max(99).optional(),
  embarkedIn: z.number().int().min(0).max(99).optional(),
  nickname: z.string().max(UNIT_NICKNAME_MAX_LENGTH).optional(),
  note: z.string().max(UNIT_NOTE_MAX_LENGTH).optional(),
})
const phase = z.enum(PHASES)
const missed = z.object({ round: z.number().int().min(1).max(BATTLE_ROUNDS), phase, turn: id }).optional()
export const missionAwardSchema = z.object({
  vp: z.number().int().min(0).max(100),
  per: z.string().max(200).nullable(),
  mode: z.string().max(40).nullable(),
  max: z.number().int().min(0).max(100).nullable(),
  group: z.string().max(100).nullable(),
  cumulative: z.boolean(),
  criteria: z.string().max(2_000).nullable(),
  trigger: z.object({
    timing: z.string().max(80).nullable(),
    phase: z.string().max(80).nullable(),
    playerTurn: z.string().max(80).nullable(),
    roundMin: z.number().int().min(1).max(BATTLE_ROUNDS).nullable(),
    roundMax: z.number().int().min(1).max(BATTLE_ROUNDS).nullable(),
  }),
})
const secondary = z.object({
  key: id,
  name: name,
  awards: z.array(missionAwardSchema).max(20).optional(),
  selection: z.enum(MISSION_SELECTION_KINDS).optional(),
})
const missionUnit = z.object({ playerId: id, unitKey: id, rosterSeq: z.number().int().positive() })
const missionObjective = z.object({ key: z.string().trim().min(1).max(128), name: z.string().trim().min(1).max(80) })
const missionSelection = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('punishment'),
    units: z.array(missionUnit).max(3),
    fallback: z.boolean(),
    qualified: z.boolean(),
    unavailable: z.literal(true).optional(),
  }),
  z.object({ kind: z.literal('guards'), guards: z.array(z.object({ objective: missionObjective, unit: missionUnit })).max(20) }),
  z.object({ kind: z.literal('tempting-target'), objective: missionObjective }),
  z.object({ kind: z.literal('beacon'), unit: missionUnit.nullable(), note: z.string().max(200) }),
  z.object({
    kind: z.literal('locate-and-deny'),
    areas: z.array(missionObjective).max(5),
    outsideZone: z.boolean(),
    allEligible: z.boolean(),
  }),
  z.object({ kind: z.literal('sensor-sweep'), marker: missionObjective.extend({ playerId: id }), controlled: z.boolean() }),
  z.object({
    kind: z.literal('consecrate'),
    consecrations: z.array(z.object({ objective: missionObjective, unit: missionUnit })).max(20),
    qualified: z.boolean(),
    notHome: z.boolean(),
  }),
])
/** A stratagem as a roster's battle preparation saves it. */
export const stratagemSchema = z.object({
  key: id,
  name: name,
  cp: z.number().int().min(0).max(STRATAGEM_CP_MAX),
  limit: z.enum(STRATAGEM_LIMITS),
  phases: z.array(phase).max(PHASES.length).optional(),
  turn: z.enum(TURN_SCOPES).optional(),
})
const stratagem = stratagemSchema.extend({ detachment: z.string().min(1).max(STRATAGEM_SOURCE_MAX_LENGTH).optional() })
const battlePrep = z.object({
  stratagems: z.array(stratagem).max(STRATAGEMS_MAX),
  secondaries: z.array(secondary).max(SECONDARIES_MAX),
  secondaryDeck: z.array(secondary).max(SECONDARY_DECK_MAX).optional(),
  primary: secondary.nullable(),
  secondaryMode: z.enum(SECONDARY_MODES),
})
/**
 * The wire and storage contract for a command, in both directions: what a client
 * may send, and what the log is trusted to contain when it is read back. Length
 * limits are the domain's, so a command cannot be stored that `validate` would
 * have refused.
 */
const commandUnion = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('select-mission'),
    cardKey: id,
    occurrence: z.number().int().positive(),
    playerId: id.optional(),
    selection: missionSelection,
  }),
  z.object({
    kind: z.literal('configure-battle'),
    limit: rosterLimit.nullable(),
    missionPackId: id.nullable(),
    terrainLayoutId: id.nullable(),
    twistId: id.nullable(),
    teamBattle: z.boolean().optional(),
    playerCount: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    armyPoints: z.array(z.number().int().min(1).max(POINTS_BUDGET_MAX)).length(2).nullable().optional(),
    clockLimitMinutes: z.number().int().min(5).max(300).nullable(),
    manual: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('reset-setup') }),
  z.object({ kind: z.literal('set-battle-group'), groupId: id.nullable() }),
  z.object({ kind: z.literal('detach-roster'), playerId: id.optional() }),
  z.object({
    kind: z.literal('lock-sealed-event-rosters'),
    sealedEventToken: id,
    eventToken: id.optional(),
    dispositions: z
      .array(z.object({ side: z.number().int().min(0).max(1), disposition: id }))
      .max(2)
      .optional(),
    warlords: z
      .array(z.object({ side: z.number().int().min(0).max(1), playerId: id }))
      .max(2)
      .optional(),
  }),
  z.object({ kind: z.literal('set-setup-step'), step: z.number().int().min(0).max(SETUP_STEP_MAX) }),
  z.object({ kind: z.literal('set-setup-checked'), step: z.number().int().min(0).max(SETUP_STEP_MAX), checked: z.boolean() }),
  z.object({ kind: z.literal('set-attacker'), attackerId: id }),
  z.object({ kind: z.literal('set-first-turn'), firstPlayerId: id }),
  z.object({ kind: z.literal('set-side-disposition'), side: z.number().int().min(0).max(1), disposition: id }),
  z.object({ kind: z.literal('set-side-warlord'), side: z.number().int().min(0).max(1), playerId: id }),
  z.object({
    kind: z.literal('attach-roster'),
    playerId: id.optional(),
    prep: battlePrep.nullable().optional(),
    painted: z.boolean().optional(),
    roster: z.object({
      name: z.string().max(ROSTER_NAME_MAX_LENGTH),
      text: z.string().max(ROSTER_MAX_LENGTH),
      id: id.optional(),
      lentBy: z.object({ id, name: z.string().max(PROFILE_NAME_MAX_LENGTH) }).optional(),
      reminders: z.array(rosterReminderSchema).max(ROSTER_REMINDERS_MAX).optional(),
      remindersEnabled: z.boolean().optional(),
      built: z
        .object({
          catalogueId: id,
          edition: catalogueEditionSummarySchema.optional(),
          revision: id,
          limit: rosterLimit,
          pointsBudget: z.number().int().min(POINTS_BUDGET_MIN).max(POINTS_BUDGET_MAX).optional(),
          strategicReserveLimit: z.number().int().min(0).max(5_000).optional(),
          detachment: z.string().max(ROSTER_NAME_MAX_LENGTH).nullable(),
          detachments: z
            .array(z.object({ name: z.string().max(ROSTER_NAME_MAX_LENGTH), points: z.number().int().min(1).max(3).nullable() }))
            .max(DETACHMENTS_MAX)
            .optional(),
          detachmentPointBudget: z.number().int().min(0).max(3).nullable().optional(),
          disposition: z.string().max(64).nullable(),
          dispositions: z.array(z.string().max(64)).max(16).optional(),
          detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX).optional(),
          waivedRules: z.array(z.enum(FORMAT_RULE_IDS)).max(FORMAT_RULE_IDS.length).optional(),
          picks: z.array(rosterPickSchema).max(100).optional(),
          units: z
            .array(
              z.object({
                key: id,
                name: name,
                nickname: z.string().max(UNIT_NICKNAME_MAX_LENGTH).optional(),
                note: z.string().max(UNIT_NOTE_MAX_LENGTH).optional(),
                points: z.number().int().min(0).max(10_000),
                models: z.number().int().min(0).max(100),
                wounds: z.number().int().min(1).max(100).optional(),
                entryId: id.optional(),
                group: z.enum(UNIT_GROUPS).optional(),
                warlord: z.boolean().optional(),
                warlordEligible: z.boolean().optional(),
                wargear: z
                  .array(z.object({ name: name, count: z.number().int().min(1).max(100) }))
                  .max(200)
                  .optional(),
                enhancements: z.array(name).max(20).optional(),
                upgrades: z.array(name).max(20).optional(),
                joined: z
                  .array(
                    z.object({
                      label: name,
                      name: name,
                    }),
                  )
                  .max(20)
                  .optional(),
                attachedTo: id.optional(),
                formationOptions: z.array(z.enum(UNIT_FORMATIONS)).max(4).optional(),
                prebattleRules: z
                  .array(z.enum(['infiltrators', 'scouts']))
                  .max(2)
                  .optional(),
                strategicReserveExempt: z.boolean().optional(),
                embarksWithBodyguard: z.boolean().optional(),
                embarkedSpace: z.number().int().positive().max(1_000).optional(),
                transport: z.boolean().optional(),
                transportRule: z.string().max(4_000).optional(),
                transportCapacity: printedTransportSchema.optional(),
                keywords: z.array(z.string().max(100)).max(60).optional(),
                startsEmbarkedIn: id.optional(),
              }),
            )
            .max(200),
        })
        .optional(),
    }),
  }),
  z.object({ kind: z.literal('set-unit'), unitKey: id, destroyed: z.boolean(), playerId: id.optional() }),
  z.object({
    kind: z.literal('set-prep'),
    ...battlePrep.shape,
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('deploy-unit'), unitKey: id, deployed: z.boolean(), playerId: id.optional() }),
  z.object({
    kind: z.literal('set-unit-formation'),
    unitKey: id,
    formation: z.enum(UNIT_FORMATIONS),
    transportKey: id.optional(),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('set-painted'), painted: z.boolean(), playerId: id.optional() }),
  z.object({ kind: z.literal('wound-unit'), unitKey: id, delta: z.number().int(), playerId: id.optional() }),
  z.object({ kind: z.literal('damage-unit'), unitKey: id, delta: z.number().int(), playerId: id.optional() }),
  z.object({ kind: z.literal('set-deployment'), patternId: id.nullable() }),
  z.object({ kind: z.literal('set-battlefield'), patternId: id, terrainLayoutId: id }),
  z.object({
    kind: z.literal('use-stratagem'),
    key: id,
    cp: z.number().int().min(0).max(STRATAGEM_CP_MAX).optional(),
    playerId: id.optional(),
    missed,
  }),
  z.object({
    kind: z.literal('use-new-orders'),
    stratagemKey: id,
    secondaryKey: id,
    secondary,
    cp: z.number().int().min(0).max(STRATAGEM_CP_MAX).optional(),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('score-secondary'), key: id, delta: z.number().int(), playerId: id.optional() }),
  z.object({
    kind: z.literal('score-settlement'),
    scores: z
      .array(
        z.discriminatedUnion('category', [
          z.object({
            category: z.literal('primary'),
            delta: z.number().int().positive(),
            final: z.object({ claims: z.array(z.number().int().min(0).max(100)).max(20), delta: z.number().int().positive() }).optional(),
          }),
          z.object({
            category: z.literal('secondary'),
            key: id,
            delta: z.number().int().positive(),
            status: z.literal('achieved').optional(),
          }),
        ]),
      )
      .min(1)
      .max(SCORE_SETTLEMENT_MAX),
    round: z.number().int().min(1).max(BATTLE_ROUNDS).optional(),
    playerId: id.optional(),
    missed,
  }),
  z.object({
    kind: z.literal('set-secondary-status'),
    key: id,
    status: z.enum(['active', 'achieved', 'discarded', 'returned']),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('draw-secondary'), secondary, playerId: id.optional() }),
  z.object({
    kind: z.literal('draw-secondaries'),
    secondaries: z.array(secondary).min(1).max(2),
    selected: z.literal(true).optional(),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('acknowledge-draw'), playerId: id.optional() }),
  z.object({ kind: z.literal('acknowledge-scoring'), playerId: id.optional() }),
  z.object({ kind: z.literal('select-secret'), secondary, playerId: id.optional() }),
  z.object({ kind: z.literal('reveal-secret'), playerId: id.optional() }),
  z.object({ kind: z.literal('begin-battle'), firstPlayerId: id, attackerId: id.optional() }),
  z.object({ kind: z.literal('adjust-cp'), delta: z.number().int(), playerId: id.optional(), missed }),
  z.object({
    kind: z.literal('resolve-tactical-hand'),
    keys: z.array(id).optional(),
    gainCp: z.boolean().optional(),
    playerId: id.optional(),
  }),
  z.object({ kind: z.literal('score'), category: z.enum(['primary', 'secondary']), delta: z.number().int(), playerId: id.optional() }),
  z.object({ kind: z.literal('correct-player'), playerId: id, resource: z.enum(['cp', 'primary', 'secondary']), delta: z.number().int() }),
  z.object({ kind: z.literal('settle-opponent-turn') }),
  z.object({ kind: z.literal('request-advance'), playerId: id.optional() }),
  z.object({ kind: z.literal('cancel-advance'), playerId: id.optional() }),
  z.object({ kind: z.literal('advance'), playerId: id.optional() }),
  z.object({ kind: z.literal('pause-clock') }),
  z.object({ kind: z.literal('resume-clock') }),
  z.object({
    kind: z.literal('end-battle'),
    reason: z.enum(['completed', 'finished-early', 'conceded']).optional(),
    concededBy: id.optional(),
  }),
  z.object({ kind: z.literal('reopen-battle') }),
  z.object({ kind: z.literal('add-note'), text: z.string().max(NOTE_MAX_LENGTH) }),
  z.object({ kind: z.literal('undo'), target: z.number().int().positive() }),
])
export const commandSchema: z.ZodType<Command> = z.preprocess(currentCommand, commandUnion)

export function parseRosterSnapshot(snapshot: string): Roster {
  const command = commandSchema.parse({ kind: 'attach-roster', roster: JSON.parse(snapshot) })
  if (command.kind !== 'attach-roster') throw new Error('expected a roster snapshot')
  return command.roster
}

/** A saved roster snapshot, or null where there is none or it no longer parses. */
export function rosterSnapshotOrNull(snapshot: string | null | undefined): Roster | null {
  if (!snapshot) return null
  try {
    return parseRosterSnapshot(snapshot)
  } catch {
    return null
  }
}
