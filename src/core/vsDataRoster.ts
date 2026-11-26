import type { Definition, Per, Requirement, UnitData, VsDataDefinitions, When, OptionData, Bounds } from './vsDataConstruction'
import { costRowFor, pointsAt, type PointsRef, unitCostRows } from './vsDataPoints'

/**
 * A list in VS Data catalogue IDs (VS Data's `docs/roster-definitions.md`, "Saved rosters"): model counts by model ID,
 * taken wargear by option ID, the warlord's model ID and the allegiance taken.
 */
export type VsRosterUnit = {
  unit: string
  /**
   * The unit's model count where its models and wargear are not read into VS Data's: only its size is checked then, as
   * when the catalogue still builds the unit.
   */
  size?: number
  models?: Record<string, number>
  options?: Record<string, Record<string, number>>
  enhancement?: string
  warlord?: string
  allegiance?: string
}
export type VsRoster = { faction: string; detachments: string[]; battleSize?: string; units: VsRosterUnit[] }

export type VsProblemCode =
  | 'not-current'
  | 'missing-definition'
  | 'detachment-faction'
  | 'unit-faction'
  | 'unit-model'
  | 'model-count'
  | 'model-group-count'
  | 'unit-size'
  | 'unit-composition'
  | 'unit-option'
  | 'option-choice'
  | 'option-count'
  | 'option-quantity'
  | 'option-uniform'
  | 'option-cap'
  | 'option-unavailable'
  | 'option-group-count'
  | 'enhancement-detachment'
  | 'enhancement-keywords'
  | 'enhancement-repeated'
  | 'roster-limit'
  | 'unit-limit'
  | 'warlord-repeated'
  | 'warlord-ineligible'
  | 'warlord-required'
  | 'enhancement-limit'
  | 'unit-excluded'
  | 'ally-detachment'
  | 'ally-points'
  | 'ally-limit'
  | 'ally-enhancement'
  | 'detachment-group'
  | 'detachment-count'
  | 'detachment-repeated'
  | 'allegiance-missing'
  | 'allegiance-choice'
  | 'allegiance-requires'
  | 'allegiance-limit'
/** `unit` is the position in the roster, absent for the roster as a whole. */
export type VsProblem = { code: VsProblemCode; unit?: number; message: string }

/** What each unit costs, and what the roster's Detachments cost, with every item VS Data does not price named. */
export type VsRosterPrice = {
  units: { points: number; unpriced: string[] }[]
  points: number
  detachmentPoints: number
  unpriced: string[]
}

export const requirements = (option: OptionData): Requirement[] => (option.requires === undefined ? [] : [option.requires].flat())

export const modelBounds = (model: Bounds & { bySize?: (Bounds & { size: number })[] }, size: number): Bounds =>
  model.bySize?.find((bounds) => bounds.size === size) ?? model

/** How many times a bound scaled by `per` applies in a unit of `total` models, `carriers` of which can take the option. */
const blocks = (per: Per | undefined, total: number, carriers: number) =>
  carriers === 0 ? 0 : per === 'carrier' ? carriers : per ? Math.floor(total / per.models) : 1

/** How many wargear selections an option takes in a unit of `total` models, `carriers` of which can take it. */
export function optionBounds(option: OptionData, total: number, carriers: number): Bounds {
  const sized = option.bySize?.find(({ size }) => size === total)
  if (sized && carriers > 0) return { min: sized.min, max: sized.max }
  const n = blocks(option.per, total, carriers)
  return { min: option.choose.min * n, max: option.choose.max * n }
}

function holds(when: When | undefined, roster: VsRoster, allegiance?: string): boolean {
  if (!when) return true
  return (
    (when.allegiance === undefined || when.allegiance === allegiance) &&
    (when.faction === undefined || when.faction === roster.faction) &&
    (when.detachment === undefined || roster.detachments.includes(when.detachment)) &&
    (when.warlord === undefined || roster.units.some((unit) => unit.warlord === when.warlord))
  )
}

