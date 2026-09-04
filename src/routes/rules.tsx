import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { RulesIndex } from '../client/components/RulesIndex'
import { ruleIndexQuery } from '../client/queries'

export const Route = createFileRoute('/rules')({
  loader: ({ context, location }) => (location.pathname === '/rules' ? context.queryClient.ensureQueryData(ruleIndexQuery()) : undefined),
  component: Rules,
})

function Rules() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  if (path !== '/rules') return <Outlet />
  return <RulesIndex />
}
