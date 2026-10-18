import { rosterSnapshot } from '../core/rosterSnapshot'
import { ROSTER_NOT_USABLE } from '../core/rosterUse'
import { app } from './app'
import { unitBattleDetailsIn } from '../shared/catalogue'
import { calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'

export { rosterUseProblem, rosterUseError } from '../core/rosterLegality'
import { rosterUseError } from '../core/rosterLegality'

/** A battle may field a roster a friend lent; a league entry is sealed from the entrant's own rosters. */
export async function rosterForUse(userId: string, rosterId: string, options: { lent?: boolean } = {}) {
  const usable = await app().service.rosterService.usableRoster(userId, rosterId)
  if (!usable || (usable.lentBy && !options.lent)) {
    throw new Response(options.lent ? 'this roster is not yours or lent to you' : 'you do not own this roster', { status: 403 })
  }
  const { roster: saved, lentBy } = usable
  return { saved, snapshot: { ...(await frozenRoster(saved)), ...(lentBy ? { lentBy } : {}) } }
}

type UsableRoster = Parameters<typeof rosterSnapshot>[0] &
  Parameters<typeof savedRosterPriceInput>[0] &
  Parameters<typeof rosterUseError>[1]

/** A list priced, checked, and frozen the way a battle fields it, whoever holds it. */
export async function frozenRoster(saved: UsableRoster) {
  const catalogue = await app().catalogueFor(saved.catalogueId)
  if (!catalogue) throw new Response('army data is not available', { status: 409 })
  const rules = await app().rulesFor(saved.catalogueId)
  if (!rules) throw new Response('army rules data is not available', { status: 409 })
  const priced = calculateRosterPrice(savedRosterPriceInput(saved), catalogue, rules)
  if (!priced) throw new Response('army data is not available', { status: 409 })
  const error = rosterUseError(priced, saved)
  if (error) throw new Response(`${ROSTER_NOT_USABLE}: ${error}`, { status: 409 })
  const details = unitBattleDetailsIn(
    catalogue,
    saved.catalogueId,
    saved.picks.map((pick) => pick.entryId),
  )
  return rosterSnapshot(saved, priced, details)
}