/** A unit's keywords in this roster: its own and every conditional keyword whose condition holds. */
export function unitKeywords(unit: UnitData, roster: VsRoster, allegiance?: string): string[] {
  return [
    ...new Set([
      ...unit.keywords,
      ...(unit.conditionalKeywords ?? []).filter((conditional) => holds(conditional.when, roster, allegiance)).flatMap((c) => c.keywords),
    ]),
  ]
}

const holdsAll = (keywords: readonly string[], wanted: readonly string[]) => wanted.every((keyword) => keywords.includes(keyword))
const upper = (keywords: readonly string[]) => keywords.map((keyword) => keyword.toUpperCase())

/** The unit's model counts, an omitted model at its `min`. */
export function modelCounts(definitions: VsDataDefinitions, picked: VsRosterUnit): Map<string, number> {
  return new Map(
    definitions
      .modelsOf(picked.unit)
      .map((model) => [model.id, picked.models && Object.hasOwn(picked.models, model.id) ? picked.models[model.id]! : model.data.min]),
  )
}

/** How many of each wargear the unit carries: its models' and its own, changed by the options it takes, bundles expanded. */
export function carried(definitions: VsDataDefinitions, picked: VsRosterUnit): Map<string, number> {
  const held = new Map<string, number>()
  const carry = (id: string, n: number) => {
    held.set(id, (held.get(id) ?? 0) + n)
    for (const [inner, k] of Object.entries(definitions.get('wargear', id)?.data.includes ?? {})) carry(inner, n * k)
  }
  const counts = modelCounts(definitions, picked)
  for (const model of definitions.modelsOf(picked.unit))
    for (const [id, n] of Object.entries(model.data.wargear)) carry(id, n * (counts.get(model.id) ?? 0))
  for (const [id, n] of Object.entries(definitions.get('unit', picked.unit)?.data.wargear ?? {})) carry(id, n)
  for (const option of definitions.optionsOf(picked.unit)) {
    for (const [id, n] of Object.entries(picked.options?.[option.id] ?? {})) {
      if (!(n > 0)) continue
      carry(id, n)
      for (const [replaced, k] of Object.entries(option.data.replaces ?? {})) carry(replaced, -n * k)
    }
  }
  return held
}

/** Whether an Enhancement's eligibility admits this unit, before the roster's Warlord is considered. */
export function enhancementAdmits(
  definitions: VsDataDefinitions,
  enhancement: Definition<'enhancement'>,
  picked: VsRosterUnit,
  keywords: readonly string[],
): boolean {
  const unit = definitions.get('unit', picked.unit)
  if (!unit || unit.data.enhancements === false) return false
  const held = upper(keywords)
  const { eligibility } = enhancement.data
  if (!eligibility.nonCharacters && !held.includes('CHARACTER')) return false
  if (!eligibility.epicHeroes && held.includes('EPIC HERO')) return false
  if ((eligibility.excludedKeywords ?? []).some((keyword) => held.includes(keyword.toUpperCase()))) return false
  const matches = eligibility.anyOf.some(
    (entry) =>
      (!entry.unit || entry.unit.id === picked.unit) &&
      holdsAll(held, upper(entry.keywords ?? [])) &&
      holdsAll(held, upper(entry.factionKeywords ?? [])),
  )
  if (!matches) return false
  // A unit read by its size alone has no wargear read, so what it carries is the catalogue's to check.
  if (picked.size !== undefined && !picked.models) return true
  const carrying = carried(definitions, picked)
  const names = new Set([...carrying].filter(([, n]) => n > 0).map(([id]) => (definitions.get('wargear', id)?.name ?? id).toLowerCase()))
  return (eligibility.requiredWargear ?? []).every((name) => names.has(name.toLowerCase()))
}

/** The names a cost row may give the roster's army by: its faction's and its parent's, as named and as their IDs read. */
function armiesOf(definitions: VsDataDefinitions, faction: string) {
  const parent = definitions.get('faction', faction)?.data.parent
  return [faction, ...(parent ? [parent] : [])].flatMap((id) => [id.replaceAll('-', ' '), definitions.get('faction', id)?.name ?? id])
}

