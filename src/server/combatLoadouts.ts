import { combatCarriers } from '../core/combatLoadout'
import { isWeaponProfile, type LoadoutBatch, type LoadoutCandidate, type LoadoutOption, type LoadoutSpace } from '../core/combatLoadouts'
import { evaluate, type ModifierCache } from '../core/evaluate'
import type { BuiltUnit, RosterPick } from '../core/roster'
import { isUnitCompositionChoice, type UnitChoice, type UnitChoiceCache } from '../core/unitChoices'
import { datasheetViewsIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { buildRosterPick, rosterDatasheetContext } from './rosterDatasheetContext'
import { rosterDetachments } from './rosterDetachments'

type LoadoutRequest = { catalogueId: string; detachmentIds: string[]; picks: RosterPick[]; pickIndex: number }

/** Enhancements and detachment upgrades are army decisions, not a unit's weapon choice. */
const ARMY_CHOICE = /enhancement|upgrade/i
const weaponChoices = (choices: UnitChoice[]) =>
  choices.filter((choice) => choice.options.length && !isUnitCompositionChoice(choice) && !ARMY_CHOICE.test(choice.name))

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
  const carriers = combatCarriers(base.selection, loaded.index, { primaryCatalogueId: data.catalogueId, roster: detachments })
  const models = pick.models ?? base.size.models
  const option = (group: string, entry: string, step: LoadoutOption['step'], candidate: RosterPick | null): LoadoutOption[] => {
    if (!candidate) return [{ group, entry, step, carriers }]
    const variant = build(candidate)
    return variant && errors(variant.selection).every((error) => known.has(error))
      ? [
          {
            group,
            entry,
            step,
            carriers: combatCarriers(variant.selection, loaded.index, { primaryCatalogueId: data.catalogueId, roster: detachments }),
          },
        ]
      : []
  }
  const chosen = (key: string, entry: string) => {
    const choices = { ...pick.choices }
    if (entry) choices[key] = entry
    else delete choices[key]
    return { ...pick, choices }
  }
  const spread = (key: string, counts: Record<string, number>) => ({ ...pick, models, spreads: { ...pick.spreads, [key]: counts } })
  const choices = weaponChoices(base.choices)
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

export async function* combatLoadoutCandidates(
  loaded: LoadedCatalogue,
  data: LoadoutRequest,
  signal: AbortSignal,
): AsyncGenerator<LoadoutBatch> {
  if (signal.aborted) return
  const pick = data.picks[data.pickIndex]
  const space = combatLoadoutSpace(loaded, data)
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).selections
  const choiceCache: UnitChoiceCache = new WeakMap()
  const modifierCache: ModifierCache = new WeakMap()
  const build = (candidate: RosterPick) => buildRosterPick(loaded, data.catalogueId, detachments, candidate, choiceCache, modifierCache)
  const base = pick && build(pick)
  if (!pick || !space || !base) throw new Error('The loadout could not be loaded.')
  const errors = (selection: typeof base.selection) =>
    evaluate([selection], loaded.index, { primaryCatalogueId: data.catalogueId, roster: detachments, modifierCache }).errors.map(
      (error) => `${error.entryId}:${error.message}`,
    )
  const known = new Set(errors(base.selection))
  const queue: ({ choices: UnitChoice[]; resolved: RosterPick } | null)[] = []
  const requested = new Set([loadoutRequestKey(pick)])
  const seen = new Set<string>()
  const equipment = new Set<string>()
  let candidates: LoadoutCandidate[] = []
  let attempts = 1
  let expanded = 0
  let head = 0
  const started = performance.now()
  let work = 0
  const takeBatch = (done = false): LoadoutBatch => {
    const batch = { weapons: space.weapons, candidates, built: expanded, scheduled: seen.size, done }
    candidates = []
    work = 0
    return batch
  }
  const enqueue = (candidate: RosterPick, built: BuiltUnit) => {
    if (built.size.models !== base.size.models) return
    const key = JSON.stringify(built.selection)
    if (seen.has(key)) return
    if (queue.length - head >= 50_000) throw new Error('The full search could not finish. The best loadout found so far has been kept.')
    seen.add(key)
    const resolved = {
      ...candidate,
      spreads: {
        ...candidate.spreads,
        ...Object.fromEntries(
          built.choices
            .filter((choice) => candidate.spreads?.[choice.key] !== undefined)
            .map((choice) => [choice.key, Object.fromEntries(choice.options.map((option) => [option.id, option.count]))]),
        ),
      },
    }
    queue.push({ choices: built.choices, resolved })
    if (errors(built.selection).every((error) => known.has(error))) {
      const carriers = combatCarriers(built.selection, loaded.index, {
        primaryCatalogueId: data.catalogueId,
        roster: detachments,
        modifierCache,
      })
      const equipmentKey = JSON.stringify(carriers)
      if (!equipment.has(equipmentKey)) {
        equipment.add(equipmentKey)
        candidates.push({ pick: candidate, carriers })
      }
    }
  }
  enqueue(pick, base)
  yield { weapons: space.weapons, candidates: [], built: 0, scheduled: 1, done: false }
  await new Promise<void>((resolve) => setImmediate(resolve))
  while (head < queue.length) {
    if (signal.aborted) return
    if (performance.now() - started > 120_000)
      throw new Error('The full search could not finish. The best loadout found so far has been kept.')
    const current = queue[head]!
    queue[head++] = null
    expanded++
    if (head >= 1024) {
      queue.splice(0, head)
      head = 0
    }
    if (++work >= 32) {
      yield takeBatch()
      await new Promise<void>((resolve) => setImmediate(resolve))
      if (signal.aborted) return
    }
    // Illegal intermediate selections can connect legal combinations with shared limits.
    for (const candidate of loadoutEdits(current.resolved, current.choices, base.size.models)) {
      if (signal.aborted) return
      const key = loadoutRequestKey(candidate)
      if (requested.has(key)) continue
      if (++work >= 32) {
        yield takeBatch()
        await new Promise<void>((resolve) => setImmediate(resolve))
        if (signal.aborted) return
      }
      if (attempts >= 100_000 || performance.now() - started > 120_000)
        throw new Error('The full search could not finish. The best loadout found so far has been kept.')
      requested.add(key)
      attempts++
      const built = build(candidate)
      if (built) enqueue(candidate, built)
    }
  }
  yield takeBatch(true)
}

