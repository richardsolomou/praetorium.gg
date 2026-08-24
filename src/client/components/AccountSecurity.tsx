import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ShieldCheck } from 'lucide-react'
import posthog from 'posthog-js'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setOwnPassword, unlinkOwnAccount } from '../../server/functions'
import { authClient } from '../authClient'
import { accountMethodsQuery, meQuery } from '../queries'
import { AuthMethodIcon, SOCIAL_AUTH_PROVIDER_NAMES, type SocialAuthProvider } from './AuthMethodIcon'

type AccountIdentity = {
  twoFactorEnabled: boolean
}

type DialogKind = 'create-password' | 'change-password' | 'two-factor-setup' | 'two-factor-disable'

export function AccountSecurity({ me }: { me: AccountIdentity }) {
  const { data: methods } = useQuery(accountMethodsQuery())
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<DialogKind>()
  const [removing, setRemoving] = useState<'credential' | SocialAuthProvider>()
  const linked = new Set(methods?.linked ?? [])
  const hasPassword = linked.has('credential')
  const available = new Set(methods?.availableProviders ?? [])
  const usableMethods = Number(hasPassword) + [...available].filter((provider) => linked.has(provider)).length
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountMethodsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: meQuery().queryKey }),
    ])
  }

  return (
    <div className="ph-no-capture mx-auto mt-6 grid max-w-5xl gap-6 px-3 sm:px-0 lg:grid-cols-2">
      <section className="border border-edge bg-panel p-5 md:p-7">
        <p className="rubric border-b border-edge pb-2">Two-factor authentication</p>
        <div className="mt-4 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center border border-edge bg-sunken text-parchment">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base">Authenticator app</h2>
              <span className={`chip ${me.twoFactorEnabled ? 'text-achieved' : 'text-dim'}`}>
                {me.twoFactorEnabled ? 'Enabled' : hasPassword ? 'Not set up' : 'Needs a password'}
              </span>
            </div>
            <p className="mt-1 text-sm text-dim">
              {me.twoFactorEnabled
                ? 'Password sign-in requires a current authenticator code or one-time recovery code.'
                : hasPassword
                  ? 'Protect password sign-in with a time-based code from your authenticator app.'
                  : 'Create a password sign-in method before setting up an authenticator.'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={!hasPassword}
          onClick={() => setDialog(me.twoFactorEnabled ? 'two-factor-disable' : 'two-factor-setup')}
        >
          {me.twoFactorEnabled ? 'Turn off' : 'Set up authenticator'}
        </Button>
      </section>

      <section className="border border-edge bg-panel p-5 md:p-7">
        <p className="rubric border-b border-edge pb-2">Sign-in methods</p>
        {!methods ? <p className="mt-4 text-sm text-dim">Loading sign-in methods…</p> : null}
        {methods ? (
          <div className="mt-4 space-y-3">
            <MethodRow
              method="password"
              name="Password"
              linked={hasPassword}
              available
              action={
                hasPassword ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDialog('change-password')}>
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={usableMethods < 2 || me.twoFactorEnabled}
                      onClick={() => setRemoving('credential')}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setDialog('create-password')}>
                    Create password
                  </Button>
                )
              }
            />
            {(['google', 'discord'] as const)
              .filter((provider) => available.has(provider) || linked.has(provider))
              .map((provider) => (
                <MethodRow
                  key={provider}
                  method={provider}
                  name={SOCIAL_AUTH_PROVIDER_NAMES[provider]}
                  linked={linked.has(provider)}
                  available={available.has(provider)}
                  action={
                    linked.has(provider) ? (
                      <Button type="button" variant="ghost" size="sm" disabled={usableMethods < 2} onClick={() => setRemoving(provider)}>
                        Unlink
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          posthog.capture('sign_in_method_linking_started', { provider })
                          void authClient.linkSocial({ provider, callbackURL: '/profile', errorCallbackURL: '/profile' })
                        }}
                      >
                        Link
                      </Button>
                    )
                  }
                />
              ))}
          </div>
        ) : null}
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
    </div>
  )
}

