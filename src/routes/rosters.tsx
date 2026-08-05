import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { IdentityGate } from '../client/components/IdentityGate'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/rosters')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: RostersLayout,
})

function RostersLayout() {
  const { data: me } = useQuery(meQuery())
  return me ? <Outlet /> : <IdentityGate />
}
