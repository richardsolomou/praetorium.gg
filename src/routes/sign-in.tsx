import { createFileRoute, redirect } from '@tanstack/react-router'
import { localRedirectPath } from 'ras-stack/auth/client'
import { SignInPage } from '../client/features/account/SignInPage'
import { signInOptionsQuery } from '../client/queries'
import { signedInDestination } from '../client/signInGuard'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { next?: string; error?: string; reset?: boolean } = {}
    result.next = localRedirectPath(search.next)
    if (typeof search.error === 'string' && search.error) result.error = search.error
    if (search.reset === true || search.reset === 'true') result.reset = true
    return result
  },
  beforeLoad: async ({ context, preload, search }) => {
    if (preload) return
    const destination = await signedInDestination(context.queryClient, search.next)
    if (destination) throw redirect({ href: destination, replace: true })
  },
  loader: ({ context }) => context.queryClient.query({ ...signInOptionsQuery(), staleTime: 'static' }),
  component: SignInRoute,
})

function SignInRoute() {
  return <SignInPage {...Route.useSearch()} />
}