/** The price of every unit and the roster's Detachments under the rules version's points snapshots. */
export function priceVsRoster(definitions: VsDataDefinitions, roster: VsRoster): VsRosterPrice {
  const copies = new Map<string, number>()
  const unpriced: string[] = []
  const units = roster.units.map((picked) => {
    const missing: string[] = []
    const price = (ref: PointsRef, label: string) => {
      const found = pointsAt(definitions.points, ref)
      if (found.ok) return found.points
      missing.push(`${label} (${found.reason})`)
      return 0
    }
    const unit = definitions.get('unit', picked.unit)
    if (!unit) return { points: 0, unpriced: [`unit:${picked.unit} (missing-definition)`] }
    copies.set(unit.id, (copies.get(unit.id) ?? 0) + 1)
    const copy = copies.get(unit.id)!
    const total = [...modelCounts(definitions, picked).values()].reduce((sum, n) => sum + n, 0)
    const counts = modelCounts(definitions, picked)
    const rows = (unitCostRows(definitions.points, unit.data.faction, unit.id, copy) ?? []).filter((row) => row.models === total)
    const row =
      rows.length > 1
        ? costRowFor(rows, {
            detachments: roster.detachments.map((id) => definitions.get('detachment', id)?.name ?? id),
            armies: armiesOf(definitions, roster.faction),
            models: definitions
              .modelsOf(unit.id)
              .map((model) => `${counts.get(model.id) ?? 0} ${model.name}`)
              .join(', '),
          })
        : undefined
    const unitPoints =
      rows.length > 1
        ? typeof row?.points === 'number'
          ? row.points
          : (missing.push(`unit:${unit.id} at ${total} (ambiguous-size)`), 0)
        : price({ kind: 'unit', faction: unit.data.faction, unit: unit.id, models: total, copy }, `unit:${unit.id} at ${total}`)
    const enhancement = picked.enhancement ? definitions.get('enhancement', picked.enhancement) : undefined
    const enhancementFaction = enhancement ? (definitions.get('detachment', enhancement.data.detachment)?.data.faction ?? '') : ''
    const points =
      unitPoints +
      (enhancement
        ? price(
            { kind: 'enhancement', faction: enhancementFaction, detachment: enhancement.data.detachment, enhancement: enhancement.id },
            `enhancement:${enhancement.id}`,
          )
        : 0) +
      // A priced item costs for every one the unit carries, by default or through a bundle as much as by its own choice.
      [...carried(definitions, picked)].reduce((sum, [item, n]) => {
        if (!(n > 0)) return sum
        const found = pointsAt(definitions.points, { kind: 'wargear', faction: unit.data.faction, unit: unit.id, item })
        return sum + (found.ok ? n * found.points : 0)
      }, 0)
    unpriced.push(...missing)
    return { points, unpriced: missing }
  })
  const detachmentPoints = roster.detachments.reduce((sum, id) => {
    const detachment = definitions.get('detachment', id)
    if (!detachment) return sum
    const found = pointsAt(definitions.points, { kind: 'detachment', faction: detachment.data.faction, detachment: id })
    if (!found.ok) unpriced.push(`detachment:${id} (${found.reason})`)
    return sum + (found.ok ? found.points : 0)
  }, 0)
  return { units, points: units.reduce((sum, unit) => sum + unit.points, 0), detachmentPoints, unpriced }
}

