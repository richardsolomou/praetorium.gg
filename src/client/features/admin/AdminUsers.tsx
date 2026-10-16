import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { ShieldCheck } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import type { AdminUser, AdminUserSort } from '../../../admin'
import { adminUsersQuery, heldCollectionPhotosQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useSettled } from '../../useSettled'
import { PageContent, PageHeader } from '../../components/Page'
import { PageTabsList } from '../../components/PageTabs'
import { AdminHeldPhotos } from './AdminHeldPhotos'
import { AdminUserPanel } from './AdminUserPanel'
import { AdminUsersTable } from './AdminUsersTable'

const NO_USERS: AdminUser[] = []

export type AdminTab = 'players' | 'photos'

/** Players is the default, so it stays out of the address. */
export const readAdminSearch = (search: Record<string, unknown>): { tab?: Exclude<AdminTab, 'players'> } =>
  search.tab === 'photos' ? { tab: 'photos' } : {}

export function AdminUsers({ currentUserId, tab, onTab }: { currentUserId: string; tab: AdminTab; onTab: (tab: AdminTab) => void }) {
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
  const held = useQuery(heldCollectionPhotosQuery())
  // Held rather than looked up, so a new search or page does not close the player being worked on.
  const [opened, setOpened] = useState<AdminUser>()
  const selected = opened && (users.find((user) => user.id === opened.id) ?? opened)
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }))

  return (
    <main className="ph-no-capture w-full">
      <PageHeader
        eyebrow="Administrator tools"
        title="Administration"
        description="Change a player’s access, help them sign in, delete their account, or review reported photos."
        media={
          <span className="grid size-12 shrink-0 place-items-center border border-edge-strong bg-sunken text-parchment">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
        }
      />

      <PageContent>
        {/* The primitive's root is a flex row by default, which would sit the panel beside the tab bar. */}
        <Tabs value={tab} className="flex-col gap-0" onValueChange={(value) => onTab(value as AdminTab)}>
          <PageTabsList
            tabs={[
              { value: 'players', label: 'Players', count: usersResult.data?.total },
              { value: 'photos', label: 'Reported photos', count: held.data?.length },
            ]}
          />
          <TabsContent value="players" className="mt-4 space-y-2">
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
          </TabsContent>
          <TabsContent value="photos" className="mt-4">
            <AdminHeldPhotos />
          </TabsContent>
        </Tabs>
      </PageContent>

      {selected ? (
        <AdminUserPanel key={selected.id} user={selected} current={selected.id === currentUserId} onClose={() => setOpened(undefined)} />
      ) : null}
    </main>
  )
}
