import type { RuleSummary } from '../contracts/rules'
import { unitAbilitySlug } from '../core/summaryMarkdown'
import type { VsDataUnits } from './vsData'

/** A release's units with each ability as a summary, as datasheets show them, or as anything else found the same way, such as its id. */
type UnitsOf<T> = Omit<VsDataUnits, 'abilities'> & { abilities: Record<string, T> }

/** `unitAbilitySlug` without each word's trailing "s", as a datasheet's "Bomb Squig" is VS Data's "Bomb Squigs". */
export const abilityKey = (name: string) => unitAbilitySlug(name).replaceAll(/(?<=[a-z0-9]{2}[a-rt-z0-9])s(?=-|$)/g, '')

/** An `@` owner as VS Data names it: a faction, or a faction's detachment, by the faction's VS Data id. */
function vsDataOwner(units: Pick<VsDataUnits, 'factions'> | null, subject: string) {
  const [faction = '', ...rest] = subject.slice(1).split('.')
  return [units?.factions?.[faction] ?? faction, ...rest].join('.')
}

/** Whose records a datasheet entry (or `@` and the VS Data owner) holds: its VS Data unit's, or the faction's or detachment's. */
const ownerOf = (units: UnitsOf<unknown> | null, subject: string) =>
  subject.startsWith('@') ? vsDataOwner(units, subject) : units?.units[subject]?.id

/** The ability a BSData rule or profile is on `subject`: its own entry there where a profile several carry differs, else VS Data's alias. */
const aliased = <T>(units: UnitsOf<T>, subject: string, id: string | undefined) =>
  id ? units.abilities[units.aliases[`${subject}/${id}`] ?? units.aliases[id] ?? ''] : undefined

/**
 * An ability's summary for the datasheet entry (or `@` and the VS Data owner) it is printed on: the record its BSData id
 * is, else its owner's own record of that name, as a unit's Transport is `<unit>.transport`.
 */
export function abilitySummaryIn<T = RuleSummary>(units: UnitsOf<T>, subject: string, name: string, id?: string): T | null {
  const owner = ownerOf(units, subject)
  return aliased(units, subject, id) ?? (owner ? units.abilities[`${owner}.${unitAbilitySlug(name)}`] : undefined) ?? null
}

/**
 * A datasheet ability's summary: the record its BSData id is, else the first of the records its printed text names that is
 * its own owner's, a faction's or detachment's rule, or no ability at all, as a core rule.
 */
export function datasheetAbilitySummary<T = RuleSummary>(
  units: UnitsOf<T> | null,
  subject: string,
  id: string | undefined,
  printed: readonly { id: string; summary: T }[],
): T | null {
  const own = units ? aliased(units, subject, id) : undefined
  if (own) return own
  if (!units) return printed[0]?.summary ?? null
  const owner = ownerOf(units, subject)
  // A faction's rule (`<faction>.<rule>`), or the owner's own record, whatever catalogue owns the detachment.
  const detachment = subject.startsWith('@') && owner?.includes('.') ? owner.slice(owner.indexOf('.')) : null
  const reaches = ({ id: record }: { id: string }) => {
    if (!record.startsWith('ability:')) return true
    const held = record.slice('ability:'.length, record.lastIndexOf('.'))
    return !held.includes('.') || held === owner || (detachment !== null && held.endsWith(detachment))
  }
  return printed.find(reaches)?.summary ?? null
}
