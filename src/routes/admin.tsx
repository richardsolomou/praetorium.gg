import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminPanel } from '../client/components/AdminPanel'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/admin')({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery())
    if (me?.role !== 'admin' || me.impersonatedBy) throw redirect({ to: '/' })
    return me
  },
  component: Admin,
})

function Admin() {
  const me = Route.useLoaderData()
  return <AdminPanel currentUserId={me.id} />
}
