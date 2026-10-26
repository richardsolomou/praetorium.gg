import { type Dispatch, type SetStateAction, useCallback, useMemo, useRef, useState } from 'react'
import { withoutUnit } from '../../../../core/attachedUnits'
import type { RosterPick } from '../../../../core/roster'
import { type UnavailableSelection, withoutUnavailableSelections } from '../../../../core/rosterSelections'
import { isUnitCompositionChoice } from '../../../../core/unitChoices'
import { type KeyedPick, positionedAnnotatedPicks, positionedPicks } from '../rosterPicks'
import { pressedCounts, type SpreadUpdate } from './loadoutModel'

/**
 * A group told to hold nothing holds nothing, however it came to be filled.
 *
 * The same group can be answered as one chosen option or as a spread of counts, and
 * only one of those is a choice. Clearing the choice alone left the count behind,
 * which put the option straight back — the button emptied the group and the group
 * refilled itself, so nothing on screen moved. Anything recorded under the group's
 * own options goes too: those describe a loadout that is no longer carried.
 */
function emptied(spreads: Record<string, Record<string, number>> | undefined, key: string) {
  if (!spreads) return spreads
  const entries = Object.entries(spreads).filter(([stored]) => stored !== key && !stored.startsWith(`${key}/`))
  return entries.length === Object.keys(spreads).length ? spreads : Object.fromEntries(entries)
}

/**
 * A group saved as one chosen option or as counts, never both: spreads apply after
 * choices, so a stale spread silently overruled the option just chosen.
 */
function without<T>(entries: Record<string, T> | undefined, key: string) {
  if (!entries || !Object.hasOwn(entries, key)) return entries
  const { [key]: _removed, ...rest } = entries
  return rest
}

function withoutEmbark<T extends RosterPick>(pick: T): T {
  if (pick.embarkedIn === undefined) return pick
  const { embarkedIn: _embarkedIn, ...rest } = pick
  return rest as T
}

/** A character embarks with the unit it joins, so its own starting embark goes. */
const joining = <T extends RosterPick>(pick: T, host: number): T => ({ ...withoutEmbark(pick), attachedTo: host })

/** Only what an edit needs to read back off the priced list. */
type SizedUnit = {
  size: { models: number; min: number; max: number; options?: number[] }
  toggles: { key: string; name: string }[]
  choices: {
    key: string
    name?: string
    optional?: boolean
    room?: number
    options: { id: string; name?: string; count: number; min?: number; default?: boolean }[]
  }[]
  models?: { members: { choiceKey: string | null }[] }[]
}

/**
 * Saved model counts moved with the squad's size, so they still describe every body.
 *
 * Counts start from what the unit was built with, which is what the player saw. A
 * squad grows into its default loadout and shrinks out of it first, then out of the
 * largest remaining loadout and finally out of specialists filed under it. Groups the
 * pick never saved are left to the build.
 */
function resizedSpreads(unit: SizedUnit, saved: Record<string, Record<string, number>>, change: number) {
  const bodies = unit.choices.filter((choice) =>
    unit.models?.some((model) => model.members.some((member) => member.choiceKey === choice.key)),
  )
  const squad = bodies.find((choice) => !choice.optional && saved[choice.key])
  if (!squad || !change) return saved
  const counts = (choice: SizedUnit['choices'][number]) => Object.fromEntries(choice.options.map((option) => [option.id, option.count]))
  const next = { ...saved, [squad.key]: counts(squad) }
  const ordered = (choice: SizedUnit['choices'][number]) =>
    choice.options
      .map((option) => ({ ...option, count: next[choice.key]?.[option.id] ?? option.count }))
      .toSorted((one, other) => Number(Boolean(other.default)) - Number(Boolean(one.default)) || other.count - one.count)
  if (change > 0) {
    const receiver = ordered(squad)[0]
    if (receiver) next[squad.key] = { ...next[squad.key], [receiver.id]: receiver.count + change }
    return next
  }
  let removing = -change
  for (const group of [squad, ...bodies.filter((choice) => choice.optional && choice.key.startsWith(`${squad.key}/`))]) {
    for (const option of ordered(group)) {
      const taken = Math.min(removing, Math.max(0, option.count - (option.min ?? 0)))
      if (!taken) continue
      next[group.key] = { ...(next[group.key] ?? counts(group)), [option.id]: option.count - taken }
      removing -= taken
    }
  }
  return next
}

