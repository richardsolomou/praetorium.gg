import { createFileRoute } from '@tanstack/react-router'
import { PageLoading } from '../client/components/PageState'

/** A battle you were invited to opens without an account, so nothing is gated here. */
export const Route = createFileRoute('/battles')({
  pendingComponent: PageLoading,
})
