import { createFileRoute, notFound } from '@tanstack/react-router'
import { RosterEditor } from '../client/components/RosterEditor'
import { collectionQuery, factionsQuery, savedRosterPriceQuery, savedRostersQuery, unitsQuery } from '../client/queries'

export const Route = createFileRoute('/rosters/$id/edit')({
  loader: async ({ context, params }) => {
    const [, saved] = await Promise.all([
      context.queryClient.ensureQueryData(factionsQuery()),
      context.queryClient.ensureQueryData(savedRostersQuery()),
      context.queryClient.ensureQueryData(collectionQuery()),
    ])
    const roster = saved.find((candidate) => candidate.id === params.id)
    if (!roster) throw notFound()
    await Promise.all([
      context.queryClient.ensureQueryData(unitsQuery(roster.catalogueId, '')),
      context.queryClient.ensureQueryData(
        savedRosterPriceQuery(
          roster.id,
          roster.catalogueId,
          roster.detachmentIds,
          roster.limit,
          roster.picks.map(({ entryId, catalogueId, models, choices, spreads, toggles }) => ({
            entryId,
            catalogueId,
            models,
            choices,
            spreads,
            toggles,
          })),
        ),
      ),
    ])
  },
  component: EditRoster,
})

function EditRoster() {
  const { id } = Route.useParams()
  return <RosterEditor rosterId={id} />
}
