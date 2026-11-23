import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { RuleSummary } from '../../contracts/rules'
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

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`)
const listed = (items: readonly string[], last = 'or') =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`
const counted = (items: readonly (readonly [string, number])[]) => items.map(([name, count]) => (count === 1 ? name : `${count} × ${name}`))

/** Each model line of a unit, as "5–10 Immortal". */
export const unitComposition = (unit: VsDataUnit) => unit.models.map((model) => `${range(model.min, model.max)} ${model.name}`)

/** What each model carries before any option is taken. */
export const unitLoadout = (unit: VsDataUnit) =>
  unit.models.filter((model) => model.wargear.length).map((model) => `${model.name}: ${listed(counted(model.wargear), 'and')}.`)

/** Each option a unit's models take, in Praetorium's words. */
export function unitOptions(unit: VsDataUnit) {
  return unit.options.map((option) => {
    const who = option.carrier
      ? option.perModels
        ? `For every ${option.perModels} models, 1 ${option.carrier}`
        : `Each ${option.carrier}`
      : 'The unit'
    const how = option.choose.max > 1 ? `up to ${option.choose.max} of ${listed(option.choices, 'and')}` : listed(option.choices)
    const instead = option.replaces?.length ? ` in place of ${listed(counted(option.replaces), 'and')}` : ''
    const caps = (option.caps ?? []).map(
      (cap) => ` At most ${cap.max} ${listed(cap.choices)}${cap.perModels ? ` for every ${cap.perModels} models` : ''}.`,
    )
    return `${who} can take ${how}${instead}.${caps.join('')}`
  })
}

/** What a transport can carry, as lines. */
export function unitTransport(unit: VsDataUnit) {
  const transport = unit.transport
  if (!transport) return []
  const loads = (transport.loads ?? []).map((load) =>
    listed(
      load.map((pool) => `${pool.limit} ${listed(pool.selectors)} ${pool.count === 'models' ? 'models' : pool.count}`),
      'and',
    ),
  )
  return [
    ...(loads.length ? [`Carries ${listed(loads)}.`] : []),
    ...(transport.excluded ?? []).map((excluded) => `Cannot carry ${listed(excluded.selectors)} models.`),
    ...(transport.space ?? []).map(
      (space) =>
        `${space.selectors?.length ? `${listed(space.selectors)} models take` : 'Each model takes'} the space of ${space.size} models.`,
    ),
    ...(transport.firingDeck !== undefined ? [`Firing Deck ${transport.firingDeck}.`] : []),
  ]
}
