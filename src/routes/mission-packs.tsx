import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/mission-packs')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/mission-packs') throw redirect({ to: '/missions', hash: location.hash, replace: true })
  },
  component: Outlet,
})
