import type { Datasheet } from '../contracts/catalogue'
import { calculateCombat, type CombatInput, type CombatOptions, type CombatResult } from './combat'
import type { WeaponAdjustment } from './combatAdjustments'
import type { CombatCarrier } from './combatLoadout'
import { combatAttackInput, combatAttacks, type CombatAttacker, type CombatOpponent } from './combatScenario'
import { datasheetProfileKind } from './datasheetStructure'
import type { RosterPick } from './roster'
import { sameWargear } from './wargear'

/**
 * The weapon choices a unit can make, each measured as the change one step makes to the models
 * and weapons it carries.
 *
 * The server measures every step with a real build; combining them is only a screen. The best
 * screened loadouts are built again before anything is suggested.
 */
export type LoadoutAxis = {
  key: string
  name: string
  owner: string | null
  /** A nested choice only varies while the choice that offers it keeps its current value. */
  host: string | null
  options: LoadoutAxisOption[]
} & (
  | { kind: 'single'; current: string }
  | {
      kind: 'spread'
      room: number
      /** The whole unit takes one option, as "all models can each replace" choices require. */
      uniform: boolean
      /** Whether the counts must fill the room; the donor gives up a model for each other option. */
      exact: boolean
      donor: string | null
      /** Specialists counted against one model entry's maximum. */
      limits: { options: string[]; max: number }[]
    }
)
export type LoadoutAxisOption = {
  /** Unique within its axis; `entry` is the option's id inside `group`. */
  id: string
  entry: string
  name: string
  /** The group the value is written to; nested specialists write to their own group. */
  group: string
  count: number
  min: number
  max: number
  change: CombatCarrier[]
}
export type LoadoutSpace = { carriers: CombatCarrier[]; axes: LoadoutAxis[]; weapons: Datasheet['profiles'] }
/** One value per axis: an option id for single choices, counts for spreads. */
export type LoadoutAssignment = (string | Record<string, number>)[]

type Carried = Map<string, { models: number; weapons: Map<string, number> }>

function carried(carriers: readonly CombatCarrier[]): Carried {
  const found: Carried = new Map()
  for (const carrier of carriers) {
    const entry = found.get(carrier.name) ?? { models: 0, weapons: new Map() }
    entry.models += carrier.models
    for (const weapon of carrier.weapons) entry.weapons.set(weapon.name, (entry.weapons.get(weapon.name) ?? 0) + weapon.count)
    found.set(carrier.name, entry)
  }
  return found
}

/** What a build changed, per model name, as signed model and weapon counts. */
export function carrierChange(before: readonly CombatCarrier[], after: readonly CombatCarrier[]): CombatCarrier[] {
  const old = carried(before)
  const now = carried(after)
  return [...new Set([...old.keys(), ...now.keys()])].flatMap((name) => {
    const was = old.get(name)
    const is = now.get(name)
    const weapons = [...new Set([...(was?.weapons.keys() ?? []), ...(is?.weapons.keys() ?? [])])].flatMap((weapon) => {
      const count = (is?.weapons.get(weapon) ?? 0) - (was?.weapons.get(weapon) ?? 0)
      return count ? [{ name: weapon, count }] : []
    })
    const models = (is?.models ?? 0) - (was?.models ?? 0)
    return models || weapons.length ? [{ name, models, weapons }] : []
  })
}

/** The carriers a combination of steps leaves, or null when the steps cannot all apply. */
export function composeCarriers(base: readonly CombatCarrier[], changes: readonly (readonly [CombatCarrier[], number])[]) {
  const result = carried(base)
  for (const [change, times] of changes)
    for (const step of change) {
      const entry = result.get(step.name) ?? { models: 0, weapons: new Map() }
      entry.models += step.models * times
      for (const weapon of step.weapons) entry.weapons.set(weapon.name, (entry.weapons.get(weapon.name) ?? 0) + weapon.count * times)
      result.set(step.name, entry)
    }
  const carriers: CombatCarrier[] = []
  for (const [name, { models, weapons }] of result) {
    if (models < 0 || [...weapons.values()].some((count) => count < 0)) return null
    const held = [...weapons].flatMap(([weapon, count]) => (count ? [{ name: weapon, count }] : []))
    if (models > 0) carriers.push({ name, models, weapons: held })
    else if (held.length) return null
  }
  return carriers
}

export const isWeaponProfile = (profile: Datasheet['profiles'][number]) =>
  ['ranged-weapon', 'melee-weapon'].includes(datasheetProfileKind(profile.type))

