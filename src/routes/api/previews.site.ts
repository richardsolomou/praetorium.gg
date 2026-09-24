import { createFileRoute } from '@tanstack/react-router'
import { siteCard } from '../../client/linkPreview'
import { previewResponse } from '../../server/previewImage'

const DAY_SECONDS = 86_400

export const Route = createFileRoute('/api/previews/site')({
  server: { handlers: { GET: () => previewResponse(() => Promise.resolve({ card: siteCard, maxAge: DAY_SECONDS })) } },
})
