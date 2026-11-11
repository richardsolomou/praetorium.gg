import type { PriceInput } from '../contracts/schemas'
import { combatMatchup, type CombatAnswer, type CombatantSnapshot } from '../core/combatMatchup'
import { combatRuleSelections } from '../core/combatRules'
import { attachedUnitList, attachmentHost } from '../core/attachedUnits'
import { datasheetProfilesByKind } from '../core/datasheetStructure'
import { gradedTargets, rosterGrades, type GradedUnit, type ReferenceTargetKey } from '../core/rosterGrades'
import { calculateRosterPrice } from '../shared/pricing'
import { rosterDatasheetSelections } from '../shared/rosterDatasheetContext'
import { rosterProjectionCache } from '../shared/rosterCombatRules'
import { app } from './app'
import { combatCalculationPool } from './combatCalculationPool'
import { combatantSnapshot, readRosterCombatant, type CombatProjection } from './combatSnapshot'
import { namedCombatant } from './combatTools'
import { memoUntilSnapshotChanges } from './snapshotMemo'

// The pool refuses work beyond 64 pending calculations and shares two workers with the simulator, so grading asks a few at a time.
const BATCH = 4
const NO_CHOICES = { preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] }

const moveOf = (projection: CombatProjection) => {
  const [profile] = datasheetProfilesByKind(projection.selected).unit
  const move = profile?.values.find((value) => value.kind === 'movement')
  return Number.parseInt(move?.value ?? '', 10) || 0
}

const coreAbilities = (projection: CombatProjection) =>
  [projection.selected, ...projection.companions.map((member) => member.selected)].map((sheet) =>
    sheet.abilities.filter((ability) => ability.kind === 'core').map((ability) => ability.name),
  )

const numberIn = (names: readonly string[], pattern: RegExp) => Math.max(0, ...names.map((name) => Number(pattern.exec(name)?.[1] ?? 0)))

/**
 * Whether one unit's shooting, fighting, or shooting then fighting takes half the target's wounds.
 *
 * A phase the simulator refuses could have been the one that does it, so a shortfall beside a refusal is
 * not calculated rather than a no.
 */
function removesHalf(answer: CombatAnswer, wounds: number): boolean | null {
  const phases = [answer.ranged, answer.melee, answer.combined]
  const dealt = Math.max(0, ...phases.map((phase) => phase?.result?.meanDamage ?? 0))
  if (dealt >= wounds / 2) return true
  return phases.some((phase) => phase?.error && !phase.result) ? null : false
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
  if (!loaded) throw new Error('This roster’s army data is unavailable.')
  const price = calculateRosterPrice(data, loaded, rules)
  const priced = new Map((price?.units ?? []).map((unit) => [Number(unit.key), unit]))
  const picks = data.units.map((pick) => ({ catalogueId: data.catalogueId, ...pick }))
  // Deep Strike, Infiltrators and Scouts need every model in the unit, so they come from the units the list forms.
  const deployment = new Map(
    attachedUnitList(
      picks.map((pick, key) => ({
        key,
        attachedTo: pick.attachedTo ?? undefined,
        formationOptions: priced.get(key)?.formationOptions ?? [],
        prebattleRules: priced.get(key)?.prebattleRules ?? [],
      })),
    ).map((unit) => [unit.host.key, unit]),
  )
  const prepared = rosterDatasheetSelections(loaded, { catalogueId: data.catalogueId, detachmentIds: data.detachmentIds, picks })
  const cache = rosterProjectionCache()
  const targets = await Promise.all(
    gradedTargets(data.limit).map(async (target) => {
      // Reference units are shared reference data, never a reader's roster, so one build serves every request.
      const snapshot = await memoUntilSnapshotChanges('roster-grade-target', target.key, () =>
        namedCombatant(target.faction, target.unit, target.models),
      )
      return snapshot && { key: target.key, snapshot, wounds: woundsOf(snapshot) }
    }),
  )
  const hosts = (
    await Promise.all(
      picks.map(async (pick, pickIndex) => {
        if (attachmentHost(picks, pickIndex) !== pickIndex) return null
        const projection = await readRosterCombatant(
          loaded,
          rules,
          { catalogueId: data.catalogueId, detachmentIds: data.detachmentIds, picks, pickIndex },
          prepared,
          { attachmentChoices: false, cache },
        )
        if (!projection) return null
        const selection = combatRuleSelections([...projection.rules, ...projection.companions.flatMap((member) => member.rules)], {})
        const members = [pickIndex, ...projection.companions.map((member) => member.pickIndex)]
        return {
          projection,
          pickIndex,
          snapshot: combatantSnapshot(projection, selection),
          points: members.reduce((total, index) => total + (priced.get(index)?.points ?? 0), 0),
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
        // A busy or failed calculation service fails the whole request, so the reader can retry rather than read a gap.
        const answer = await combatCalculationPool.calculate(request, signal)
        removes[unit]![target.key] = removesHalf(answer, target.wounds)
      }),
    )
  }
  for (const target of gradedTargets(data.limit)) {
    // A reference unit the data cannot field leaves its row uncalculated for every unit.
    if (!targets.some((built) => built?.key === target.key)) for (const entry of removes) entry[target.key] = null
  }
  const units: GradedUnit[] = hosts.map((host, index) => {
    const formed = deployment.get(host.pickIndex)
    const members = coreAbilities(host.projection)
    const scouts = formed?.prebattleRules.includes('scouts')
      ? Math.min(...members.map((names) => numberIn(names, /^Scouts (\d+)/i)).filter(Boolean))
      : 0
    return {
      name: [host.projection.selected.name, ...host.projection.companions.map((member) => member.selected.name)].join(' + '),
      points: host.points,
      move: moveOf(host.projection),
      deepStrike: Boolean(formed?.formationOptions.includes('deep-strike')),
      infiltrators: Boolean(formed?.prebattleRules.includes('infiltrators')),
      scouts: Number.isFinite(scouts) ? scouts : 0,
      chargeBonus: numberIn(members.flat(), /\+(\d+) to charge/i),
      removes: removes[index]!,
    }
  })
  return rosterGrades(units, data.limit)
}
