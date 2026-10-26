import { useAuthAction } from 'ras-stack/auth/react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { authClient } from '../../authClient'

export function McpConsentPage({
  signedIn,
  client,
  scopes,
  next,
}: {
  signedIn: boolean
  client: string | null
  scopes: readonly string[]
  next: string
}) {
  const {
    busy: pending,
    error,
    run,
  } = useAuthAction({
    failureMessage: () => 'Could not finish connecting. Start the connection again from your assistant.',
  })

  const decide = async (accept: boolean) => {
    const result = await run(() => authClient.oauth2.consent({ accept }))
    if (!result.error && 'data' in result && result.data?.url) window.location.assign(result.data.url)
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <p className="eyebrow">Connected apps</p>
      <h1 className="mt-2 text-3xl">Connect to Praetorium</h1>
      {signedIn ? (
        <>
          <p className="mt-4 text-dim">{client} is asking to access your Praetorium account.</p>
          <ul className="mt-6 list-disc space-y-2 pl-5 text-sm">
            {scopes.includes('openid') && <li>Identify your Praetorium account.</li>}
            {scopes.includes('profile') && <li>Read your profile name and picture.</li>}
            {scopes.includes('mcp:read') && <li>Read your saved rosters and battles.</li>}
            {scopes.includes('mcp:write') && <li>Edit your rosters, create battles, and record battle actions.</li>}
            {scopes.includes('offline_access') && <li>Stay connected until you revoke access.</li>}
          </ul>
          {error && (
            <p role="alert" className="mt-4 text-destructive">
              {error}
            </p>
          )}
          <div className="mt-8 flex gap-3">
            <Button disabled={pending} onClick={() => void decide(true)}>
              Allow access
            </Button>
            <Button disabled={pending} variant="outline" onClick={() => void decide(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-4 text-dim">Sign in to choose what this app may access.</p>
          <a className={buttonClass({ className: 'mt-6' })} href={`/sign-in?${new URLSearchParams({ next })}`}>
            Sign in to continue
          </a>
        </>
      )}
    </main>
  )
}
