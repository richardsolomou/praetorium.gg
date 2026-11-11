import { decodeHistoryCursor, encodeHistoryCursor, historyPage } from '../core/catalogueHistory'
import { app } from './app'
import { factionHistory, indexedUpdate, listedHistory } from './catalogueChangeLog'

// Kept apart from catalogueChangeLog, which the catalogue refresh script bundles: app() would pull the photo pipeline's native modules into it.
export const installedHistory = async () => listedHistory((await app().catalogueHistoryFor()) ?? [])

/** How many data updates one page of the index lists. */
const CHANGE_LOG_PAGE = 20

/**
 * One page of the data updates the installed snapshot carries, newest first, and the address of
 * the next, across every faction or for the one a slug names. A cursor naming no page this history
 * has starts again from the newest.
 */
export async function changeLogPage({ before, faction }: { before?: string; faction?: string }) {
  const cursor = before ? decodeHistoryCursor(before) : null
  const history = await installedHistory()
  const canonical = history.length ? await app().canonicalCatalogueFor(faction) : null
  const scoped = faction ? (canonical ? factionHistory(history, canonical, faction) : []) : history
  const page = historyPage(scoped, CHANGE_LOG_PAGE, cursor ?? undefined)
  return {
    updates: page.entries.map((entry) => indexedUpdate(entry, canonical)),
    older: page.next ? encodeHistoryCursor(page.next) : null,
  }
}
