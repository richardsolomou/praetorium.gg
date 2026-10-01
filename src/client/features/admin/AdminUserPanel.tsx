import { posthog } from 'posthog-js'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Eye, ImageOff, LogOut, Mail, Monitor, Plug, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminUser } from '../../../admin'
import { PROFILE_NAME_MAX_LENGTH, type SocialAuthProvider } from '../../../authConfig'
import {
  deleteUserAsAdmin,
  markEmailVerifiedAsAdmin,
  removeUserImageAsAdmin,
  renameUserAsAdmin,
  revokeConnectionAsAdmin,
  revokeSessionAsAdmin,
  revokeSessionsAsAdmin,
  sendPasswordResetAsAdmin,
  sendVerificationEmailAsAdmin,
  setAdminRole,
  unlinkSignInMethodAsAdmin,
} from '../../../server/functions'
import { authClient } from '../../authClient'
import { useDateFormatting } from '../../dates'
import {
  refreshAdminQueries,
  adminPlayerBattlesQuery,
  adminUserConnectionsQuery,
  adminUserSessionsQuery,
  signInOptionsQuery,
} from '../../queries'
import { Choice } from '../../components/Choice'
import { Fact } from '../../components/Fact'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SettingRow } from '../../components/SettingRow'
import { AdminBattleRow } from './AdminBattleRow'
import { count, MethodIcon, methodName } from './accountText'
import { ConfirmDialog } from './ConfirmDialog'
import { Notice, Problem } from './feedback'

type Role = AdminUser['role']
type Section = 'profile' | 'access' | 'sign-in' | 'sessions' | 'connections'
type Confirming =
  | { kind: 'role'; role: Role }
  | { kind: 'image' }
  | { kind: 'verify' }
  | { kind: 'unlink'; provider: 'credential' | SocialAuthProvider }
  | { kind: 'delete' }

