import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { RuleSummary, RuleSummaryBlock, RuleSummaryInline } from '../../contracts/rules'
import { catalogueEditionId } from '../../core/catalogueEdition'
import { canonicalDetachmentName } from '../../core/detachmentName'
import { routeSlug } from '../../core/slug'
import type { VsDataInvulnerableSave, VsDataUnit, VsDataUnits } from '../../shared/vsData'
import { ruleUnitsQuery } from '../queries/references'
import { abilitySummaryIn, datasheetAbilitySummary } from '../../shared/vsDataAbilities'
import { useRuleSummaries } from '../ruleSummaries'

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
  // By the name the rest give a detachment BSData spells otherwise, as its unfinished "Deathwatch Support (ITS NOT READY)".
  `${catalogueId}#@${factionSlug}.${routeSlug(canonicalDetachmentName(detachmentSlug))}`
/** A faction as the owner of its army rules: VS Data names them `<faction>.<name>`. */
export const factionRulesOwner = (catalogueId: string, factionSlug: string) => `${catalogueId}#@${factionSlug}`

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

/**
 * The summary of a rule a datasheet or detachment around it prints, by `datasheetAbilitySummary`: its owner's own record
 * first, then the record its printed text names. Undefined while asked for, null where there is none.
 */
export function useDatasheetAbilitySummary(text: string, name: string | undefined, id?: string): RuleSummary | null | undefined {
  const { pending, recordOf } = useRuleSummaries([text])
  const [catalogueId = '', subject = ''] = useContext(DatasheetUnit)?.split('#') ?? []
  const units = useVsDataUnits(catalogueId, Boolean(subject && name))
  if (pending || units === undefined) return undefined
  const printed = recordOf(text, name)
  return name ? datasheetAbilitySummary(units, subject, name, id, printed) : (printed?.summary ?? null)
}

/**
 * Every ability summary of a rules version's release by VS Data id, as a card the build has only in its app is found by
 * its id, with no printed text to name it by. Undefined while asked for, null where there is none.
 */
export function useReleaseAbilities(catalogueId: string, enabled = true): VsDataUnits['abilities'] | null | undefined {
  const units = useVsDataUnits(catalogueId, enabled)
  return units === undefined ? undefined : (units?.abilities ?? null)
}

/** What an invulnerable save applies to, as "Against ranged attacks", or nothing where it applies to every attack. */
export const invulnerableSaveScope = (save: Pick<VsDataInvulnerableSave, 'against'>) =>
  save.against ? `Against ${save.against} attacks` : null

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
/** Items as one run of a sentence, joined by `comma` and `last`. */
const listed = <T,>(items: readonly T[], last = 'or', comma = ','): (T | string)[] =>
  items.flatMap((item, at) => [
    ...(at === 0 ? [] : [at < items.length - 1 ? `${comma} ` : comma === ',' ? ` ${last} ` : `${comma} ${last} `]),
    item,
  ])
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
  const low = unit.models.reduce((total, model) => total + model.min, 0)
  const high = unit.models.reduce((total, model) => total + model.max, 0)
  const sized = low === fewest && high === most ? lines : [...lines, line(`${range(fewest, most)} models in all`)]
  return unit.defaultModels ? [...sized, line('It starts as ', listed(counted(unit.defaultModels), 'and'), '.')] : sized
}

/**
 * What each model carries before any option is taken, each line followed by how many of its models start with each
 * choice where they differ, as one of a Servitor Battleclade's two Gun Servitors starts with a heavy bolter.
 */
export function unitLoadout(unit: VsDataUnit): Line[] {
  const defaults = (carrier: string | undefined) =>
    unit.options.flatMap((option) =>
      option.carrier === carrier && option.defaults?.length
        ? [
            line(
              `Of the ${carrier ?? 'unit'}${carrier ? ' models' : '’s models'}, `,
              listed(
                option.defaults.map(
                  ([choice, count], at) => `${count} ${at ? 'with' : count === 1 ? 'starts with' : 'start with'} ${choice}`,
                ),
                'and',
                option.defaults.some(([choice]) => choice.includes(' and ')) ? ';' : ',',
              ),
              '.',
            ),
          ]
        : [],
    )
  return [
    ...unit.models.flatMap((model) => [
      ...(model.wargear.length ? [line(`${model.name}: `, listed(counted(model.wargear), 'and'), '.')] : []),
      ...defaults(model.name),
    ]),
    ...defaults(undefined),
  ]
}

/** One option a unit's models take, in Praetorium's words: what it allows, then a short list of the limits on its choices. */
export function unitOption(option: VsDataUnit['options'][number]): RuleSummaryBlock[] {
  const who = option.carrier
    ? option.perModels
      ? `For every ${option.perModels} models, 1 ${option.carrier}`
      : `Each ${option.carrier}`
    : 'The unit'
  // Semicolons keep a choice of several pieces, as "Holy fire and Plasma gun", from reading as separate choices.
  const comma = option.choices.some((choice) => choice.includes(' and ')) ? ';' : ','
  const how =
    option.choose.max > 1
      ? [`up to ${option.choose.max} of `, ...listed(option.choices, 'and', comma)]
      : listed(option.choices, 'or', comma)
  const instead = option.replaces?.length ? [' in place of ', ...listed(counted(option.replaces), 'and')] : []
  const limits = (option.caps ?? []).map((cap) =>
    line(`At most ${cap.max} `, ...listed(cap.choices), `${cap.perModels ? ` for every ${cap.perModels} models` : ''}.`),
  )
  return [
    { paragraph: line(`${who} ${option.choose.min ? 'takes' : 'can take'} `, how, instead, '.') },
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
