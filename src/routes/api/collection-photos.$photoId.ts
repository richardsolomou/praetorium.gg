import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { currentUserId } from '../../server/playerSession'

export const Route = createFileRoute('/api/collection-photos/$photoId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => app().collectionPhotos.response(params.photoId, await currentUserId(request)),
    },
  },
})
