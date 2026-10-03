import { tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table'
import { ArrowDown, ArrowDownUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminUser, AdminUserSort } from '../../../admin'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { useDateFormatting } from '../../dates'
import { count, MethodIcon, methodName } from './accountText'

type AdminTableMeta = { currentUserId: string; openedUserId?: string }
const features = tableFeatures({ tableMeta: {} as AdminTableMeta })
const columnClasses: Record<string, string> = {
  player: 'min-w-0',
  activity: 'hidden w-48 md:table-cell',
  security: 'hidden w-36 md:table-cell',
  joined: 'hidden w-28 lg:table-cell',
  seen: 'w-28',
}

const columns: ColumnDef<typeof features, AdminUser>[] = [
  {
    id: 'player',
    header: 'Player',
    cell: ({ row: { original: user }, table }) => (
      <button
        type="button"
        aria-label={user.email}
        aria-haspopup="dialog"
        aria-expanded={table.options.meta?.openedUserId === user.id}
        className="flex min-h-11 w-full min-w-0 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlayerAvatar name={user.name} image={user.image} className="size-9 shrink-0 text-xs" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 md:flex-nowrap">
            <span className="w-full truncate font-bold uppercase md:w-auto">{user.name}</span>
            {user.role === 'admin' ? <span className="chip shrink-0 text-parchment">Admin</span> : null}
            {user.id === table.options.meta?.currentUserId ? <span className="chip shrink-0">You</span> : null}
          </span>
          <span className="block truncate text-xs text-dim">{user.email}</span>
          <span className="readout block truncate text-xs text-dim md:hidden">
            {count(user.rosterCount, 'roster', 'rosters')} · {count(user.battleCount, 'battle', 'battles')}
          </span>
        </span>
      </button>
    ),
  },
  {
    id: 'activity',
    header: 'Activity',
    cell: ({ row: { original: user } }) => (
      <span className="readout text-xs text-dim">
        <span className="block">
          {count(user.rosterCount, 'roster', 'rosters')} · {count(user.battleCount, 'battle', 'battles')}
        </span>
        <span className="block">
          {count(user.friendCount, 'friend', 'friends')}
          {user.leagueCount ? ` · ${count(user.leagueCount, 'league run', 'leagues run')}` : ''}
        </span>
      </span>
    ),
  },
  {
    id: 'security',
    header: 'Sign-in',
    cell: ({ row: { original: user } }) => (
      <span className="space-y-1 text-xs text-dim">
        <span className="flex items-center gap-1.5">
          {user.signInMethods.map((method) => (
            <span key={method.providerId} title={methodName(method.providerId)}>
              <MethodIcon providerId={method.providerId} className="size-3.5" />
              <span className="sr-only">{methodName(method.providerId)}</span>
            </span>
          ))}
          <span>{user.twoFactorEnabled ? '2FA on' : '2FA off'}</span>
        </span>
        <span className={cn('block', !user.emailVerified && 'text-discarded')}>
          {user.emailVerified ? 'Verified email' : 'Unverified email'}
        </span>
      </span>
    ),
  },
  {
    id: 'joined',
    header: 'Joined',
    cell: ({ row }) => <DateCell at={row.original.createdAt} />,
  },
  {
    id: 'seen',
    header: 'Last seen',
    cell: ({ row }) => <DateCell at={row.original.lastSeenAt} />,
  },
]

export function AdminUsersTable({
  users,
  currentUserId,
  openedUserId,
  pending,
  empty,
  sort,
  onSort,
  onOpen,
}: {
  users: AdminUser[]
  currentUserId: string
  openedUserId?: string
  pending: boolean
  empty: boolean
  sort: AdminUserSort
  onSort: (sort: AdminUserSort) => void
  onOpen: (user: AdminUser) => void
}) {
  const table = useTable({
    features,
    columns,
    data: users,
    getRowId: (user) => user.id,
    meta: { currentUserId, openedUserId },
  })

  return (
    <div className="border border-edge bg-panel">
      <Table aria-label="Players" aria-busy={pending} className="table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="border-edge hover:bg-transparent">
              {group.headers.map((header) => {
                const order = header.id === 'joined' || header.id === 'seen' ? header.id : undefined
                return (
                  <TableHead
                    key={header.id}
                    className={cn('px-3 text-dim', columnClasses[header.id])}
                    aria-sort={order && sort === order ? 'descending' : undefined}
                  >
                    {order ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        aria-label={order === 'joined' ? 'Sort by recently joined' : 'Sort by recently seen'}
                        onClick={() => onSort(order)}
                      >
                        <table.FlexRender header={header} />
                        {sort === order ? <ArrowDown aria-hidden /> : <ArrowDownUp aria-hidden />}
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {pending
            ? Array.from({ length: 4 }, (_, index) => (
                <TableRow key={index} className="border-edge" aria-hidden>
                  {columns.map((column) => (
                    <TableCell key={column.id} className={cn('h-19 px-3 md:h-17', columnClasses[column.id!])}>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : null}
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer border-edge focus-within:bg-muted/50"
              data-state={row.id === openedUserId ? 'selected' : undefined}
              onClick={() => onOpen(row.original)}
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cn('px-3 py-3', columnClasses[cell.column.id])}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {empty ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-24 text-center text-dim">
                No player matches this search.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

function DateCell({ at }: { at: Date | null }) {
  const dates = useDateFormatting()
  return <span className="readout text-xs text-dim">{at ? dates.date(at) : 'Never'}</span>
}
