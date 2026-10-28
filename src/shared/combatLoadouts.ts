import { canonicalJson } from '../core/text'
import { combatCarriers } from '../core/combatLoadout'
import { toBase64 } from '../core/base64'
import { isWeaponProfile, type LoadoutBatch, type LoadoutCandidate, type LoadoutOption, type LoadoutSpace } from '../core/combatLoadouts'
import { evaluate, type ModifierCache, type Selection } from '../core/evaluate'
import type { BuiltUnit, RosterPick } from '../core/roster'
import { isUnitCompositionChoice, type UnitChoice, type UnitChoiceCache } from '../core/unitChoices'
import { datasheetViewsIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { buildRosterPick, rosterDatasheetContext } from './rosterDatasheetContext'
import { rosterDetachments } from './rosterDetachments'
import { attachedUnit } from '../core/attachedUnits'
import { rosterCombatant, rosterProjectionCache } from './rosterCombatRules'
import type { LoadedRules } from './rules'
import { nextTask } from './nextTask'

type LoadoutRequest = {
  catalogueId: string
  detachmentIds: string[]
  picks: RosterPick[]
  pickIndex: number
  /** Start from a legal loadout this many random edits away, chosen by `seed`, instead of the one requested. */
  walk?: { seed: number; steps: number }
}

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

const LOADOUT_SLICE_MS = 16

/**
 * The most loadouts a unit's choices may allow for the search to visit them all. Beyond it a search returns only the
 * loadouts near the requested one, and the page climbs from there.
 */
export const EXHAUSTIVE_STATES = 1000

/** Where a search stops without claiming an optimum. */
const SEARCH_LIMITS = { retainedBytes: 64 * 1024 * 1024, queued: 50_000, equipment: 20_000, ms: 120_000, attempts: 100_000 }

export async function* combatLoadoutCandidates(
  loaded: LoadedCatalogue,
  data: LoadoutRequest,
  signal: AbortSignal,
  rules: LoadedRules | null = null,
): AsyncGenerator<LoadoutBatch> {
  if (signal.aborted) return
  const indexes = [data.pickIndex, ...attachedUnit(data.picks, data.pickIndex)]
  if (indexes.length > 8) throw new Error('This unit has too many attached members to optimize.')
  const context = rosterDatasheetContext(loaded, data)
  if (!context) throw new Error('The loadout could not be loaded.')
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).selections
  const choiceCache: UnitChoiceCache = new WeakMap()
  const modifierCache: ModifierCache = new WeakMap()
  const build = (candidate: RosterPick) => buildRosterPick(loaded, data.catalogueId, detachments, candidate, choiceCache, modifierCache)
  const picks = indexes.map((index) => data.picks[index]!)
  const base = picks.map(build)
  if (base.some((unit) => !unit)) throw new Error('The attached unit could not be loaded.')
  const units = base as BuiltUnit[]
  const outside = context.selections.filter(
    (_, selectionIndex) =>
      !context.unitSelections.some((unit) => indexes.includes(unit.pickIndex) && unit.selectionIndex === selectionIndex),
  )
  const errors = (built: BuiltUnit[]) =>
    evaluate(
      built.map((unit) => unit.selection),
      loaded.index,
      {
        primaryCatalogueId: data.catalogueId,
        roster: outside,
        modifierCache,
      },
    ).errors.map((error) => `${error.entryId}:${error.message}`)
  const known = new Set(errors(units))
  const legal = (built: BuiltUnit[]) => errors(built).every((error) => known.has(error))
  const estimated = units.reduce((states, unit) => states * loadoutStates(unit.choices), 1)
  const local = estimated > EXHAUSTIVE_STATES || data.walk !== undefined
  const start = data.walk ? walked(data.walk) : { picks, units }
  const memberSelections = indexes.map((pickIndex) => context.unitSelections.find((unit) => unit.pickIndex === pickIndex))
  if (memberSelections.some((unit) => !unit)) throw new Error('The attached unit could not be loaded.')
  // The roster as built for a candidate, reusing the members just built and every other unit as the roster built it.
  const prepared = (built: BuiltUnit[]) => {
    const replaced = new Map(memberSelections.map((unit, at) => [unit!.selectionIndex, built[at]!]))
    return {
      selections: context.selections.map((selection, at) => replaced.get(at)?.selection ?? selection),
      unitSelections: context.unitSelections.map((unit) => {
        const member = replaced.get(unit.selectionIndex)
        return member ? { ...unit, models: member.size.models } : unit
      }),
    }
  }
  const queue: ({ units: BuiltUnit[]; resolved: RosterPick[]; depth: number; legal: boolean } | null)[] = []
  const requestKey = (members: RosterPick[]) => JSON.stringify(members.map(loadoutRequestKey))
  const requested = new Set([requestKey(start.picks)])
  const seen = new Set<string>()
  const equipment = new Set<string>()
  let candidates: LoadoutCandidate[] = []
  let attempts = 1
  let expanded = 0
  let head = 0
  const started = performance.now()
  let work = 0
  let slice = performance.now()
  // A batch ends after 32 steps or a slice of time, whichever comes first: one step can take tens of milliseconds, and
  // the service runs this search between other requests.
  const due = () => ++work >= 32 || performance.now() - slice >= LOADOUT_SLICE_MS
  let retainedBytes = 0
  const incomplete = () => new Error('The full search could not finish. The best loadout found so far has been kept.')
  const retain = (key: string) => {
    retainedBytes += key.length * 2
    if (retainedBytes > SEARCH_LIMITS.retainedBytes) throw incomplete()
  }
  const takeBatch = (done = false): LoadoutBatch => {
    const batch = { candidates, built: expanded, scheduled: seen.size, estimated, done, local }
    candidates = []
    work = 0
    return batch
  }
  const enqueue = async (members: RosterPick[], built: BuiltUnit[], depth: number) => {
    if (built.some((unit, index) => unit.size.models !== units[index]!.size.models)) return
    const key = await digest(JSON.stringify(built.map((unit) => withoutEmptyEntries(unit.selection))))
    if (seen.has(key)) return
    if (queue.length - head >= SEARCH_LIMITS.queued) throw incomplete()
    retain(key)
    seen.add(key)
    const resolved = members.map((candidate, index) => resolvedPick(candidate, built[index]!))
    const isLegal = legal(built)
    queue.push({ units: built, resolved, depth, legal: isLegal })
    if (!isLegal) return
    const updates = new Map(indexes.map((pickIndex, at) => [pickIndex, resolved[at]!]))
    const roster = data.picks.map((pick, pickIndex) => updates.get(pickIndex) ?? pick)
    const projected = rosterCombatant(loaded, rules, { ...data, picks: roster }, prepared(built), {
      attachmentChoices: false,
      cache: rosterProjectionCache(modifierCache),
    })
    if (!projected) throw new Error('The attached unit could not be loaded.')
    if (projected.attachmentErrors.length) {
      if (seen.size === 1) throw new Error('The attached unit could not be evaluated legally.')
      return
    }
    const member = (
      pickIndex: number,
      sheet: NonNullable<typeof projected>['selected'],
      carriers: NonNullable<typeof projected>['carriers'],
      memberRules: NonNullable<typeof projected>['rules'],
      models: number,
    ) => ({
      pickIndex,
      pick: roster[pickIndex]!,
      sheet,
      carriers,
      rules: memberRules,
      models,
    })
    const candidate: LoadoutCandidate = {
      members: [
        member(data.pickIndex, projected.selected, projected.carriers, projected.rules, units[0]!.size.models),
        ...projected.companions.map((companion) =>
          member(companion.pickIndex, companion.selected, companion.carriers, companion.rules, companion.models),
        ),
      ],
    }
    const equipmentKey = await digest(JSON.stringify(candidate.members.map(({ pick: _pick, ...description }) => description)))
    if (equipment.has(equipmentKey)) return
    if (equipment.size >= SEARCH_LIMITS.equipment) throw incomplete()
    retain(equipmentKey)
    equipment.add(equipmentKey)
    candidates.push(candidate)
  }
  await enqueue(start.picks, start.units, 0)
  yield { candidates: [], built: 0, scheduled: 1, estimated, done: false, local }
  await nextTask()
  while (head < queue.length) {
    if (signal.aborted) return
    if (performance.now() - started > SEARCH_LIMITS.ms) throw incomplete()
    const current = queue[head]!
    queue[head++] = null
    // A local search looks one edit away, and one more past an illegal step, since shared limits can need two.
    if (local && (current.depth > 1 || (current.depth === 1 && current.legal))) continue
    expanded++
    if (head >= 1024) {
      queue.splice(0, head)
      head = 0
    }
    if (due()) {
      yield takeBatch()
      await nextTask()
      slice = performance.now()
      if (signal.aborted) return
    }
    for (let at = 0; at < indexes.length; at++) {
      // Illegal intermediate selections can connect legal combinations with shared limits.
      for (const candidate of loadoutEdits(current.resolved[at]!, current.units[at]!.choices, units[at]!.size.models)) {
        if (signal.aborted) return
        const members = current.resolved.map((pick, index) => (index === at ? candidate : pick))
        const key = requestKey(members)
        if (requested.has(key)) continue
        if (due()) {
          yield takeBatch()
          await nextTask()
          slice = performance.now()
          if (signal.aborted) return
        }
        if (attempts >= SEARCH_LIMITS.attempts || performance.now() - started > SEARCH_LIMITS.ms) throw incomplete()
        retain(key)
        requested.add(key)
        attempts++
        const built = build(candidate)
        if (built)
          await enqueue(
            members,
            current.units.map((unit, index) => (index === at ? built : unit)),
            current.depth + 1,
          )
      }
    }
  }
  yield takeBatch(true)

  /** A legal loadout reached by random edits from the requested one, or the requested one when the walk finds none. */
  function walked({ seed, steps }: NonNullable<LoadoutRequest['walk']>) {
    let state = seed
    const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648
    let here = { picks, units }
    for (let move = 0; move < steps || (move < steps * 3 && !legal(here.units)); move++) {
      const edits = indexes.flatMap((_, at) =>
        [...loadoutEdits(here.picks[at]!, here.units[at]!.choices, units[at]!.size.models)].map((candidate) => ({ at, candidate })),
      )
      if (!edits.length) break
      const { at, candidate } = edits[Math.floor(random() * edits.length)]!
      const built = build(candidate)
      if (!built || built.size.models !== units[at]!.size.models) continue
      here = {
        picks: here.picks.map((pick, index) => (index === at ? resolvedPick(candidate, built) : pick)),
        units: here.units.map((unit, index) => (index === at ? built : unit)),
      }
    }
    return legal(here.units) ? here : { picks, units }
  }
}

