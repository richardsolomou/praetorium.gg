import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { RulesIndex } from '../client/features/reference/rules/RulesIndex'
import { pageHead } from '../client/linkPreview'
import { ruleIndexQuery } from '../client/queries'

export const Route = createFileRoute('/rules')({
  loader: ({ context, location }) =>
    location.pathname === '/rules' ? context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' }) : undefined,
  head: ({ match, matches }) =>
    matches.at(-1)?.routeId === match.routeId
      ? pageHead(match.context.origin, {
          title: 'Rules',
          description: 'The Warhammer 40,000 core rules, mission sequence and event rules, searchable by name or rule number.',
          path: '/rules',
        })
      : {},
  component: Rules,
})

function Rules() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  if (path !== '/rules') return <Outlet />
  return <RulesIndex />
}
