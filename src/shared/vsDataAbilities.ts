import type { RuleSummary } from '../contracts/rules'
import { unitAbilitySlug } from '../core/summaryMarkdown'
import { abilityKeysNamed } from './ruleSummaries'
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
  // An alias to its owner's own record or its faction's holds under any name, as the Banehammer's "Banehammer" profile is
  // its Transport; VS Data aliases a few profiles to another owner's in like words, as a Legends Assault Squad's Hammer of
  // Wrath to the Negavolt Cultists' Voltagheist Field, so another owner's reaches it only by the same name.
  const alias = id ? units.aliases[id] : undefined
  const aliasOwner = alias?.slice(0, alias.lastIndexOf('.'))
  const ownAlias = owner !== undefined && (aliasOwner === owner || aliasOwner === owner.split('.')[0])
  const aliased = alias && (ownAlias || namesIt(alias, name)) ? alias : undefined
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
  const owner = subject.startsWith('@') ? subject.slice(1) : units?.units[subject]?.id
  const held = ability?.id.slice('ability:'.length, ability.id.lastIndexOf('.'))
  const ownUnits = owner !== undefined && held === owner
  // Another owner's record, a unit's, a Detachment's or another faction's, reaches it only by the same name.
  const reaches = ability && (!units || ownUnits || !held?.includes('.') || namesIt(ability.id, name))
  return (
    [
      ...own,
      ownUnits ? ability?.summary : undefined,
      ability || !printed || !namesIt(printed.id, name) ? undefined : printed.summary,
      ...faction,
      reaches ? ability.summary : undefined,
    ].find(Boolean) ?? null
  )
}

/**
 * Whether a record, by `kind:id`, is of this name: its key, or the name's without the value or qualifier it takes, but
 * for a misspelling of up to two letters in a long name, as a datasheet's Dessication Conduit is VS Data's Desiccation.
 */
function namesIt(record: string, name: string) {
  const key = letters(record.slice(Math.max(record.lastIndexOf('.'), record.indexOf(':')) + 1))
  return [abilityKey(name), ...abilityKeysNamed(name).map((named) => named.slice(named.indexOf(':') + 1))].some((named) => {
    const spelt = letters(named)
    return spelt === key || (Math.min(spelt.length, key.length) >= 10 && misspelt(spelt, key))
  })
}

const letters = (slug: string) => abilityKey(slug).replaceAll('-', '')

/** Whether two spellings are at most two insertions, deletions or substitutions apart. */
function misspelt(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 2) return false
  let row = Array.from({ length: right.length + 1 }, (_, at) => at)
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1]
    for (let j = 0; j < right.length; j++) next.push(Math.min(row[j + 1]! + 1, next[j]! + 1, row[j]! + (left[i] === right[j] ? 0 : 1)))
    row = next
  }
  return row[right.length]! <= 2
}
