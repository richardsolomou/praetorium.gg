import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminPanel } from '../client/components/AdminPanel'
import { adminUsersQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/admin')({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery())
    if (me?.role !== 'admin' || me.impersonatedBy) throw redirect({ to: '/' })
    await context.queryClient.ensureInfiniteQueryData(adminUsersQuery('')).catch(() => undefined)
    return me
  },
  component: Admin,
})

function Admin() {
  const me = Route.useLoaderData()
  return <AdminPanel currentUserId={me.id} />
}
