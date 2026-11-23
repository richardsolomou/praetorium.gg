import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { RuleSummary, RuleSummaryBlock, RuleSummaryInline } from '../../contracts/rules'
import { unitAbilitySlug } from '../../core/summaryMarkdown'
import { catalogueEditionId } from '../../core/catalogueEdition'
import type { VsDataUnit, VsDataUnits } from '../../shared/vsData'
import { ruleUnitsQuery } from '../queries/references'

/** What VS Data's roster and transport data say of one datasheet's unit: undefined while asked for, null where it has none. */
export function useVsDataUnit(catalogueId: string, entryId: string, enabled = true): VsDataUnit | null | undefined {
  return unitIn(useVsDataUnits(catalogueId, enabled), entryId)
}

function useVsDataUnits(catalogueId: string, enabled: boolean): VsDataUnits | null | undefined {
  const { data, isPending } = useQuery({ ...ruleUnitsQuery(catalogueEditionId(catalogueId)), enabled })
  if (!enabled) return null
  return data ?? (isPending ? undefined : null)
}

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

const unitIn = (units: VsDataUnits | null | undefined, entryId: string) =>
  units === undefined ? undefined : (units?.units[entryId] ?? null)

/**
 * The datasheet whose abilities the rules texts inside it are, so one VS Data reaches only through its unit can be found:
 * its catalogue and entry ids as `datasheetUnit` writes them.
 */
export const DatasheetUnit = createContext<string | null>(null)
export const datasheetUnit = (catalogueId: string, entryId: string) => `${catalogueId}#${entryId}`

/**
 * The summary of an ability of the datasheet around it, by the ability's name: how a rule whose text only BSData prints
 * reaches its VS Data record. Undefined while asked for, null where there is none or no datasheet around it.
 */
export function useUnitAbilitySummary(name: string | undefined, enabled: boolean): RuleSummary | null | undefined {
  const [catalogueId = '', entryId = ''] = useContext(DatasheetUnit)?.split('#') ?? []
  const units = useVsDataUnits(catalogueId, enabled && Boolean(entryId && name))
  const unit = unitIn(units, entryId)
  if (units === undefined) return undefined
  if (!unit || !name || !units) return null
  const byOwner = abilitiesByOwner(units)
  const slug = unitAbilitySlug(name)
  // The unit's own ability first, then its faction's, as its army rule and shared abilities are the faction's, then the
  // one faction that has it, as a chapter's datasheets print the Space Marines' army rule.
  const faction = [...byOwner].filter(([owner, abilities]) => !owner.includes('.') && abilities.has(slug))
  return (
    byOwner.get(unit.id)?.get(slug) ??
    byOwner.get(unit.id.split('.')[0]!)?.get(slug) ??
    (faction.length === 1 ? faction[0]![1].get(slug)! : null)
  )
}

type Line = RuleSummaryInline[]
type Run = string | RuleSummaryInline

/** A line of runs, each string plain; adjacent plain runs join, so a line reads the same however it was put together. */
const line = (...runs: readonly (Run | readonly Run[])[]): Line =>
  runs.flat().reduce<Line>((joined, run) => {
    const next = typeof run === 'string' ? { text: run } : run
    const last = joined.at(-1)
    if (!next.text) return joined
    if (last && !last.bold && !next.bold && !last.link && !next.link && !last.ability && !next.ability) last.text += next.text
    else joined.push({ ...next })
    return joined
  }, [])
/** A keyword or rule name, bold as BSData prints them. */
const bold = (text: string): RuleSummaryInline => ({ text, bold: true })

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`)
/** Items as one run of a sentence, joined by commas and `last`. */
const listed = <T,>(items: readonly T[], last = 'or'): (T | string)[] =>
  items.flatMap((item, at) => [...(at === 0 ? [] : [at === items.length - 1 ? ` ${last} ` : ', ']), item])
const counted = (items: readonly (readonly [string, number])[]) => items.map(([name, count]) => (count === 1 ? name : `${count} × ${name}`))

/** A model's name for more than one of it, as a datasheet writes "5–10 Immortals" or "2 Canoptek Wraiths". */
export function pluralModel(name: string) {
  const [, head = '', last = ''] = /^(.*?)(\S+)$/.exec(name) ?? []
  if (/(?:man)$/i.test(last)) return `${head}${last.slice(0, -2)}en`
  if (/[^aeiou]y$/i.test(last)) return `${head}${last.slice(0, -1)}ies`
  if (/(?:s|x|z|ch|sh)$/i.test(last)) return `${head}${last}es`
  return `${name}s`
}

/** Each model line of a unit, as "5–10 Immortals" or "1 Overlord". */
export const unitComposition = (unit: VsDataUnit): Line[] =>
  unit.models.map((model) => line(`${range(model.min, model.max)} ${model.max === 1 ? model.name : pluralModel(model.name)}`))

/** What each model carries before any option is taken. */
export const unitLoadout = (unit: VsDataUnit): Line[] =>
  unit.models.filter((model) => model.wargear.length).map((model) => line(`${model.name}: `, listed(counted(model.wargear), 'and'), '.'))

/** One option a unit's models take, in Praetorium's words: what it allows, then a short list of the limits on its choices. */
export function unitOption(option: VsDataUnit['options'][number]): RuleSummaryBlock[] {
  const who = option.carrier
    ? option.perModels
      ? `For every ${option.perModels} models, 1 ${option.carrier}`
      : `Each ${option.carrier}`
    : 'The unit'
  const how = option.choose.max > 1 ? [`up to ${option.choose.max} of `, ...listed(option.choices, 'and')] : listed(option.choices)
  const instead = option.replaces?.length ? [' in place of ', ...listed(counted(option.replaces), 'and')] : []
  const limits = (option.caps ?? []).map((cap) =>
    line(`At most ${cap.max} `, ...listed(cap.choices), `${cap.perModels ? ` for every ${cap.perModels} models` : ''}.`),
  )
  return [
    { paragraph: line(`${who} can take `, how, instead, '.') },
    ...(limits.length ? [{ list: 'unordered' as const, items: limits }] : []),
  ]
}

/** Each option a unit's models take, in Praetorium's words. */
export const unitOptions = (unit: VsDataUnit) => unit.options.map(unitOption)

/** What a transport can carry, as lines, its keywords and Firing Deck in bold. */
export function unitTransport(unit: VsDataUnit): Line[] {
  const transport = unit.transport
  if (!transport) return []
  const selectors = (names: readonly string[]) => listed(names.map(bold))
  const loads = (transport.loads ?? []).map((load) =>
    line(
      ...listed(
        load.map((pool) => line(`${pool.limit} `, selectors(pool.selectors), ` ${pool.count === 'models' ? 'models' : pool.count}`)),
        'and',
      ),
    ),
  )
  return [
    ...(loads.length ? [line('Carries ', ...listed(loads), '.')] : []),
    ...(transport.excluded ?? []).map((excluded) => line('Cannot carry ', selectors(excluded.selectors), ' models.')),
    ...(transport.space ?? []).map((space) =>
      line(
        space.selectors?.length ? [...selectors(space.selectors), ' models take'] : 'Each model takes',
        ` the space of ${space.size} models.`,
      ),
    ),
    ...(transport.firingDeck !== undefined ? [line(bold(`Firing Deck ${transport.firingDeck}`), '.')] : []),
  ]
}
