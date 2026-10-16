import { createFileRoute } from '@tanstack/react-router'
import { CollectionPage } from '../client/features/collection/CollectionPage'
import { collectionInventoryQuery, combatUnitsQuery, factionIndexQuery, fieldedDatasheetsQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/collection')({
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (!me) return
    await Promise.all([
      context.queryClient.query({ ...collectionInventoryQuery(), staleTime: 'static' }),
      // Suggestions are optional; a failed read leaves them out instead of failing the page.
      context.queryClient.query({ ...fieldedDatasheetsQuery(), staleTime: 'static' }).catch(() => []),
      context.queryClient.query({ ...combatUnitsQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
    ])
  },
  component: CollectionPage,
})
