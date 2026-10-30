import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { SealedEventPage } from '../client/features/sealedEvents/SealedEventPage'
import { eventAddress } from '../client/functions'
import { deploymentsQuery, sealedEventQuery } from '../client/queries'
import { searchFlag, searchText } from '../client/searchParams'

export const Route = createFileRoute('/tournaments/$token')({
  validateSearch: (search: Record<string, unknown>): { event?: string; start?: boolean; choose?: boolean } => ({
    event: searchText(search.event),
    ...(searchFlag(search.start) ? { start: true } : {}),
    ...(searchFlag(search.choose) ? { choose: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ context, params, deps, location }) => {
    const [sealedEvent] = await Promise.all([
      deps.event ? null : context.queryClient.query({ ...sealedEventQuery(params.token), staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (sealedEvent?.kind === 'tournament' && sealedEvent.token === params.token) return
    // Anything else is a link from elsewhere: a retired host's, now its group's, a hidden-list game's, or one naming its event.
    const address = await eventAddress({ data: { token: params.token, eventToken: deps.event } })
    const { event: _event, ...search } = location.search as { event?: string; start?: boolean; choose?: boolean }
    if (address?.kind === 'tournament')
      throw redirect({ to: '/tournaments/$token', params: { token: address.token }, search, replace: true })
    if (address?.kind === 'hidden-list-game')
      throw redirect({
        to: '/groups/$token/games/$game',
        params: { token: address.groupToken, game: address.token },
        search,
        replace: true,
      })
    if (address?.kind === 'group') throw redirect({ to: '/groups/$token', params: { token: address.groupToken }, replace: true })
    throw notFound()
  },
  component: SealedEventRoute,
})

function SealedEventRoute() {
  const { token } = Route.useParams()
  const { start, choose } = Route.useSearch()
  return <SealedEventPage token={token} startBattle={start} chooseRoster={choose} />
}
