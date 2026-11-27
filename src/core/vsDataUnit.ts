import type { Bounds, Counts, VsDataDefinitions } from './vsDataConstruction'
import { checkVsUnit, modelBounds, modelCounts, optionBounds, requirements, type VsProblem, type VsRosterUnit } from './vsDataRoster'

/**
 * One of a unit's options as the player meets it: its scaled bounds at the unit's size, what it replaces, and each choice
 * with how many are taken and the most its caps leave room for. `open` is false until the option it requires is taken.
 */
export type VsUnitOption = {
  id: string
  name: string
  carrier: string | null
  carriers: number
  bounds: Bounds
  taken: number
  replaces: Counts
  uniform: boolean
  substitutes: string[]
  open: boolean
  choices: { id: string; name: string; count: number; most: number }[]
}

const sum = (counts: Iterable<number>) => [...counts].reduce((total, n) => total + n, 0)
const sizeOf = (definitions: VsDataDefinitions, picked: VsRosterUnit) => sum(modelCounts(definitions, picked).values())

/** The unit as its datasheet first fields it, at its smallest size: its `defaultModels` and `defaults`, else each model's minimum. */
export function vsFirstFielding(definitions: VsDataDefinitions, unitId: string): VsRosterUnit {
  const unit = definitions.get('unit', unitId)
  if (!unit) return { unit: unitId }
  const smallest = Math.min(...unit.data.sizes)
  const models = Object.fromEntries(
    definitions.modelsOf(unitId).map((model) => [model.id, unit.data.defaultModels?.[model.id] ?? modelBounds(model.data, smallest).min]),
  )
  const options = unit.data.defaults ? structuredClone(unit.data.defaults) : {}
  return withMinima(definitions, { unit: unitId, models, options })
}

/** Every option of the unit at its current size and models. */
export function vsUnitOptions(definitions: VsDataDefinitions, picked: VsRosterUnit): VsUnitOption[] {
  const counts = modelCounts(definitions, picked)
  const total = sum(counts.values())
  const takenOf = (optionId: string, only?: readonly string[]) =>
    sum(Object.entries(picked.options?.[optionId] ?? {}).flatMap(([wargear, n]) => (!only || only.includes(wargear) ? [n] : [])))
  const groups = (definitions.get('unit', picked.unit)?.data.optionGroups ?? []).map((group) => {
    const carriers = group.carrier ? (counts.get(group.carrier) ?? 0) : total
    const blocks = carriers === 0 ? 0 : group.per === 'carrier' ? carriers : group.per ? Math.floor(total / group.per.models) : 1
    const most = group.bySize?.find((row) => row.size === total)?.max ?? group.max * blocks
    const taken = sum(group.options.map(({ option, choices, weight = 1 }) => weight * takenOf(option, choices)))
    return { members: group.options, room: most - taken }
  })
  return definitions.optionsOf(picked.unit).map((option) => {
    const { data } = option
    const carriers = data.carrier ? (counts.get(data.carrier) ?? 0) : total
    const chosen = picked.options?.[option.id] ?? {}
    const bounds = optionBounds(data, total, carriers)
    const caps = (data.caps ?? []).map((cap) => {
      const sized = cap.bySize?.find((row) => row.size === total)
      const blocks = carriers === 0 ? 0 : cap.per === 'carrier' ? carriers : cap.per ? Math.floor(total / cap.per.models) : 1
      return { choices: cap.choices, max: sized && carriers > 0 ? sized.max : cap.max * blocks }
    })
    const taken = sum(Object.values(chosen))
    return {
      id: option.id,
      name: option.name,
      carrier: data.carrier ?? null,
      carriers,
      bounds,
      taken,
      replaces: data.replaces ?? {},
      uniform: Boolean(data.uniform),
      substitutes: data.substitutes ?? [],
      open: requirements(data).every((requirement) =>
        requirement.choices.some((choice) => (picked.options?.[requirement.option]?.[choice] ?? 0) > 0),
      ),
      choices: data.choices.map((id) => {
        const count = chosen[id] ?? 0
        // Room the option and each cap on this choice leave, counting what is already taken of it.
        const capRoom = caps
          .filter((cap) => cap.choices.includes(id))
          .map((cap) => cap.max - sum(cap.choices.map((choice) => chosen[choice] ?? 0)) + count)
        const groupRoom = groups.flatMap(({ members, room }) => {
          const member = members.find(
            (candidate) => candidate.option === option.id && (!candidate.choices || candidate.choices.includes(id)),
          )
          return member ? [Math.floor(room / (member.weight ?? 1)) + count] : []
        })
        return {
          id,
          name: definitions.get('wargear', id)?.name ?? id,
          count,
          most: Math.min(bounds.max - taken + count, ...capRoom, ...groupRoom),
        }
      }),
    }
  })
}

