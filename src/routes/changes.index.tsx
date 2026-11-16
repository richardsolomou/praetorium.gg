import { createFileRoute, redirect } from '@tanstack/react-router'

/** The data updates index before it moved to /data-updates. */
export const Route = createFileRoute('/changes/')({
  beforeLoad: () => {
    throw redirect({ to: '/data-updates', replace: true })
  },
})
