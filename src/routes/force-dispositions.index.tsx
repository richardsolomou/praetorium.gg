import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/force-dispositions/')({
  beforeLoad: () => {
    throw redirect({ to: '/missions', replace: true })
  },
})
