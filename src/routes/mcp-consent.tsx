import { createFileRoute } from '@tanstack/react-router'
import { FullPageState } from '../client/components/PageState'
import { RouteError } from '../client/components/RouteError'
import { McpConsentPage } from '../client/features/account/McpConsentPage'
import { reportRouteError } from '../client/routeErrors'
import { captureWhenLoaded } from '../posthog'
import { mcpConsentDetails } from '../server/mcpConsent'
import { mcpConsentRefusal } from '../shared/mcpConsent'

const refusalTitles = {
  expired: 'This connection request has expired',
  unknown_client: 'This app is no longer registered',
}

export const Route = createFileRoute('/mcp-consent')({
  loader: () => mcpConsentDetails(),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: () => <McpConsentPage {...Route.useLoaderData()} />,
  onCatch: (error) => {
    const reason = mcpConsentRefusal(error)
    if (reason) captureWhenLoaded('mcp_consent_refused', { reason })
    else reportRouteError(error)
  },
  errorComponent: (props) => {
    const reason = mcpConsentRefusal(props.error)
    // A refused request cannot be retried from here; only the assistant can start a new one.
    return reason ? (
      <FullPageState eyebrow="Connected apps" title={refusalTitles[reason]} explanation="Start the connection again from your assistant." />
    ) : (
      <RouteError {...props} />
    )
  },
})
