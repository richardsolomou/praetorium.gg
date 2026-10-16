import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { currentUser, requireAdmin } from '../../server/playerSession'

export const Route = createFileRoute('/api/collection-photos/$photoId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const viewer = await currentUser(request)
        // The session's role can be a cached copy, so a claimed administrator is checked against the account.
        const admin =
          viewer?.role === 'admin' &&
          (await requireAdmin(request).then(
            () => true,
            () => false,
          ))
        return app().collectionPhotos.response(params.photoId, viewer?.id ?? null, admin)
      },
    },
  },
})
