import { combatCarriers, type CombatCarrier } from '../core/combatLoadout'
import { carrierChange, changesWeapons, isWeaponProfile, type LoadoutAxis, type LoadoutAxisOption } from '../core/combatLoadouts'
import { evaluate } from '../core/evaluate'
import type { RosterPick } from '../core/roster'
import { isUnitCompositionChoice, type UnitChoice } from '../core/unitChoices'
import { datasheetViewsIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { buildRosterPick, rosterDatasheetContext } from './rosterDatasheetContext'
import { rosterDetachments } from './rosterDetachments'

type LoadoutRequest = { catalogueId: string; detachmentIds: string[]; picks: RosterPick[]; pickIndex: number }
type ChoiceOption = Pick<UnitChoice['options'][number], 'id' | 'name' | 'count' | 'min' | 'max'>

const axisOption = (option: ChoiceOption, group: string, prefix: string, change: CombatCarrier[]): LoadoutAxisOption => ({
  id: `${prefix}${option.id}`,
  entry: option.id,
  name: option.name,
  group,
  count: option.count,
  min: option.min,
  max: option.max,
  change,
})
const scaled = (carrier: CombatCarrier, sign: number): CombatCarrier => ({
  ...carrier,
  models: carrier.models * sign,
  weapons: carrier.weapons.map((weapon) => ({ ...weapon, count: weapon.count * sign })),
})

/** Enhancements and detachment upgrades are army decisions, not a unit's weapon choice. */
const ARMY_CHOICE = /enhancement|upgrade/i

function builder(loaded: LoadedCatalogue, data: LoadoutRequest) {
  const pick = data.picks[data.pickIndex]
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).selections
  const build = (candidate: RosterPick) => buildRosterPick(loaded, data.catalogueId, detachments, candidate)
  const base = pick ? build(pick) : null
  const evaluated = (selection: NonNullable<typeof base>['selection']) =>
    evaluate([selection], loaded.index, { primaryCatalogueId: data.catalogueId, roster: detachments })
  return pick && base ? { pick, base, build, evaluated } : null
}