export function AdminUserPanel({ user, current, onClose }: { user: AdminUser; current: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const dates = useDateFormatting()
  const emailDelivery = useQuery(signInOptionsQuery()).data?.passwordReset ?? false
  const [notice, setNotice] = useState<{ section: Section; message: string }>()
  const [confirming, setConfirming] = useState<Confirming>()
  const [name, setName] = useState(user.name)
  const isAdmin = user.role === 'admin'
  const refresh = () => refreshAdminQueries(queryClient)
  const done = async (section: Section, message: string) => {
    await refresh()
    setConfirming(undefined)
    setNotice({ section, message })
  }
  const noticeFor = (section: Section) => (notice?.section === section ? <Notice>{notice.message}</Notice> : null)

  const impersonate = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.impersonateUser({ userId: user.id })
      if (result.error) throw new Error(result.error.message || `Could not view Praetorium as ${user.name}.`)
    },
    onSuccess: () => {
      posthog.capture('admin_impersonation_started')
      window.location.assign('/')
    },
  })
  const rename = useMutation({
    mutationFn: () => renameUserAsAdmin({ data: { userId: user.id, name: name.trim() } }),
    onSuccess: () => done('profile', `Renamed to ${name.trim()}.`),
  })
  const resetPassword = useMutation({
    mutationFn: () => sendPasswordResetAsAdmin({ data: { userId: user.id } }),
    onSuccess: () => done('sign-in', `A reset link was sent to ${user.email}.`),
  })
  const sendVerification = useMutation({
    mutationFn: () => sendVerificationEmailAsAdmin({ data: { userId: user.id } }),
    onSuccess: () => done('sign-in', `A verification link was sent to ${user.email}.`),
  })

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent
        className="ph-no-capture border-edge bg-panel p-0 text-bone"
        style={{ '--drawer-content-width': 'min(34rem, calc(100vw - 1rem))' } as CSSProperties}
      >
        <header className="relative flex items-center gap-3 border-b border-edge px-4 py-3 pr-12">
          <PlayerAvatar name={user.name} image={user.image} className="size-12 text-sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DrawerTitle className="text-xl break-words">{user.name}</DrawerTitle>
              {isAdmin ? <span className="chip text-parchment">Admin</span> : null}
              {current ? <span className="chip">You</span> : null}
            </div>
            <DrawerDescription className="flex min-w-0 items-center gap-1 text-sm text-dim">
              <span className="truncate">{user.email}</span>
              <CopyButton value={user.email} label="Copy email" />
            </DrawerDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" className="absolute top-2 right-2" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-sm">
            <Fact label="Joined" value={dates.date(user.createdAt)} />
            <Fact label="Last seen" value={user.lastSeenAt ? dates.date(user.lastSeenAt) : 'Never'} />
            <Fact label="Friends" value={String(user.friendCount)} />
            <Fact label="Rosters" value={String(user.rosterCount)} />
            <Fact label="Battles" value={String(user.battleCount)} />
            <Fact label="Leagues run" value={String(user.leagueCount)} />
          </dl>

          <Section title="Profile">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                rename.mutate()
              }}
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Display name"
                maxLength={PROFILE_NAME_MAX_LENGTH}
                required
              />
              <Button type="submit" variant="outline" disabled={!name.trim() || name.trim() === user.name || rename.isPending}>
                {rename.isPending ? 'Renaming…' : 'Rename'}
              </Button>
            </form>
            <SettingRow
              icon={<PlayerAvatar name={user.name} image={user.image} className="size-8 text-2xs" />}
              tile={false}
              title="Profile picture"
              detail={user.image ? 'Shown wherever their name is.' : 'None uploaded.'}
              action={
                user.image ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-dim hover:text-destructive"
                    onClick={() => setConfirming({ kind: 'image' })}
                  >
                    <ImageOff /> Remove
                  </Button>
                ) : undefined
              }
            />
            {rename.error ? <Problem error={rename.error} /> : null}
            {noticeFor('profile')}
          </Section>

          <Section title="Access">
            <Choice
              label={current ? 'Role · you cannot change your own' : 'Role'}
              value={user.role}
              columns={2}
              disabled={current}
              options={[
                { value: 'user', name: 'User', detail: 'Plays with no administration access.' },
                { value: 'admin', name: 'Administrator', detail: 'Manages, views as, and deletes players.' },
              ]}
              onChange={(role) => role !== user.role && setConfirming({ kind: 'role', role })}
            />
            <SettingRow
              icon={<Eye className="size-4 text-parchment" aria-hidden />}
              title="View as user"
              detail={
                current
                  ? 'This is you.'
                  : isAdmin
                    ? 'Administrators cannot be viewed as.'
                    : `Use Praetorium with ${user.name}’s permissions for up to one hour.`
              }
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={current || isAdmin || impersonate.isPending}
                  onClick={() => impersonate.mutate()}
                >
                  {impersonate.isPending ? 'Opening…' : 'View'}
                </Button>
              }
            />
            {impersonate.error ? <Problem error={impersonate.error} /> : null}
            {noticeFor('access')}
          </Section>

          <Section title="Sign-in">
            <SettingRow
              icon={<Mail className="size-4 text-parchment" aria-hidden />}
              title="Email"
              detail={user.emailVerified ? 'Verified' : 'Not verified'}
              action={
                user.emailVerified ? undefined : (
                  <span className="flex flex-wrap justify-end gap-1">
                    {emailDelivery ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={sendVerification.isPending}
                        onClick={() => sendVerification.mutate()}
                      >
                        {sendVerification.isPending ? 'Sending…' : 'Send link'}
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming({ kind: 'verify' })}>
                      Mark verified
                    </Button>
                  </span>
                )
              }
            />
            {user.signInMethods.map((method) => (
              <SettingRow
                key={method.providerId}
                icon={<MethodIcon providerId={method.providerId} />}
                title={methodName(method.providerId)}
                detail={`Linked ${dates.date(method.linkedAt)}`}
                action={
                  <span className="flex flex-wrap justify-end gap-1">
                    {method.providerId === 'credential' && emailDelivery ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resetPassword.isPending}
                        onClick={() => resetPassword.mutate()}
                      >
                        {resetPassword.isPending ? 'Sending…' : 'Send reset'}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Unlink ${methodName(method.providerId)}`}
                      onClick={() => setConfirming({ kind: 'unlink', provider: method.providerId as 'credential' | SocialAuthProvider })}
                    >
                      Unlink
                    </Button>
                  </span>
                }
              />
            ))}
            {user.signInMethods.length ? null : (
              <p className="border border-edge bg-sunken p-3 text-sm text-dim">No sign-in method is linked.</p>
            )}
            <SettingRow
              icon={<ShieldCheck className="size-4 text-parchment" aria-hidden />}
              title="Authenticator app"
              action={
                <span className={`chip ${user.twoFactorEnabled ? 'text-achieved' : 'text-dim'}`}>
                  {user.twoFactorEnabled ? 'Enabled' : 'Not set up'}
                </span>
              }
            />
            {resetPassword.error ? <Problem error={resetPassword.error} /> : null}
            {sendVerification.error ? <Problem error={sendVerification.error} /> : null}
            {noticeFor('sign-in')}
          </Section>

          <Sessions user={user} current={current} notice={noticeFor('sessions')} onDone={(message) => done('sessions', message)} />
          <Connections user={user} notice={noticeFor('connections')} onDone={(message) => done('connections', message)} />
          <RecentBattles user={user} />

          {current ? null : (
            <section className="border border-destructive/40 p-4">
              <p className="rubric border-b border-edge pb-2 text-destructive">Delete account</p>
              <div className="mt-3 flex flex-col items-start gap-3">
                <p className="text-sm text-dim">
                  {isAdmin ? 'Remove the administrator role before deleting this account.' : deletionImpact(user)}
                </p>
                <Button type="button" variant="destructive" disabled={isAdmin} onClick={() => setConfirming({ kind: 'delete' })}>
                  <Trash2 /> Delete account
                </Button>
              </div>
            </section>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-edge bg-sunken px-4 py-2 text-xs text-dim">
          <span className="flex min-w-0 items-center gap-1">
            <span className="eyebrow shrink-0">ID</span>
            <span className="readout truncate">{user.id}</span>
            <CopyButton value={user.id} label="Copy user ID" />
          </span>
          <Link to="/users/$userId" params={{ userId: user.id }} className="text-sm text-bone hover:text-info">
            Public profile
          </Link>
        </footer>
      </DrawerContent>

      {confirming ? (
        <Confirmation
          user={user}
          confirming={confirming}
          onClose={() => setConfirming(undefined)}
          onDone={done}
          onDeleted={async () => {
            await refresh()
            onClose()
          }}
        />
      ) : null}
    </Drawer>
  )
}

/** Each change that asks first, with what it says and what it does written together. */
function Confirmation({
  user,
  confirming,
  onClose,
  onDone,
  onDeleted,
}: {
  user: AdminUser
  confirming: Confirming
  onClose: () => void
  onDone: (section: Section, message: string) => Promise<void>
  onDeleted: () => Promise<void>
}) {
  const action = useMutation({
    mutationFn: async () => {
      switch (confirming.kind) {
        case 'role':
          await setAdminRole({ data: { userId: user.id, role: confirming.role } })
          return onDone('access', `${user.name} is now ${confirming.role === 'admin' ? 'an administrator' : 'a user'}.`)
        case 'image':
          await removeUserImageAsAdmin({ data: { userId: user.id } })
          return onDone('profile', 'The profile picture was removed.')
        case 'verify':
          await markEmailVerifiedAsAdmin({ data: { userId: user.id } })
          return onDone('sign-in', `${user.email} is marked as verified.`)
        case 'unlink':
          await unlinkSignInMethodAsAdmin({ data: { userId: user.id, provider: confirming.provider } })
          return onDone('sign-in', `${methodName(confirming.provider)} was unlinked.`)
        case 'delete':
          await deleteUserAsAdmin({ data: { userId: user.id } })
          return onDeleted()
      }
    },
  })
  return (
    <ConfirmDialog
      {...confirmationCopy(user, confirming)}
      pending={action.isPending}
      error={action.error}
      onClose={onClose}
      onConfirm={() => action.mutate()}
    />
  )
}

function confirmationCopy(user: AdminUser, confirming: Confirming) {
  switch (confirming.kind) {
    case 'role':
      return confirming.role === 'admin'
        ? {
            title: `Make ${user.name} an administrator?`,
            description: `${user.name} will be able to manage, view as, and delete every player.`,
            cancel: 'Keep role',
            confirm: 'Make administrator',
            pendingLabel: 'Changing…',
          }
        : {
            title: `Make ${user.name} a user?`,
            description: `${user.name} will lose access to administration.`,
            cancel: 'Keep role',
            confirm: 'Make user',
            pendingLabel: 'Changing…',
          }
    case 'image':
      return {
        title: 'Remove profile picture?',
        description: `${user.name} will show their initial until they choose a new picture.`,
        cancel: 'Keep picture',
        confirm: 'Remove picture',
        pendingLabel: 'Removing…',
        destructive: true,
      }
    case 'verify':
      return {
        title: `Mark ${user.email} as verified?`,
        description:
          'Only once you know the player controls this address: an Apple, Google, or Discord account with the same email can then sign in to this one.',
        cancel: 'Leave unverified',
        confirm: 'Mark verified',
        pendingLabel: 'Saving…',
      }
    case 'unlink':
      return {
        title: `Unlink ${methodName(confirming.provider)}?`,
        description: `${user.name} will no longer be able to sign in with ${methodName(confirming.provider)}. Another sign-in method has to stay linked.`,
        cancel: 'Keep it',
        confirm: 'Unlink',
        pendingLabel: 'Unlinking…',
        destructive: true,
      }
    case 'delete':
      return {
        title: `Delete ${user.name}?`,
        description: deletionImpact(user),
        cancel: 'Keep account',
        confirm: 'Delete account',
        pendingLabel: 'Deleting…',
        destructive: true,
      }
  }
}

function Section({ title, total, children }: { title: string; total?: number; children: ReactNode }) {
  return (
    <section>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        {total === undefined ? null : <span className="readout">{total}</span>}
      </p>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  )
}

function Sessions({
  user,
  current,
  notice,
  onDone,
}: {
  user: AdminUser
  current: boolean
  notice: ReactNode
  onDone: (message: string) => Promise<void>
}) {
  const dates = useDateFormatting()
  const sessions = useQuery(adminUserSessionsQuery(user.id))
  const revokeOne = useMutation({
    mutationFn: (sessionId: string) => revokeSessionAsAdmin({ data: { userId: user.id, sessionId } }),
    onSuccess: () => onDone('That device was signed out.'),
  })
  const revokeAll = useMutation({
    mutationFn: () => revokeSessionsAsAdmin({ data: { userId: user.id } }),
    onSuccess: () => onDone(`${user.name} was signed out on every device.`),
  })
  const list = sessions.data ?? []
  const busy = revokeOne.isPending || revokeAll.isPending
  const error = sessions.error ?? revokeOne.error ?? revokeAll.error
  return (
    <Section title="Signed-in devices" total={sessions.data ? list.length : undefined}>
      {sessions.isPending ? <Skeleton className="h-14 w-full" /> : null}
      {list.map((session) => {
        const device = describeDevice(session.userAgent)
        return (
          <SettingRow
            key={session.id}
            icon={
              device.phone ? <Smartphone className="size-4 text-info" aria-hidden /> : <Monitor className="size-4 text-info" aria-hidden />
            }
            title={
              <>
                {device.name}
                {session.impersonatedBy ? <span className="chip ml-2 align-middle">Admin viewing</span> : null}
              </>
            }
            detail={[`Active ${dates.date(session.updatedAt)}`, `signed in ${dates.date(session.createdAt)}`, session.ipAddress]
              .filter(Boolean)
              .join(' · ')}
            action={
              current ? undefined : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Sign out ${device.name}`}
                  disabled={busy}
                  onClick={() => revokeOne.mutate(session.id)}
                >
                  Sign out
                </Button>
              )
            }
          />
        )
      })}
      {sessions.isSuccess && !list.length ? (
        <p className="border border-edge bg-sunken p-3 text-sm text-dim">{user.name} is not signed in anywhere.</p>
      ) : null}
      {!current && list.length > 1 ? (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => revokeAll.mutate()}>
          <LogOut /> Sign out everywhere
        </Button>
      ) : null}
      {error ? <Problem error={error} /> : null}
      {notice}
    </Section>
  )
}

