import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/leagues/')({
  beforeLoad: () => {
    throw redirect({ to: '/tournaments', replace: true })
  },
})
