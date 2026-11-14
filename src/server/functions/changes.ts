import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { IndexedUpdate } from '../../contracts/catalogueChanges'
import type { CatalogueChange } from '../../core/catalogueChanges'
import { historyPage, updateSummary } from '../../core/catalogueHistory'
import { app } from '../app'
import { factionHistory, recentReferenceChanges } from '../catalogueChangeLog'
import { changeLogPage, installedHistory } from '../catalogueChangePages'
import { historyAnchor } from '../catalogueHistory'
import { rpc } from '../rpc'
import { RELEASE_DAYS, recentReleaseNotes } from '../../core/releaseNotes'
// The build bundles only the newest releases of this file: see scripts/lib/recentChangelogPlugin.ts.
import changelog from '../../../CHANGELOG.md?raw'

/** The index of data updates the installed snapshot carries, a page at a time. Nobody needs an account to read them. */
export const catalogueChangeLog = createServerFn({ method: 'GET' })
  .validator(z.object({ before: z.string().max(4096).optional(), faction: z.string().max(200).optional() }))
  .handler(({ data }) => rpc(async (): Promise<{ updates: IndexedUpdate[]; older: string | null }> => changeLogPage(data)))

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

const releaseNotes = recentReleaseNotes(changelog, RELEASE_DAYS)

/** The app's own release notes, kept apart from the game-data updates above. */
export const appReleaseNotes = createServerFn({ method: 'GET' }).handler(() => rpc(async () => releaseNotes))
