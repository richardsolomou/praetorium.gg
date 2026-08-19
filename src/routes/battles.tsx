import { createFileRoute, Outlet } from '@tanstack/react-router'

/** A battle you were invited to opens without an account, so nothing is gated here. */
export const Route = createFileRoute('/battles')({
  component: Outlet,
})