function MethodRow({
  method,
  name,
  linked,
  available,
  action,
}: {
  method: SocialAuthProvider | 'password'
  name: string
  linked: boolean
  available: boolean
  action: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border border-edge bg-sunken p-3">
      <span className="grid size-8 shrink-0 place-items-center bg-raised">
        <AuthMethodIcon method={method} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-bone">{name}</p>
        <p className="text-xs text-dim">{linked ? 'Linked' : available ? 'Available to link' : 'Unavailable'}</p>
      </div>
      {action}
    </div>
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
      <DialogContent className="ph-no-capture rounded-none border border-edge bg-panel sm:max-w-lg">
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
          await setOwnPassword({ data: { password } })
          await onDone()
        } catch {
          setError('The password was not created. Use at least 10 characters and try again.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="create-password">New password</Label>
        <Input
          id="create-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={10}
          autoComplete="new-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="rounded-none border-edge bg-sunken">
        <Button type="submit" disabled={busy || password.length < 10}>
          {busy ? 'Creating…' : 'Create password'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError('')
        const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
        if (result.error) setError('The password was not changed. Check the current password and use at least 10 characters.')
        else {
          posthog.capture('password_changed')
          onDone()
        }
        setBusy(false)
      }}
    >
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
          minLength={10}
          autoComplete="new-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="rounded-none border-edge bg-sunken">
        <Button type="submit" disabled={busy || newPassword.length < 10}>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = method === 'credential' ? 'password sign-in' : SOCIAL_AUTH_PROVIDER_NAMES[method]
  return (
    <AccountDialog title={method === 'credential' ? 'Remove password sign-in' : `Unlink ${label}`} onClose={onClose}>
      <p className="text-sm text-dim">You will no longer be able to sign in with {label}. Your other linked method will keep working.</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="rounded-none border-edge bg-sunken">
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await unlinkOwnAccount({ data: { provider: method } })
              await onDone()
            } catch {
              setError('That method was not removed. Keep another available method linked and turn off two-factor authentication first.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Removing…' : method === 'credential' ? 'Remove password' : `Unlink ${label}`}
        </Button>
      </DialogFooter>
    </AccountDialog>
  )
}

function TwoFactorSetupForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [totpURI, setTotpURI] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [verified, setVerified] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (totpURI) void QRCode.toDataURL(totpURI, { width: 240, margin: 1 }).then(setQrCode)
  }, [totpURI])

  if (verified) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-dim">Save these one-time recovery codes somewhere secure. Each code can be used once.</p>
        <div className="grid grid-cols-2 gap-2 border border-edge bg-sunken p-3 font-mono text-sm">
          {backupCodes.map((backupCode) => (
            <span key={backupCode}>{backupCode}</span>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(backupCodes.join('\n'))
            posthog.capture('two_factor_recovery_codes_copied')
            setCopied(true)
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
        <Button type="button" className="w-full" onClick={() => void onDone()}>
          I saved my recovery codes
        </Button>
      </div>
    )
  }

  if (!totpURI) {
    return (
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          const result = await authClient.twoFactor.enable({ password })
          if (result.error || !result.data) setError('Setup could not start. Check your password and try again.')
          else {
            setTotpURI(result.data.totpURI)
            setBackupCodes(result.data.backupCodes)
            setPassword('')
          }
          setBusy(false)
        }}
      >
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? 'Starting…' : 'Continue'}
        </Button>
      </form>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError('')
        const result = await authClient.twoFactor.verifyTotp({ code: code.replaceAll(/\s/g, '') })
        if (result.error) setError('That authenticator code is invalid. Check the app and try again.')
        else {
          posthog.capture('two_factor_enabled')
          setVerified(true)
        }
        setBusy(false)
      }}
    >
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
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy || !code.trim()}>
        {busy ? 'Verifying…' : 'Verify and enable'}
      </Button>
    </form>
  )
}

function DisableTwoFactorForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError('')
        const result = await authClient.twoFactor.disable({ password })
        if (result.error) setError('Two-factor authentication is still on. Check your password and try again.')
        else {
          posthog.capture('two_factor_disabled')
          await onDone()
        }
        setBusy(false)
      }}
    >
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
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="rounded-none border-edge bg-sunken">
        <Button type="submit" variant="destructive" disabled={busy || !password}>
          {busy ? 'Turning off…' : 'Turn off two-factor authentication'}
        </Button>
      </DialogFooter>
    </form>
  )
}
