type Read = { status: 'pending' | 'error' | 'success'; faction: unknown }

/**
 * Only the server answering that it has no such book means the book was replaced: a read that has
 * not finished, including the server render before the browser fetches, or one that failed while a
 * deploy rolls out, says nothing about the book.
 */
export function armyAvailability(catalogueId: string, read: Read, indexedIds: readonly string[] | undefined) {
  if (read.faction) return 'ready'
  if (catalogueId && read.status === 'pending') return 'loading'
  if (read.status === 'success' && indexedIds && !indexedIds.includes(catalogueId)) return 'replaced'
  return 'unavailable'
}
