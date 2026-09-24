import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { LinkedChangeSet } from '../../contracts/catalogueChanges'
import { decodeHistoryCursor, encodeHistoryCursor, historyKey, historyPage } from '../../core/catalogueHistory'
import { app } from '../app'
import { linkedChanges } from '../catalogueChangeLog'
import { rpc } from '../rpc'

/** How many data updates one page of the changes page lists. */
const CHANGE_LOG_PAGE = 20

/**
 * One page of the data updates the installed snapshot carries, newest first, and the
 * address of the next. Nobody needs an account to read them. An address naming no page
 * this history has starts again from the newest.
 */
export const catalogueChangeLog = createServerFn({ method: 'GET' })
  .validator(z.object({ before: z.string().max(4096).optional() }))
  .handler(({ data }) =>
    rpc((): { updates: LinkedChangeSet[]; older: string | null } => {
      const instance = app()
      const before = data.before ? decodeHistoryCursor(data.before) : null
      const page = historyPage(instance.catalogueHistory() ?? [], CHANGE_LOG_PAGE, before ?? undefined)
      const canonical = page.entries.length ? instance.canonicalCatalogue() : null
      return {
        updates: page.entries.map((entry) => ({
          key: historyKey(entry),
          recordedAt: entry.recordedAt,
          ...linkedChanges(entry.changes, canonical),
        })),
        older: page.next ? encodeHistoryCursor(page.next) : null,
      }
    }),
  )
