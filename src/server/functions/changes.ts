import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { IndexedUpdate } from '../../contracts/catalogueChanges'
import type { CatalogueChange } from '../../core/catalogueChanges'
import { app } from '../app'
import { recentReferenceChanges } from '../catalogueChangeLog'
import { changeLogPage, installedHistory } from '../catalogueChangePages'
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

const releaseNotes = recentReleaseNotes(changelog, RELEASE_DAYS)

/** The app's own release notes, kept apart from the game-data updates above. */
export const appReleaseNotes = createServerFn({ method: 'GET' }).handler(() => rpc(async () => releaseNotes))
