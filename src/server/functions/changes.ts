import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { IndexedUpdate, LinkedChangeSet } from '../../contracts/catalogueChanges'
import { decodeHistoryCursor, encodeHistoryCursor, historyPage } from '../../core/catalogueHistory'
import { app } from '../app'
import { indexedUpdate, linkedUpdate } from '../catalogueChangeLog'
import { historyUpdate } from '../catalogueHistory'
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
    rpc((): { updates: IndexedUpdate[]; older: string | null } => {
      const instance = app()
      const before = data.before ? decodeHistoryCursor(data.before) : null
      const page = historyPage(instance.catalogueHistory() ?? [], CHANGE_LOG_PAGE, before ?? undefined)
      const canonical = page.entries.length ? instance.canonicalCatalogue() : null
      return {
        updates: page.entries.map((entry) => indexedUpdate(entry, canonical)),
        older: page.next ? encodeHistoryCursor(page.next) : null,
      }
    }),
  )

/** One data update, whole, or null when the installed history holds none by that id. */
export const catalogueUpdate = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().regex(/^[0-9a-f]{16}$/) }))
  .handler(({ data }) =>
    rpc((): LinkedChangeSet | null => {
      const instance = app()
      const entry = historyUpdate(instance.catalogueHistory() ?? [], data.id)
      return entry ? linkedUpdate(entry, instance.canonicalCatalogue()) : null
    }),
  )
