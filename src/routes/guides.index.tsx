import { createFileRoute } from '@tanstack/react-router'
import { GuidesPage } from '../client/features/guides/GuidesPage'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/guides/')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Warhammer 40,000 player guides',
      description:
        'Prepare for your first Warhammer 40,000 game, build a balanced army and plan your scoring, with guides to lists, loadouts and battle tracking.',
      path: '/guides',
    }),
  component: GuidesPage,
})
