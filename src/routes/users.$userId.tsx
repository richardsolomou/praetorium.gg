import { createFileRoute } from '@tanstack/react-router'
import { pageMeta, playerPreview, previewImage } from '../client/linkPreview'
import { PlayerProfilePage, readSearch, recordFilter } from '../client/features/profile/PlayerProfilePage'
import {
  deploymentsQuery,
  meQuery,
  collectionProfileQuery,
  playerAchievementsQuery,
  playerProfileQuery,
  playerRankingsQuery,
  playerRostersQuery,
  userProfileQuery,
} from '../client/queries'

export const Route = createFileRoute('/users/$userId')({
  validateSearch: readSearch,
  loaderDeps: ({ search }) => recordFilter(search),
  loader: async ({ context, params, deps }) => {
    const [, profile, record, rankings] = await Promise.all([
      context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...userProfileQuery(params.userId), staleTime: 'static' }),
      context.queryClient.query({ ...playerProfileQuery(params.userId, deps), staleTime: 'static' }),
      context.queryClient.query({ ...playerRankingsQuery(params.userId), staleTime: 'static' }),
      context.queryClient.query({ ...playerRostersQuery(params.userId), staleTime: 'static' }),
      context.queryClient.query({ ...collectionProfileQuery(params.userId), staleTime: 'static' }),
      context.queryClient.query({ ...playerAchievementsQuery(params.userId), staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    // The same record the page header summarises, narrowed exactly as far as the link is.
    return { preview: profile ? playerPreview(profile.name, record?.record, rankings) : null }
  },
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    if (!preview) return {}
    const path = `/users/${params.userId}`
    return {
      meta: [
        ...pageMeta(match.context.origin, {
          title: preview.title,
          description: preview.description,
          path,
          image: previewImage(path, preview.title),
        }),
        { property: 'og:type', content: 'profile' },
      ],
    }
  },
  component: () => <PlayerProfilePage userId={Route.useParams().userId} search={Route.useSearch()} />,
})