export function canAddCopy(entryId: string, held: number, limits: ReadonlyMap<string, number | null>) {
  const limit = limits.get(entryId)
  return limit !== undefined && (limit === null || held < limit)
}

type Held = Readonly<Record<string, number>>

/** Copies of `batch[at]`'s datasheet once `before` and the picks ahead of it in `batch` are added to those `held`. */
export const heldWith = (held: Held, batch: readonly { entryId: string }[], at: number, before: readonly { entryId: string }[] = []) =>
  (held[batch[at]!.entryId] ?? 0) + [...before, ...batch.slice(0, at)].filter((pick) => pick.entryId === batch[at]!.entryId).length

/** Whether every pick in `batch` fits the unit limits, each counted after the ones ahead of it. */
export const batchFits = (
  batch: readonly { entryId: string }[],
  held: Held,
  limits: ReadonlyMap<string, number | null>,
  before: readonly { entryId: string }[] = [],
) => batch.every((pick, at) => canAddCopy(pick.entryId, heldWith(held, batch, at, before), limits))

export function unitLimitMessage(entryId: string, held: number, limits: ReadonlyMap<string, number | null>) {
  const limit = limits.get(entryId)
  if (limit === undefined) return 'Checking unit limits…'
  if (limit === null || held < limit) return null
  return limit === 0
    ? 'No copies available with the current detachments and prerequisite units.'
    : `Limit reached: ${held} of ${limit} permitted copies in the roster.`
}

/** The roster unit a newly added unit joins, or the one that joins it. */
export type AttachLink = { joins: number } | { joinedBy: number }

type RequestedUnit = { kind: 'pending' } | { kind: 'add' } | { kind: 'refused'; reason: 'limit' | 'not_offered'; message: string }

/** A unit asked for from outside the builder waits for the roster's own limits, then gets the picker's answer. */
export function requestedUnit(entryId: string, held: number, limits: ReadonlyMap<string, number | null> | null): RequestedUnit {
  if (!limits) return { kind: 'pending' }
  if (canAddCopy(entryId, held, limits)) return { kind: 'add' }
  const message = limits.has(entryId) ? unitLimitMessage(entryId, held, limits) : null
  return message
    ? { kind: 'refused', reason: 'limit', message }
    : { kind: 'refused', reason: 'not_offered', message: 'This roster’s army does not include that unit.' }
}

/**
 * The list being edited, in the two shapes the builder reads it in.
 *
 * Picks carry their own key: the same datasheet may legitimately appear twice, so a
 * key is the only thing that tells two of them apart while they are being moved
 * around. Everything the picks are sent to counts positions instead, which is what
 * `positioned` is for — the price and the datasheet — and `annotated` adds the
 * nicknames and notes a saved row keeps.
 */
export function usePicks(initial: readonly RosterPick[]) {
  const [picks, setPicks] = useState<KeyedPick[]>(() => initial.map((pick, key) => ({ ...pick, key })))
  const nextKey = useRef(initial.length)
  const allocateKey = useCallback(() => nextKey.current++, [])
  const resetPicks = useCallback((saved: readonly RosterPick[]) => {
    nextKey.current = saved.length
    setPicks(saved.map((pick, key) => ({ ...pick, key })))
  }, [])
  const positioned = useMemo(() => positionedPicks(picks), [picks])
  const annotated = useMemo(() => positionedAnnotatedPicks(picks), [picks])
  /** How many of each datasheet the list already holds, so the picker can say so. */
  const held = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const pick of picks) counts[pick.entryId] = (counts[pick.entryId] ?? 0) + 1
    return counts
  }, [picks])

  return { picks, setPicks, resetPicks, positioned, annotated, held, allocateKey }
}

/**
 * The pick that should be the army's one Warlord, when the list says otherwise.
 *
 * A unit the data requires as Warlord takes it from everyone else. Otherwise two crowns
 * keep the one added first, and with `fill` an empty list crowns the eligible unit added
 * first, which the ever-increasing keys record. `fill` is only set when units arrive or
 * leave, so a Warlord the player takes away deliberately stays away.
 */
