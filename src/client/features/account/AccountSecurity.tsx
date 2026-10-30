import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, MailCheck, ShieldCheck, Trash2 } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useAuthAction } from 'ras-stack/auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { PASSWORD_MIN_LENGTH, SOCIAL_AUTH_PROVIDER_NAMES, SOCIAL_PROVIDERS, type SocialAuthProvider } from '../../../authConfig'
import { revokeMcpConnection, setOwnPassword, unlinkOwnAccount } from '../../functions'
import { authClient } from '../../authClient'
import { hasNativeAuthBridge, requestNativeAuth, useGithubAuthAvailability } from '../../nativeAuth'
import { accountMethodsQuery, mcpConnectionsQuery, meQuery } from '../../queries'
import { AuthMethodIcon } from './AuthMethodIcon'
import { captureAuthFailure } from './authFailureReason'
import { ConnectedAppIcon } from './ConnectedAppIcon'
import { GithubSupporter } from './GithubSupporter'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/Dialog'
import { SettingRow } from '../../components/SettingRow'
import { PageState } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useCopyText } from '../../useCopyText'
import { useQrCode } from '../../components/useQrCode'
import { SectionHeading } from '../../components/SectionHeading'

type AccountIdentity = {
  email: string
  twoFactorEnabled: boolean
}

type DialogKind = 'create-password' | 'change-password' | 'delete-account' | 'two-factor-setup' | 'two-factor-disable'

