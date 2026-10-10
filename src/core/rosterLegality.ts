import { enforces } from './battle'

type PricedRosterLegality = {
  points: number
  detachmentError: string | null
  dispositionError: string | null
  errors: readonly { entryName: string; message: string }[]
}

/** Why a list cannot be fielded, if it cannot: the one answer a battle, a league and the library all read. */
export function rosterUseProblem(
  priced: PricedRosterLegality,
  limit: number,
  waivedRules: readonly string[] = [],
): { kind: 'over-limit' | 'not-legal'; message: string } | null {
  if (priced.points > limit && enforces(waivedRules, 'points-limit'))
    return { kind: 'over-limit', message: `roster has ${priced.points} points, over its ${limit}-point limit` }
  const violation = priced.errors[0]
  const message = priced.detachmentError || priced.dispositionError || (violation ? `${violation.entryName}: ${violation.message}` : null)
  return message ? { kind: 'not-legal', message } : null
}

export const rosterUseError = (priced: PricedRosterLegality, limit: number, waivedRules: readonly string[] = []) =>
  rosterUseProblem(priced, limit, waivedRules)?.message ?? null
