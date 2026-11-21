import { z } from 'zod'

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
