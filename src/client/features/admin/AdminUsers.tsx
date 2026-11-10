import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { ShieldCheck } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { type AdminUser, type AdminUserSort } from '../../../admin'
import { adminUsersQuery, heldCollectionPhotosQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { PageContent, PageHeader } from '../../components/Page'
import { PageTabsList } from '../../components/PageTabs'
import { AdminPhotos } from './AdminPhotos'
import { AdminUserPanel } from './AdminUserPanel'
import { AdminUsersTable } from './AdminUsersTable'
import { type AdminSearch, type AdminTab, DEFAULT_PAGE_SIZE, DEFAULT_SORT } from './adminSearch'
import { Problem } from '../../components/Problem'

const NO_USERS: AdminUser[] = []

export function AdminUsers({
  currentUserId,
  search,
  onTab,
  onSearch,
}: {
  currentUserId: string
  search: AdminSearch
  onTab: (tab: AdminTab) => void
  /** Replaces the players table's part of the address; `undefined` restores a default. */
  onSearch: (change: Omit<AdminSearch, 'tab'>) => void
}) {
  const query = useSettled(search.q?.trim() ?? '')
  const roles = (search.role?.split(',') ?? []) as AdminUser['role'][]
  const sort = search.sort ?? DEFAULT_SORT
  const descending = search.order !== 'asc'
  const sorting: SortingState = [{ id: sort, desc: descending }]
  const pagination: PaginationState = { pageIndex: (search.page ?? 1) - 1, pageSize: search.size ?? DEFAULT_PAGE_SIZE }
  const usersResult = useQuery(
    adminUsersQuery({
      query,
      role: roles,
      sort,
      descending,
      page: pagination.pageIndex,
      pageSize: pagination.pageSize,
    }),
  )
  const users = usersResult.data?.users ?? NO_USERS
  const held = useQuery(heldCollectionPhotosQuery())
  // Held rather than looked up, so a new search or page does not close the player being worked on.
  const [opened, setOpened] = useState<AdminUser>()
  const selected = opened && (users.find((user) => user.id === opened.id) ?? opened)

  return (
    <main className="ph-no-capture w-full">
      <PageHeader
        title="Administration"
        description="Change a player’s access, help them sign in, delete their account, or review players’ photos."
        media={
          <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-edge-strong bg-sunken text-parchment">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
        }
      />

      <PageContent>
        {/* The primitive's root is a flex row by default, which would sit the panel beside the tab bar. */}
        <Tabs value={search.tab ?? 'players'} className="flex-col gap-0" onValueChange={(value) => onTab(value as AdminTab)}>
          <PageTabsList
            tabs={[
              { value: 'players', label: 'Players', count: usersResult.data?.total },
              { value: 'photos', label: 'Photos', count: held.data?.length },
            ]}
          />
          <TabsContent value="players" className="mt-4 space-y-2">
            <AdminUsersTable
              users={users}
              total={usersResult.data?.total ?? 0}
              currentUserId={currentUserId}
              openedUserId={opened?.id}
              pending={usersResult.isPending}
              search={search.q ?? ''}
              onSearch={(value) => onSearch({ q: value || undefined, page: undefined })}
              roles={roles}
              onRoles={(value) => onSearch({ role: value.join(',') || undefined, page: undefined })}
              sorting={sorting}
              onSorting={([value]) =>
                onSearch({
                  sort: !value || value.id === DEFAULT_SORT ? undefined : (value.id as AdminUserSort),
                  order: value && !value.desc ? 'asc' : undefined,
                  page: undefined,
                })
              }
              pagination={pagination}
              onPagination={(value) =>
                onSearch({
                  page: value.pageIndex ? value.pageIndex + 1 : undefined,
                  size: value.pageSize === DEFAULT_PAGE_SIZE ? undefined : value.pageSize,
                })
              }
              onOpen={setOpened}
            />
            {usersResult.error ? <Problem error={usersResult.error} className="part p-4" /> : null}
          </TabsContent>
          <TabsContent value="photos" className="mt-4">
            <AdminPhotos />
          </TabsContent>
        </Tabs>
      </PageContent>

      {selected ? (
        <AdminUserPanel key={selected.id} user={selected} current={selected.id === currentUserId} onClose={() => setOpened(undefined)} />
      ) : null}
    </main>
  )
}
