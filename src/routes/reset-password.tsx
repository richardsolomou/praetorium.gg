import { createFileRoute } from '@tanstack/react-router'
import { localRedirectPath } from 'ras-stack/auth/client'
import { ResetPasswordPage } from '../client/features/account/ResetPasswordPage'
import { searchText } from '../client/searchParams'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: searchText(search.token),
    error: searchText(search.error),
    next: localRedirectPath(search.next),
  }),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const { token, error, next } = Route.useSearch()
  return <ResetPasswordPage token={token} tokenError={error} next={next} />
}
