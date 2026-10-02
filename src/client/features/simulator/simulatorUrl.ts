import { z } from 'zod'
import { combatAdjustmentsSchema } from '../../../core/combatAdjustments'
import { rosterPickSchema } from '../../../core/commands'

const key = z.string().max(400)
const phaseWeapons = z.array(z.string().max(200)).max(60)

/** The matchup's own choices: modifiers, weapon modes, excluded weapons, and allocation order. */
export const matchupSettingsSchema = z.object({
  adjustments: combatAdjustmentsSchema,
  preferences: z.record(key, z.string().max(200)),
  excluded: z.object({ ranged: phaseWeapons, melee: phaseWeapons }),
  allocation: z.array(z.string().max(200)).max(20),
})
export type MatchupSettings = z.infer<typeof matchupSettingsSchema>

const sideSchema = z.object({
  catalogueId: z.string().min(1).max(64),
  pick: rosterPickSchema.omit({ attachedTo: true }),
  rules: z.record(key, z.int().min(0).max(20)),
})
export type SimulatorSide = z.infer<typeof sideSchema>

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
  const bytes = new TextEncoder().encode(JSON.stringify(state))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/** A link that does not decode to a valid matchup opens an empty simulator rather than a broken one. */
export function decodeSimulatorState(value: string | undefined): SimulatorState | null {
  if (!value || value.length > MAX_LENGTH) return null
  try {
    const text = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
    const parsed = simulatorStateSchema.safeParse(
      JSON.parse(new TextDecoder().decode(Uint8Array.from(text, (character) => character.charCodeAt(0)))),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
