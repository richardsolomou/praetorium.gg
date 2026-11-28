import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { RuleSummary, RuleSummaryBlock } from '../../contracts/rules'
import { catalogueEditionId } from '../../core/catalogueEdition'
import { canonicalDetachmentName } from '../../core/detachmentName'
import { routeSlug } from '../../core/slug'
import type { VsDataInvulnerableSave, VsDataUnit, VsDataUnits } from '../../shared/vsData'
import { ruleUnitsQuery } from '../queries/references'
import { abilitySummaryIn, datasheetAbilitySummary } from '../../shared/vsDataAbilities'
import { useRuleSummaries } from '../ruleSummaries'
import { bold, counted, line, type Line, listed } from '../../shared/vsDataUnitLines'

/** What VS Data's roster and transport data say of one datasheet's unit: undefined while asked for, null where it has none. */
export function useVsDataUnit(catalogueId: string, entryId: string, enabled = true): VsDataUnit | null | undefined {
  return unitIn(useVsDataUnits(catalogueId, enabled), entryId)
}

const useVsDataUnits = (catalogueId: string, enabled: boolean) => useEditionUnits(catalogueEditionId(catalogueId), enabled)

/** A rules version's VS Data units and abilities, the current one's where `edition` is null. */
function useEditionUnits(edition: string | null, enabled: boolean): VsDataUnits | null | undefined {
  const { data, isPending } = useQuery({ ...ruleUnitsQuery(edition), enabled })
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
/** The catalogue a `DatasheetUnit` owner is in, whose rules version its records are read in. */
export const ownerCatalogueId = (owner: string) => owner.slice(0, owner.indexOf('#'))
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
 * The summaries of rules by VS Data id in the rules version `catalogueId` is of, then in the current one, as a rules
 * version plays a card its own release does not publish as the current release does. Each is undefined while asked for,
 * null where there is none.
 */
export function useVsDataSummaries(catalogueId: string, ids: readonly (string | undefined)[]) {
  const wanted = ids.filter((id): id is string => Boolean(id))
  const edition = catalogueEditionId(catalogueId)
  const own = useEditionUnits(edition, wanted.length > 0)
  const unpublished = edition !== null && own !== undefined && wanted.some((id) => !own?.abilities[id])
  const current = useEditionUnits(null, unpublished)
  return (id: string): RuleSummary | null | undefined => {
    if (own === undefined) return undefined
    const summary = own?.abilities[id]
    if (summary || !unpublished) return summary ?? null
    return current === undefined ? undefined : (current?.abilities[id] ?? null)
  }
}

/** What an invulnerable save applies to, as "Against ranged attacks", or nothing where it applies to every attack. */
export const invulnerableSaveScope = (save: Pick<VsDataInvulnerableSave, 'against'>) =>
  save.against ? `Against ${save.against} attacks` : null

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
