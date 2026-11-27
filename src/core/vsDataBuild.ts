import type { CombatCarrier } from './combatLoadout'
import type { ModelKind } from './modelKinds'
import { vsModelKinds } from './unitChoices'
import type { VsPick } from './roster'
import type { Counts, VsDataDefinitions } from './vsDataConstruction'
import { carried, modelCounts, type VsRosterUnit } from './vsDataRoster'

/**
 * A unit fielded by VS Data's definitions: its saved selections, its size, and what its models carry, by VS Data's
 * names. `carriers` are its models grouped by what each one carries, the shape the battle's model lines and the
 * simulator read; `unitWide` holds what the unit has rather than a model.
 */
export type VsBuiltUnit = {
  unit: VsRosterUnit
  size: { min: number; max: number; models: number; options?: number[] }
  carriers: CombatCarrier[]
  models: ModelKind[]
  wargear: { name: string; count: number }[]
}

type Line = { model: string; models: number; each: Map<string, number>; extra: Map<string, number> }

const add = (into: Map<string, number>, id: string, n: number) => into.set(id, (into.get(id) ?? 0) + n)
const bundled = (definitions: VsDataDefinitions, id: string) => Object.keys(definitions.get('wargear', id)?.data.includes ?? {}).length > 0

/** A bundle's contents in its place, as many deep as it nests, so wargear counts once under its own name. */
function leaves(definitions: VsDataDefinitions, counts: Counts, n = 1, into = new Map<string, number>()) {
  for (const [id, k] of Object.entries(counts)) {
    if (bundled(definitions, id)) leaves(definitions, definitions.get('wargear', id)!.data.includes!, n * k, into)
    else add(into, id, n * k)
  }
  return into
}

const holds = (each: ReadonlyMap<string, number>, lost: ReadonlyMap<string, number>) =>
  [...lost].every(([id, n]) => (each.get(id) ?? 0) >= n)

const changed = (each: ReadonlyMap<string, number>, lost: ReadonlyMap<string, number>, gained: ReadonlyMap<string, number>) => {
  const next = new Map(each)
  for (const [id, n] of lost) add(next, id, -n)
  for (const [id, n] of gained) add(next, id, n)
  return next
}

/**
 * The unit a VS pick fields. Each selection goes to one model of its option's carrier, taken from the largest group still
 * holding what it replaces, so "two of ten swap their bolter for a plasma gun" is two models apart from eight; a
 * selection no model can take, as a second piece one model holds, stays on its carrier's first group. An option without
 * a carrier belongs to the unit's only model, else to the model holding what it replaces, else to the unit.
 */
export function vsBuiltUnit(definitions: VsDataDefinitions, unitId: string, pick: VsPick): VsBuiltUnit {
  const unit = definitions.get('unit', unitId)
  const picked: VsRosterUnit = {
    unit: unitId,
    models: pick.models,
    options: pick.options,
    ...(pick.enhancement ? { enhancement: pick.enhancement } : {}),
    ...(pick.allegiance ? { allegiance: pick.allegiance } : {}),
    ...(pick.warlord ? { warlord: pick.warlord } : {}),
  }
  const models = definitions.modelsOf(unitId)
  const counts = modelCounts(definitions, picked)
  const lines: Line[] = models.flatMap((model) => {
    const count = counts.get(model.id) ?? 0
    return count > 0 ? [{ model: model.id, models: count, each: leaves(definitions, model.data.wargear), extra: new Map() }] : []
  })
  const unitWide = leaves(definitions, unit?.data.wargear ?? {})
  for (const option of definitions.optionsOf(unitId)) {
    const lost = leaves(definitions, option.data.replaces ?? {})
    const carrier =
      option.data.carrier ?? (models.length === 1 ? models[0]!.id : lines.find((line) => lost.size > 0 && holds(line.each, lost))?.model)
    for (const [choice, n] of Object.entries(pick.options[option.id] ?? {})) {
      if (!(n > 0)) continue
      const gained = leaves(definitions, { [choice]: 1 })
      if (carrier === undefined) {
        for (const [id, k] of gained) add(unitWide, id, k * n)
        continue
      }
      let left = n
      while (left > 0) {
        const line = lines
          .filter((candidate) => candidate.model === carrier && holds(candidate.each, lost))
          .reduce<Line | undefined>(
            (largest, candidate) => (!largest || candidate.models > largest.models ? candidate : largest),
            undefined,
          )
        if (!line) break
        const taking = Math.min(left, line.models)
        const each = changed(line.each, lost, gained)
        if (taking === line.models) line.each = each
        else {
          line.models -= taking
          lines.push({ model: carrier, models: taking, each, extra: new Map() })
        }
        left -= taking
      }
      const first = lines.find((line) => line.model === carrier)
      if (left > 0 && first) for (const [id, k] of changed(new Map(), lost, gained)) add(first.extra, id, k * left)
    }
  }

  const named = (held: ReadonlyMap<string, number>) => {
    const byName = new Map<string, number>()
    for (const [id, n] of held) add(byName, definitions.get('wargear', id)?.name ?? id, n)
    return [...byName].flatMap(([name, count]) => (count > 0 ? [{ name, count }] : []))
  }
  const totalOf = (line: Line) => {
    const total = new Map<string, number>()
    for (const [id, n] of line.each) add(total, id, n * line.models)
    for (const [id, n] of line.extra) add(total, id, n)
    return total
  }
  const nameOf = (modelId: string) => definitions.get('model', modelId)?.name ?? modelId
  const carriers: CombatCarrier[] = [
    ...lines.map((line) => ({ name: nameOf(line.model), models: line.models, weapons: named(totalOf(line)) })),
    ...(unitWide.size ? [{ name: unit?.name ?? unitId, models: 1, weapons: named(unitWide), unitWide: true }] : []),
  ]
  const held = new Map([...carried(definitions, picked)].filter(([id]) => !bundled(definitions, id)))
  const sizes = [...(unit?.data.sizes ?? [])].toSorted((left, right) => left - right)
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return {
    unit: picked,
    size: {
      min: sizes[0] ?? total,
      max: sizes.at(-1) ?? total,
      models: total,
      // A unit fielding every size between its smallest and largest steps by one model; any other steps between its sizes.
      ...(sizes.length > 1 && sizes.at(-1)! - sizes[0]! + 1 !== sizes.length ? { options: sizes } : {}),
    },
    carriers,
    models: vsModelKinds(definitions, picked),
    wargear: named(held),
  }
}
