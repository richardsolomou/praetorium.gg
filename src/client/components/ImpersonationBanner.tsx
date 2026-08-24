import { useState } from 'react'
import { LogOut } from 'lucide-react'
import posthog from 'posthog-js'
import { Button } from '@/components/ui/button'
import { authClient } from '../authClient'

export function ImpersonationBanner({ name, email }: { name: string; email: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <aside className="ph-no-capture fixed right-3 bottom-3 z-50 w-[calc(100%-1.5rem)] max-w-sm border border-discarded bg-panel shadow-2xl sm:right-4 sm:bottom-4 sm:w-auto sm:min-w-80">
      <div className="h-1.5 bg-[repeating-linear-gradient(45deg,var(--color-discarded)_0_10px,var(--color-void)_10px_20px)]" aria-hidden />
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-bone">Viewing as {name}</p>
          <p className="truncate text-xs text-dim">{email}</p>
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            const result = await authClient.admin.stopImpersonating()
            if (result.error) {
              setError('Could not exit impersonation.')
              setBusy(false)
            } else {
              posthog.capture('admin_impersonation_stopped')
              window.location.assign('/admin')
            }
          }}
        >
          <LogOut /> {busy ? 'Exiting…' : 'Exit'}
        </Button>
      </div>
    </aside>
  )
}
