import { rosterSnapshot } from '../core/rosterSnapshot'
import { app } from './app'
import { unitWoundsIn } from './catalogue'
import { calculateRosterPrice } from './pricing'

type PricedRosterLegality = {
  points: number
  detachmentError: string | null
  dispositionError: string | null
  errors: readonly { entryName: string; message: string }[]
}

export function rosterUseError(priced: PricedRosterLegality, limit: number): string | null {
  if (priced.points > limit) return `roster has ${priced.points} points, over its ${limit}-point limit`
  if (priced.detachmentError) return priced.detachmentError
  if (priced.dispositionError) return priced.dispositionError
  const violation = priced.errors[0]
  return violation ? `${violation.entryName}: ${violation.message}` : null
}

export async function rosterForUse(userId: string, rosterId: string) {
  const saved = await app().service.ownRoster(userId, rosterId)
  if (!saved) throw new Response('you do not own this roster', { status: 403 })
  const catalogue = app().catalogue()
  if (!catalogue) throw new Response('this instance has no catalogue', { status: 409 })
  const priced = calculateRosterPrice(
    {
      catalogueId: saved.catalogueId,
      detachmentIds: saved.detachmentIds,
      disposition: saved.disposition,
      limit: saved.limit,
      units: saved.picks,
    },
    catalogue,
  )
  if (!priced) throw new Response('this instance has no catalogue', { status: 409 })
  const error = rosterUseError(priced, saved.limit)
  if (error) throw new Response(`fix roster errors before using it: ${error}`, { status: 409 })
  const wounds = unitWoundsIn(
    catalogue,
    saved.catalogueId,
    saved.picks.map((pick) => pick.entryId),
  )
  return { saved, snapshot: rosterSnapshot(saved, priced, wounds) }
}
