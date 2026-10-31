import { z } from 'zod'
import { fromBase64Url, toBase64Url } from '../core/base64'
import { combatAdjustmentsSchema } from '../core/combatAdjustments'
import { idSchema, rosterPickSchema } from '../core/commands'

const key = z.string().max(400)
const weaponPreferencesSchema = z.record(key, z.string().max(200))
const phaseWeapons = z.array(z.string().max(200)).max(60)

/** The matchup's own choices: modifiers, weapon modes, excluded weapons, and allocation order. */
const matchupSettingsSchema = z.object({
  adjustments: combatAdjustmentsSchema,
  preferences: weaponPreferencesSchema,
  excluded: z.object({ ranged: phaseWeapons, melee: phaseWeapons }),
  allocation: z.array(z.string().max(200)).max(20),
})
export type MatchupSettings = z.infer<typeof matchupSettingsSchema>

const savedRosterSource = z.object({ id: idSchema })
const sealedEventRosterSource = z.object({ sealedEvent: z.object({ token: idSchema, eventToken: idSchema, userId: idSchema }) })
export type SimulatorRosterSource = z.infer<typeof savedRosterSource> | z.infer<typeof sealedEventRosterSource>
const pickIndexSchema = z.int().min(0).max(500)

const sideSchema = z.object({
  catalogueId: idSchema,
  pick: rosterPickSchema.omit({ attachedTo: true }),
  rules: z.record(key, z.int().min(0).max(20)),
  preferences: weaponPreferencesSchema.optional(),
  /** Units joined to the main unit, or with `attachedTo` to an earlier one in `[pick, ...attached]`, as a Loyal Protector joins a Command Squad. */
  attached: z
    .array(rosterPickSchema.omit({ attachedTo: true }).extend({ attachedTo: z.int().min(1).max(6).optional() }))
    .max(7)
    .refine((units) => units.every((unit, at) => (unit.attachedTo ?? 0) <= at), 'An attached unit joins the main unit or an earlier one.')
    .optional(),
  /** Detachments whose rules and stratagems the side fields without a roster, as an assistant's matchup names them. */
  detachmentIds: z.array(idSchema).max(4).optional(),
  /** A unit from a saved roster or a revealed sealed event list, simulated with its detachment, enhancements, and attachments. */
  roster: z
    .preprocess(
      // Links shared before sealed events had their name spell the source `league`.
      (value) =>
        value && typeof value === 'object' && 'league' in value
          ? (({ league, ...rest }) => ({ ...rest, sealedEvent: league }))(value)
          : value,
      z.union([savedRosterSource.extend({ pickIndex: pickIndexSchema }), sealedEventRosterSource.extend({ pickIndex: pickIndexSchema })]),
    )
    .optional(),
})
export type SimulatorSide = z.infer<typeof sideSchema>

/** Identifies a side's roster, whichever kind it is. */
export function rosterSourceKey(source: SimulatorRosterSource) {
  return 'id' in source
    ? source.id
    : JSON.stringify(['sealed-event', source.sealedEvent.token, source.sealedEvent.eventToken, source.sealedEvent.userId])
}

/** Everything a shared simulator link restores; the first side attacks unless swapped. */
const simulatorStateSchema = z.object({
  v: z.literal(1),
  sides: z.tuple([sideSchema.nullable(), sideSchema.nullable()]),
  swapped: z.boolean(),
  matchup: matchupSettingsSchema.optional(),
})
export type SimulatorState = z.infer<typeof simulatorStateSchema>

const MAX_LENGTH = 8_000

export function encodeSimulatorState(state: SimulatorState) {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(state)))
}

/** A link that does not decode to a valid matchup opens an empty simulator rather than a broken one. */
export function decodeSimulatorState(value: string | undefined): SimulatorState | null {
  if (!value || value.length > MAX_LENGTH) return null
  try {
    const parsed = simulatorStateSchema.safeParse(JSON.parse(new TextDecoder().decode(fromBase64Url(value))))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The main units, their rosters, and sides a link pairs, ignoring attached units and settings; null until both sides are chosen. */
export function simulatorPairing(shared: string) {
  const state = decodeSimulatorState(shared)
  if (!state?.sides.every(Boolean)) return null
  return JSON.stringify([
    state.swapped,
    state.sides.map((side) => [side!.catalogueId, side!.pick.entryId, ...(side!.roster ? [rosterSourceKey(side!.roster)] : [])]),
  ])
}

/** A link that defends with one unit of a roster, with the attacker still to pick. */
export function rosterMatchup(catalogueId: string, pick: SimulatorSide['pick'], source: SimulatorRosterSource, pickIndex: number) {
  return encodeSimulatorState({ v: 1, sides: [null, { catalogueId, pick, rules: {}, roster: { ...source, pickIndex } }], swapped: false })
}

/** A link that puts one datasheet on the chosen side, with the other side still to pick. */
export function datasheetMatchup(catalogueId: string, entryId: string, side: 'attacker' | 'defender') {
  const unit = { catalogueId, pick: { entryId, catalogueId }, rules: {} }
  return encodeSimulatorState({ v: 1, sides: side === 'attacker' ? [unit, null] : [null, unit], swapped: false })
}
