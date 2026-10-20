import { createFileRoute } from '@tanstack/react-router'
import { CollectionPage } from '../client/features/collection/CollectionPage'
import {
  collectionCountsQuery,
  collectionPhotosQuery,
  collectionProgressQuery,
  collectionQuery,
  collectionWishesQuery,
  combatUnitsQuery,
  factionIndexQuery,
  fieldedDatasheetsQuery,
  meQuery,
} from '../client/queries'

export const Route = createFileRoute('/collection')({
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (!me) return
    await Promise.all([
      context.queryClient.query({ ...collectionQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...collectionCountsQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...collectionProgressQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...collectionWishesQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...collectionPhotosQuery(), staleTime: 'static' }).catch(() => ({})),
      // Suggestions are optional; a failed read leaves them out instead of failing the page.
      context.queryClient.query({ ...fieldedDatasheetsQuery(), staleTime: 'static' }).catch(() => []),
      context.queryClient.query({ ...combatUnitsQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
    ])
  },
  component: CollectionPage,
})
