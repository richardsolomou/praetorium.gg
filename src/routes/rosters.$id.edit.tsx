import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { RosterEditor } from '../client/components/RosterEditor'
import { SignInRequired } from '../client/components/SignInRequired'
import { collectionQuery, factionsQuery, meQuery, savedRosterPriceQuery, savedRostersQuery, unitsQuery } from '../client/queries'

export const Route = createFileRoute('/rosters/$id/edit')({
  loader: async ({ context, params }) => {
    // Without an account there are no saved lists to look this one up in, and the
    // page says so rather than claiming the list does not exist.
    if (!(await context.queryClient.ensureQueryData(meQuery()))) return
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
          roster.disposition,
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
  const { data: me } = useQuery(meQuery())
  if (!me) return <SignInRequired title="Your rosters" explanation="Sign in to build a list and keep it between battles." />
  return <RosterEditor rosterId={id} />
}