/** What is wrong with one unit's models and wargear alone, whatever the roster around it. */
export function checkVsUnit(definitions: VsDataDefinitions, picked: VsRosterUnit, add: (code: VsProblemCode, message: string) => void) {
  const unit = definitions.get('unit', picked.unit)
  if (!unit) return add('missing-definition', `unit:${picked.unit} has no definition`)
  const models = definitions.modelsOf(unit.id)
  const counts = modelCounts(definitions, picked)
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  for (const model of models) {
    const count = counts.get(model.id)!
    const { min, max } = modelBounds(model.data, total)
    if (!Number.isSafeInteger(count) || count < min || count > max)
      add('model-count', `${model.name} needs ${min}-${max} models, has ${count}`)
  }
  for (const group of unit.data.modelGroups ?? []) {
    const count = group.models.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0)
    const { min, max } = modelBounds(group, total)
    if (count < min || count > max) {
      const names = group.models.map((id) => definitions.get('model', id)?.name ?? id)
      add('model-group-count', `${names.join(', ')} together need ${min}-${max} models, have ${count}`)
    }
  }
  if (!unit.data.sizes.includes(total)) add('unit-size', `${unit.name} fields ${unit.data.sizes.join(' or ')} models, has ${total}`)
  const fits = (composition: Record<string, Bounds>) =>
    models.every(
      (model) => counts.get(model.id)! >= (composition[model.id]?.min ?? 0) && counts.get(model.id)! <= (composition[model.id]?.max ?? 0),
    )
  if (unit.data.compositions && !unit.data.compositions.some(fits))
    add('unit-composition', `${unit.name} fields its models in none of its compositions`)

  const options = definitions.optionsOf(unit.id)
  for (const [id, chosen] of Object.entries(picked.options ?? {})) {
    if (!definitions.get('roster-option', id)) {
      add('missing-definition', `roster-option:${id} has no definition`)
      continue
    }
    const option = options.find((candidate) => candidate.id === id)
    if (!option) {
      add('unit-option', `roster-option:${id} is not offered to ${unit.name}`)
      continue
    }
    const selections = Object.entries(chosen)
    if (selections.some(([, n]) => !Number.isSafeInteger(n) || n < 0))
      add('option-quantity', `${option.name} needs non-negative whole counts`)
    for (const [wargear] of selections.filter(([, n]) => n > 0))
      if (!option.data.choices.includes(wargear)) add('option-choice', `${option.name} does not offer wargear:${wargear}`)
  }
  const takenOf = (optionId: string, only?: readonly string[]) =>
    Object.entries(picked.options?.[optionId] ?? {})
      .filter(([wargear, n]) => n > 0 && (!only || only.includes(wargear)))
      .reduce((sum, [, n]) => sum + n, 0)
  for (const option of options) {
    const carriers = option.data.carrier ? (counts.get(option.data.carrier) ?? 0) : total
    const { min, max } = optionBounds(option.data, total, carriers)
    const taken = takenOf(option.id)
    const substitutes = option.data.substitutes ?? []
    const substituted = takenOf(option.id, substitutes)
    const kinds = Object.entries(picked.options?.[option.id] ?? {}).filter(([w, n]) => n > 0 && !substitutes.includes(w)).length
    if (taken < min || taken > max) add('option-count', `${option.name} takes ${min}-${max}, has ${taken}`)
    else if (option.data.uniform && (kinds > 1 || (taken > substituted && taken !== max)))
      add('option-uniform', `${option.name} is taken ${max} times with one choice besides its substitutes, or not at all`)
    for (const cap of option.data.caps ?? []) {
      const sized = cap.bySize?.find((row) => row.size === total)
      const most = sized && carriers > 0 ? sized.max : cap.max * blocks(cap.per, total, carriers)
      const capped = takenOf(option.id, cap.choices)
      if (capped > most)
        add('option-cap', `${option.name} takes at most ${most} of ${cap.choices.map((w) => `wargear:${w}`).join(', ')}, has ${capped}`)
    }
    for (const requirement of requirements(option.data))
      if (taken > 0 && takenOf(requirement.option, requirement.choices) === 0)
        add(
          'option-unavailable',
          `${option.name} needs one of ${requirement.choices.map((w) => `wargear:${w}`).join(', ')} from roster-option:${requirement.option}`,
        )
  }
  for (const group of unit.data.optionGroups ?? []) {
    const taken = group.options.reduce((sum, { option, choices, weight = 1 }) => sum + weight * takenOf(option, choices), 0)
    const carriers = group.carrier ? (counts.get(group.carrier) ?? 0) : total
    const most = group.bySize?.find((row) => row.size === total)?.max ?? group.max * blocks(group.per, total, carriers)
    const least = (group.min ?? 0) * blocks(group.per, total, carriers)
    const names = group.options.map(({ option }) => `roster-option:${option}`).join(', ')
    if (taken > most) add('option-group-count', `${names} together take at most ${most}, have ${taken}`)
    else if (taken < least) add('option-group-count', `${names} together take at least ${least}, have ${taken}`)
  }
}

