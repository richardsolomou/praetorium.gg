import { createFileRoute } from '@tanstack/react-router'
import { feedbackScreenshotResponse } from '../../server/feedbackScreenshots'
import { requireAdmin } from '../../server/playerSession'

export const Route = createFileRoute('/api/feedback-screenshots/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdmin(request)
        } catch (error) {
          if (error instanceof Response) return error
          throw error
        }
        return feedbackScreenshotResponse(params.id)
      },
    },
  },
})
