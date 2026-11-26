import type { PriceInput } from '../contracts/schemas'
import { attachedUnitList, attachmentHost } from '../core/attachedUnits'
import { remember } from '../core/collections'
import { combatMatchup, strongestWeaponPreferences, type CombatAnswer, type CombatantSnapshot } from '../core/combatMatchup'
import { combatRuleSelections } from '../core/combatRules'
import { datasheetProfilesByKind } from '../core/datasheetStructure'
import { carrierModelProfiles } from '../core/combatLoadout'
import { REFERENCE_ATTACKERS, gradedTargets, type GradedUnit, type ReferenceTargetKey } from '../core/rosterGrades'
import type { LoadedCatalogue } from './catalogueIndex'
import { calculateRosterPrice } from './pricing'
import { rosterCombatant, rosterProjectionCache } from './rosterCombatRules'
import { rosterDatasheetSelections } from './rosterDatasheetContext'
import type { LoadedRules } from './rules'
import { gradeReadingsIn } from './textFacts'
import { unitMove } from '../core/unitReach'

export type CombatProjection = NonNullable<ReturnType<typeof rosterCombatant>>
/** A reference unit every list is measured against, with its total wounds. */
export type ReferenceUnit = { snapshot: CombatantSnapshot; wounds: number }
export type GradeReferences = {
  targets: Partial<Record<ReferenceTargetKey, ReferenceUnit>>
  /** The units whose shooting a unit has to survive. */
  attackers: readonly ReferenceUnit[]
}

/**
 * A reference target fielded as `copies` of itself in one unit, so a unit's damage can run past the first copy
 * without carrying over between models; `wounds` stays one copy's.
 */
export function referenceTarget(snapshot: CombatantSnapshot, copies: number): ReferenceUnit | null {
  const models = snapshot.models * copies
  const wounds = unitTotal(snapshot, 'wounds')
  return wounds === null ? null : { snapshot: { ...snapshot, models, startingModels: models }, wounds }
}

/** A reference target or attacker as `rosterGrades` names it; a target fields `copies` of itself. */
type ReferenceSpec = { faction: string; unit: string; models?: number; copies?: number }

/** The reference units a battle size grades against, each built by `build`, leaving out any the data cannot field. */
export async function gradeReferences(
  limit: number,
  build: (key: string, unit: ReferenceSpec) => Promise<ReferenceUnit | null>,
): Promise<GradeReferences> {
  const [targets, attackers] = await Promise.all([
    Promise.all(gradedTargets(limit).map(async (target) => [target.key, await build(target.key, target)] as const)),
    Promise.all(REFERENCE_ATTACKERS.map((attacker) => build(attacker.key, attacker))),
  ])
  return {
    targets: Object.fromEntries(targets.filter(([, unit]) => unit)),
    attackers: attackers.filter((unit) => unit !== null),
  }
}

/** A reference unit from the snapshot `field` gives for it, stacked into its copies when it is a target. */
export async function referenceUnit(
  unit: ReferenceSpec,
  field: (faction: string, unit: string, models?: number) => Promise<CombatantSnapshot | null>,
): Promise<ReferenceUnit | null> {
  const snapshot = await field(unit.faction, unit.unit, unit.models)
  if (!snapshot) return null
  if (unit.copies) return referenceTarget(snapshot, unit.copies)
  const wounds = unitTotal(snapshot, 'wounds')
  return wounds === null ? null : { snapshot, wounds }
}

/**
 * A resolved matchup with the phases the simulator refused before resolving anything, such as a weapon whose
 * profile it cannot read; those come back without an answer rather than with an error.
 */
type Attack = { answer: CombatAnswer; refused: Record<'ranged' | 'melee', boolean> }

const NO_CHOICES = { preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] }

/** The unit at full strength with the selected rules active, as the simulator fields it. */
export function combatantSnapshot(projection: CombatProjection, selection: ReturnType<typeof combatRuleSelections>): CombatantSnapshot {
  return {
    sheet: projection.selected,
    bodyguard: true,
    models: projection.models,
    startingModels: projection.models,
    damage: 0,
    carriers: projection.carriers,
    rules: selection.active(projection.rules),
    ruleChoices: selection.choices,
    appliedDefenceSources: selection.appliedDefenceSources(projection.rules),
    companions: projection.companions.map((member) => ({
      sheet: member.selected,
      bodyguard: false,
      models: member.models,
      startingModels: member.models,
      damage: 0,
      carriers: member.carriers,
      rules: selection.active(member.rules),
      appliedDefenceSources: selection.appliedDefenceSources(member.rules),
    })),
  }
}

/** A unit as the simulator fields it, with its passive rules switched on. */
export function defaultSnapshot(projection: CombatProjection) {
  const selection = combatRuleSelections([...projection.rules, ...projection.companions.flatMap((member) => member.rules)], {})
  return combatantSnapshot(projection, selection)
}

