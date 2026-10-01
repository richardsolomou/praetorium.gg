import { useState, type ReactNode } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminUser, AdminUserFilter, AdminUserSort } from '../../../admin'
import { useDateFormatting } from '../../dates'
import { adminUsersQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useSettled } from '../../useSettled'
import { PageContent, PageHeader } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchField } from '../../components/SearchField'
import { AdminUserPanel } from './AdminUserPanel'
import { count, MethodIcon, methodName } from './accountText'

export function AdminUsers({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState('')
  const query = useSettled(search.trim())
  const [sort, setSort] = useState<AdminUserSort>('joined')
  const [filter, setFilter] = useState<AdminUserFilter>('all')
  const usersResult = useInfiniteQuery(adminUsersQuery(query, sort, filter))
  const users = usersResult.data?.pages.flatMap((page) => page.users) ?? []
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
            {usersResult.isPending ? Array.from({ length: 4 }, (_, index) => <UserRowSkeleton key={index} />) : null}
            {users.map((user) => (
              <UserRow key={user.id} user={user} current={user.id === currentUserId} onOpen={() => setOpened(user)} />
            ))}
            {usersResult.error ? (
              <p role="alert" className="border border-edge bg-panel p-4 text-sm text-destructive">
                {errorMessage(usersResult.error)}
              </p>
            ) : null}
            {usersResult.isSuccess && !users.length ? (
              <p className="border border-edge bg-panel p-4 text-sm text-dim">No player matches this search.</p>
            ) : null}
          </div>
          {usersResult.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={usersResult.isFetchingNextPage}
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

/** One choice from a short list, in the trigger-and-radio menu the roster library sorts with. */
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

function UserRow({ user, current, onOpen }: { user: AdminUser; current: boolean; onOpen: () => void }) {
  const dates = useDateFormatting()
  const rosters = count(user.rosterCount, 'roster', 'rosters')
  const battles = count(user.battleCount, 'battle', 'battles')
  const activity = [
    rosters,
    battles,
    count(user.friendCount, 'friend', 'friends'),
    ...(user.leagueCount ? [count(user.leagueCount, 'league run', 'leagues run')] : []),
  ].join(' · ')
  const seen = user.lastSeenAt ? `Seen ${dates.date(user.lastSeenAt)}` : 'Never signed in'
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 border border-edge bg-panel p-3 text-left hover:border-edge-strong"
      onClick={onOpen}
    >
      <PlayerAvatar name={user.name} image={user.image} className="size-9 text-xs" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-bold uppercase">{user.name}</span>
          {user.role === 'admin' ? <span className="chip shrink-0 text-parchment">Admin</span> : null}
          {current ? <span className="chip shrink-0">You</span> : null}
        </span>
        <span className="block truncate text-xs text-dim">{user.email}</span>
        <span className="readout block truncate text-xs text-dim md:hidden">
          {/* A phone line leads with when they were last here, which truncation would cut first. */}
          {[seen, rosters, battles].join(' · ')}
        </span>
      </span>
      <span className="readout hidden shrink-0 text-right text-xs text-dim md:block">
        <span className="block">{activity}</span>
        <span className="block">{seen}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-dim">
        {user.signInMethods.map((method) => (
          <MethodIcon key={method.providerId} providerId={method.providerId} className="size-3.5" />
        ))}
        {user.twoFactorEnabled ? <ShieldCheck className="size-3.5 text-achieved" aria-hidden /> : null}
        <span className="sr-only">
          {[...user.signInMethods.map((method) => methodName(method.providerId)), ...(user.twoFactorEnabled ? ['two-factor'] : [])].join(
            ', ',
          )}
        </span>
      </span>
    </button>
  )
}

function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border border-edge bg-panel p-3" aria-hidden>
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-3 w-52 md:hidden" />
      </div>
      <div className="hidden space-y-1.5 md:block">
        <Skeleton className="ml-auto h-3 w-40" />
        <Skeleton className="ml-auto h-3 w-24" />
      </div>
      <Skeleton className="size-3.5 shrink-0" />
    </div>
  )
}
