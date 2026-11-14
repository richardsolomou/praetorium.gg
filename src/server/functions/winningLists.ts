import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { rpc } from '../rpc'

/** Recent tournament placings whose lists import cleanly, or null while the first import is still running. */
export const winningLists = createServerFn({ method: 'GET' }).handler(() => rpc(async () => ({ lists: app().winningLists.lists() })))

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
