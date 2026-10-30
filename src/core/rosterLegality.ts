import { enforces, pointsBudgetOf } from './battle'

type PricedRosterLegality = {
  points: number
  detachmentError: string | null
  dispositionError: string | null
  errors: readonly { entryName: string; message: string }[]
}

type RosterAllowance = { limit: number; pointsBudget?: number | null; waivedRules?: readonly string[] }

/** Every reason a list cannot be fielded, most important first. */
export function rosterProblems(
  priced: PricedRosterLegality,
  roster: RosterAllowance,
): { kind: 'over-limit' | 'not-legal'; message: string }[] {
  const budget = pointsBudgetOf(roster)
  const overLimit = priced.points > budget && enforces(roster.waivedRules, 'points-limit')
  return [
    ...(overLimit ? [{ kind: 'over-limit' as const, message: `roster has ${priced.points} points, over its ${budget}-point limit` }] : []),
    ...[priced.detachmentError, priced.dispositionError, ...priced.errors.map((error) => `${error.entryName}: ${error.message}`)]
      .filter((message): message is string => Boolean(message))
      .map((message) => ({ kind: 'not-legal' as const, message })),
  ]
}

/** Why a list cannot be fielded, if it cannot: the one answer a battle, a league and the library all read. */
export const rosterUseProblem = (priced: PricedRosterLegality, roster: RosterAllowance) => rosterProblems(priced, roster)[0] ?? null

export const rosterUseError = (priced: PricedRosterLegality, roster: RosterAllowance) => rosterUseProblem(priced, roster)?.message ?? null
