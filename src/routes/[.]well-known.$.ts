import { createFileRoute } from '@tanstack/react-router'
import { app } from '../server/app'

export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: ({ request }) => app().auth.handler(request) } },
})
