import { createFileRoute } from '@tanstack/react-router'
import { FullPageState } from '../client/components/PageState'
import { McpConsentPage } from '../client/features/account/McpConsentPage'
import { mcpConsentDetails } from '../server/mcpConsent'

export const Route = createFileRoute('/mcp-consent')({
  loader: () => mcpConsentDetails(),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: () => <McpConsentPage {...Route.useLoaderData()} />,
  // An expired or replayed request cannot be retried from here; only the app can start a new one.
  errorComponent: () => (
    <FullPageState
      eyebrow="Connected apps"
      title="This connection request has expired"
      explanation="Start the connection again from your app."
    />
  ),
})
