import { createFileRoute } from '@tanstack/react-router'
import { GuidesPage } from '../client/features/guides/GuidesPage'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/guides/')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Warhammer 40,000 player guides',
      description: 'Learn to build and validate an army list, import a roster, compare unit loadouts and track a battle with Praetorium.',
      path: '/guides',
    }),
  component: GuidesPage,
})
