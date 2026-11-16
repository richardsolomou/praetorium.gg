import { createFileRoute, redirect } from '@tanstack/react-router'

/** The game journal is retired; battles are where played games are kept. */
export const Route = createFileRoute('/journal')({
  beforeLoad: () => {
    throw redirect({ to: '/battles', replace: true })
  },
})
