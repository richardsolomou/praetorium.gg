import { rosterSnapshot } from '../core/rosterSnapshot'
import { app } from './app'
import { unitWoundsIn } from './catalogue'
import { calculateRosterPrice, savedRosterPriceInput } from './pricing'

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
): { kind: 'over-limit' | 'not-legal'; message: string } | null {
  if (priced.points > limit) return { kind: 'over-limit', message: `roster has ${priced.points} points, over its ${limit}-point limit` }
  const violation = priced.errors[0]
  const message = priced.detachmentError || priced.dispositionError || (violation ? `${violation.entryName}: ${violation.message}` : null)
  return message ? { kind: 'not-legal', message } : null
}

export const rosterUseError = (priced: PricedRosterLegality, limit: number) => rosterUseProblem(priced, limit)?.message ?? null

export async function rosterForUse(userId: string, rosterId: string) {
  const saved = await app().service.ownRoster(userId, rosterId)
  if (!saved) throw new Response('you do not own this roster', { status: 403 })
  const catalogue = app().catalogue()
  if (!catalogue) throw new Response('army data is not available', { status: 409 })
  const rules = app().rules()
  if (!rules) throw new Response('army rules data is not available', { status: 409 })
  const priced = calculateRosterPrice(savedRosterPriceInput(saved), catalogue, rules)
  if (!priced) throw new Response('army data is not available', { status: 409 })
  const error = rosterUseError(priced, saved.limit)
  if (error) throw new Response(`fix roster errors before using it: ${error}`, { status: 409 })
  const wounds = unitWoundsIn(
    catalogue,
    saved.catalogueId,
    saved.picks.map((pick) => pick.entryId),
  )
  return { saved, snapshot: rosterSnapshot(saved, priced, wounds) }
}
