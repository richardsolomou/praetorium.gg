import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { IndexedUpdate } from '../../contracts/catalogueChanges'
import type { CatalogueChange } from '../../core/catalogueChanges'
import { decodeHistoryCursor, encodeHistoryCursor, historyPage, updateSummary } from '../../core/catalogueHistory'
import { app } from '../app'
import { factionHistory, indexedUpdate, listedHistory, recentReferenceChanges } from '../catalogueChangeLog'
import { historyAnchor } from '../catalogueHistory'
import { rpc } from '../rpc'
import { parseReleaseNotes } from '../../core/releaseNotes'
import changelog from '../../../CHANGELOG.md?raw'

const installedHistory = async () => listedHistory((await app().catalogueHistoryFor()) ?? [])

/** How many data updates one page of the index lists. */
const CHANGE_LOG_PAGE = 20

/**
 * One page of the index of data updates the installed snapshot carries, newest first, and
 * the address of the next, across every faction or for the one a slug names. Nobody needs an
 * account to read them. An address naming no page this history has starts again from the newest.
 */
export const catalogueChangeLog = createServerFn({ method: 'GET' })
  .validator(z.object({ before: z.string().max(4096).optional(), faction: z.string().max(200).optional() }))
  .handler(({ data }) =>
    rpc(async (): Promise<{ updates: IndexedUpdate[]; older: string | null }> => {
      const instance = app()
      const before = data.before ? decodeHistoryCursor(data.before) : null
      const history = await installedHistory()
      const canonical = history.length ? await instance.canonicalCatalogueFor(data.faction) : null
      const scoped = data.faction ? (canonical ? factionHistory(history, canonical, data.faction) : []) : history
      const page = historyPage(scoped, CHANGE_LOG_PAGE, before ?? undefined)
      return {
        updates: page.entries.map((entry) => indexedUpdate(entry, canonical)),
        older: page.next ? encodeHistoryCursor(page.next) : null,
      }
    }),
  )

/** The newest changes the installed history recorded to one datasheet or detachment page. */
export const referenceChanges = createServerFn({ method: 'GET' })
  .validator(z.object({ kind: z.enum(['datasheet', 'detachment']), faction: z.string().max(200), slug: z.string().max(200) }))
  .handler(({ data }) =>
    rpc(async (): Promise<{ recordedAt: number; change: CatalogueChange }[]> => {
      const instance = app()
      const history = await installedHistory()
      const canonical = history.length ? await instance.canonicalCatalogueFor(data.faction) : null
      return recentReferenceChanges(history, canonical, data)
    }),
  )

/** How many armies the home page asks after, which is at most one per list it shows. */
const ARMY_UPDATE_FACTIONS = 5

/**
 * The newest data update that reached each named faction, with only the count of its changes:
 * the home page points at the faction's updates page rather than carrying them.
 */
export const armyUpdates = createServerFn({ method: 'GET' })
  .validator(z.object({ factions: z.array(z.string().max(200)).max(ARMY_UPDATE_FACTIONS) }))
  .handler(({ data }) =>
    rpc(async () => {
      const instance = app()
      const history = await installedHistory()
      if (!history.length) return []
      const newest = await Promise.all(
        data.factions.map(async (slug) => {
          const canonical = await instance.canonicalCatalogueFor(slug)
          const entry = canonical ? historyPage(factionHistory(history, canonical, slug), 1).entries[0] : undefined
          if (!entry) return []
          return [
            {
              slug,
              recordedAt: entry.recordedAt,
              anchor: historyAnchor(entry),
              changes: updateSummary(entry.changes).total,
            },
          ]
        }),
      )
      return newest.flat()
    }),
  )

/** How many app releases What's new lists. */
const RELEASE_NOTES = 15
const releaseNotes = parseReleaseNotes(changelog, RELEASE_NOTES)

/** The app's own release notes, kept apart from the game-data updates above. */
export const appReleaseNotes = createServerFn({ method: 'GET' }).handler(() => rpc(async () => releaseNotes))
