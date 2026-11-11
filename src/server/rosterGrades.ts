import type { PriceInput } from '../contracts/schemas'
import { combatMatchup, type CombatAnswer, type CombatantSnapshot } from '../core/combatMatchup'
import { combatRuleSelections } from '../core/combatRules'
import { datasheetProfilesByKind } from '../core/datasheetStructure'
import { gradedTargets, rosterGrades, type GradedUnit, type ReferenceTargetKey } from '../core/rosterGrades'
import { calculateRosterPrice } from '../shared/pricing'
import { app } from './app'
import { combatCalculationPool } from './combatCalculationPool'
import { combatantSnapshot, readRosterCombatant, type CombatProjection } from './combatSnapshot'
import { namedCombatant } from './combatTools'

// The pool refuses work beyond 64 pending calculations, which other readers share.
const BATCH = 16
const NO_CHOICES = { preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] }

const moveOf = (projection: CombatProjection) => {
  const [profile] = datasheetProfilesByKind(projection.selected).unit
  const move = profile?.values.find((value) => value.kind === 'movement')
  return Number.parseInt(move?.value ?? '', 10) || 0
}

const coreAbilities = (projection: CombatProjection) =>
  [projection.selected, ...projection.companions.map((member) => member.selected)].flatMap((sheet) =>
    sheet.abilities.filter((ability) => ability.kind === 'core').map((ability) => ability.name),
  )

/** Whether one unit's shooting, or shooting then fighting, takes half the target's wounds; null when it cannot be calculated. */
function removesHalf(answer: CombatAnswer, wounds: number): boolean | null {
  const results = [answer.ranged, answer.combined ?? answer.melee]
  if (results.some((phase) => phase?.error) && !results.some((phase) => phase?.result)) return null
  const dealt = Math.max(0, ...results.map((phase) => phase?.result?.meanDamage ?? 0))
  return dealt >= wounds / 2
}

const woundsOf = (snapshot: CombatantSnapshot) =>
  [snapshot, ...(snapshot.companions ?? [])].reduce((total, member) => {
    const [profile] = datasheetProfilesByKind(member.sheet).unit
    const wounds = Number.parseInt(profile?.values.find((value) => value.kind === 'wounds')?.value ?? '', 10) || 0
    return total + wounds * member.models
  }, 0)

/** The grades for a roster's current picks, from the exact simulator at full strength with passive rules only. */
export async function calculateRosterGrades(data: PriceInput, signal: AbortSignal) {
  const instance = app()
  const [loaded, rules] = await Promise.all([instance.catalogueFor(data.catalogueId), instance.rulesFor(data.catalogueId)])
  if (!loaded) return null
  const price = calculateRosterPrice(data, loaded, rules)
  const pointsByPick = new Map((price?.units ?? []).map((unit) => [Number(unit.key), unit.points ?? 0]))
  const picks = data.units.map((pick) => ({ catalogueId: data.catalogueId, ...pick }))
  const targets = await Promise.all(
    gradedTargets(data.limit).map(async (target) => {
      const snapshot = await namedCombatant(target.faction, target.unit, target.models)
      return snapshot && { key: target.key, snapshot, wounds: woundsOf(snapshot) }
    }),
  )
  const hosts = (
    await Promise.all(
      picks.map(async (pick, pickIndex) => {
        if (pick.attachedTo !== undefined && pick.attachedTo !== null) return null
        const projection = await readRosterCombatant(loaded, rules, {
          catalogueId: data.catalogueId,
          detachmentIds: data.detachmentIds,
          picks,
          pickIndex,
        })
        if (!projection) return null
        const selection = combatRuleSelections([...projection.rules, ...projection.companions.flatMap((member) => member.rules)], {})
        const members = [pickIndex, ...projection.companions.map((member) => member.pickIndex)]
        return {
          projection,
          snapshot: combatantSnapshot(projection, selection),
          points: members.reduce((total, index) => total + (pointsByPick.get(index) ?? 0), 0),
        }
      }),
    )
  ).filter((host) => host !== null)
  const work = hosts.flatMap((host, unit) => targets.flatMap((target) => (target ? [{ unit, target }] : [])))
  const removes = hosts.map((): Partial<Record<ReferenceTargetKey, boolean | null>> => ({}))
  for (let start = 0; start < work.length; start += BATCH) {
    await Promise.all(
      work.slice(start, start + BATCH).map(async ({ unit, target }) => {
        const request = combatMatchup(hosts[unit]!.snapshot, target.snapshot, NO_CHOICES).request({})
        const answer = await combatCalculationPool.calculate(request, signal).catch((error: unknown) => {
          if (signal.aborted) throw error
          return null
        })
        removes[unit]![target.key] = answer ? removesHalf(answer, target.wounds) : null
      }),
    )
  }
  for (const target of gradedTargets(data.limit)) {
    // A reference unit the data cannot field leaves its row uncalculated for every unit.
    if (!targets.some((built) => built?.key === target.key)) for (const entry of removes) entry[target.key] = null
  }
  const units: GradedUnit[] = hosts.map((host, index) => ({
    name: [host.projection.selected.name, ...host.projection.companions.map((member) => member.selected.name)].join(' + '),
    points: host.points,
    move: moveOf(host.projection),
    coreAbilities: coreAbilities(host.projection),
    removes: removes[index]!,
  }))
  return rosterGrades(units, data.limit)
}
