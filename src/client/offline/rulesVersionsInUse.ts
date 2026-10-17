import type { QueryClient } from '@tanstack/react-query'
import { PUBLIC_REFERENCE_QUERIES } from '../../contracts/appSnapshot'
import { catalogueEditionId } from '../../core/catalogueEdition'
import { peekGuestDraft } from '../features/rosters/guestDraft'

/** Every rules version named by a `catalogueId` in `value`, which is how saved rosters and battles pin theirs. */
export function rulesVersionsIn(value: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 64 || !value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    if (key === 'catalogueId' && typeof child === 'string') {
      const edition = catalogueEditionId(child)
      if (edition) found.add(edition)
    } else rulesVersionsIn(child, found, depth + 1)
  }
  return found
}

/** Rules versions this device holds rosters or battles on: its loaded account data and any guest draft. */
export function rulesVersionsInUse(client: QueryClient) {
  const found = rulesVersionsIn(peekGuestDraft())
  for (const query of client.getQueryCache().getAll())
    if (!PUBLIC_REFERENCE_QUERIES.has(String(query.queryKey[0]))) rulesVersionsIn(query.state.data, found)
  return found
}
