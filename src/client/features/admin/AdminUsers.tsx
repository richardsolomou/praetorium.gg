import { useMemo, useState, type ReactNode } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowDownUp, ListFilter, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AdminUser, AdminUserFilter, AdminUserSort } from '../../../admin'
import { adminUsersQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useSettled } from '../../useSettled'
import { PageContent, PageHeader } from '../../components/Page'
import { SearchField } from '../../components/SearchField'
import { AdminUserPanel } from './AdminUserPanel'
import { AdminUsersTable } from './AdminUsersTable'

export function AdminUsers({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState('')
  const query = useSettled(search.trim())
  const [sort, setSort] = useState<AdminUserSort>('joined')
  const [filter, setFilter] = useState<AdminUserFilter>('all')
  const usersResult = useInfiniteQuery(adminUsersQuery(query, sort, filter))
  const users = useMemo(() => usersResult.data?.pages.flatMap((page) => page.users) ?? [], [usersResult.data])
  // Held rather than looked up, so a new search or sort does not close the player being worked on.
  const [opened, setOpened] = useState<AdminUser>()
  const selected = opened && (users.find((user) => user.id === opened.id) ?? opened)

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
        <section>
          <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
            <span>Players</span>
            {usersResult.data ? <span className="readout">{users.length}</span> : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <SearchField
              className="min-w-56 flex-1"
              value={search}
              onChange={setSearch}
              placeholder="Search by name or email"
              label="Search users"
              clearLabel="Empty the user search"
              maxLength={100}
            />
            <ChoiceMenu label="Show" icon={<ListFilter />} value={filter} options={FILTERS} onChange={setFilter} />
            <ChoiceMenu label="Sort" icon={<ArrowDownUp />} value={sort} options={SORTS} onChange={setSort} />
          </div>
          <div className="mt-2 space-y-2">
            <AdminUsersTable
              users={users}
              currentUserId={currentUserId}
              openedUserId={opened?.id}
              pending={usersResult.isPending}
              empty={usersResult.isSuccess && !users.length}
              sort={sort}
              onSort={setSort}
              onOpen={setOpened}
            />
            {usersResult.error ? (
              <p role="alert" className="border border-edge bg-panel p-4 text-sm text-destructive">
                {errorMessage(usersResult.error)}
              </p>
            ) : null}
          </div>
          {usersResult.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={usersResult.isFetchingNextPage || usersResult.isPlaceholderData}
              onClick={() => void usersResult.fetchNextPage()}
            >
              {usersResult.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </section>
      </PageContent>

      {selected ? (
        <AdminUserPanel key={selected.id} user={selected} current={selected.id === currentUserId} onClose={() => setOpened(undefined)} />
      ) : null}
    </main>
  )
}

const FILTERS: { value: AdminUserFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'admins', label: 'Administrators' },
  { value: 'no-two-factor', label: 'Without two-factor' },
  { value: 'unverified', label: 'Unverified email' },
]
const SORTS: { value: AdminUserSort; label: string }[] = [
  { value: 'joined', label: 'Recently joined' },
  { value: 'seen', label: 'Recently seen' },
]

function ChoiceMenu<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string
  icon: ReactNode
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const current = options.find((option) => option.value === value)?.label ?? ''
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" aria-label={`${label}: ${current}`} />}>
        {icon}
        {current}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={(chosen) => onChange(chosen as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
