import { createFileRoute, redirect } from '@tanstack/react-router'
import { localRedirectPath } from 'ras-stack/auth/client'
import { SignInPage } from '../client/features/account/SignInPage'
import { signInOptionsQuery } from '../client/queries'
import { signedInDestination } from '../client/features/account/signInGuard'
import { searchFlag, searchText } from '../client/searchParams'
import { PROFILE_NAME_MAX_LENGTH } from '../core/profileName'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>) => {
    // `name` starts a new account with the name its holder already played under, such as a guest seat's.
    const result: { next?: string; error?: string; reset?: boolean; join?: boolean; name?: string } = {}
    result.next = localRedirectPath(search.next)
    const error = searchText(search.error)
    if (error) result.error = error
    if (searchFlag(search.reset)) result.reset = true
    if (searchFlag(search.join)) result.join = true
    const name = searchText(search.name, PROFILE_NAME_MAX_LENGTH)
    if (name) result.name = name
    return result
  },
  beforeLoad: async ({ context, location, preload, search }) => {
    if (preload) return
    if (new URLSearchParams(location.searchStr).has('sig')) return
    const destination = await signedInDestination(context.queryClient, search.next)
    if (destination) throw redirect({ href: destination, replace: true })
  },
  loader: ({ context }) => context.queryClient.query({ ...signInOptionsQuery(), staleTime: 'static' }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: SignInRoute,
})

function SignInRoute() {
  return <SignInPage {...Route.useSearch()} />
}
