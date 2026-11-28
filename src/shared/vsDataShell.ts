import type { z } from 'zod'
import type { legacyOptionsSchema } from '../core/legacyIds'
import type { VsPick } from '../core/roster'
import type { VsRosterData } from './vsDataLegality'

/**
 * For each datasheet entry VS Data defines exactly, the catalogue option each VS Data choice stands for, read backwards
 * from the frozen options map: a catalogue option whose one gain is a single VS Data choice stands for that choice.
 * `entry → VS option → VS choice → [choice key, option ID]`, one pair per catalogue group that offers it, in the map's order.
 */
export type VsShell = Record<string, Record<string, Record<string, [string, string][]>>>

/** The roster definitions as the server loads them for the current rules version, with the shell its options map gives. */
export type VsRosterWithShell = VsRosterData & { shell?: VsShell }

export function vsShellOf(units: z.infer<typeof legacyOptionsSchema>['units']): VsShell {
  const shell: VsShell = {}
  for (const [entryId, entry] of Object.entries(units)) {
    if (entry.unmatched.length) continue
    for (const [held, mapped] of Object.entries(entry.choices)) {
      if (!('options' in mapped)) continue
      const gains = Object.entries(mapped.options).flatMap(([option, choices]) =>
        Object.entries(choices).flatMap(([choice, count]) => (count > 0 ? [{ option, choice, count }] : [])),
      )
      const gain = gains.length === 1 && gains[0]!.count === 1 ? gains[0]! : undefined
      if (!gain) continue
      const at = held.lastIndexOf('|')
      const byOption = (shell[entryId] ??= {})
      const byChoice = (byOption[gain.option] ??= {})
      ;(byChoice[gain.choice] ??= []).push([held.slice(0, at), held.slice(at + 1)])
    }
  }
  return shell
}

/** The shell of a datasheet entry, where the loaded definitions carry one. */
export const vsShellIn = (vsRoster: VsRosterWithShell | undefined, entryId: string) => vsRoster?.shell?.[entryId]

/**
 * A VS pick's taken choices as the catalogue spreads that arm its datasheet's tree, each on the first group the map files
 * it under; null when a taken choice has no catalogue option standing for it, so the tree can't follow the pick.
 */
export function vsShellSpreads(
  shell: VsShell[string] | undefined,
  options: VsPick['options'],
): Record<string, Record<string, number>> | null {
  const spreads: Record<string, Record<string, number>> = {}
  for (const [option, choices] of Object.entries(options))
    for (const [choice, count] of Object.entries(choices)) {
      if (count <= 0) continue
      const [key, optionId] = shell?.[option]?.[choice]?.[0] ?? []
      if (!key || !optionId) return null
      const group = (spreads[key] ??= {})
      group[optionId] = (group[optionId] ?? 0) + count
    }
  return spreads
}