function Connections({ user, notice, onDone }: { user: AdminUser; notice: ReactNode; onDone: (message: string) => Promise<void> }) {
  const dates = useDateFormatting()
  const connections = useQuery(adminUserConnectionsQuery(user.id))
  const revoke = useMutation({
    mutationFn: (connectionId: string) => revokeConnectionAsAdmin({ data: { userId: user.id, connectionId } }),
    onSuccess: () => onDone('That app no longer has access.'),
  })
  const list = connections.data ?? []
  return (
    <Section title="Connected apps" total={connections.data ? list.length : undefined}>
      {connections.isPending ? <Skeleton className="h-14 w-full" /> : null}
      {list.map((connection) => (
        <SettingRow
          key={connection.id}
          icon={<Plug className="size-4 text-info" aria-hidden />}
          title={connection.name}
          detail={[`Granted ${dates.date(connection.createdAt)}`, connection.scopes.join(', ')].filter(Boolean).join(' · ')}
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Revoke ${connection.name}`}
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(connection.id)}
            >
              Revoke
            </Button>
          }
        />
      ))}
      {connections.isSuccess && !list.length ? (
        <p className="border border-edge bg-sunken p-3 text-sm text-dim">No app has access to this account.</p>
      ) : null}
      {connections.error ? <Problem error={connections.error} /> : null}
      {revoke.error ? <Problem error={revoke.error} /> : null}
      {notice}
    </Section>
  )
}

function RecentBattles({ user }: { user: AdminUser }) {
  const battles = useQuery(adminPlayerBattlesQuery(user.id))
  const list = battles.data ?? []
  return (
    <Section title="Recent battles" total={user.battleCount}>
      {battles.isPending ? <Skeleton className="h-14 w-full" /> : null}
      {list.map((battle) => (
        <AdminBattleRow key={battle.token} battle={battle} />
      ))}
      {battles.isSuccess && !list.length ? (
        <p className="border border-edge bg-sunken p-3 text-sm text-dim">{user.name} has not played a battle.</p>
      ) : null}
      {battles.error ? <Problem error={battles.error} /> : null}
    </Section>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? 'Copied' : label}
      className="shrink-0 text-faint hover:text-bone"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

function deletionImpact(user: AdminUser) {
  const parts = [
    user.rosterCount ? count(user.rosterCount, 'roster', 'rosters') : '',
    user.battleCount ? count(user.battleCount, 'battle', 'battles') : '',
    user.leagueCount ? count(user.leagueCount, 'league they organize', 'leagues they organize') : '',
  ].filter(Boolean)
  const deletes = parts.length
    ? `Deletes the account, ${new Intl.ListFormat('en', { type: 'conjunction' }).format(parts)}.`
    : 'Deletes the account.'
  const shared = user.battleCount ? ' Battles are removed for every player in them.' : ''
  return `${deletes}${shared} This cannot be undone.`
}

/** A device name readable at a glance; the full user agent stays out of the way. */
function describeDevice(userAgent: string | null) {
  const agent = userAgent ?? ''
  const platform = /iPad/.test(agent)
    ? 'iPad'
    : /iPhone/.test(agent)
      ? 'iPhone'
      : /Android/.test(agent)
        ? 'Android'
        : /Mac OS X/.test(agent)
          ? 'Mac'
          : /Windows/.test(agent)
            ? 'Windows'
            : /Linux/.test(agent)
              ? 'Linux'
              : undefined
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : undefined
  return {
    name: [browser, platform].filter(Boolean).join(' on ') || 'Unknown device',
    phone: platform === 'iPhone' || platform === 'Android',
  }
}