function loadoutRequestKey(pick: RosterPick): string {
  return JSON.stringify({
    choices: Object.entries(pick.choices ?? {}).toSorted(([left], [right]) => left.localeCompare(right)),
    spreads: Object.entries(pick.spreads ?? {})
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([group, counts]) => [group, Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right))]),
  })
}

function* loadoutEdits(resolved: RosterPick, availableChoices: UnitChoice[], models: number): Generator<RosterPick> {
  for (const choice of weaponChoices(availableChoices)) {
    if (choice.room <= 1) {
      for (const id of [...choice.options.map((option) => option.id), ...(choice.optional ? [''] : [])]) {
        if (id === choice.chosen) continue
        const choices = { ...resolved.choices }
        if (id) choices[choice.key] = id
        else delete choices[choice.key]
        const spreads = Object.fromEntries(
          Object.entries(resolved.spreads ?? {}).filter(([key]) => key !== choice.key && !key.startsWith(`${choice.key}/`)),
        )
        yield { ...resolved, choices, spreads }
      }
    } else {
      const counts = Object.fromEntries(choice.options.map((option) => [option.id, option.count]))
      const used = choice.options.reduce((sum, option) => sum + option.count, 0)
      const hasModels = choice.options.some((option) => option.profile !== undefined)
      const replace = (spreadCounts: Record<string, number>): RosterPick => ({
        ...resolved,
        models,
        spreads: { ...resolved.spreads, [choice.key]: spreadCounts },
      })
      if (choice.uniform) {
        const count = hasModels ? used : Math.min(choice.room, used || models)
        for (const option of choice.options) {
          if (option.count === count || option.max < count) continue
          yield replace(Object.fromEntries(choice.options.map((entry) => [entry.id, entry === option ? count : 0])))
        }
      } else {
        for (const option of choice.options) {
          if (option.count < option.max) {
            if ((!hasModels || choice.optional) && used < choice.room) yield replace({ ...counts, [option.id]: option.count + 1 })
            for (const donor of choice.options) {
              if (donor === option || donor.count <= (donor.mutableMin ? 0 : donor.min)) continue
              yield replace({ ...counts, [option.id]: option.count + 1, [donor.id]: donor.count - 1 })
            }
          }
          if ((!hasModels || choice.optional) && option.count > (option.mutableMin ? 0 : option.min))
            yield replace({ ...counts, [option.id]: option.count - 1 })
        }
      }
    }
  }
}
