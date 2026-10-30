import {
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CirclePlus,
  Settings2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ADMIN_USER_PAGE_SIZES, ADMIN_USER_ROLES, type AdminUser, type AdminUserCountSort } from '../../../admin'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchField } from '../../components/SearchField'
import { useDateFormatting } from '../../dates'
import { countLabel } from '../../text'

type AdminTableMeta = { currentUserId: string; openedUserId?: string }
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  tableMeta: {} as AdminTableMeta,
})

type AdminColumnMeta = { label: string; numeric?: true }
const columns: (ColumnDef<typeof features, AdminUser> & { meta: AdminColumnMeta })[] = [
  {
    id: 'name',
    accessorFn: (user) => user.name,
    meta: { label: 'Name' },
    enableHiding: false,
    sortDescFirst: false,
    cell: ({ row: { original: user }, table }) => (
      <span className="flex items-center gap-2">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={table.options.meta?.openedUserId === user.id}
          className="flex max-w-64 min-w-0 items-center gap-2.5 text-left"
        >
          <PlayerAvatar name={user.name} image={user.image} className="size-7 shrink-0 text-[0.625rem]" />
          <span className="truncate font-bold">{user.name}</span>
        </button>
        {user.id === table.options.meta?.currentUserId ? <span className="chip shrink-0">You</span> : null}
      </span>
    ),
  },
  {
    id: 'email',
    accessorFn: (user) => user.email,
    meta: { label: 'Email' },
    sortDescFirst: false,
    cell: ({ row }) => <span className="block max-w-64 truncate text-dim">{row.original.email}</span>,
  },
  {
    id: 'role',
    meta: { label: 'Role' },
    enableSorting: false,
    cell: ({ row }) =>
      row.original.role === 'admin' ? <span className="chip text-parchment">Admin</span> : <span className="text-dim">Player</span>,
  },
  numberColumn('rosters', 'Rosters', (user) => user.rosterCount),
  numberColumn('battles', 'Battles', (user) => user.battleCount),
  numberColumn('friends', 'Friends', (user) => user.friendCount),
  numberColumn('sealedEvents', 'Tournaments', (user) => user.sealedEventCount),
  {
    id: 'joined',
    accessorFn: (user) => user.createdAt,
    meta: { label: 'Joined' },
    cell: ({ row }) => <DateCell at={row.original.createdAt} />,
  },
  {
    id: 'seen',
    accessorFn: (user) => user.lastSeenAt,
    meta: { label: 'Last seen' },
    cell: ({ row }) => <DateCell at={row.original.lastSeenAt} />,
  },
]

function numberColumn(id: AdminUserCountSort, label: string, value: (user: AdminUser) => number) {
  return {
    id,
    accessorFn: value,
    meta: { label, numeric: true },
    sortDescFirst: true,
    cell: ({ row }) => {
      const total = value(row.original)
      return total ? <span className="readout">{total}</span> : <span className="text-dim">-</span>
    },
  } satisfies ColumnDef<typeof features, AdminUser> & { meta: AdminColumnMeta }
}

