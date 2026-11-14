import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { rpc } from '../rpc'

/** Tournament placings whose lists import cleanly, as many as the first import has checked, and whether it still is. */
export const winningLists = createServerFn({ method: 'GET' }).handler(() => rpc(async () => app().winningLists.lists()))

/** How many of a faction's top-four lists field each datasheet, or null while the first import is still running. */
export const topFourUnitCounts = createServerFn({ method: 'GET' })
  .validator(z.object({ catalogueId: z.string().max(80) }))
  .handler(({ data }) => rpc(async () => app().winningLists.unitCounts(data.catalogueId)))

/** A faction's top-four lists that field one datasheet, newest first, or null while the first import is still running. */
export const topFourUnitLists = createServerFn({ method: 'GET' })
  .validator(z.object({ catalogueId: z.string().max(80), entryId: z.string().max(80) }))
  .handler(({ data }) => rpc(async () => app().winningLists.unitLists(data.catalogueId, data.entryId)))

/** One placing's list as it imports today, to read before importing, with its army text for the import review. */
export const winningList = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().max(64) }))
  .handler(({ data }) =>
    rpc(async () => {
      const found = await app().winningLists.list(data.id)
      if (!found) throw new Response('That list is no longer available.', { status: 404 })
      return found
    }),
  )