export function AccountSecurity({ me, preferences }: { me: AccountIdentity; preferences: ReactNode }) {
  const methodsResult = useQuery(accountMethodsQuery())
  const connectionsResult = useQuery(mcpConnectionsQuery())
  const { data: methods, isPending: methodsPending } = methodsResult
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<DialogKind>()
  const [removing, setRemoving] = useState<'credential' | SocialAuthProvider>()
  const [verificationSent, setVerificationSent] = useState(false)
  const [linkError, setLinkError] = useState(false)
  const [revoking, setRevoking] = useState<{ id: string; name: string }>()
  const verifyEmail = useAuthAction()
  const githubAuthAvailable = useGithubAuthAvailability()
  const linked = new Set(methods?.linked ?? [])
  const hasPassword = linked.has('credential')
  const available = new Set<string>(methods?.availableProviders ?? [])
  const canRemove = (provider: 'credential' | SocialAuthProvider) =>
    [...linked].some((candidate) => candidate !== provider && (candidate === 'credential' || available.has(candidate)))
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountMethodsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: meQuery().queryKey }),
    ])
  }

  if (methodsResult.isError) {
    return (
      <div className="grid gap-6">
        <PageState
          headingLevel={2}
          eyebrow="Account security"
          title="Could not load sign-in methods"
          explanation="Your security settings could not be loaded. Try again."
          action={
            <Button variant="outline" onClick={() => void methodsResult.refetch()} disabled={methodsResult.isFetching}>
              Try again
            </Button>
          }
        />
        {preferences}
      </div>
    )
  }

  return (
    <div className="ph-no-capture grid gap-6">
      <section id="sign-in-methods" className="border border-edge bg-panel p-5 md:p-7">
        <SectionHeading title="Sign-in and security" />
        {methodsPending ? <AccountMethodsSkeleton /> : null}
        {methods ? (
          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            {methods.emailDelivery && !methods.emailVerified ? (
              <div className="border border-edge bg-sunken p-3 lg:col-span-2">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center bg-raised text-parchment">
                    <MailCheck className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-bone">Verify your email</p>
                    <p className="mt-1 text-xs text-dim">
                      Verify {me.email} so a matching Apple, Google, Discord or GitHub account can sign you in safely.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={verifyEmail.busy || verificationSent}
                  onClick={async () => {
                    verifyEmail.clearError()
                    const result = await verifyEmail.run(() =>
                      authClient.sendVerificationEmail({ email: me.email, callbackURL: '/profile?verified=true' }),
                    )
                    if (!result.error) setVerificationSent(true)
                  }}
                >
                  {verificationSent ? 'Verification email sent' : 'Send verification email'}
                </Button>
                {verifyEmail.error ? <Problem className="mt-2">{verifyEmail.error}</Problem> : null}
              </div>
            ) : null}
            <MethodRow
              method="credential"
              name="Password"
              linked={hasPassword}
              available
              note={canRemove('credential') && me.twoFactorEnabled ? 'Turn off two-factor to remove' : undefined}
              action={
                hasPassword ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDialog('change-password')}>
                      Change
                    </Button>
                    {canRemove('credential') ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={me.twoFactorEnabled}
                        onClick={() => setRemoving('credential')}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setDialog('create-password')}>
                    Create password
                  </Button>
                )
              }
            />
            {SOCIAL_PROVIDERS.filter((provider) => available.has(provider) || linked.has(provider)).map((provider) => (
              <div key={provider} className="space-y-2">
                <MethodRow
                  method={provider}
                  name={SOCIAL_AUTH_PROVIDER_NAMES[provider]}
                  linked={linked.has(provider)}
                  available={available.has(provider)}
                  action={
                    linked.has(provider) ? (
                      canRemove(provider) ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setRemoving(provider)}>
                          Unlink
                        </Button>
                      ) : null
                    ) : provider === 'github' && !githubAuthAvailable ? (
                      <span className="text-xs text-faint">Update the app to link GitHub.</span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          posthog.capture('sign_in_method_linking_started', { provider })
                          setLinkError(false)
                          if (hasNativeAuthBridge()) {
                            const token = await authClient.oneTimeToken.generate()
                            if (token.error || !token.data?.token) {
                              if (token.error) posthog.captureException(token.error, { operation: 'native_auth_link_start' })
                              setLinkError(true)
                              return
                            }
                            if (await requestNativeAuth({ action: 'link', provider, next: '/profile', sessionToken: token.data.token }))
                              return
                          }
                          const started = await authClient.linkSocial({ provider, callbackURL: '/profile', errorCallbackURL: '/profile' })
                          if (started.error) {
                            captureAuthFailure(started.error, { action: 'link', method: provider })
                            setLinkError(true)
                          }
                        }}
                      >
                        Link
                      </Button>
                    )
                  }
                />
                {provider === 'github' ? <GithubSupporter /> : null}
              </div>
            ))}
            <SettingRow
              icon={<ShieldCheck className="size-4 text-parchment" aria-hidden />}
              title="Two-factor authentication"
              detail={
                me.twoFactorEnabled
                  ? 'Enabled · Protects password sign-in'
                  : hasPassword
                    ? 'Not set up · Protects password sign-in'
                    : 'Needs a password'
              }
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasPassword}
                  onClick={() => setDialog(me.twoFactorEnabled ? 'two-factor-disable' : 'two-factor-setup')}
                >
                  {me.twoFactorEnabled ? 'Turn off' : 'Set up authenticator'}
                </Button>
              }
            />
            {linkError ? <Problem className="lg:col-span-2">Secure provider linking could not start. Try again.</Problem> : null}
          </div>
        ) : null}
      </section>

      {preferences}

      <section className="border border-edge bg-panel p-5 md:p-7">
        <SectionHeading title="Connected apps" />
        <p className="text-sm text-dim">
          Apps you have allowed to read or change your rosters and battles.{' '}
          <Link to="/docs/$docId" params={{ docId: 'connect-an-assistant' }} className="text-info underline-offset-4 hover:underline">
            Connect Claude, ChatGPT or Gemini
          </Link>
        </p>
        {connectionsResult.isPending ? <Skeleton className="mt-4 h-10 w-full" /> : null}
        {connectionsResult.isError ? (
          <Button className="mt-4" variant="outline" onClick={() => void connectionsResult.refetch()}>
            Try again
          </Button>
        ) : null}
        {connectionsResult.data?.length === 0 ? <p className="mt-4 text-sm text-dim">No apps connected.</p> : null}
        {connectionsResult.data?.length ? (
          <div className="mt-4 space-y-3">
            {connectionsResult.data.map((connection) => (
              <SettingRow
                key={connection.id}
                icon={<ConnectedAppIcon name={connection.name} />}
                title={connection.name}
                detail={[
                  connection.scopes.includes('mcp:read') ? 'Read rosters and battles' : null,
                  connection.scopes.includes('mcp:write') ? 'Change rosters and record battles' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => setRevoking(connection)}>
                    Revoke access
                  </Button>
                }
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="border border-destructive/40 bg-panel p-5 md:p-7">
        <SectionHeading title="Delete account" className="text-destructive" />
        <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-dim">
            Permanently deletes your rosters, friendships, tournaments, the groups you own and every battle you played.
          </p>
          <Button type="button" variant="destructive" disabled={!methods} onClick={() => setDialog('delete-account')}>
            <Trash2 /> Delete account
          </Button>
        </div>
      </section>

      {dialog === 'create-password' ? (
        <AccountDialog
          title="Create a password"
          description="Add email and password sign-in alongside your linked providers."
          onClose={() => setDialog(undefined)}
        >
          <CreatePasswordForm
            onDone={async () => {
              setDialog(undefined)
              await refresh()
            }}
          />
        </AccountDialog>
      ) : null}
      {dialog === 'change-password' ? (
        <AccountDialog title="Change password" onClose={() => setDialog(undefined)}>
          <ChangePasswordForm onDone={() => setDialog(undefined)} />
        </AccountDialog>
      ) : null}
      {dialog === 'two-factor-setup' ? (
        <AccountDialog title="Set up two-factor authentication" onClose={() => setDialog(undefined)}>
          <TwoFactorSetupForm
            onDone={async () => {
              setDialog(undefined)
              await refresh()
            }}
          />
        </AccountDialog>
      ) : null}
      {dialog === 'two-factor-disable' ? (
        <AccountDialog title="Turn off two-factor authentication" onClose={() => setDialog(undefined)}>
          <DisableTwoFactorForm
            onDone={async () => {
              setDialog(undefined)
              await refresh()
            }}
          />
        </AccountDialog>
      ) : null}
      {dialog === 'delete-account' ? (
        <AccountDialog
          title="Delete your account"
          description="This cannot be undone. Your rosters, friendships, tournament entries, the groups you own and every battle you played will be deleted."
          onClose={() => setDialog(undefined)}
        >
          <DeleteAccountForm hasPassword={hasPassword} />
        </AccountDialog>
      ) : null}
      {removing ? (
        <RemoveMethodDialog
          method={removing}
          onClose={() => setRemoving(undefined)}
          onDone={async () => {
            setRemoving(undefined)
            await refresh()
          }}
        />
      ) : null}
      {revoking ? (
        <RevokeConnectionDialog
          connection={revoking}
          onClose={() => setRevoking(undefined)}
          onDone={async () => {
            setRevoking(undefined)
            await queryClient.invalidateQueries({ queryKey: mcpConnectionsQuery().queryKey })
          }}
        />
      ) : null}
    </div>
  )
}

function AccountMethodsSkeleton() {
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2" aria-label="Loading sign-in methods">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border border-edge bg-sunken p-3" aria-hidden>
          <Skeleton className="size-8 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  )
}

function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const { busy, error, run } = useAuthAction({
    failureMessage: () =>
      hasPassword
        ? 'The account was not deleted. Check your password and try again.'
        : 'The account was not deleted. Sign out, sign in again, then retry while the session is fresh.',
  })

  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault()
        const result = await run(() => authClient.deleteUser(hasPassword ? { password } : {}))
        if (result.error) {
          posthog.captureException(result.error, { operation: 'account_delete' })
          return
        }
        posthog.capture('account_deleted')
        posthog.reset()
        window.location.assign('/')
      }}
    >
      <DialogBody>
        {hasPassword ? (
          <div className="space-y-2">
            <Label htmlFor="delete-account-password">Confirm your password</Label>
            <Input
              id="delete-account-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        ) : (
          <p className="text-sm text-dim">Your recent Apple, Google, Discord or GitHub sign-in confirms this request.</p>
        )}
        <label className="flex items-start gap-3 text-sm text-dim">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-destructive"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>I understand that my account and its battles cannot be recovered.</span>
        </label>
        {error ? <Problem>{error}</Problem> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Keep account</DialogClose>
        <Button type="submit" variant="destructive" disabled={busy || !confirmed || (hasPassword && !password)}>
          {busy ? 'Deleting…' : 'Permanently delete account'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function MethodRow({
  method,
  name,
  linked,
  available,
  note,
  action,
}: {
  method: 'credential' | SocialAuthProvider
  name: string
  linked: boolean
  available: boolean
  /** Why an action beside the row is unavailable. */
  note?: string
  action: ReactNode
}) {
  return (
    <SettingRow
      icon={<AuthMethodIcon method={method} />}
      title={name}
      detail={[linked ? 'Linked' : available ? 'Available to link' : 'Unavailable', note].filter(Boolean).join(' · ')}
      action={action}
    />
  )
}

function AccountDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="ph-no-capture">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CreatePasswordForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAuthAction({
    failureMessage: () => `The password was not created. Use at least ${PASSWORD_MIN_LENGTH} characters and try again.`,
  })
  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault()
        await run(async () => {
          await setOwnPassword({ data: { password } })
          await onDone()
          return {}
        })
      }}
    >
      <DialogBody>
        <div className="space-y-2">
          <Label htmlFor="create-password">New password</Label>
          <Input
            id="create-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            required
          />
        </div>
        {error ? <Problem>{error}</Problem> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={busy || password.length < PASSWORD_MIN_LENGTH}>
          {busy ? 'Creating…' : 'Create password'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const { busy, error, run } = useAuthAction({
    failureMessage: () => `The password was not changed. Check the current password and use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault()
        const result = await run(() => authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }))
        if (result.error) return
        posthog.capture('password_changed')
        onDone()
      }}
    >
      <DialogBody>
        <p className="text-sm text-dim">Changing your password signs out every other device.</p>
        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            required
          />
        </div>
        {error ? <Problem>{error}</Problem> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={busy || newPassword.length < PASSWORD_MIN_LENGTH}>
          {busy ? 'Changing…' : 'Change password'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function RemoveMethodDialog({
  method,
  onClose,
  onDone,
}: {
  method: 'credential' | SocialAuthProvider
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const remove = useMutation({ mutationFn: () => unlinkOwnAccount({ data: { provider: method } }), onSuccess: onDone })
  const label = method === 'credential' ? 'password sign-in' : SOCIAL_AUTH_PROVIDER_NAMES[method]
  return (
    <ConfirmDialog
      title={method === 'credential' ? 'Remove password sign-in' : `Unlink ${label}`}
      description={`You will no longer be able to sign in with ${label}. Your other linked method will keep working.`}
      cancel={method === 'credential' ? 'Keep password' : `Keep ${label}`}
      confirm={method === 'credential' ? 'Remove password' : `Unlink ${label}`}
      pendingLabel="Removing…"
      destructive
      pending={remove.isPending}
      error={
        remove.isError
          ? new Error('That method was not removed. Keep another available method linked and turn off two-factor authentication first.')
          : null
      }
      onClose={onClose}
      onConfirm={() => remove.mutate()}
    />
  )
}

function RevokeConnectionDialog({
  connection,
  onClose,
  onDone,
}: {
  connection: { id: string; name: string }
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const revoke = useMutation({ mutationFn: () => revokeMcpConnection({ data: { id: connection.id } }), onSuccess: onDone })
  return (
    <ConfirmDialog
      title={`Revoke ${connection.name}?`}
      description={`${connection.name} can no longer read or change your rosters and battles. Connect it again to give it access.`}
      cancel="Keep access"
      confirm="Revoke access"
      pendingLabel="Revoking…"
      destructive
      pending={revoke.isPending}
      error={revoke.isError ? new Error('Could not revoke access. Try again.') : null}
      onClose={onClose}
      onConfirm={() => revoke.mutate()}
    />
  )
}

function TwoFactorSetupForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [totpURI, setTotpURI] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [verified, setVerified] = useState(false)
  const { copy, copied, problem: copyProblem } = useCopyText()
  const start = useAuthAction({ failureMessage: () => 'Setup could not start. Check your password and try again.' })
  const verify = useAuthAction({ failureMessage: () => 'That authenticator code is invalid. Check the app and try again.' })
  const { image: qrCode } = useQrCode(totpURI || null, 240, 'M', 1)

  if (verified) {
    return (
      <>
        <DialogBody>
          <p className="text-sm text-dim">Save these one-time recovery codes somewhere secure. Each code can be used once.</p>
          <div className="grid grid-cols-2 gap-2 border border-edge bg-sunken p-3 font-mono text-sm">
            {backupCodes.map((backupCode) => (
              <span key={backupCode}>{backupCode}</span>
            ))}
          </div>
          {copyProblem ? <Problem>{copyProblem}</Problem> : null}
        </DialogBody>
        {/* Reading order on a phone: copying comes before the button that puts the codes away for good. */}
        <DialogFooter className="flex-col">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              if (
                await copy(backupCodes.join('\n'), {
                  failure: 'Copy failed. Select the codes to copy them.',
                  operation: 'two_factor_recovery_codes_copy',
                })
              )
                posthog.capture('two_factor_recovery_codes_copied')
            }}
          >
            {copied ? (
              <>
                <Check /> Recovery codes copied
              </>
            ) : (
              'Copy recovery codes'
            )}
          </Button>
          <Button type="button" onClick={() => void onDone()}>
            I saved my recovery codes
          </Button>
        </DialogFooter>
      </>
    )
  }

  if (!totpURI) {
    return (
      <form
        className="contents"
        onSubmit={async (event) => {
          event.preventDefault()
          await start.run(async () => {
            const result = await authClient.twoFactor.enable({ password, method: 'totp' })
            if (result.error || !result.data || result.data.method !== 'totp') return { error: result.error ?? result }
            setTotpURI(result.data.totpURI)
            setBackupCodes(result.data.backupCodes)
            setPassword('')
            return result
          })
        }}
      >
        <DialogBody>
          <div className="space-y-2">
            <Label htmlFor="two-factor-password">Confirm your password</Label>
            <Input
              id="two-factor-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {start.error ? <Problem>{start.error}</Problem> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={start.busy || !password}>
            {start.busy ? 'Starting…' : 'Continue'}
          </Button>
        </DialogFooter>
      </form>
    )
  }

  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault()
        const result = await verify.run(() => authClient.twoFactor.verifyTotp({ code: code.replaceAll(/\s/g, '') }))
        if (result.error) return
        posthog.capture('two_factor_enabled')
        setVerified(true)
      }}
    >
      <DialogBody>
        <p className="text-sm text-dim">Scan this QR code in your authenticator app, then enter its current code.</p>
        {qrCode ? <img src={qrCode} alt="Authenticator setup QR code" className="mx-auto size-60 border border-edge bg-white p-2" /> : null}
        <details className="text-sm text-dim">
          <summary className="cursor-pointer">Cannot scan the QR code?</summary>
          <code className="mt-2 block break-all bg-sunken p-2 text-xs">{totpURI}</code>
        </details>
        <div className="space-y-2">
          <Label htmlFor="two-factor-setup-code">Authenticator code</Label>
          <Input
            id="two-factor-setup-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </div>
        {verify.error ? <Problem>{verify.error}</Problem> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={verify.busy || !code.trim()}>
          {verify.busy ? 'Verifying…' : 'Verify and enable'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function DisableTwoFactorForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAuthAction({
    failureMessage: () => 'Two-factor authentication is still on. Check your password and try again.',
  })
  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault()
        await run(async () => {
          const result = await authClient.twoFactor.disable({ password })
          if (result.error) return result
          posthog.capture('two_factor_disabled')
          await onDone()
          return result
        })
      }}
    >
      <DialogBody>
        <p className="text-sm text-dim">Your account returns to password-only sign-in and unused recovery codes stop working.</p>
        <div className="space-y-2">
          <Label htmlFor="disable-two-factor-password">Confirm your password</Label>
          <Input
            id="disable-two-factor-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error ? <Problem>{error}</Problem> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Keep two-factor</DialogClose>
        <Button type="submit" variant="destructive" disabled={busy || !password}>
          {busy ? 'Turning off…' : 'Turn off two-factor authentication'}
        </Button>
      </DialogFooter>
    </form>
  )
}
