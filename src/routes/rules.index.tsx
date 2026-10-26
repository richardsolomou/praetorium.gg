import { createFileRoute } from '@tanstack/react-router'
import { RulesIndex } from '../client/features/reference/rules/RulesIndex'
import { pageHead } from '../client/linkPreview'
import { ruleIndexQuery } from '../client/queries'

export const Route = createFileRoute('/rules/')({
  loader: ({ context }) => context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Rules',
      description: 'The Warhammer 40,000 core rules, mission sequence and event rules, searchable by name or rule number.',
      path: '/rules',
    }),
  component: RulesIndex,
})
