import {
  canTransport,
  fieldedUnits,
  startingEmbarkRefusal,
  startingEmbarks,
  transportAboard,
  transportLabel,
} from '../../../../core/battle'
import type { RosterPick } from '../../../../core/roster'
import { frozenUnits } from '../../../../core/rosterSnapshot'

type Units = Parameters<typeof frozenUnits>[1]
type Details = Parameters<typeof frozenUnits>[2]

export type EmbarkTransport = { pickIndex: number; name: string; aboard: string | null; refusal: string | null; chosen: boolean }

/**
 * The list's starting embarks as setup will judge them, by pick position.
 *
 * Reads the army the battle would freeze from these picks, so a choice offered here is
 * the one `startingEmbarks` accepts when the roster is attached.
 */
export function rosterEmbarks(picks: readonly RosterPick[], units: Units, details: Details) {
  const fielded = fieldedUnits(frozenUnits(picks, units, details))
  const pickOf = new Map(fielded.map((unit, at) => [unit.key, units[at]!.key]))
  const keyOf = new Map(fielded.map((unit, at) => [units[at]!.key, unit.key]))
  const started = startingEmbarks(fielded)
  const transports = fielded.filter((unit) => canTransport(unit) && !unit.attachedTo)

  return {
    /** Picks whose starting embark the list can no longer hold. */
    dropped: started.flatMap((unit) => {
      const at = unit.startingEmbarkRefused ? pickOf.get(unit.key) : undefined
      return at === undefined ? [] : [at]
    }),
    /** The pick a unit's choice is kept on: the unit a character joined. */
    hostOf: (pickIndex: number) => {
      const unit = fielded.find((candidate) => candidate.key === keyOf.get(pickIndex))
      return unit?.attachedTo ? pickOf.get(unit.attachedTo) : unit ? pickIndex : undefined
    },
    /** Transports the unit at this pick could start in, or nothing when it cannot ride in one. */
    transportsFor: (pickIndex: number): EmbarkTransport[] => {
      const key = keyOf.get(pickIndex)
      const unit = fielded.find((candidate) => candidate.key === key)
      if (!unit || canTransport(unit) || fielded.some((other) => other.attachedTo === unit.key && canTransport(other))) return []
      return transports.map((transport) => ({
        pickIndex: pickOf.get(transport.key)!,
        name: transportLabel(fielded, transport.key) ?? transport.name,
        aboard: transportAboard(
          transport,
          started.filter((candidate) => candidate.embarkedIn === transport.key),
        ),
        refusal: startingEmbarkRefusal(fielded, unit.key, transport.key)?.message ?? null,
        chosen: unit.startsEmbarkedIn === transport.key,
      }))
    },
  }
}