/** Every model's characteristic, summed over the unit and everything attached to it. */
export function unitTotal(snapshot: CombatantSnapshot, kind: 'wounds' | 'objective-control'): number | null {
  let total = 0
  for (const member of [snapshot, ...(snapshot.companions ?? [])]) {
    const profiles = datasheetProfilesByKind(member.sheet).unit
    const values = profiles.map((profile) => Number.parseInt(profile.values.find((value) => value.kind === kind)?.value ?? '', 10))
    if (!values.length || values.some((value) => !Number.isFinite(value))) return null
    if (values.every((value) => value === values[0])) {
      total += values[0]! * member.models
      continue
    }
    let counted = 0
    for (const carrier of member.carriers ?? []) {
      if (carrier.unitWide) continue
      const matches = carrierModelProfiles(carrier, profiles)
      if (matches.length !== 1) return null
      total += values[matches[0]!]! * carrier.models
      counted += carrier.models
    }
    if (counted !== member.models) return null
  }
  return total
}

const numberIn = (names: readonly string[], pattern: RegExp) => Math.max(0, ...names.map((name) => Number(pattern.exec(name)?.[1] ?? 0)))

/**
 * How many of the target one unit's shooting, fighting, or shooting then fighting removes in a turn: its expected
 * damage to the stacked reference over one copy's wounds, so a unit that takes two Rhinos counts 2.
 *
 * A phase the simulator refuses could have done more, so a shortfall beside a refusal is not calculated rather than a guess.
 */
function removed({ answer, refused }: Attack, wounds: number): number | null {
  const phases = [answer.ranged, answer.melee, answer.combined]
  const share = Math.max(0, ...phases.map((phase) => phase?.result?.meanDamage ?? 0)) / wounds
  if (share >= 1) return share
  return refused.ranged || refused.melee || phases.some((phase) => phase?.error && !phase.result) ? null : share
}

/** The share of the unit's wounds a turn of the attacker's shooting takes on average; null when it cannot be calculated. */
function lost({ answer, refused }: Attack, wounds: number): number | null {
  if (refused.ranged || (answer.ranged?.error && !answer.ranged.result)) return null
  return wounds ? Math.min(1, (answer.ranged?.result?.meanDamage ?? 0) / wounds) : 1
}

/**
 * The facts the grades are read from, one entry per unit the list forms.
 *
 * `calculate` resolves each matchup; the server sends them to its shared workers and a script may resolve
 * them in place, so a list measured either way gets the same answer.
 */
