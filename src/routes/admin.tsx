import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminUsers } from '../client/features/admin/AdminUsers'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/admin')({
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 0 })
    if (me?.role !== 'admin' || me.impersonatedBy) throw redirect({ to: '/' })
    return me
  },
  component: Admin,
})

function Admin() {
  const me = Route.useLoaderData()
  return <AdminUsers currentUserId={me.id} />
}
