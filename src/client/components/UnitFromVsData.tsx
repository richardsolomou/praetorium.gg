import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { RuleSummary, RuleSummaryBlock, RuleSummaryInline } from '../../contracts/rules'
import { catalogueEditionId } from '../../core/catalogueEdition'
import type { VsDataUnit, VsDataUnits } from '../../shared/vsData'
import { ruleUnitsQuery } from '../queries/references'
import { abilitySummaryIn } from '../../shared/vsDataAbilities'

/** What VS Data's roster and transport data say of one datasheet's unit: undefined while asked for, null where it has none. */
export function useVsDataUnit(catalogueId: string, entryId: string, enabled = true): VsDataUnit | null | undefined {
  return unitIn(useVsDataUnits(catalogueId, enabled), entryId)
}

function useVsDataUnits(catalogueId: string, enabled: boolean): VsDataUnits | null | undefined {
  const { data, isPending } = useQuery({ ...ruleUnitsQuery(catalogueEditionId(catalogueId)), enabled })
  if (!enabled) return null
  return data ?? (isPending ? undefined : null)
}

const unitIn = (units: VsDataUnits | null | undefined, entryId: string) =>
  units === undefined ? undefined : (units?.units[entryId] ?? null)

/**
 * Whose abilities the rules texts inside it are, so one VS Data reaches only through their owner can be found: a
 * datasheet's catalogue and entry ids as `datasheetUnit` writes them, or a detachment as `detachmentRulesOwner` does.
 */
export const DatasheetUnit = createContext<string | null>(null)
export const datasheetUnit = (catalogueId: string, entryId: string) => `${catalogueId}#${entryId}`
/** A detachment as the owner of its rules, enhancements and upgrades: VS Data names them `<faction>.<detachment>.<name>`. */
export const detachmentRulesOwner = (catalogueId: string, factionSlug: string, detachmentSlug: string) =>
  `${catalogueId}#@${factionSlug}.${detachmentSlug}`

/**
 * The summary of an ability of the datasheet or detachment around it, by the ability's name: how a rule whose text only
 * BSData prints reaches its VS Data record. Undefined while asked for, null where there is none or no owner around it.
 */
export function useUnitAbilitySummary(name: string | undefined, enabled: boolean, id?: string): RuleSummary | null | undefined {
  const [catalogueId = '', subject = ''] = useContext(DatasheetUnit)?.split('#') ?? []
  const units = useVsDataUnits(catalogueId, enabled && Boolean(subject && name))
  if (units === undefined) return undefined
  return units && name ? abilitySummaryIn(units, subject, name, id) : null
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

/**
 * Each model line of a unit, as "5–10 Immortals" or "1 Overlord", then the unit's size where its lines do not add up to it,
 * as a Brotherhood Terminator Squad's optional Ancient takes the place of one of its Terminators.
 */
export function unitComposition(unit: VsDataUnit): Line[] {
  const lines = unit.models.map((model) => line(`${range(model.min, model.max)} ${model.max === 1 ? model.name : pluralModel(model.name)}`))
  if (!unit.sizes.length) return lines
  const [fewest, most] = [Math.min(...unit.sizes), Math.max(...unit.sizes)]
  const summed = unit.models.reduce(([low, high], model) => [low + model.min, high + model.max], [0, 0])
  return summed[0] === fewest && summed[1] === most ? lines : [...lines, line(`${range(fewest, most)} models in all`)]
}

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
