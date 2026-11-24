import type { RuleSummary } from '../contracts/rules'
import { unitAbilitySlug } from '../core/summaryMarkdown'
import type { VsDataUnits } from './vsData'

const owned = new WeakMap<VsDataUnits, Map<string, Map<string, RuleSummary>>>()

/** `unitAbilitySlug` without each word's trailing "s", as a datasheet's "Bomb Squig" is VS Data's "Bomb Squigs". */
export const abilityKey = (name: string) => unitAbilitySlug(name).replaceAll(/(?<=[a-z0-9]{2}[a-rt-z0-9])s(?=-|$)/g, '')

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
 * An ability's summaries among VS Data's, for the datasheet entry (or `@` and the VS Data owner) it is printed on, by
 * name, in order: the owner's own, a record it shares with other units and the ability VS Data aliases to its BSData
 * profile; then its faction's, the one detachment of that name's and the one faction's that has it.
 */
function ownersAbility(units: VsDataUnits, subject: string, name: string, id?: string) {
  const unit = subject.startsWith('@') ? undefined : units.units[subject]
  const owner = subject.startsWith('@') ? subject.slice(1) : unit?.id
  const byOwner = abilitiesByOwner(units)
  const slug = abilityKey(name)
  // A record VS Data publishes once for several units, as the Land Raiders' Damaged, by the units it names.
  const shared = unit?.shared?.find((held) => abilityKey(held.slice(held.lastIndexOf('.') + 1)) === slug && units.abilities[held])
  const aliased = id ? units.aliases[id] : undefined
  // Then its faction's, as its army rule and shared abilities are the faction's, then the one faction that has it, as a
  // chapter's datasheets and a Crucible datasheet with no VS Data unit print an army rule.
  const faction = [...byOwner].filter(([held, abilities]) => !held.includes('.') && abilities.has(slug))
  // A detachment another faction's page shows, as Dark Angels show the Space Marines' Stormlance Task Force, is the one
  // owner of that detachment's name.
  const detachment = subject.startsWith('@') && owner?.includes('.') ? owner.slice(owner.indexOf('.')) : null
  const named = detachment ? [...byOwner].filter(([held, abilities]) => held.endsWith(detachment) && abilities.has(slug)) : []
  return {
    own: [
      owner ? byOwner.get(owner)?.get(slug) : undefined,
      shared ? units.abilities[shared] : undefined,
      aliased ? units.abilities[aliased] : undefined,
    ],
    faction: [
      owner ? byOwner.get(owner.split('.')[0]!)?.get(slug) : undefined,
      named.length === 1 ? named[0]![1].get(slug) : undefined,
      faction.length === 1 ? faction[0]![1].get(slug) : undefined,
    ],
  }
}

/** An ability's summary among VS Data's, by name, for the datasheet entry (or `@` and the VS Data owner) it is printed on. */
export function abilitySummaryIn(units: VsDataUnits, subject: string, name: string, id?: string): RuleSummary | null {
  const { own, faction } = ownersAbility(units, subject, name, id)
  return [...own, ...faction].find(Boolean) ?? null
}

const unitIds = new WeakMap<VsDataUnits, ReadonlySet<string>>()

/** Whether a record, by `kind:id`, is an ability one of the release's units owns, and not this datasheet's own unit. */
function otherUnitsAbility(units: VsDataUnits, subject: string, record: string) {
  if (!record.startsWith('ability:')) return false
  const bare = record.slice('ability:'.length)
  const owner = bare.slice(0, bare.lastIndexOf('.'))
  let ids = unitIds.get(units)
  if (!ids) unitIds.set(units, (ids = new Set(Object.values(units.units).map((unit) => unit.id))))
  return ids.has(owner) && owner !== units.units[subject]?.id
}

/**
 * A datasheet ability's summary: its owner's own record, or the one of its own unit its printed text names, as a file
 * an earlier rules version prints alike names the base's; then the weapon or core ability its printed text names, then
 * its faction's, and last any other record its printed text names, which reaches another unit's ability only by the same
 * name, as Game Datacards prints a few cards in another's words, such as Karanak's Pack Leader in a Sorcerer's Warptime.
 */
export function datasheetAbilitySummary(
  units: VsDataUnits | null,
  subject: string,
  name: string,
  id: string | undefined,
  printed: { id: string; summary: RuleSummary } | null,
): RuleSummary | null {
  const { own, faction } = units ? ownersAbility(units, subject, name, id) : { own: [], faction: [] }
  const ability = printed?.id.startsWith('ability:') ? printed : null
  const owner = units?.units[subject]?.id
  const ownUnits = owner !== undefined && ability?.id.slice('ability:'.length, ability.id.lastIndexOf('.')) === owner
  const reaches =
    ability &&
    (!units ||
      !otherUnitsAbility(units, subject, ability.id) ||
      abilityKey(ability.id.slice(ability.id.lastIndexOf('.') + 1)) === abilityKey(name))
  return (
    [
      ...own,
      ownUnits ? ability.summary : undefined,
      ability ? undefined : printed?.summary,
      ...faction,
      reaches ? ability.summary : undefined,
    ].find(Boolean) ?? null
  )
}
