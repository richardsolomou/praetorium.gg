import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '../authClient'

export function TwoFactorSignIn({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void | Promise<void> }) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [trustDevice, setTrustDevice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <form
      className="ph-no-capture mt-8 space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError('')
        const result = recovery
          ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
          : await authClient.twoFactor.verifyTotp({ code: code.replaceAll(/\s/g, ''), trustDevice })
        if (result.error)
          setError(recovery ? 'That recovery code is invalid or has already been used.' : 'That authenticator code is invalid.')
        else {
          await queryClient.invalidateQueries()
          await onSuccess()
        }
        setBusy(false)
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="two-factor-code">{recovery ? 'Recovery code' : 'Authenticator code'}</Label>
        <Input
          id="two-factor-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode={recovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          required
        />
        <p className="text-xs text-dim">
          {recovery
            ? 'Enter one of the one-time codes saved during setup.'
            : 'Enter the current six-digit code from your authenticator app.'}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-dim">
        <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
        Trust this device for 30 days
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-11 w-full text-base" disabled={busy || !code.trim()}>
        {busy ? 'Verifying…' : 'Verify and sign in'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={() => {
          setRecovery((current) => !current)
          setCode('')
          setError('')
        }}
      >
        {recovery ? 'Use authenticator code' : 'Use a recovery code'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onBack}>
        Back to sign in
      </Button>
    </form>
  )
}
