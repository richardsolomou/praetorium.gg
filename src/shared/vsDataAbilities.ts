import type { RuleSummary } from '../contracts/rules'
import { unitAbilitySlug } from '../core/summaryMarkdown'
import type { VsDataUnits } from './vsData'

const owned = new WeakMap<VsDataUnits, Map<string, Map<string, RuleSummary>>>()

/** Each ability by the unit or faction whose id it starts with, then by `unitAbilitySlug`, read once per answer. */
function abilitiesByOwner(units: VsDataUnits) {
  let byOwner = owned.get(units)
  if (!byOwner) {
    byOwner = new Map()
    for (const [id, summary] of Object.entries(units.abilities)) {
      const at = id.lastIndexOf('.')
      const slug = unitAbilitySlug(id.slice(at + 1))
      const abilities = byOwner.get(id.slice(0, at)) ?? new Map<string, RuleSummary>()
      if (!abilities.has(slug)) abilities.set(slug, summary)
      byOwner.set(id.slice(0, at), abilities)
    }
    owned.set(units, byOwner)
  }
  return byOwner
}

/**
 * An ability's summary among VS Data's, for the datasheet entry (or `@` and the VS Data owner) it is printed on: the
 * ability VS Data aliases to its BSData profile, then by name the owner's own, its faction's, then the one faction's that has it.
 */
export function abilitySummaryIn(units: VsDataUnits, subject: string, name: string, id?: string): RuleSummary | null {
  const aliased = id ? units.aliases[id] : undefined
  if (aliased && units.abilities[aliased]) return units.abilities[aliased]
  const owner = subject.startsWith('@') ? subject.slice(1) : units.units[subject]?.id
  if (!owner) return null
  const byOwner = abilitiesByOwner(units)
  const slug = unitAbilitySlug(name)
  // The owner's own ability first, then its faction's, as its army rule and shared abilities are the faction's, then the
  // one faction that has it, as a chapter's datasheets print the Space Marines' army rule.
  const faction = [...byOwner].filter(([held, abilities]) => !held.includes('.') && abilities.has(slug))
  return (
    byOwner.get(owner)?.get(slug) ??
    byOwner.get(owner.split('.')[0]!)?.get(slug) ??
    (faction.length === 1 ? faction[0]![1].get(slug)! : null)
  )
}
