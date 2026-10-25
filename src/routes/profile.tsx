import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '../client/features/account/ProfilePage'
import { githubSponsorshipQuery, meQuery, playerDefaultsQuery } from '../client/queries'
import { searchFlag, searchText } from '../client/searchParams'

export const Route = createFileRoute('/profile')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { error?: string; verified?: boolean } = {}
    const error = searchText(search.error)
    if (error) result.error = error
    if (searchFlag(search.verified)) result.verified = true
    return result
  },
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (me)
      await Promise.all([
        context.queryClient.query({ ...playerDefaultsQuery(), staleTime: 'static' }),
        context.queryClient.query({ ...githubSponsorshipQuery(), staleTime: 'static' }),
      ])
  },
  component: ProfileRoute,
})

function ProfileRoute() {
  return <ProfilePage {...Route.useSearch()} />
}
