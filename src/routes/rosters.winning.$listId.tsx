import { createFileRoute } from '@tanstack/react-router'
import { PageLoading } from '../client/components/PageState'
import { WinningListRoster } from '../client/features/rosters/WinningListRoster'
import { winningListQuery } from '../client/queries'

export const Route = createFileRoute('/rosters/winning/$listId')({
  pendingComponent: PageLoading,
  loader: ({ context, params }) => context.queryClient.query({ ...winningListQuery(params.listId), staleTime: 'static' }).catch(() => null),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: () => <WinningListRoster id={Route.useParams().listId} />,
})