/** A change matters to an attack only if it moves a weapon the unit has a profile for. */
export const changesWeapons = (change: readonly CombatCarrier[], weapons: Datasheet['profiles']) =>
  change.some((step) => step.weapons.some((piece) => weapons.some((profile) => sameWargear(piece.name, profile.name))))

/** The datasheet with each weapon profile counted from the carriers that hold it. */
export function loadoutSheet(sheet: Datasheet, weapons: Datasheet['profiles'], carriers: readonly CombatCarrier[]): Datasheet {
  const held = (profile: Datasheet['profiles'][number]) =>
    carriers.reduce(
      (total, carrier) =>
        total + carrier.weapons.reduce((sum, piece) => sum + (sameWargear(piece.name, profile.name) ? piece.count : 0), 0),
      0,
    )
  return {
    ...sheet,
    profiles: [
      ...sheet.profiles.filter((profile) => !isWeaponProfile(profile)),
      ...weapons.flatMap((profile) => {
        const count = held(profile)
        return count ? [{ ...profile, count }] : []
      }),
    ],
  }
}

const countsOf = (axis: LoadoutAxis) => Object.fromEntries(axis.options.map((option) => [option.id, option.count]))

/** Every value an axis can take, starting with its current one. */
export function axisValues(axis: LoadoutAxis, limit: number): LoadoutAssignment[number][] {
  if (axis.kind === 'single') return [axis.current, ...axis.options.map((option) => option.id).filter((id) => id !== axis.current)]
  const current = countsOf(axis)
  if (axis.uniform)
    return [
      current,
      ...axis.options
        .filter((option) => current[option.id] !== axis.room)
        .map((option) => Object.fromEntries(axis.options.map((other) => [other.id, other === option ? axis.room : 0]))),
    ]
  const free = axis.options.filter((option) => option.id !== axis.donor)
  const donor = axis.options.find((option) => option.id === axis.donor)
  const values: Record<string, number>[] = [current]
  const same = (counts: Record<string, number>) => axis.options.every((option) => (counts[option.id] ?? 0) === current[option.id])
  const visit = (at: number, used: number, counts: Record<string, number>) => {
    if (values.length >= limit) return
    if (at === free.length) {
      if (axis.limits.some(({ options, max }) => options.reduce((total, id) => total + (counts[id] ?? 0), 0) > max)) return
      const filled = donor ? { ...counts, [donor.id]: axis.room - used } : counts
      if (donor && (filled[donor.id]! < donor.min || filled[donor.id]! > donor.max)) return
      if (axis.exact && !donor && used !== axis.room) return
      if (!same(filled)) values.push(filled)
      return
    }
    const option = free[at]!
    for (let count = option.min; count <= Math.min(option.max, axis.room - used); count++)
      visit(at + 1, used + count, { ...counts, [option.id]: count })
  }
  visit(0, 0, {})
  return values
}

/** The steps a value takes from the current loadout, each with how many times it applies. */
export function axisChanges(axis: LoadoutAxis, value: LoadoutAssignment[number]): [CombatCarrier[], number][] {
  if (axis.kind === 'single') {
    const option = axis.options.find((candidate) => candidate.id === value)
    return option && value !== axis.current ? [[option.change, 1]] : []
  }
  const counts = value as Record<string, number>
  return axis.options.flatMap((option) => {
    const times = (counts[option.id] ?? 0) - option.count
    return option.id !== axis.donor && times ? [[option.change, times] as [CombatCarrier[], number]] : []
  })
}

/** The roster pick a value-per-axis assignment describes. */
export function loadoutPick(pick: RosterPick, axes: readonly LoadoutAxis[], assignment: LoadoutAssignment): RosterPick {
  const choices = { ...pick.choices }
  const spreads = { ...pick.spreads }
  axes.forEach((axis, at) => {
    const value = assignment[at]!
    if (axis.kind === 'single') {
      if (value === axis.current) return
      const option = axis.options.find((candidate) => candidate.id === value)
      if (option) choices[axis.key] = option.entry
      else delete choices[axis.key]
      return
    }
    const counts = value as Record<string, number>
    if (axis.options.every((option) => (counts[option.id] ?? 0) === option.count)) return
    for (const option of axis.options) spreads[option.group] = { ...spreads[option.group], [option.entry]: counts[option.id] ?? 0 }
  })
  return { ...pick, choices, spreads }
}

