import { createFileRoute } from '@tanstack/react-router'
import { localRedirectPath } from 'ras-stack/auth/client'
import { ResetPasswordPage } from '../client/features/account/ResetPasswordPage'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
    next: localRedirectPath(search.next),
  }),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const { token, error, next } = Route.useSearch()
  return <ResetPasswordPage token={token} tokenError={error} next={next} />
}