/** A request with each spread it states settled to the counts the unit was built with. */
function resolvedPick(candidate: RosterPick, built: BuiltUnit): RosterPick {
  return {
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
}

/**
 * How many loadouts a unit's weapon choices allow, counted from each choice's options, their bounds and its room. The
 * choices on offer change as weapons are swapped, so this estimates the search's size rather than bounding it.
 */
export function loadoutStates(choices: UnitChoice[]) {
  return weaponChoices(choices).reduce((states, choice) => {
    if (choice.room <= 1) return states * (choice.options.length + (choice.optional ? 1 : 0))
    if (choice.uniform) return states * choice.options.length
    const used = choice.options.reduce((sum, option) => sum + option.count, 0)
    const free = choice.optional || !choice.options.some((option) => option.profile !== undefined)
    // How many ways each total can be split among the options, within each option's bounds.
    let splits = new Map([[0, 1]])
    for (const option of choice.options) {
      const next = new Map<number, number>()
      for (const [total, ways] of splits)
        for (let count = option.mutableMin ? 0 : option.min; count <= option.max && total + count <= choice.room; count++)
          next.set(total + count, (next.get(total + count) ?? 0) + ways)
      splits = next
    }
    return states * [...splits].reduce((sum, [total, ways]) => sum + (free || total === used ? ways : 0), 0)
  }, 1)
}

/**
 * A state's identity for the search's memory, short whatever the state's size. A collision could prune a distinct
 * state, so the digest is SHA-256, whose collisions are not a practical concern.
 */
async function digest(value: string) {
  return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

/**
 * A selection without the zero-count entries a build keeps when it trims an over-filled request; they hold no models
 * or equipment, so a loadout reached that way is the same state as one requested exactly.
 */
export function withoutEmptyEntries(selection: Selection): Selection {
  return selection.selections
    ? { ...selection, selections: selection.selections.filter((child) => child.count !== 0).map(withoutEmptyEntries) }
    : selection
}

function loadoutRequestKey(pick: RosterPick) {
  return canonicalJson({ choices: pick.choices ?? {}, spreads: pick.spreads ?? {} })
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
      // A group that must stay full, as each Crisis suit's two weapons must, changes only by swapping. Nested choices
      // can need the short step, since a swap leaves the inner group's counts behind.
      const full =
        used <= (choice.least ?? 0) &&
        !availableChoices.some((other) => other.key.startsWith(`${choice.key}/`) || choice.key.startsWith(`${other.key}/`))
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
          if ((!hasModels || choice.optional) && option.count > (option.mutableMin ? 0 : option.min) && !full)
            yield replace({ ...counts, [option.id]: option.count - 1 })
        }
      }
    }
  }
}