/** How the attacker's loadout changes, in words a player reads beside the weapon cards. */
export function loadoutChanges(axes: readonly LoadoutAxis[], assignment: LoadoutAssignment) {
  return axes.flatMap((axis, at) => {
    const value = assignment[at]!
    if (axis.kind === 'single') {
      if (value === axis.current) return []
      const from = axis.options.find((option) => option.id === axis.current)?.name ?? 'Nothing'
      const to = axis.options.find((option) => option.id === value)?.name ?? 'Nothing'
      return [`${from} → ${to}`]
    }
    const counts = value as Record<string, number>
    return axis.options.flatMap((option) => {
      const difference = (counts[option.id] ?? 0) - option.count
      return difference ? [`${difference > 0 ? '+' : '−'}${Math.abs(difference)} ${option.name}`] : []
    })
  })
}

const SAME = 1e-9
/** Smaller gains than these read as the same result, so a suggestion keeps the current loadout. */
const MATERIAL = { wipe: 0.005, meanKills: 0.05, meanDamage: 0.05 } as const

/** Positive when `left` is the better attack: likelier to destroy the unit, then more models, then more wounds. */
export function compareOutcomes(left: CombatResult, right: CombatResult) {
  for (const field of ['wipe', 'meanKills', 'meanDamage'] as const) {
    const difference = left[field] - right[field]
    if (Math.abs(difference) > SAME) return difference
  }
  return 0
}

/** Whether `candidate` beats `current` by enough, in the same order of importance, to suggest it. */
export function materiallyBetter(candidate: CombatResult, current: CombatResult) {
  for (const field of ['wipe', 'meanKills', 'meanDamage'] as const) {
    const difference = candidate[field] - current[field]
    if (Math.abs(difference) >= MATERIAL[field]) return difference > 0
  }
  return false
}

type Phase = 'ranged' | 'melee'
export type LoadoutScore = Record<Phase, CombatResult | null>
export type RankedLoadout = { assignment: LoadoutAssignment; result: CombatResult }
/** One option of one choice with every other choice held at a base loadout. */
export type LoadoutRow = { axis: number; assignment: LoadoutAssignment; result: CombatResult }
export type LoadoutSearch = Record<Phase, { current: CombatResult | null; ranked: RankedLoadout[]; complete: boolean }>

const SPREAD_ROWS = 6

/** How many choices differ, which breaks ties in favour of the smaller change. */
export const changedChoices = (from: LoadoutAssignment, to: LoadoutAssignment) =>
  from.reduce<number>((total, value, at) => total + Number(JSON.stringify(value) !== JSON.stringify(to[at])), 0)

/**
 * Searches one unit's weapon choices against one target, remembering every loadout it scores.
 *
 * Small spaces are searched completely. Larger ones sweep every value of each choice from the
 * current loadout, then improve one choice at a time until no change helps, so `complete` says
 * whether the best is proven.
 */