/** The unit with an option's choices set to `counts`; a choice it leaves out is no longer taken. */
export function vsWithChoice(
  definitions: VsDataDefinitions,
  picked: VsRosterUnit,
  optionId: string,
  counts: Readonly<Record<string, number>>,
): VsRosterUnit {
  const options = { ...picked.options }
  const kept = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
  if (Object.keys(kept).length) options[optionId] = kept
  else delete options[optionId]
  return withoutClosed(definitions, { ...picked, options })
}

/**
 * The unit fielded at `size`: each model at its bounds for that size, the one model whose count is free taking the rest,
 * and every option trimmed to what the new size allows, its minimum met from its first choice.
 */
export function vsResized(definitions: VsDataDefinitions, picked: VsRosterUnit, size: number): VsRosterUnit {
  const models = definitions.modelsOf(picked.unit)
  const counts = modelCounts(definitions, picked)
  const next = new Map(models.map((model) => [model.id, clamp(counts.get(model.id) ?? 0, modelBounds(model.data, size))]))
  for (const model of models) {
    const over = size - sum(next.values())
    if (over === 0) break
    const bounds = modelBounds(model.data, size)
    next.set(model.id, clamp(next.get(model.id)! + over, bounds))
  }
  const resized = { ...picked, models: Object.fromEntries(next) }
  return withMinima(definitions, trimmed(definitions, resized))
}

/** What is wrong with the unit's models and wargear alone. */
export function vsUnitProblems(definitions: VsDataDefinitions, picked: VsRosterUnit): VsProblem[] {
  const problems: VsProblem[] = []
  checkVsUnit(definitions, picked, (code, message) => problems.push({ code, message }))
  return problems
}

/** How many models the unit fields. */
export const vsUnitSize = sizeOf

const clamp = (n: number, { min, max }: Bounds) => Math.min(Math.max(n, min), max)

/**
 * The unit cut, one selection at a time, to what its options, caps and option groups allow at its size: each cut takes
 * the last choice still past its room, so a shared limit loses only its overflow. A uniform option then holds all of
 * its one choice again.
 */
function trimmed(definitions: VsDataDefinitions, picked: VsRosterUnit): VsRosterUnit {
  let unit = picked
  for (;;) {
    const over = vsUnitOptions(definitions, unit)
      .flatMap((option) => option.choices.map((choice) => ({ option, choice })))
      .findLast(({ choice }) => choice.count > Math.max(choice.most, 0))
    if (!over) break
    const counts = Object.fromEntries(over.option.choices.map((choice) => [choice.id, choice.count]))
    counts[over.choice.id] = over.choice.count - 1
    unit = vsWithChoice(definitions, unit, over.option.id, counts)
  }
  // A cut that met one limit can leave room another cut made, so each choice takes back what it still fits.
  for (const option of vsUnitOptions(definitions, unit))
    for (const choice of option.choices) {
      const before = picked.options?.[option.id]?.[choice.id] ?? 0
      for (let count = choice.count + 1; count <= before; count++) {
        const held = unit.options?.[option.id] ?? {}
        const next = vsWithChoice(definitions, unit, option.id, { ...held, [choice.id]: count })
        if (vsUnitProblems(definitions, next).length > vsUnitProblems(definitions, unit).length) break
        unit = next
      }
    }
  for (const option of vsUnitOptions(definitions, unit)) {
    const held = option.uniform && option.choices.find((choice) => choice.count > 0 && !option.substitutes.includes(choice.id))
    if (!held) continue
    const counts = Object.fromEntries(option.choices.map((choice) => [choice.id, choice.count]))
    counts[held.id] = option.bounds.max - sum(option.substitutes.map((id) => counts[id] ?? 0))
    unit = vsWithChoice(definitions, unit, option.id, counts)
  }
  return unit
}

/** Each open option with a minimum takes its first choice for the selections it lacks. */
function withMinima(definitions: VsDataDefinitions, picked: VsRosterUnit): VsRosterUnit {
  let unit = picked
  for (const option of vsUnitOptions(definitions, unit)) {
    const lacking = option.bounds.min - option.taken
    if (lacking <= 0 || !option.open) continue
    const first = option.choices[0]
    if (!first) continue
    const counts = Object.fromEntries(option.choices.map((choice) => [choice.id, choice.count]))
    counts[first.id] = counts[first.id]! + (option.uniform ? option.bounds.max - option.taken : lacking)
    unit = vsWithChoice(definitions, unit, option.id, counts)
  }
  return unit
}

/** The unit without the options whose requirement it no longer takes. */
function withoutClosed(definitions: VsDataDefinitions, picked: VsRosterUnit): VsRosterUnit {
  const closed = vsUnitOptions(definitions, picked).filter((option) => !option.open && option.taken > 0)
  if (!closed.length) return picked
  const options = { ...picked.options }
  for (const option of closed) delete options[option.id]
  return withoutClosed(definitions, { ...picked, options })
}
