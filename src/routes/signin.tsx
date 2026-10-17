import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/signin')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/sign-in', search, replace: true })
  },
})
