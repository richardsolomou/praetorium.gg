import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../client/components/buttonClass'
import { PageState } from '../client/components/PageState'
import { authClient } from '../client/authClient'
import { mcpConsentDetails } from '../server/mcpConsent'

export const Route = createFileRoute('/mcp-consent')({
  loader: () => mcpConsentDetails(),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: McpConsent,
  // An expired or replayed request cannot be retried from here; only the app can start a new one.
  errorComponent: () => (
    <main className="flex w-full">
      <PageState
        className="flex-1 border-x-0 border-t-0"
        eyebrow="Connected apps"
        title="This connection request has expired"
        explanation="Start the connection again from your app."
      />
    </main>
  ),
})

function McpConsent() {
  const { signedIn, client, scopes, next } = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const decide = async (accept: boolean) => {
    setPending(true)
    setError(null)
    const result = await authClient.oauth2.consent({ accept })
    if (result.error) {
      setError('Could not finish connecting. Start the connection again from your app.')
      setPending(false)
      return
    }
    if (result.data?.url) window.location.assign(result.data.url)
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