/**
 * Every reason the roster is not legal under these definitions, in roster order: VS Data's `checkRoster`
 * (`src/roster-definitions/roster.ts`), with Enhancement eligibility read from each Enhancement's rule facts. The
 * points limit and the Detachment points budget are format rules a roster may waive, so `battleFormat.ts` checks them.
 */
export function checkVsRoster(definitions: VsDataDefinitions, roster: VsRoster, price = priceVsRoster(definitions, roster)): VsProblem[] {
  const problems: VsProblem[] = []
  const current = (kind: Parameters<VsDataDefinitions['get']>[0], id: string, unit?: number) => {
    if (definitions.get(kind, id)) return true
    const gone = kind === 'unit' && definitions.unavailable.has(id)
    problems.push({
      code: gone ? 'not-current' : 'missing-definition',
      ...(unit === undefined ? {} : { unit }),
      message: gone ? `${kind}:${id} is not in this rules version` : `${kind}:${id} has no definition`,
    })
    return false
  }
  const rosterProblem = (code: VsProblemCode, message: string) => problems.push({ code, message })
  const battleSize = roster.battleSize && current('battle-size', roster.battleSize) ? roster.battleSize : undefined
  const size = battleSize ? definitions.get('battle-size', battleSize)!.data : undefined
  const faction = current('faction', roster.faction) ? definitions.get('faction', roster.faction)!.data : undefined
  const own = new Set([roster.faction, ...(faction?.parent ? [faction.parent] : [])])
  const detachmentIds = roster.detachments
  if (detachmentIds.length === 0 || detachmentIds.length > 3)
    rosterProblem('detachment-count', `a roster has one to three detachments, has ${detachmentIds.length}`)
  for (const [at, id] of detachmentIds.entries())
    if (detachmentIds.indexOf(id) < at) rosterProblem('detachment-repeated', `detachment:${id} is listed more than once`)
  const detachments = [...new Set(detachmentIds)].filter((id) => current('detachment', id)).map((id) => definitions.get('detachment', id)!)
  const groups = new Map<string, string>()
  for (const detachment of detachments) {
    if (faction && !own.has(detachment.data.faction))
      rosterProblem('detachment-faction', `detachment:${detachment.id} is not a ${roster.faction} detachment`)
    const { group } = detachment.data
    if (group === undefined) continue
    if (groups.has(group)) rosterProblem('detachment-group', `${detachment.name} shares ${group} with detachment:${groups.get(group)}`)
    else groups.set(group, detachment.id)
  }
  const excluded = new Set([...(faction?.excludedUnits ?? []), ...detachments.flatMap((detachment) => detachment.data.excludedUnits ?? [])])
  const granted = new Set(detachments.flatMap((detachment) => detachment.data.warlords ?? []))
  const allies = faction?.allies ?? []
  // A unit belongs to the first entry that offers it under one of the roster's detachments, and only that entry counts it.
  const entryOf = (unit: string) =>
    allies.findIndex((ally) => ally.units.includes(unit) && (!ally.detachments || ally.detachments.some((d) => detachmentIds.includes(d))))
  const members = allies.map(() => [] as number[])
  const keywordsAt: string[][] = []
  const copies = new Map<string, number>()
  const enhancementCounts = new Map<string, number>()
  let enhancementCount = 0
  const unitLimits = (faction?.unitLimits ?? []).map((limit) => {
    const row = limit.detachments?.find((d) => detachmentIds.includes(d.detachment)) ?? limit
    return { keywords: limit.keywords, min: row.min, max: row.max, count: 0 }
  })
  const warlords = roster.units.filter((unit) => unit.warlord !== undefined).length
  roster.units.forEach((picked, at) => {
    const add = (code: VsProblemCode, message: string) => problems.push({ code, unit: at, message })
    if (!current('unit', picked.unit, at)) return
    const unit = definitions.get('unit', picked.unit)!
    const keywords = unitKeywords(unit.data, roster, picked.allegiance)
    keywordsAt[at] = keywords
    const entry = entryOf(unit.id)
    const offered = allies.filter((ally) => ally.units.includes(unit.id))
    if (entry >= 0) members[entry]!.push(at)
    else if (offered.length > 0)
      add(
        'ally-detachment',
        `${unit.name} needs one of ${offered
          .flatMap((ally) => ally.detachments ?? [])
          .map((d) => `detachment:${d}`)
          .join(', ')}`,
      )
    else if (!own.has(unit.data.faction)) add('unit-faction', `${unit.name} is not a ${roster.faction} unit`)
    if (excluded.has(unit.id)) add('unit-excluded', `${unit.name} is excluded from this roster`)
    copies.set(unit.id, (copies.get(unit.id) ?? 0) + 1)
    const limit =
      unit.data.limits?.find((row) => row.battleSize === battleSize && holds(row.when, roster))?.perRoster ??
      unit.data.perRoster ??
      size?.duplicates
    if (copies.get(unit.id) === (limit ?? Infinity) + 1) add('roster-limit', `${unit.name} is limited to ${limit} per roster`)
    for (const shared of unitLimits) {
      if (!holdsAll(keywords, shared.keywords)) continue
      shared.count++
      if (shared.count === (shared.max ?? Infinity) + 1)
        add('unit-limit', `a roster holds at most ${shared.max} ${shared.keywords.join(' ')} units`)
    }

    const models = definitions.modelsOf(unit.id)
    for (const id of Object.keys(picked.models ?? {}))
      if (current('model', id, at) && !models.some((model) => model.id === id)) add('unit-model', `model:${id} is not part of ${unit.name}`)
    if (picked.warlord !== undefined) {
      const warlord = picked.warlord
      const inUnit = models.some((model) => model.id === warlord)
      if (current('model', warlord, at) && !inUnit) add('unit-model', `model:${warlord} is not part of ${unit.name}`)
      if (warlords > 1) add('warlord-repeated', 'a roster has one warlord')
      const character = keywords.some((keyword) => keyword.toUpperCase() === 'CHARACTER')
      if (inUnit && !granted.has(warlord) && (!character || offered.length > 0 || !own.has(unit.data.faction)))
        add('warlord-ineligible', `${unit.name} cannot hold the warlord`)
      for (const detachment of detachments) {
        const required = detachment.data.requiredWarlords
        if (inUnit && required && !required.includes(warlord))
          add('warlord-required', `${detachment.name} needs one of ${required.map((m) => `model:${m}`).join(', ')} as warlord`)
      }
    }
    if (picked.size === undefined || picked.models) checkVsUnit(definitions, picked, add)
    else if (!unit.data.sizes.includes(picked.size))
      add('unit-size', `${unit.name} fields ${unit.data.sizes.join(' or ')} models, has ${picked.size}`)

    const offers = (unit.data.allegiances ?? []).filter((offer) => !offer.detachment || detachmentIds.includes(offer.detachment))
    if (picked.allegiance === undefined) {
      if (offers.some((offer) => offer.required)) add('allegiance-missing', `${unit.name} needs an allegiance`)
    } else if (current('allegiance', picked.allegiance, at)) {
      const allegiance = picked.allegiance
      const offer = offers.find((candidate) => candidate.choices.includes(allegiance))
      const needed = offer?.requires?.[allegiance]
      if (!offer) add('allegiance-choice', `${unit.name} cannot take allegiance:${allegiance}`)
      else if (needed && !((carried(definitions, picked).get(needed) ?? 0) > 0))
        add('allegiance-requires', `allegiance:${allegiance} needs ${unit.name} to carry wargear:${needed}`)
    }

    if (picked.enhancement && current('enhancement', picked.enhancement, at)) {
      const enhancement = definitions.get('enhancement', picked.enhancement)!
      if (!detachmentIds.includes(enhancement.data.detachment))
        add('enhancement-detachment', `${enhancement.name} belongs to another detachment`)
      if (entry >= 0 && !allies[entry]!.enhancements) add('ally-enhancement', `${unit.name} cannot take enhancements`)
      if (!enhancementAdmits(definitions, enhancement, picked, keywords))
        add('enhancement-keywords', `${unit.name} cannot take ${enhancement.name}`)
      if (enhancement.data.eligibility.notWarlord && picked.warlord !== undefined)
        add('enhancement-keywords', `${enhancement.name} cannot be taken by the warlord`)
      const taken = (enhancementCounts.get(enhancement.id) ?? 0) + 1
      enhancementCounts.set(enhancement.id, taken)
      const most = enhancement.data.perRoster ?? (enhancement.data.type === 'upgrade' ? Infinity : 1)
      if (taken === most + 1) add('enhancement-repeated', `${enhancement.name} is already taken`)
      if (
        enhancement.data.type !== 'upgrade' &&
        !enhancement.data.outsideLimit &&
        ++enhancementCount === (size?.enhancements ?? Infinity) + 1
      )
        add('enhancement-limit', `a roster takes at most ${size!.enhancements} enhancements`)
    }
  })
  for (const shared of unitLimits)
    if (shared.count < (shared.min ?? 0))
      rosterProblem('unit-limit', `a roster holds at least ${shared.min} ${shared.keywords.join(' ')} units, has ${shared.count}`)
  allies.forEach((ally, at) => {
    const units = members[at]!
    const allyPoints = units.reduce((sum, i) => sum + (price.units[i]?.points ?? 0), 0)
    for (const row of ally.points ?? [])
      if (row.battleSize === battleSize && allyPoints > row.max)
        rosterProblem('ally-points', `allied units cost at most ${row.max} points, cost ${allyPoints}`)
    for (const limit of ally.limits ?? []) {
      if (limit.battleSize !== battleSize) continue
      const under = units.filter((i) => holdsAll(keywordsAt[i]!, limit.keywords))
      const freed = new Set<number>()
      for (const free of limit.free ?? []) {
        const backing = keywordsAt.filter((keywords) => keywords && holdsAll(keywords, free.per)).length
        for (const member of under.filter((i) => !freed.has(i) && holdsAll(keywordsAt[i]!, free.keywords)).slice(0, backing))
          freed.add(member)
      }
      const counted = under.length - freed.size
      if (counted > limit.max)
        rosterProblem('ally-limit', `a roster holds at most ${limit.max} allied ${limit.keywords.join(' ')} units, has ${counted}`)
    }
    if (ally.oneLimit) {
      const sets = (ally.limits ?? []).filter((limit) => limit.battleSize === battleSize).map((limit) => limit.keywords)
      const under = units.filter((i) => sets.some((set) => holdsAll(keywordsAt[i]!, set)))
      if (sets.length > 0 && !sets.some((set) => under.every((i) => holdsAll(keywordsAt[i]!, set))))
        rosterProblem('ally-limit', 'allied units fall under one of their limits only')
    }
  })
  for (const detachment of detachments)
    for (const { allegiances, min, max } of detachment.data.allegianceLimits ?? []) {
      const count = roster.units.filter((unit) => unit.allegiance !== undefined && allegiances.includes(unit.allegiance)).length
      if (count < (min ?? 0) || count > (max ?? Infinity))
        rosterProblem(
          'allegiance-limit',
          `${detachment.name} needs ${min ?? 0}-${max ?? 'any'} units with ${allegiances.map((a) => `allegiance:${a}`).join(', ')}, has ${count}`,
        )
    }
  if (warlords === 0)
    for (const detachment of detachments) {
      const required = detachment.data.requiredWarlords
      if (required)
        rosterProblem('warlord-required', `${detachment.name} needs one of ${required.map((m) => `model:${m}`).join(', ')} as warlord`)
    }
  return problems
}