export function loadoutExplorer(
  space: LoadoutSpace,
  score: (carriers: CombatCarrier[]) => LoadoutScore,
  { exhaustive = 400 }: { exhaustive?: number } = {},
) {
  const values = space.axes.map((axis) => axisValues(axis, exhaustive * 4))
  const current = values.map((options) => options[0]!)
  const allowed = (assignment: LoadoutAssignment) =>
    space.axes.every((axis, at) => {
      if (!axis.host || assignment[at] === current[at]) return true
      const host = space.axes.findIndex((other) => other.key === axis.host)
      return host < 0 || assignment[host] === current[host]
    })
  const scores = new Map<string, LoadoutScore | null>()
  const evaluate = (assignment: LoadoutAssignment) => {
    const key = JSON.stringify(assignment)
    if (!scores.has(key)) {
      const carriers = allowed(assignment)
        ? composeCarriers(
            space.carriers,
            space.axes.flatMap((axis, at) => axisChanges(axis, assignment[at]!)),
          )
        : null
      scores.set(key, carriers ? score(carriers) : null)
    }
    return scores.get(key) ?? null
  }
  // Spreads also move one model at a time, which is how a large squad refines after its first sweep.
  const steps = (at: number, held: LoadoutAssignment[number], reach: number) => {
    const axis = space.axes[at]!
    if (axis.kind === 'single' || axis.uniform || reach === Infinity) return values[at]!
    const counts = held as Record<string, number>
    return values[at]!.filter((value) => {
      const moved = axis.options.reduce(
        (total, option) => total + Math.abs(((value as Record<string, number>)[option.id] ?? 0) - (counts[option.id] ?? 0)),
        0,
      )
      return moved > 0 && moved <= reach
    })
  }
  const complete = values.reduce((product, options) => product * options.length, 1) <= exhaustive
  const visited: LoadoutAssignment[] = []
  const better = (phase: Phase, left: LoadoutAssignment, right: LoadoutAssignment) => {
    const a = evaluate(left)?.[phase]
    const b = evaluate(right)?.[phase]
    return Boolean(a && (!b || compareOutcomes(a, b) > 0))
  }
  // The largest choice goes first, from the current loadout, so both phases share that sweep.
  const order = values.map((_, at) => at).toSorted((left, right) => values[right]!.length - values[left]!.length)
  const climb = (phase: Phase) => {
    let best = current
    visited.push(best)
    for (let pass = 0, improved = true; improved && pass < 16; pass++) {
      improved = false
      order.forEach((at) => {
        for (let moving = true; moving;) {
          moving = false
          for (const value of steps(at, best[at]!, pass ? 2 : Infinity)) {
            const candidate = best.map((held, index) => (index === at ? value : held))
            visited.push(candidate)
            if (better(phase, candidate, best)) {
              best = candidate
              improved = true
              moving = pass > 0 && steps(at, value, 2) !== values[at]
            }
          }
        }
      })
    }
  }
  return {
    current,
    /** The strongest loadouts per phase, best first. */
    search(keep: number): LoadoutSearch {
      if (complete) {
        const visit = (at: number, assignment: LoadoutAssignment) => {
          if (at === values.length) {
            visited.push(assignment)
            evaluate(assignment)
            return
          }
          for (const value of values[at]!) visit(at + 1, [...assignment, value])
        }
        visit(0, [])
      } else {
        climb('ranged')
        climb('melee')
      }
      // Loadouts that differ only in the other phase's weapons share one result. Current values are visited
      // first and the sort is stable, so the smallest change stands for them.
      const ranked = (phase: Phase) => {
        const seen = new Set<CombatResult>()
        return visited
          .flatMap((assignment) => {
            const result = evaluate(assignment)?.[phase]
            return result ? [{ assignment, result }] : []
          })
          .toSorted((left, right) => compareOutcomes(right.result, left.result))
          .filter(({ result }) => !seen.has(result) && Boolean(seen.add(result)))
          .slice(0, keep)
      }
      return {
        ranged: { current: evaluate(current)?.ranged ?? null, ranked: ranked('ranged'), complete },
        melee: { current: evaluate(current)?.melee ?? null, ranked: ranked('melee'), complete },
      }
    },
    /** Each option of each choice with the others held at `base`; large squad splits keep their strongest few. */
    rows(phase: Phase, base: LoadoutAssignment): LoadoutRow[] {
      return values.flatMap((_, at) => {
        const options = space.axes[at]!.kind === 'single' ? values[at]! : [base[at]!, ...steps(at, base[at]!, 2)]
        const row = options.flatMap((value) => {
          const assignment = base.map((held, index) => (index === at ? value : held))
          const result = evaluate(assignment)?.[phase]
          return result ? [{ axis: at, assignment, result }] : []
        })
        return space.axes[at]!.kind === 'single'
          ? row
          : row.toSorted((left, right) => compareOutcomes(right.result, left.result)).slice(0, SPREAD_ROWS)
      })
    },
  }
}

export type LoadoutScoring = {
  sheet: Datasheet
  models: number
  rules: CombatAttacker['rules']
  opponent: CombatOpponent
  preferences: Readonly<Record<string, string>>
  excluded: Readonly<Record<Phase, readonly string[]>>
  phases: Record<Phase, { target: CombatInput['target']; options: CombatOptions; adjustment: WeaponAdjustment } | null>
}

/** Scores carriers through the same attack plan and calculation as the matchup itself. */
export function loadoutScorer(space: LoadoutSpace, scoring: LoadoutScoring) {
  const results = new Map<string, CombatResult | null>()
  const calculate = (input: CombatInput | null) => {
    if (!input) return null
    const key = JSON.stringify(input)
    if (!results.has(key)) {
      try {
        results.set(key, calculateCombat(input))
      } catch {
        results.set(key, null)
      }
    }
    return results.get(key) ?? null
  }
  const inputs = (carriers: readonly CombatCarrier[]) => {
    const attacks = combatAttacks(
      { sheet: loadoutSheet(scoring.sheet, space.weapons, carriers), carriers, models: scoring.models, rules: scoring.rules },
      scoring.opponent,
      scoring.preferences,
      scoring.excluded,
    )
    const input = (phase: Phase) => {
      const setup = scoring.phases[phase]
      return setup ? combatAttackInput(attacks[phase], setup.target, setup.options, setup.adjustment) : null
    }
    return { ranged: input('ranged'), melee: input('melee') }
  }
  return {
    inputs,
    score: (carriers: readonly CombatCarrier[]): LoadoutScore => {
      const { ranged, melee } = inputs(carriers)
      return { ranged: calculate(ranged), melee: calculate(melee) }
    },
  }
}
