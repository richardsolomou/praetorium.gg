import type { RuleSummary } from '../contracts/rules'
import { unitAbilitySlug } from '../core/summaryMarkdown'
import type { VsDataUnits } from './vsData'

const owned = new WeakMap<VsDataUnits, Map<string, Map<string, RuleSummary>>>()

/** `unitAbilitySlug` without each word's trailing "s", as a datasheet's "Bomb Squig" is VS Data's "Bomb Squigs". */
const abilityKey = (name: string) => unitAbilitySlug(name).replaceAll(/(?<=[a-z0-9]{2}[a-rt-z0-9])s(?=-|$)/g, '')

/** Each ability by the unit or faction whose id it starts with, then by `abilityKey`, read once per answer. */
function abilitiesByOwner(units: VsDataUnits) {
  let byOwner = owned.get(units)
  if (!byOwner) {
    byOwner = new Map()
    for (const [id, summary] of Object.entries(units.abilities)) {
      const at = id.lastIndexOf('.')
      const slug = abilityKey(id.slice(at + 1))
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
  const byOwner = abilitiesByOwner(units)
  const slug = abilityKey(name)
  // The owner's own ability first, then its faction's, as its army rule and shared abilities are the faction's, then the
  // one faction that has it, as a chapter's datasheets and a Crucible datasheet with no VS Data unit print an army rule.
  const faction = [...byOwner].filter(([held, abilities]) => !held.includes('.') && abilities.has(slug))
  // A detachment another faction's page shows, as Dark Angels show the Space Marines' Stormlance Task Force, is the one
  // owner of that detachment's name.
  const detachment = subject.startsWith('@') && owner?.includes('.') ? owner.slice(owner.indexOf('.')) : null
  const shared = detachment ? [...byOwner].filter(([held, abilities]) => held.endsWith(detachment) && abilities.has(slug)) : []
  return (
    (owner ? (byOwner.get(owner)?.get(slug) ?? byOwner.get(owner.split('.')[0]!)?.get(slug)) : undefined) ??
    (shared.length === 1 ? shared[0]![1].get(slug)! : undefined) ??
    (faction.length === 1 ? faction[0]![1].get(slug)! : null)
  )
}
