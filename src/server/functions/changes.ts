import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { IndexedUpdate } from '../../contracts/catalogueChanges'
import type { CatalogueChange } from '../../core/catalogueChanges'
import { decodeHistoryCursor, encodeHistoryCursor, historyPage } from '../../core/catalogueHistory'
import { app } from '../app'
import { factionHistory, indexedUpdate, referenceHistory, referencePath } from '../catalogueChangeLog'
import { rpc } from '../rpc'

/** How many data updates one page of the index lists. */
const CHANGE_LOG_PAGE = 20

/** How many of its own changes a reference page lists before pointing at its faction's updates. */
const REFERENCE_CHANGES = 10

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
      const history = (await instance.catalogueHistoryFor()) ?? []
      const canonical = history.length ? await instance.canonicalCatalogueFor() : null
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
      const history = (await instance.catalogueHistoryFor()) ?? []
      const canonical = history.length ? await instance.canonicalCatalogueFor() : null
      return canonical ? referenceHistory(history, canonical, referencePath(data)).slice(0, REFERENCE_CHANGES) : []
    }),
  )
