import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '../client/features/account/ProfilePage'
import { battleAudienceQuery, meQuery, notificationSettingsQuery } from '../client/queries'

export const Route = createFileRoute('/profile')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { error?: string; verified?: boolean } = {}
    if (typeof search.error === 'string' && search.error) result.error = search.error
    if (search.verified === true || search.verified === 'true') result.verified = true
    return result
  },
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (me)
      await Promise.all([
        context.queryClient.query({ ...battleAudienceQuery(), staleTime: 'static' }),
        context.queryClient.query({ ...notificationSettingsQuery(), staleTime: 'static' }),
      ])
  },
  component: ProfileRoute,
})

function ProfileRoute() {
  return <ProfilePage {...Route.useSearch()} />
}