export function AdminUsersTable({
  users,
  total,
  currentUserId,
  openedUserId,
  pending,
  search,
  onSearch,
  roles,
  onRoles,
  sorting,
  onSorting,
  pagination,
  onPagination,
  onOpen,
}: {
  users: AdminUser[]
  total: number
  currentUserId: string
  openedUserId?: string
  pending: boolean
  search: string
  onSearch: (search: string) => void
  roles: AdminUser['role'][]
  onRoles: (roles: AdminUser['role'][]) => void
  sorting: SortingState
  onSorting: (sorting: SortingState) => void
  pagination: PaginationState
  onPagination: (pagination: PaginationState) => void
  onOpen: (user: AdminUser) => void
}) {
  const table = useTable({
    features,
    columns,
    data: users,
    getRowId: (user) => user.id,
    meta: { currentUserId, openedUserId },
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    rowCount: total,
    state: { sorting, pagination },
    onSortingChange: (update) => onSorting(typeof update === 'function' ? update(sorting) : update),
    onPaginationChange: (update) => onPagination(typeof update === 'function' ? update(pagination) : update),
  })
  const visibleColumns = table.getVisibleLeafColumns()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          className="min-w-56 flex-1 sm:max-w-80"
          value={search}
          onChange={onSearch}
          placeholder="Search by name or email"
          label="Search users"
          clearLabel="Empty the user search"
          maxLength={100}
        />
        <RoleFilter selected={roles} onChange={onRoles} />
        {roles.length ? (
          <Button type="button" variant="ghost" onClick={() => onRoles([])}>
            Reset
            <X aria-hidden />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" className="ml-auto" />}>
            <Settings2 aria-hidden />
            View
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(visible) => column.toggleVisibility(visible)}
                  >
                    {columnLabel(column)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-w-0 border border-edge bg-panel">
        <Table aria-label="Players" aria-busy={pending}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="border-edge hover:bg-transparent">
                {group.headers.map((header) => {
                  const { column } = header
                  const sorted = column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className={cn('px-2 text-[0.8rem] text-dim', numeric(column) && 'text-right')}
                      aria-sort={sorted ? (sorted === 'desc' ? 'descending' : 'ascending') : undefined}
                    >
                      {column.getCanSort() ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn('text-dim', numeric(column) ? '-mr-2.5' : '-ml-2.5')}
                          onClick={column.getToggleSortingHandler()}
                        >
                          {columnLabel(column)}
                          {sorted === 'desc' ? (
                            <ArrowDown aria-hidden />
                          ) : sorted === 'asc' ? (
                            <ArrowUp aria-hidden />
                          ) : (
                            <ChevronsUpDown aria-hidden />
                          )}
                        </Button>
                      ) : (
                        columnLabel(column)
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pending
              ? Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={index} className="border-edge" aria-hidden>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.id} className="h-12 px-2">
                        <Skeleton className="h-4 w-full min-w-8" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer border-edge focus-within:bg-muted/50"
                    data-state={row.id === openedUserId ? 'selected' : undefined}
                    onClick={() => onOpen(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn('h-12 px-2', numeric(cell.column) && 'text-right')}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            {!pending && !users.length ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length} className="h-24 text-center text-dim">
                  No players match this search.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-dim">
        <p className="readout">{pending ? ' ' : countLabel(total, 'player')}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span id="admin-users-page-size">Rows per page</span>
            <Select value={pagination.pageSize} onValueChange={(pageSize: number | null) => pageSize && table.setPageSize(pageSize)}>
              <SelectTrigger aria-labelledby="admin-users-page-size" size="sm" className="w-18">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_USER_PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="readout">
            Page {pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <div className="flex items-center gap-1">
            <PageButton label="First page" disabled={!table.getCanPreviousPage()} onClick={() => table.firstPage()}>
              <ChevronsLeft />
            </PageButton>
            <PageButton label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeft />
            </PageButton>
            <PageButton label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRight />
            </PageButton>
            <PageButton label="Last page" disabled={!table.getCanNextPage()} onClick={() => table.lastPage()}>
              <ChevronsRight />
            </PageButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function columnLabel(column: Column<typeof features, AdminUser>) {
  return (column.columnDef.meta as AdminColumnMeta).label
}

function numeric(column: Column<typeof features, AdminUser>) {
  return (column.columnDef.meta as AdminColumnMeta).numeric
}

const ROLE_NAMES: Record<AdminUser['role'], string> = { admin: 'Administrator', user: 'Player' }

function RoleFilter({ selected, onChange }: { selected: AdminUser['role'][]; onChange: (roles: AdminUser['role'][]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" className="border-dashed" />}>
        <CirclePlus aria-hidden />
        Role
        {selected.length ? <span className="chip ml-1 text-parchment">{selected.map((role) => ROLE_NAMES[role]).join(', ')}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Role</DropdownMenuLabel>
          {ADMIN_USER_ROLES.map((role) => (
            <DropdownMenuCheckboxItem
              key={role}
              checked={selected.includes(role)}
              onCheckedChange={(checked) =>
                onChange(ADMIN_USER_ROLES.filter((option) => (option === role ? checked : selected.includes(option))))
              }
            >
              {ROLE_NAMES[role]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button type="button" variant="outline" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

function DateCell({ at }: { at: Date | null }) {
  const dates = useDateFormatting()
  return <span className="readout text-dim">{at ? dates.date(at) : 'Never'}</span>
}
