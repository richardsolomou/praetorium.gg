import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminUsers } from '../client/features/admin/AdminUsers'
import { readAdminSearch } from '../client/features/admin/adminSearch'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/admin')({
  validateSearch: readAdminSearch,
  // The table writes its search and order to the address as they change; only arriving needs the administrator check.
  shouldReload: ({ cause }) => cause !== 'stay',
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
      search={Route.useSearch()}
      onTab={(tab) => void navigate({ search: (current) => ({ ...current, tab }) })}
      onSearch={(change) => void navigate({ search: (current) => ({ ...current, ...change }), replace: true, resetScroll: false })}
    />
  )
}