/** Each weapon choice the selected pick offers, with the change one step makes to its carriers. */
export function combatLoadoutSpace(loaded: LoadedCatalogue, data: LoadoutRequest) {
  const built = builder(loaded, data)
  const context = rosterDatasheetContext(loaded, data)
  if (!built || !context) return null
  const { pick, base, build } = built
  const weapons = (datasheetViewsIn(loaded, data.catalogueId, pick.entryId, context).available?.profiles ?? []).filter(isWeaponProfile)
  const carriers = combatCarriers(base.selection, loaded.index)
  const models = pick.models ?? base.size.models
  const measure = (candidate: RosterPick) => {
    const variant = build(candidate)
    return variant ? carrierChange(carriers, combatCarriers(variant.selection, loaded.index)) : null
  }
  const chosen = (key: string, entry: string) => {
    const choices = { ...pick.choices }
    if (entry) choices[key] = entry
    else delete choices[key]
    return measure({ ...pick, choices })
  }
  const spread = (key: string, counts: Record<string, number>) => measure({ ...pick, models, spreads: { ...pick.spreads, [key]: counts } })
  const choices = base.choices.filter(
    (choice) => choice.options.length && !isUnitCompositionChoice(choice) && !ARMY_CHOICE.test(choice.name),
  )
  const hostOf = (choice: UnitChoice) => {
    const parent = choices
      .filter((other) => choice.key.startsWith(`${other.key}/`))
      .reduce<UnitChoice | undefined>((nearest, other) => (!nearest || other.key.length > nearest.key.length ? other : nearest), undefined)
    const option = parent?.options.find((candidate) => candidate.id === choice.key.slice(parent.key.length + 1).split('/')[0])
    return parent && option ? { parent, option } : null
  }
  const isSpread = (choice: UnitChoice) => choice.room > 1
  // A specialist's own weapon group sets how many of that model the squad holds.
  const governs = (choice: UnitChoice) => {
    const host = hostOf(choice)
    return host && isSpread(host.parent) && !host.parent.uniform && host.option.profile !== undefined && isSpread(choice) ? host : null
  }
  const countsOf = (choice: UnitChoice) => Object.fromEntries(choice.options.map((option) => [option.id, option.count]))
  const spreadSteps = (choice: UnitChoice, group: string, prefix: string) => {
    const counts = countsOf(choice)
    const used = choice.options.reduce((total, option) => total + option.count, 0)
    const exact = !choice.optional && used === choice.room
    const donor = exact
      ? (choice.options.find((option) => option.default && option.count > 0) ?? choice.options.toSorted((a, b) => b.count - a.count)[0])
      : undefined
    const options = choice.options.flatMap((option): LoadoutAxisOption[] => {
      const step = (change: CombatCarrier[] | null, sign = 1) =>
        change
          ? [
              axisOption(
                option,
                group,
                prefix,
                change.map((entry) => scaled(entry, sign)),
              ),
            ]
          : []
      if (option.id === donor?.id) return step([])
      if (donor)
        return donor.count > 0 ? step(spread(group, { ...counts, [option.id]: option.count + 1, [donor.id]: donor.count - 1 })) : []
      if (used < choice.room) return step(spread(group, { ...counts, [option.id]: option.count + 1 }))
      return option.count > 0 ? step(spread(group, { ...counts, [option.id]: option.count - 1 }), -1) : []
    })
    return { exact, donor: donor ? `${prefix}${donor.id}` : null, options }
  }
  const axes = choices.flatMap((choice): LoadoutAxis[] => {
    if (governs(choice)) return []
    const host = hostOf(choice)
    const shared = { key: choice.key, name: choice.name, owner: choice.owner?.name ?? null, host: host ? host.parent.key : null }
    if (!isSpread(choice)) {
      const options = [...choice.options, ...(choice.optional ? [{ id: '', name: 'Nothing', count: 0, min: 0, max: 1 }] : [])].flatMap(
        (option) => {
          const change = option.id === choice.chosen ? [] : chosen(choice.key, option.id)
          return change ? [{ ...axisOption(option, choice.key, '', change), count: 0, min: 0, max: 1 }] : []
        },
      )
      return [{ ...shared, kind: 'single', current: choice.chosen, options }]
    }
    if (choice.uniform) {
      const options = choice.options.flatMap((option) => {
        const change =
          option.count === choice.room
            ? []
            : spread(choice.key, Object.fromEntries(choice.options.map((other) => [other.id, other === option ? choice.room : 0])))
        return change ? [{ ...axisOption(option, choice.key, '', change), min: 0, max: choice.room }] : []
      })
      return [{ ...shared, kind: 'spread', room: choice.room, uniform: true, exact: false, donor: null, limits: [], options }]
    }
    const own = spreadSteps(choice, choice.key, '')
    const specialists = choices.flatMap((nested) => {
      const governed = governs(nested)
      return governed?.parent === choice ? [{ nested, model: governed.option }] : []
    })
    const nested = specialists.map(({ nested: group, model }) => ({
      model,
      steps: spreadSteps({ ...group, optional: true }, group.key, `${group.key}|`),
    }))
    const hosts = new Set(specialists.map(({ model }) => model.id))
    return [
      {
        ...shared,
        kind: 'spread',
        room: choice.room,
        uniform: false,
        exact: own.exact,
        donor: own.donor,
        limits: nested.map(({ model, steps }) => ({ options: steps.options.map((option) => option.id), max: model.max })),
        options: [...own.options.filter((option) => !hosts.has(option.entry)), ...nested.flatMap(({ steps }) => steps.options)],
      },
    ]
  })
  return {
    carriers,
    weapons,
    axes: axes.filter((axis) => axis.options.some((option) => changesWeapons(option.change, weapons))),
  }
}

/** Builds each candidate the way the roster will, so a suggestion is legal and its carriers are real. */
export function checkCombatLoadouts(loaded: LoadedCatalogue, data: LoadoutRequest & { candidates: RosterPick[] }) {
  const built = builder(loaded, data)
  if (!built) return null
  const { base, build, evaluated } = built
  const before = evaluated(base.selection)
  const known = new Set(before.errors.map((error) => `${error.entryId}:${error.message}`))
  return data.candidates.map((candidate) => {
    const variant = build(candidate)
    if (!variant) return { legal: false, points: 0, carriers: [] }
    const after = evaluated(variant.selection)
    return {
      legal: after.errors.every((error) => known.has(`${error.entryId}:${error.message}`)),
      points: after.points - before.points,
      carriers: combatCarriers(variant.selection, loaded.index),
    }
  })
}
