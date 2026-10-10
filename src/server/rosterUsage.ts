import { rosterSnapshot } from '../core/rosterSnapshot'
import { ROSTER_NOT_USABLE } from '../core/rosterUse'
import { app } from './app'
import { unitBattleDetailsIn } from '../shared/catalogue'
import { calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'

export { rosterUseProblem, rosterUseError } from '../core/rosterLegality'
import { rosterUseError } from '../core/rosterLegality'

export async function rosterForUse(userId: string, rosterId: string) {
  const saved = await app().service.ownRoster(userId, rosterId)
  if (!saved) throw new Response('you do not own this roster', { status: 403 })
  const catalogue = await app().catalogueFor(saved.catalogueId)
  if (!catalogue) throw new Response('army data is not available', { status: 409 })
  const rules = await app().rulesFor()
  if (!rules) throw new Response('army rules data is not available', { status: 409 })
  const priced = calculateRosterPrice(savedRosterPriceInput(saved), catalogue, rules)
  if (!priced) throw new Response('army data is not available', { status: 409 })
  const error = rosterUseError(priced, saved.limit, saved.waivedRules)
  if (error) throw new Response(`${ROSTER_NOT_USABLE}: ${error}`, { status: 409 })
  const details = unitBattleDetailsIn(
    catalogue,
    saved.catalogueId,
    saved.picks.map((pick) => pick.entryId),
  )
  return { saved, snapshot: rosterSnapshot(saved, priced, details) }
}
