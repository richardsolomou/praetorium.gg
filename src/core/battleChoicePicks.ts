import { z } from 'zod'
import { attachedUnits } from './attachedUnits'

/** How many lists and battles a player's in-battle picks are kept for, on a device or with their account; the oldest go first. */
export const BATTLE_CHOICE_SCOPE_LIMIT = 100

/** Whose picks these are: `roster:<id>` for a list, or `battle:<player>:<fielded at>` for a fielded list with no saved roster. */
export const battleChoiceScopeSchema = z.string().min(1).max(300)

const byRule = z.record(z.string().min(1).max(600), z.array(z.string().min(1).max(200)).max(10))

/**
 * The options a player picked for a list or a battle: the army-wide ones by rule, and each unit's by its place and rule,
 * kept only for the line-up they were picked in so adding, removing or moving a unit drops them rather than moving them.
 */
export const battleChoicePicksSchema = z.object({ army: byRule, lineUp: z.string().max(20_000), units: byRule })
export type BattleChoicePicks = z.infer<typeof battleChoicePicksSchema>

export const BATTLE_CHOICE_PICKS_MAX_LENGTH = 40_000

export const NO_BATTLE_CHOICE_PICKS: BattleChoicePicks = { army: {}, lineUp: '', units: {} }

type Placed = readonly { attachedTo?: number }[]

/**
 * Where a unit's pick for a rule is kept, the Attached unit's host first: an Attached unit is one unit, so a pick made on
 * any part of it is the whole unit's. A pick kept under another part still reads, until the unit is picked again.
 */
const unitPickKeys = (placed: Placed, pickIndex: number, rule: string) =>
  attachedUnits(
    placed.map((pick, key) => ({ key, attachedTo: pick.attachedTo })),
    pickIndex,
  ).map(({ key }) => `${key}:${rule}`)

/** The options picked for a rule on the unit at `pickIndex`, as the Attached unit it is part of holds them. */
export const unitPicksOf = (units: BattleChoicePicks['units'], placed: Placed, pickIndex: number, rule: string) =>
  unitPickKeys(placed, pickIndex, rule)
    .map((key) => units[key])
    .find((options) => options?.length)

/** `units` with the options for a rule on the unit at `pickIndex` set for its whole Attached unit, or cleared when none. */
export function withUnitPicks(units: BattleChoicePicks['units'], placed: Placed, pickIndex: number, rule: string, options: string[]) {
  const [host, ...parts] = unitPickKeys(placed, pickIndex, rule)
  const next = Object.fromEntries(Object.entries(units).filter(([key]) => key !== host && !parts.includes(key)))
  return options.length && host ? { ...next, [host]: options } : next
}
