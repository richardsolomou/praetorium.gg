import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { ShieldCheck } from 'lucide-react'
import type { AdminUser, AdminUserSort } from '../../../admin'
import { adminUsersQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useSettled } from '../../useSettled'
import { PageContent, PageHeader } from '../../components/Page'
import { AdminUserPanel } from './AdminUserPanel'
import { AdminUsersTable } from './AdminUsersTable'

const NO_USERS: AdminUser[] = []

export function AdminUsers({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState('')
  const query = useSettled(search.trim())
  const [roles, setRoles] = useState<AdminUser['role'][]>([])
  const [sorting, setSorting] = useState<SortingState>([{ id: 'joined', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })
  const usersResult = useQuery(
    adminUsersQuery({
      query,
      role: roles,
      sort: sorting[0]!.id as AdminUserSort,
      descending: sorting[0]!.desc,
      page: pagination.pageIndex,
      pageSize: pagination.pageSize,
    }),
  )
  const users = usersResult.data?.users ?? NO_USERS
  // Held rather than looked up, so a new search or page does not close the player being worked on.
  const [opened, setOpened] = useState<AdminUser>()
  const selected = opened && (users.find((user) => user.id === opened.id) ?? opened)
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }))

  return (
    <main className="ph-no-capture w-full">
      <PageHeader
        eyebrow="Praetorium"
        title="Administration"
        description="Find a player to change their access, help them sign in, or delete their account."
        media={
          <span className="grid size-12 shrink-0 place-items-center border border-edge-strong bg-sunken text-parchment">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
        }
      />

      <PageContent>
        <section className="space-y-2">
          <p className="rubric border-b border-edge pb-2">Players</p>
          <AdminUsersTable
            users={users}
            total={usersResult.data?.total ?? 0}
            currentUserId={currentUserId}
            openedUserId={opened?.id}
            pending={usersResult.isPending}
            search={search}
            onSearch={(value) => {
              setSearch(value)
              firstPage()
            }}
            roles={roles}
            onRoles={(value) => {
              setRoles(value)
              firstPage()
            }}
            sorting={sorting}
            onSorting={(value) => {
              setSorting(value)
              firstPage()
            }}
            pagination={pagination}
            onPagination={setPagination}
            onOpen={setOpened}
          />
          {usersResult.error ? (
            <p role="alert" className="border border-edge bg-panel p-4 text-sm text-destructive">
              {errorMessage(usersResult.error)}
            </p>
          ) : null}
        </section>
      </PageContent>

      {selected ? (
        <AdminUserPanel key={selected.id} user={selected} current={selected.id === currentUserId} onClose={() => setOpened(undefined)} />
      ) : null}
    </main>
  )
}
