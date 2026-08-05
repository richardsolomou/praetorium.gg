import { createFileRoute } from '@tanstack/react-router'
import { RosterEditor } from '../client/components/RosterEditor'
import { collectionQuery, factionsQuery, savedRostersQuery } from '../client/queries'

export const Route = createFileRoute('/rosters/new')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(factionsQuery()),
      context.queryClient.ensureQueryData(savedRostersQuery()),
      context.queryClient.ensureQueryData(collectionQuery()),
    ]),
  component: () => <RosterEditor />,
})
