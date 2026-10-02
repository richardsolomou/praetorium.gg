import { createFileRoute } from '@tanstack/react-router'
import { indexNowKeyResponse } from '../server/indexNow'

export const Route = createFileRoute('/indexnow.txt')({
  server: { handlers: { GET: () => indexNowKeyResponse() } },
})
