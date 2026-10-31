import type { QueryClient } from '@tanstack/react-query'
import { PUBLIC_REFERENCE_QUERIES } from '../../contracts/appSnapshot'
import { peekGuestDraft } from '../features/rosters/guestDraft'

/** Every `catalogueId` in `value`, which is how saved rosters and battles name their faction and pin their rules version. */
export function cataloguesIn(value: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 64 || !value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    if (key === 'catalogueId' && typeof child === 'string') found.add(child)
    else cataloguesIn(child, found, depth + 1)
  }
  return found
}

/** Catalogues this device holds rosters or battles on: its loaded account data and any guest draft. */
export function cataloguesInUse(client: QueryClient) {
  const found = cataloguesIn(peekGuestDraft())
  for (const query of client.getQueryCache().getAll())
    if (!PUBLIC_REFERENCE_QUERIES.has(String(query.queryKey[0]))) cataloguesIn(query.state.data, found)
  return found
}
