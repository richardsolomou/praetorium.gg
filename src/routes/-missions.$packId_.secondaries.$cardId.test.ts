import { QueryClient } from '@tanstack/react-query'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { gameReferencesQuery } from '../client/queries'
import { Route } from './missions.$packId_.secondaries.$cardId'

vi.mock('../client/features/reference/missions/SecondaryMissionPage', () => ({ SecondaryMissionPage: () => null }))

const PACK = 'chapter-approved-2026-2027'
const ASSASSINATION = '56ceebfa-1be3-4520-a7cb-10b5e8b2a150'

const load = (cardId: string, secondaries = [{ key: ASSASSINATION, name: 'Assassination' }]) => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(gameReferencesQuery().queryKey, {
    packs: [{ id: PACK, name: 'Chapter Approved 2026-2027' }],
    secondaries,
  } as never)
  const loader = Route.options.loader
  if (typeof loader !== 'function') throw new Error('Missing secondary mission loader')
  return loader({ context: { queryClient }, params: { packId: PACK, cardId }, location: { hash: 'scoring' }, deps: {} } as never)
}

const rejection = (promise: unknown) =>
  Promise.resolve(promise).then(
    () => null,
    (error: unknown) => error,
  )

it('loads a secondary mission by its current key', async () => {
  await expect(load(ASSASSINATION)).resolves.toEqual({ pack: 'Chapter Approved 2026-2027', card: 'Assassination' })
})

it('redirects a name-slug URL to the card it names', async () => {
  const error = await rejection(load('assassination'))
  expect(isRedirect(error) && error.options).toMatchObject({ params: { packId: PACK, cardId: ASSASSINATION }, hash: 'scoring' })
})

it('does not guess between cards that share a name slug', async () => {
  const shared = [
    { key: 'first', name: 'Assassination' },
    { key: 'second', name: 'Variant - Assassination' },
  ]
  expect(isNotFound(await rejection(load('assassination', shared)))).toBe(true)
})

it('does not find an unknown secondary mission', async () => {
  expect(isNotFound(await rejection(load('unknown-card')))).toBe(true)
})
