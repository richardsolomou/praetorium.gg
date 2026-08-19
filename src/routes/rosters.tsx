import { createFileRoute, Outlet } from '@tanstack/react-router'
import { meQuery } from '../client/queries'

/** A shared list opens without an account, so the sign-in gate belongs on the pages that need one. */
export const Route = createFileRoute('/rosters')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: Outlet,
})
