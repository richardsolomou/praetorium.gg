import posthog from 'posthog-js'
import { useDeferredValue, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, Eye, KeyRound, ShieldCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminUser } from '../../admin'
import { PASSWORD_MIN_LENGTH } from '../../authConfig'
import { setAdminRole } from '../../server/functions'
import { authClient } from '../authClient'
import { ADMIN_USERS_QUERY_KEY, adminUsersQuery } from '../queries'
import { PlayerAvatar } from './PlayerAvatar'

type Action = 'impersonate' | 'role' | 'password'

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState('')
  const query = useDeferredValue(search.trim())
  const usersResult = useInfiniteQuery(adminUsersQuery(query))
  const users = usersResult.data?.pages.flatMap((page) => page.users) ?? []
  const [adding, setAdding] = useState(false)
  const [selection, setSelection] = useState<{ action: Action; user: AdminUser }>()

  return (
    <main className="ph-no-capture w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-3 py-5 sm:px-4 sm:py-7">
          <span className="grid size-12 shrink-0 place-items-center border border-edge-strong bg-sunken text-parchment">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-parchment">Administration</p>
            <h1 className="text-3xl">Users</h1>
            <p className="mt-1 text-sm text-dim">Manage accounts, access, passwords and support sessions.</p>
          </div>
          <Button type="button" onClick={() => setAdding(true)}>
            <UserPlus /> Add user
          </Button>
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-6xl border-y border-edge bg-panel sm:border">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge p-4">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="admin-user-search">Search users</Label>
            <Input
              id="admin-user-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or email…"
              className="rounded-none border-edge bg-sunken"
            />
          </div>
          {usersResult.isPending ? (
            <Skeleton className="h-4 w-24" aria-label="Loading user count" />
          ) : (
            <p className="text-sm text-dim">{users.length} users shown</p>
          )}
        </div>
        {usersResult.error ? <p className="p-5 text-sm text-destructive">The user list could not be loaded.</p> : null}
        {!usersResult.isPending && !usersResult.error && !users.length ? (
          <p className="p-5 text-sm text-dim">No users match this search.</p>
        ) : null}
        {usersResult.isPending || users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-sunken text-xs tracking-wide text-dim uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">User</th>
                  <th className="px-4 py-2 font-semibold">Role</th>
                  <th className="hidden px-4 py-2 font-semibold md:table-cell">Security</th>
                  <th className="hidden px-4 py-2 font-semibold lg:table-cell">Activity</th>
                  <th className="hidden px-4 py-2 font-semibold xl:table-cell">Created</th>
                  <th className="w-12 px-4 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usersResult.isPending
                  ? Array.from({ length: 4 }, (_, index) => <AdminUserSkeleton key={index} />)
                  : users.map((user) => (
                      <tr key={user.id} className="border-t border-edge hover:bg-raised/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <PlayerAvatar name={user.name} image={user.image} className="size-9 text-xs" />
                            <div className="min-w-0">
                              <p className="font-semibold text-bone">{user.name}</p>
                              <p className="text-xs text-dim">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="chip">{user.role === 'admin' ? 'Admin' : 'User'}</span>
                        </td>
                        <td className="hidden px-4 py-3 text-dim md:table-cell">
                          <p>{user.twoFactorEnabled ? '2FA enabled' : 'No 2FA'}</p>
                          <p className="text-xs">{methodNames(user.signInMethods)}</p>
                        </td>
                        <td className="hidden px-4 py-3 text-dim lg:table-cell">
                          {user.rosterCount} rosters · {user.battleCount} battles
                        </td>
                        <td className="hidden px-4 py-3 text-dim xl:table-cell">
                          <time dateTime={new Date(user.createdAt).toISOString()}>
                            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(user.createdAt))}
                          </time>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <UserActions
                            user={user}
                            current={user.id === currentUserId}
                            onAction={(action) => setSelection({ action, user })}
                          />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {usersResult.hasNextPage ? (
          <div className="border-t border-edge p-4 text-center">
            <Button
              type="button"
              variant="outline"
              disabled={usersResult.isFetchingNextPage}
              onClick={() => void usersResult.fetchNextPage()}
            >
              {usersResult.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </section>

      {adding ? <CreateUserDialog onClose={() => setAdding(false)} /> : null}
      {selection ? <UserActionDialog selection={selection} onClose={() => setSelection(undefined)} /> : null}
    </main>
  )
}

function AdminUserSkeleton() {
  return (
    <tr className="border-t border-edge" aria-hidden>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-14" />
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        <Skeleton className="h-4 w-28" />
      </td>
      <td className="hidden px-4 py-3 xl:table-cell">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="size-8" />
      </td>
    </tr>
  )
}

function methodNames(methods: string[]) {
  return (
    methods
      .map((method) =>
        method === 'credential'
          ? 'Password'
          : method === 'apple'
            ? 'Apple'
            : method === 'google'
              ? 'Google'
              : method === 'discord'
                ? 'Discord'
                : method,
      )
      .join(', ') || 'No sign-in method'
  )
}

function UserActions({ user, current, onAction }: { user: AdminUser; current: boolean; onAction: (action: Action) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`} />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-none border border-edge bg-panel">
        <DropdownMenuItem disabled={current || user.role === 'admin'} onClick={() => onAction('impersonate')}>
          <Eye /> View as user
        </DropdownMenuItem>
        <DropdownMenuItem disabled={current} onClick={() => onAction('role')}>
          <ShieldCheck /> {user.role === 'admin' ? 'Remove admin role' : 'Make administrator'}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={current} onClick={() => onAction('password')}>
          <KeyRound /> Set password
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="ph-no-capture rounded-none border border-edge bg-panel sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a password account. The player can link Apple, Google or Discord from their profile later.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError('')
            const result = await authClient.admin.createUser({ name: name.trim(), email, password, role: 'user' })
            if (result.error) setError(result.error.message || 'The account could not be created.')
            else {
              posthog.capture('admin_user_created')
              await queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
              onClose()
            }
            setBusy(false)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="admin-create-name">Name</Label>
            <Input id="admin-create-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-create-email">Email</Label>
            <Input id="admin-create-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-create-password">Password</Label>
            <Input
              id="admin-create-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="rounded-none border-edge bg-sunken">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || password.length < PASSWORD_MIN_LENGTH}>
              {busy ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UserActionDialog({ selection, onClose }: { selection: { action: Action; user: AdminUser }; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { action, user } = selection
  const copy = actionCopy(action, user)
  const submit = async () => {
    setBusy(true)
    setError('')
    switch (action) {
      case 'impersonate': {
        const result = await authClient.admin.impersonateUser({ userId: user.id })
        if (result.error) setError(`Could not view Praetorium as ${user.name}.`)
        else {
          posthog.capture('admin_impersonation_started')
          window.location.assign('/')
        }
        break
      }
      case 'role': {
        try {
          await setAdminRole({ data: { userId: user.id, role: user.role === 'admin' ? 'user' : 'admin' } })
          await queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
          onClose()
        } catch {
          setError('The administrator role was not changed.')
        }
        break
      }
      case 'password': {
        const result = await authClient.admin.setUserPassword({ userId: user.id, newPassword: password })
        if (result.error) setError('The password was not changed.')
        else {
          await queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
          const revoked = await authClient.admin.revokeUserSessions({ userId: user.id })
          if (revoked.error) setError('The password changed, but existing sessions could not be signed out.')
          else {
            posthog.capture('admin_user_password_changed')
            onClose()
          }
        }
        break
      }
    }
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="ph-no-capture rounded-none border border-edge bg-panel sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 border border-edge bg-sunken p-3">
          <PlayerAvatar name={user.name} image={user.image} className="size-10 text-xs" />
          <div>
            <p className="font-semibold text-bone">{user.name}</p>
            <p className="text-xs text-dim">{user.email}</p>
          </div>
        </div>
        {action === 'password' ? (
          <div className="space-y-2">
            <Label htmlFor={`admin-password-${user.id}`}>New password</Label>
            <Input
              id={`admin-password-${user.id}`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="rounded-none border-edge bg-sunken">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || (action === 'password' && password.length < PASSWORD_MIN_LENGTH)}
            onClick={() => void submit()}
          >
            {busy ? 'Working…' : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function actionCopy(action: Action, user: AdminUser) {
  switch (action) {
    case 'impersonate':
      return {
        title: 'View as user',
        description: `Use Praetorium with ${user.name}’s permissions for up to one hour.`,
        submit: `View as ${user.name}`,
      }
    case 'role':
      return {
        title: 'Change administrator access',
        description:
          user.role === 'admin'
            ? `${user.name} will lose access to user administration and impersonation.`
            : `${user.name} will be able to manage and impersonate every user.`,
        submit: 'Change access',
      }
    case 'password':
      return {
        title: 'Set password',
        description: `Replace ${user.name}’s password and sign them out on every device.`,
        submit: 'Set password',
      }
  }
}
