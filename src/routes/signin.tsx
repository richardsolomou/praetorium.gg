import { createFileRoute, redirect } from '@tanstack/react-router'
import { localRedirectPath } from '../authConfig'

export const Route = createFileRoute('/signin')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { next?: string; error?: string; reset?: boolean } = {}
    result.next = localRedirectPath(search.next)
    if (typeof search.error === 'string' && search.error) result.error = search.error
    if (search.reset === true || search.reset === 'true') result.reset = true
    return result
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/sign-in', search, replace: true })
  },
})
