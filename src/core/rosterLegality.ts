import { enforces, pointsBudgetOf } from './battle'

type PricedRosterLegality = {
  points: number
  detachmentError: string | null
  dispositionError: string | null
  errors: readonly { entryName: string; message: string }[]
}

type RosterAllowance = { limit: number; pointsBudget?: number | null; waivedRules?: readonly string[] }

/** Why a list cannot be fielded, if it cannot: the one answer a battle, a league and the library all read. */
export function rosterUseProblem(
  priced: PricedRosterLegality,
  roster: RosterAllowance,
): { kind: 'over-limit' | 'not-legal'; message: string } | null {
  const budget = pointsBudgetOf(roster)
  if (priced.points > budget && enforces(roster.waivedRules, 'points-limit'))
    return { kind: 'over-limit', message: `roster has ${priced.points} points, over its ${budget}-point limit` }
  const violation = priced.errors[0]
  const message = priced.detachmentError || priced.dispositionError || (violation ? `${violation.entryName}: ${violation.message}` : null)
  return message ? { kind: 'not-legal', message } : null
}

export const rosterUseError = (priced: PricedRosterLegality, roster: RosterAllowance) => rosterUseProblem(priced, roster)?.message ?? null
