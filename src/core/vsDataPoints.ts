import type { PointsCost, PointsSnapshot, PointsUnit } from './vsDataConstruction'

/** `copy` is which copy of the unit this is in the army, counting from 1. */
export type PointsRef =
  | { kind: 'unit'; faction: string; unit: string; models: number; copy?: number; composition?: string }
  | { kind: 'wargear'; faction: string; unit: string; item: string }
  | { kind: 'detachment'; faction: string; detachment: string }
  | { kind: 'enhancement'; faction: string; detachment: string; enhancement: string }

export type PointsMiss =
  | 'unknown-faction'
  | 'unknown-unit'
  | 'unknown-wargear'
  | 'unknown-detachment'
  | 'unknown-enhancement'
  | 'no-tier'
  | 'no-size'
  | 'ambiguous-size'
  | 'unresolved'

export type PointsLookup = { ok: true; points: number } | { ok: false; reason: PointsMiss }

const miss = (reason: PointsMiss): PointsLookup => ({ ok: false, reason })
const value = (points: PointsCost['points']): PointsLookup => (typeof points === 'number' ? { ok: true, points } : miss('unresolved'))

/** VS Data's `lookupPoints` over one snapshot (`src/points/lookup.ts`). */
export function lookupPoints(snapshot: PointsSnapshot, ref: PointsRef): PointsLookup {
  const faction = snapshot.factions.find((candidate) => candidate.id === ref.faction)
  if (!faction) return miss('unknown-faction')
  if (ref.kind === 'detachment' || ref.kind === 'enhancement') {
    const detachment = faction.detachments.find((candidate) => candidate.id === ref.detachment)
    if (!detachment) return miss('unknown-detachment')
    if (ref.kind === 'detachment') return value(detachment.dp)
    const enhancement = detachment.enhancements.find((candidate) => candidate.id === ref.enhancement)
    return enhancement ? value(enhancement.points) : miss('unknown-enhancement')
  }
  const unit = faction.units.find((candidate) => candidate.id === ref.unit)
  if (!unit) return miss('unknown-unit')
  if (ref.kind === 'wargear') {
    const item = unit.wargear?.find((candidate) => candidate.item === ref.item)
    return item ? value(item.points) : miss('unknown-wargear')
  }
  return unitCost(unit, ref.models, ref.copy ?? 1, ref.composition)
}

/** The first snapshot that prices the reference: the update's own, then its Legends companion. */
export function pointsAt(snapshots: readonly PointsSnapshot[], ref: PointsRef): PointsLookup {
  let first: PointsLookup = miss('unknown-faction')
  for (const [at, snapshot] of snapshots.entries()) {
    const found = lookupPoints(snapshot, ref)
    if (found.ok || (found.reason !== 'unknown-faction' && found.reason !== 'unknown-unit' && found.reason !== 'unknown-detachment'))
      return found
    if (at === 0) first = found
  }
  return first
}

/** Every cost row of the unit's tier for that copy, so a caller can tell compositions apart. */
export function unitCostRows(snapshots: readonly PointsSnapshot[], faction: string, unit: string, copy = 1): PointsCost[] | null {
  for (const snapshot of snapshots) {
    const found = snapshot.factions.find((candidate) => candidate.id === faction)?.units.find((candidate) => candidate.id === unit)
    if (found) return tierOf(found, copy)?.costs ?? null
  }
  return null
}

const tierOf = (unit: PointsUnit, copy: number) => unit.tiers.find(({ copies }) => copy >= copies.from && copy <= (copies.to ?? Infinity))

function unitCost(unit: PointsUnit, models: number, copy: number, composition?: string): PointsLookup {
  const tier = tierOf(unit, copy)
  if (!tier) return miss('no-tier')
  const rows = tier.costs.filter((cost) => cost.models === models && (composition === undefined || cost.composition === composition))
  if (rows.length === 1) return value(rows[0]!.points)
  if (rows.length > 1) return miss('ambiguous-size')
  if (composition !== undefined) return miss('no-size')
  const between = betweenRows(tier.costs, models)
  return between ? value(between.points) : miss('no-size')
}

// MFM Starting Strength guidance: a table with a lower and an upper starting strength charges any count between them at
// the upper row. Longer tables price only the counts they print.
function betweenRows(costs: readonly PointsCost[], models: number): PointsCost | undefined {
  if (costs.length !== 2) return undefined
  const [lower, upper] = costs.toSorted((left, right) => left.models - right.models)
  return models > lower!.models && models < upper!.models ? upper : undefined
}

/** Whether a cost row names the army, Detachment or other army it is for, rather than nothing or the models it holds. */
export const circumstance = (composition: string | undefined) =>
  composition !== undefined &&
  (composition.startsWith('in an army of ') || /^in the .+ Detachment$/.test(composition) || composition.startsWith('as '))
/** Whether two names are the same once case, spacing and punctuation are set aside. */
export const sameName = (left: string, right: string) =>
  left.toLowerCase().replace(/[^a-z0-9]/g, '') === right.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Whether two mixes give each model the same count, a model missing from either counting as zero. */
const sameMix = (left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>) =>
  [...new Set([...Object.keys(left), ...Object.keys(right)])].every((model) => (left[model] ?? 0) === (right[model] ?? 0))

/**
 * Which of a unit's cost rows at one size applies in a list with `detachments`, of an army that `armies` names: the row
 * naming one of those Detachments, else the one naming that army, else the one for another army (`as …`), else the one
 * whose `mix` the unit's model counts are, or, in a release without mixes, the one naming the unit's `models`, else the
 * one row naming none of these. Rows that leave it open, such as two model mixes at a size priced differently, give none.
 */
export function costRowFor(
  rows: readonly PointsCost[],
  context: { detachments: readonly string[]; armies: readonly string[]; mix?: Readonly<Record<string, number>>; models?: string },
): PointsCost | undefined {
  const named = (test: (composition: string) => boolean) => rows.filter((row) => row.composition !== undefined && test(row.composition))
  const army = 'in an army of '
  const found = [
    named((composition) => context.detachments.some((name) => composition === `in the ${name} Detachment`)),
    named((composition) => composition.startsWith(army) && context.armies.some((name) => sameName(composition.slice(army.length), name))),
    named((composition) => composition.startsWith('as ')),
    context.mix ? rows.filter((row) => row.mix && sameMix(row.mix, context.mix!)) : [],
    context.models ? named((composition) => composition === context.models) : [],
    rows.filter((row) => !circumstance(row.composition)),
  ].find((candidates) => candidates.length)
  return found && new Set(found.map((row) => JSON.stringify(row.points))).size === 1 ? found[0] : undefined
}
