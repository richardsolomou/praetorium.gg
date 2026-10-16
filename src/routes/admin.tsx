import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminUsers, readAdminSearch } from '../client/features/admin/AdminUsers'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/admin')({
  validateSearch: readAdminSearch,
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 0 })
    if (me?.role !== 'admin' || me.impersonatedBy) throw redirect({ to: '/' })
    return me
  },
  component: Admin,
})

function Admin() {
  const me = Route.useLoaderData()
  const navigate = Route.useNavigate()
  return (
    <AdminUsers
      currentUserId={me.id}
      tab={Route.useSearch().tab ?? 'players'}
      onTab={(tab) => void navigate({ search: { tab: tab === 'players' ? undefined : tab } })}
    />
  )
}