export function settledWarlord(
  picks: readonly KeyedPick[],
  units: readonly ({ toggles: readonly { key: string; name: string; selected?: boolean; required?: boolean }[] } | undefined)[],
  fill: boolean,
) {
  const warlords = units.flatMap((unit, index) => {
    const toggle = unit?.toggles.find((candidate) => candidate.name === 'Warlord')
    const key = picks[index]?.key
    return toggle && key !== undefined ? [{ index, key, toggle }] : []
  })
  const first = (eligible: typeof warlords) =>
    eligible.reduce<(typeof warlords)[number] | undefined>(
      (earliest, entry) => (earliest && earliest.key < entry.key ? earliest : entry),
      undefined,
    )
  const selected = warlords.filter((entry) => entry.toggle.selected)
  const chosen = first(warlords.filter((entry) => entry.toggle.required)) ?? first(selected) ?? (fill ? first(warlords) : undefined)
  if (!chosen || (selected.length === 1 && selected[0]!.index === chosen.index)) return null
  return { index: chosen.index, toggle: chosen.toggle.key }
}

/**
 * Every edit a player can make to the list.
 *
 * A plain factory rather than a hook, so it can be handed the priced list — which is
 * the server's answer to these very picks, and therefore only known after they are.
 */
export function pickEditor(
  setPicks: Dispatch<SetStateAction<KeyedPick[]>>,
  context: { catalogueId: string; units: readonly (SizedUnit | undefined)[]; limits?: ReadonlyMap<string, number | null> },
  allocateKey: () => number,
) {
  const editAt = (index: number, edit: (pick: KeyedPick) => KeyedPick) =>
    setPicks((current) => current.map((pick, at) => (at === index ? edit(pick) : pick)))

  /** Keys only move forward, so history cannot mistake a replacement for a deleted unit. */
  const insert = (choose: (picks: readonly KeyedPick[]) => { pick: RosterPick; after?: number } | null) => {
    const key = allocateKey()
    setPicks((current) => {
      const chosen = choose(current)
      if (!chosen) return current
      const keyed = { ...chosen.pick, key }
      const { after } = chosen
      return after === undefined ? [...current, keyed] : [...current.slice(0, after + 1), keyed, ...current.slice(after + 1)]
    })
  }

  return {
    /** A linked unit is added already joined to, or joined by, the unit it was chosen for. */
    add: (entryId: string, link?: AttachLink) => {
      const key = allocateKey()
      setPicks((current) => {
        if (!context.limits || !canAddCopy(entryId, current.filter((pick) => pick.entryId === entryId).length, context.limits))
          return current
        const partner = link && ('joins' in link ? link.joins : link.joinedBy)
        if (partner !== undefined && !current.some((pick) => pick.key === partner)) return current
        const added: KeyedPick = {
          entryId,
          catalogueId: context.catalogueId,
          key,
          ...(link && 'joins' in link ? { attachedTo: link.joins } : {}),
        }
        const rest = link && 'joinedBy' in link ? current.map((pick) => (pick.key === link.joinedBy ? joining(pick, key) : pick)) : current
        return [...rest, added]
      })
    },

    /**
     * A saved loadout joins as units of its own, priced and checked like any other, its attached
     * units already joined. It is added whole or not at all.
     */
    apply: (loadout: readonly RosterPick[]) => {
      const keys = loadout.map(() => allocateKey())
      setPicks((current) => {
        const { limits } = context
        if (!limits) return current
        const added = loadout.map((pick, at) => ({
          ...pick,
          key: keys[at] as number,
          attachedTo: at === 0 || pick.attachedTo === undefined ? undefined : keys[pick.attachedTo],
        }))
        return batchFits(added, {}, limits, current) ? [...current, ...added] : current
      })
    },

    /** A copy takes the loadout; the nickname, note and seat in a transport belong to the unit it was copied from. */
    duplicate: (index: number) =>
      insert((current) => {
        const pick = current[index]
        if (
          !pick ||
          !context.limits ||
          !canAddCopy(pick.entryId, current.filter((unit) => unit.entryId === pick.entryId).length, context.limits)
        )
          return null
        const { nickname: _nickname, note: _note, embarkedIn: _embarkedIn, ...copy } = pick
        return { pick: copy, after: index }
      }),

    /** Everything standing with the dropped unit is left standing alone, never pointing at a gap. */
    drop: (index: number) =>
      setPicks((current) => {
        const going = current[index]?.key
        if (going === undefined) return current
        return withoutUnit(current, going).map((standing) => (standing.embarkedIn === going ? withoutEmbark(standing) : standing))
      }),

    resize: (index: number, step: (models: number) => number) =>
      editAt(index, (pick) => {
        const unit = context.units[index]
        const models = step(pick.models ?? unit?.size.models ?? 0)
        const compositions = unit?.size.options?.length
          ? unit.choices.filter((choice) => isUnitCompositionChoice({ name: choice.name ?? '', options: choice.options }))
          : []
        const inside = (key: string) => compositions.some((choice) => key === choice.key || key.startsWith(`${choice.key}/`))
        const equipment = unit?.choices.filter((choice) => inside(choice.key) && !compositions.includes(choice)) ?? []
        const sized = unit ? Math.min(Math.max(models, unit.size.min), unit.size.max) : models
        return {
          ...pick,
          models: sized,
          ...(unit && pick.spreads && !compositions.length
            ? { spreads: resizedSpreads(unit, pick.spreads, sized - unit.size.models) }
            : {}),
          ...(compositions.length
            ? {
                choices: Object.fromEntries(Object.entries(pick.choices ?? {}).filter(([key]) => !inside(key))),
                spreads: Object.fromEntries([
                  ...Object.entries(pick.spreads ?? {}).filter(([key]) => !inside(key)),
                  ...equipment.map((choice) => [
                    choice.key,
                    pick.spreads?.[choice.key] ?? Object.fromEntries(choice.options.map((option) => [option.id, option.count])),
                  ]),
                ]),
              }
            : {}),
        }
      }),

    choose: (index: number, key: string, optionId: string) =>
      editAt(index, (pick) => {
        const choices = { ...pick.choices }
        if (optionId) choices[key] = optionId
        else delete choices[key]
        return { ...pick, choices, spreads: optionId ? without(pick.spreads, key) : emptied(pick.spreads, key) }
      }),

    /** How many of each option a group holds, leaving the unit's other groups alone. */
    spread: (index: number, key: string, update: SpreadUpdate) =>
      editAt(index, (pick) => {
        const unit = context.units[index]
        const current = pressedCounts(unit?.choices.find((choice) => choice.key === key) ?? { options: [] }, pick.spreads?.[key])
        const counts = update(current)
        if (!counts) return pick
        return {
          ...pick,
          models: pick.models ?? unit?.size.models,
          choices: without(pick.choices, key),
          spreads: { ...pick.spreads, [key]: { ...current, ...counts } },
        }
      }),

    /**
     * A toggle on one unit. The warlord is the army's one warlord, so claiming it
     * gives up every other claim rather than leaving two on the list.
     */
    toggle: (index: number, key: string, name: string, enabled: boolean) =>
      setPicks((current) =>
        current.map((pick, at) => {
          const toggles = { ...pick.toggles }
          if (name === 'Warlord' && enabled) {
            for (const candidate of context.units[at]?.toggles ?? []) if (candidate.name === name) toggles[candidate.key] = 0
          }
          return at === index ? { ...pick, toggles: { ...toggles, [key]: enabled ? 1 : 0 } } : { ...pick, toggles }
        }),
      ),

    join: (index: number, targetKey: number | undefined) =>
      editAt(index, (pick) => (targetKey === undefined ? { ...pick, attachedTo: undefined } : joining(pick, targetKey))),

    /** Where the unit with this key starts: in the transport with that key, or on the battlefield. */
    embark: (key: number, transportKey: number | undefined) =>
      setPicks((current) =>
        current.map((pick) =>
          pick.key !== key ? pick : transportKey === undefined ? withoutEmbark(pick) : { ...pick, embarkedIn: transportKey },
        ),
      ),

    /** Starting embarks the list can no longer hold, put back on the battlefield together. */
    disembark: (keys: readonly number[]) =>
      setPicks((current) => current.map((pick) => (keys.includes(pick.key) ? withoutEmbark(pick) : pick))),

    /** An emptied field is removed rather than saved blank. */
    annotate: (index: number, field: 'nickname' | 'note', value: string) =>
      editAt(index, (pick) => {
        const { [field]: _previous, ...rest } = pick
        return value.trim() ? { ...rest, [field]: value } : rest
      }),

    /** Selections pricing reported unavailable, which the editor offers no option to clear. */
    resetUnavailable: (unavailable: readonly UnavailableSelection[]) =>
      setPicks((current) => current.map((pick, at) => withoutUnavailableSelections(pick, at, unavailable))),

    /** A new faction is a new list: nothing picked from the old book still applies. */
    clear: () => setPicks([]),
  }
}
