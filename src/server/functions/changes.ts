import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { IndexedUpdate } from '../../contracts/catalogueChanges'
import { decodeHistoryCursor, encodeHistoryCursor, historyPage } from '../../core/catalogueHistory'
import { app } from '../app'
import { indexedUpdate } from '../catalogueChangeLog'
import { rpc } from '../rpc'

/** How many data updates one page of the index lists. */
const CHANGE_LOG_PAGE = 20

/**
 * One page of the index of data updates the installed snapshot carries, newest first, and
 * the address of the next. Nobody needs an account to read them. An address naming no page
 * this history has starts again from the newest.
 */
export const catalogueChangeLog = createServerFn({ method: 'GET' })
  .validator(z.object({ before: z.string().max(4096).optional() }))
  .handler(({ data }) =>
    rpc(async (): Promise<{ updates: IndexedUpdate[]; older: string | null }> => {
      const instance = app()
      const before = data.before ? decodeHistoryCursor(data.before) : null
      const page = historyPage((await instance.catalogueHistoryFor()) ?? [], CHANGE_LOG_PAGE, before ?? undefined)
      const canonical = page.entries.length ? await instance.canonicalCatalogueFor() : null
      return {
        updates: page.entries.map((entry) => indexedUpdate(entry, canonical)),
        older: page.next ? encodeHistoryCursor(page.next) : null,
      }
    }),
  )
