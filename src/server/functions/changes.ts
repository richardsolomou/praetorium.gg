import { createServerFn } from '@tanstack/react-start'
import type { LinkedChangeSet } from '../../contracts/catalogueChanges'
import { app } from '../app'
import { linkedChanges } from '../catalogueChangeLog'
import { rpc } from '../rpc'

/** How many data updates the changes page lists. Older ones are only of historical interest. */
const CHANGE_LOG_LIMIT = 20

/** The data updates this instance has recorded, newest first. Nobody needs an account to read them. */
export const catalogueChangeLog = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async (): Promise<LinkedChangeSet[]> => {
    const instance = app()
    const recorded = await instance.service.catalogueChanges(CHANGE_LOG_LIMIT)
    const canonical = recorded.length ? instance.canonicalCatalogue() : null
    return recorded.map((set) => ({ recordedAt: set.recordedAt, ...linkedChanges(set.changes, canonical) }))
  }),
)
