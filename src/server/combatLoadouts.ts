import { combatCarriers } from '../core/combatLoadout'
import { isWeaponProfile, type LoadoutOption, type LoadoutSpace } from '../core/combatLoadouts'
import { evaluate } from '../core/evaluate'
import type { RosterPick } from '../core/roster'
import { isUnitCompositionChoice, type UnitChoice } from '../core/unitChoices'
import { datasheetViewsIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { buildRosterPick, rosterDatasheetContext } from './rosterDatasheetContext'
import { rosterDetachments } from './rosterDetachments'

type LoadoutRequest = { catalogueId: string; detachmentIds: string[]; picks: RosterPick[]; pickIndex: number }

/** Enhancements and detachment upgrades are army decisions, not a unit's weapon choice. */
const ARMY_CHOICE = /enhancement|upgrade/i

/**
 * Each weapon choice the selected pick offers, every option built from the current loadout the way the
 * roster builds it. An option the catalogue's evaluator refuses, including caps shared across options,
 * is left out, so every estimate is of a legal loadout with its real carriers.
 */
export function combatLoadoutSpace(loaded: LoadedCatalogue, data: LoadoutRequest): LoadoutSpace | null {
  const pick = data.picks[data.pickIndex]
  const context = rosterDatasheetContext(loaded, data)
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).selections
  const build = (candidate: RosterPick) => buildRosterPick(loaded, data.catalogueId, detachments, candidate)
  const base = pick ? build(pick) : null
  if (!pick || !base || !context) return null
  const errors = (selection: typeof base.selection) =>
    evaluate([selection], loaded.index, { primaryCatalogueId: data.catalogueId, roster: detachments }).errors.map(
      (error) => `${error.entryId}:${error.message}`,
    )
  const known = new Set(errors(base.selection))
  const carriers = combatCarriers(base.selection, loaded.index)
  const models = pick.models ?? base.size.models
  const option = (group: string, entry: string, step: LoadoutOption['step'], candidate: RosterPick | null): LoadoutOption[] => {
    if (!candidate) return [{ group, entry, step, carriers }]
    const variant = build(candidate)
    return variant && errors(variant.selection).every((error) => known.has(error))
      ? [{ group, entry, step, carriers: combatCarriers(variant.selection, loaded.index) }]
      : []
  }
  const chosen = (key: string, entry: string) => {
    const choices = { ...pick.choices }
    if (entry) choices[key] = entry
    else delete choices[key]
    return { ...pick, choices }
  }
  const spread = (key: string, counts: Record<string, number>) => ({ ...pick, models, spreads: { ...pick.spreads, [key]: counts } })
  const choices = base.choices.filter(
    (choice) => choice.options.length && !isUnitCompositionChoice(choice) && !ARMY_CHOICE.test(choice.name),
  )
  const hostOf = (choice: UnitChoice) => {
    const parent = choices
      .filter((other) => choice.key.startsWith(`${other.key}/`))
      .reduce<UnitChoice | undefined>((nearest, other) => (!nearest || other.key.length > nearest.key.length ? other : nearest), undefined)
    const hosted = parent?.options.find((candidate) => candidate.id === choice.key.slice(parent.key.length + 1).split('/')[0])
    return parent && hosted ? { parent, option: hosted } : null
  }
  const isSpread = (choice: UnitChoice) => choice.room > 1
  // A specialist's own weapon group sets how many of that model the squad holds.
  const governs = (choice: UnitChoice) => {
    const host = hostOf(choice)
    return host && isSpread(host.parent) && !host.parent.uniform && host.option.profile !== undefined && isSpread(choice) ? host : null
  }
  // One more model for an option, from the donor when the counts must fill the room; one fewer once it cannot take more.
  const steps = (choice: UnitChoice) => {
    const counts = Object.fromEntries(choice.options.map((entry) => [entry.id, entry.count]))
    const used = choice.options.reduce((total, entry) => total + entry.count, 0)
    const donor =
      !choice.optional && used === choice.room
        ? (choice.options.find((entry) => entry.default && entry.count > 0) ?? choice.options.toSorted((a, b) => b.count - a.count)[0])
        : undefined
    return choice.options.flatMap((entry) => {
      if (entry.id === donor?.id) return option(choice.key, entry.id, 0, null)
      const moved = (by: number) =>
        spread(choice.key, { ...counts, [entry.id]: entry.count + by, ...(donor ? { [donor.id]: donor.count - by } : {}) })
      const more =
        entry.count < entry.max && (donor ? donor.count > 0 : used < choice.room) ? option(choice.key, entry.id, 1, moved(1)) : []
      return more.length || !entry.count ? more : option(choice.key, entry.id, -1, moved(-1))
    })
  }
  return {
    carriers,
    weapons: (datasheetViewsIn(loaded, data.catalogueId, pick.entryId, context).available?.profiles ?? []).filter(isWeaponProfile),
    choices: choices.flatMap((choice): LoadoutOption[][] => {
      if (governs(choice)) return []
      if (!isSpread(choice))
        return [
          [...choice.options, ...(choice.optional ? [{ id: '' }] : [])].flatMap(({ id }) =>
            option(choice.key, id, 0, id === choice.chosen ? null : chosen(choice.key, id)),
          ),
        ]
      if (choice.uniform)
        return [
          choice.options.flatMap((entry) =>
            option(
              choice.key,
              entry.id,
              0,
              entry.count === choice.room
                ? null
                : spread(choice.key, Object.fromEntries(choice.options.map((other) => [other.id, other === entry ? choice.room : 0]))),
            ),
          ),
        ]
      const specialists = choices.flatMap((nested) => (governs(nested)?.parent === choice ? [nested] : []))
      const hosts = new Set(specialists.map((nested) => governs(nested)!.option.id))
      return [
        [
          ...steps(choice).filter((entry) => !hosts.has(entry.entry)),
          ...specialists.flatMap((nested) => steps({ ...nested, optional: true })),
        ],
      ]
    }),
  }
}
