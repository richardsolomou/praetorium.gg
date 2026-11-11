import type { QueryClient } from '@tanstack/react-query'
import { sealedEventQuery, sealedEventRosterQuery } from '../queries/sealedEvents'
import { chunks } from '../../core/collections'

/** How far ahead of the service this device's clock may run before a held sealed roster could predate its seal. */
export const SEALED_CLOCK_MARGIN_MS = 5 * 60_000

/**
 * Saves each event this player takes part in, and every sealed list in it they may read. A sealed list only changes when
 * it is sealed again, so one this device read well after its `sealedAt` is that list and is not downloaded again.
 */
export async function prepareSealedEvents(
  client: QueryClient,
  sealedEvents: readonly { token: string; personal: boolean }[],
  viewerId: string,
  current: () => boolean,
) {
  for (const sealedEvent of sealedEvents.filter((summary) => summary.personal)) {
    if (!current()) return
    const saved = await client.query({ ...sealedEventQuery(sealedEvent.token), staleTime: Infinity })
    if (!saved) continue
    const entries = saved.entries.filter((entry) => {
      if (!entry.submitted || (!saved.revealedAt && entry.userId !== viewerId)) return false
      const held = client.getQueryState(sealedEventRosterQuery(sealedEvent.token, saved.eventToken, entry.userId).queryKey)
      return !(entry.sealedAt !== null && held?.data && held.dataUpdatedAt >= entry.sealedAt + SEALED_CLOCK_MARGIN_MS)
    })
    for (const batch of chunks(entries, 3)) {
      if (!current()) return
      await Promise.allSettled(
        batch.map((entry) => client.query({ ...sealedEventRosterQuery(sealedEvent.token, saved.eventToken, entry.userId), staleTime: 0 })),
      )
    }
  }
}
