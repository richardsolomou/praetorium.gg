import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SignInRequired } from '../client/components/SignInRequired'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/rosters')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: RostersLayout,
})

function RostersLayout() {
  const { data: me } = useQuery(meQuery())
  return me ? <Outlet /> : <SignInRequired title="Your rosters" explanation="Sign in to build a list and keep it between battles." />
}