export async function measureRosterUnits({
  loaded,
  rules,
  data,
  references,
  calculate,
  attachedShares = false,
  price = calculateRosterPrice(data, loaded, rules),
}: {
  loaded: LoadedCatalogue
  rules: LoadedRules | null
  data: PriceInput
  references: GradeReferences
  calculate: (requests: ReturnType<ReturnType<typeof combatMatchup>['request']>[]) => Promise<CombatAnswer[]>
  /** Also measure each unit without each unit attached to it, which costs a set of target matchups per attachment. */
  attachedShares?: boolean
  price?: ReturnType<typeof calculateRosterPrice>
}): Promise<GradedUnit[]> {
  const priced = new Map((price?.units ?? []).map((unit) => [unit.key, unit]))
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
  const project = (
    fielded: typeof picks,
    pickIndex: number,
    prepared = rosterDatasheetSelections(loaded, { catalogueId: data.catalogueId, detachmentIds: data.detachmentIds, picks: fielded }),
    cache = rosterProjectionCache(),
  ) => {
    return rosterCombatant(
      loaded,
      rules,
      { catalogueId: data.catalogueId, detachmentIds: data.detachmentIds, picks: fielded, pickIndex },
      prepared,
      { attachmentChoices: false, cache },
    )
  }
  const prepared = rosterDatasheetSelections(loaded, { catalogueId: data.catalogueId, detachmentIds: data.detachmentIds, picks })
  const cache = rosterProjectionCache()
  const hosts = picks.flatMap((_, pickIndex) => {
    if (attachmentHost(picks, pickIndex) !== pickIndex) return []
    const projection = project(picks, pickIndex, prepared, cache)
    if (!projection) return []
    const members = [pickIndex, ...projection.companions.map((member) => member.pickIndex)]
    // What the unit does with each attached unit left to stand alone, so a leader's or support unit's part in its damage shows.
    const without = (attachedShares ? projection.companions : []).flatMap((member) => {
      const alone = project(
        picks.map((pick, at) => (at === member.pickIndex ? { ...pick, attachedTo: undefined } : pick)),
        pickIndex,
      )
      return alone ? [{ name: member.selected.name, snapshot: defaultSnapshot(alone) }] : []
    })
    return [
      {
        projection,
        pickIndex,
        snapshot: defaultSnapshot(projection),
        without,
        points: members.reduce((total, index) => total + (priced.get(index)?.points ?? 0), 0),
      },
    ]
  })
  const targets = gradedTargets(data.limit).flatMap((target) => {
    const reference = references.targets[target.key]
    return reference ? [{ key: target.key, ...reference }] : []
  })
  const pairs = hosts.flatMap((host) => [
    ...targets.map((target) => [host.snapshot, target.snapshot] as const),
    ...references.attackers.map((attacker) => [attacker.snapshot, host.snapshot] as const),
    ...host.without.flatMap((alone) => targets.map((target) => [alone.snapshot, target.snapshot] as const)),
  ])
  // Identical units share the same plan and exact answer, including the trials used to pick weapons.
  const snapshotIds = new WeakMap<CombatantSnapshot, number>()
  const snapshots = new Map<string, number>()
  const snapshotId = (snapshot: CombatantSnapshot) =>
    remember(snapshotIds, snapshot, () => remember(snapshots, JSON.stringify(snapshot), () => snapshots.size))
  const planned = new Map<string, number>()
  const matchups: ReturnType<typeof combatMatchup>[] = []
  const pairIndices: number[] = []
  for (const [attacker, defender] of pairs) {
    const key = `${snapshotId(attacker)}:${snapshotId(defender)}`
    let index = planned.get(key)
    if (index === undefined) {
      const preferences = await strongestWeaponPreferences(attacker, defender, NO_CHOICES, {}, calculate)
      index = matchups.length
      matchups.push(combatMatchup(attacker, defender, { ...NO_CHOICES, preferences }))
      planned.set(key, index)
    }
    pairIndices.push(index)
  }
  const resolved = await calculate(matchups.map((matchup) => matchup.request({})))
  const answers: Attack[] = pairIndices.map((index) => {
    const matchup = matchups[index]!
    const refusedPhase = (phase: 'ranged' | 'melee') => Boolean(matchup.target?.error || matchup.plans[phase]?.errors.length)
    return { answer: resolved[index]!, refused: { ranged: refusedPhase('ranged'), melee: refusedPhase('melee') } }
  })
  const removedFrom = (answered: readonly Attack[]) => {
    const removes: Partial<Record<ReferenceTargetKey, number | null>> = {}
    for (const target of gradedTargets(data.limit)) {
      const at = targets.findIndex((built) => built.key === target.key)
      // A reference unit the data cannot field leaves its row uncalculated for every unit.
      removes[target.key] = at === -1 ? null : removed(answered[at]!, targets[at]!.wounds)
    }
    return removes
  }
  let offset = 0
  return hosts.map((host) => {
    const answered = answers.slice(offset, (offset += targets.length + references.attackers.length))
    const removes = removedFrom(answered)
    const without = host.without.map((alone) => ({
      name: alone.name,
      removes: removedFrom(answers.slice(offset, (offset += targets.length))),
    }))
    const wounds = unitTotal(host.snapshot, 'wounds')
    const losses = wounds === null ? [] : answered.slice(targets.length).map((answer) => lost(answer, wounds))
    const formed = deployment.get(host.pickIndex)
    const abilities = [host.projection.selected, ...host.projection.companions.map((member) => member.selected)].map((sheet) =>
      sheet.abilities.filter((ability) => ability.kind === 'core').map((ability) => ability.name),
    )
    const scouts = formed?.prebattleRules.includes('scouts')
      ? Math.min(...abilities.map((names) => numberIn(names, /^Scouts (\d+)/i)).filter(Boolean))
      : 0
    const readings = [host.projection.selected, ...host.projection.companions.map((member) => member.selected)].flatMap((sheet) =>
      sheet.abilities.map((ability) => gradeReadingsIn(ability.description ?? '', loaded.index.textFacts)),
    )
    return {
      name: [host.projection.selected.name, ...host.projection.companions.map((member) => member.selected.name)].join(' + '),
      points: host.points,
      models: host.snapshot.models + (host.snapshot.companions ?? []).reduce((total, member) => total + member.models, 0),
      transport: host.projection.selected.keywords.some((keyword) => keyword.toLowerCase() === 'transport'),
      move: unitMove(host.snapshot),
      objectiveControl: unitTotal(host.snapshot, 'objective-control'),
      deepStrike: Boolean(formed?.formationOptions.includes('deep-strike')),
      infiltrators: Boolean(formed?.prebattleRules.includes('infiltrators')),
      scouts: Number.isFinite(scouts) ? scouts : 0,
      chargeBonus: numberIn(abilities.flat(), /\+(\d+) to charge/i),
      removes,
      ...(without.length ? { without } : {}),
      unitGeneration: readings.flatMap((reading) => reading.unitGeneration),
      movementTools: [...new Set(readings.flatMap((reading) => reading.movementTools))],
      volleyLoss:
        wounds !== null && losses.length && !losses.includes(null)
          ? losses.reduce<number>((total, loss) => total + loss!, 0) / losses.length
          : null,
    }
  })
}
