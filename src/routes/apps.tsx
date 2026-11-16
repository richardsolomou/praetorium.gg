import { createFileRoute } from '@tanstack/react-router'
import { AppsPage } from '../client/features/apps/AppsPage'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/apps')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Apps',
      description: 'Praetorium for iPhone, iPad, Apple Watch and Android, and in ChatGPT, Claude, Gemini and other AI assistants.',
      path: '/apps',
    }),
  component: AppsPage,
})
