import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { CreateRoster } from '../client/components/CreateRoster'
import { RosterImport } from '../client/components/RosterImport'
import { RosterExportDialog } from '../client/components/RosterExportDialog'
import { RosterSetupDialog, type RosterSetup } from '../client/components/RosterSetupDialog'
import { RosterRow } from '../client/components/rosters/RosterRow'
import { type SavedRoster, useRosterActions } from '../client/components/rosters/rosterLibrary'
import { readWorkspaceState, writeWorkspaceState } from '../client/components/workspaceState'
import { SignInRequired } from '../client/components/SignInRequired'
import { factionsQuery, meQuery, savedRosterPointsQuery, savedRostersQuery } from '../client/queries'
import { useOrigin } from '../client/useOrigin'
import { GAME_SIZES } from '../core/battle'

type Search = { limit?: number }
/** An unsaved setup edit, kept per tab so a refresh does not lose it. */
type EditingSession = { rosterId: string; draft: RosterSetup }

const WORKSPACE_PATH = '/rosters/'
const EDITING_STATE = 'roster-setup'

export const Route = createFileRoute('/rosters/')({
  validateSearch: (search: Record<string, unknown>): Search => {
    const limit = Number(search.limit)
    return GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(savedRostersQuery()),
      context.queryClient.ensureQueryData(savedRosterPointsQuery()),
      context.queryClient.ensureQueryData(factionsQuery()),
    ]),
  component: RosterLibrary,
})

function RosterLibrary() {
  const { data: me } = useQuery(meQuery())
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const { data: prices } = useQuery(savedRosterPointsQuery())
  const { data: available } = useQuery(factionsQuery())
  const { limit } = Route.useSearch()
  const shown = limit === undefined ? saved : saved.filter((roster) => roster.limit === limit)

  const points = new Map((prices ?? []).map((entry) => [entry.id, entry.points]))

  const origin = useOrigin()
  const actions = useRosterActions(origin)
  const [deleting, setDeleting] = useState<SavedRoster | null>(null)
  const [session, setSession] = useState<EditingSession | null>(null)
  const editing = saved.find((roster) => roster.id === session?.rosterId) ?? null

  useEffect(() => setSession(readWorkspaceState<EditingSession>(WORKSPACE_PATH, EDITING_STATE)), [])
  const setEditing = (next: EditingSession | null) => {
    setSession(next)
    writeWorkspaceState(WORKSPACE_PATH, EDITING_STATE, next)
  }
  const setupOf = (roster: SavedRoster): RosterSetup => ({
    name: roster.name,
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    disposition: roster.disposition,
    limit: roster.limit,
    visibility: roster.visibility,
  })

  if (!me) return <SignInRequired title="Your rosters" explanation="Sign in to build a list and keep it between battles." />

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your rosters</p>
          <h1 className="text-3xl">My rosters</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <RosterImport />
          {available ? <CreateRoster factions={available.factions} /> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Battle size filter">
        <span className="eyebrow mr-1">Battle size</span>
        <Button
          render={<Link to="/rosters" search={{}} />}
          nativeButton={false}
          variant="outline"
          size="xs"
          className={`chip ${limit === undefined ? 'border-parchment text-parchment' : ''}`}
        >
          All
        </Button>
        {GAME_SIZES.map((size) => (
          <Button
            key={size.limit}
            render={<Link to="/rosters" search={{ limit: size.limit }} />}
            nativeButton={false}
            variant="outline"
            size="xs"
            className={`chip ${limit === size.limit ? 'border-parchment text-parchment' : ''}`}
          >
            {size.name} · {size.limit}
          </Button>
        ))}
      </div>
      {actions.shareProblem ? <p className="mt-3 text-sm text-destructive">Could not copy the link: {actions.shareProblem}</p> : null}

      <section className="mt-4">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          <span className="readout">{shown.length}</span>
        </p>
        <div className="mt-2 space-y-2">
          {shown.length ? (
            shown.map((roster) => (
              <RosterRow
                key={roster.id}
                roster={roster}
                faction={available?.factions.find((entry) => entry.id === roster.catalogueId)}
                points={points.get(roster.id)}
                actions={actions}
                origin={origin}
                onEdit={() => setEditing({ rosterId: roster.id, draft: setupOf(roster) })}
                onDelete={() => setDeleting(roster)}
              />
            ))
          ) : (
            <p className="border border-edge bg-panel p-8 text-center text-sm text-dim">
              {saved.length ? 'No rosters at this battle size.' : 'No rosters yet. Create one or bring one from another app.'}
            </p>
          )}
        </div>
      </section>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              This removes the saved roster. Battles that already use it are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="rounded-none border-edge bg-sunken">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) actions.remove.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete roster
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {available && editing ? (
        <RosterSetupDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          factions={available.factions}
          value={session?.draft ?? setupOf(editing)}
          onDraftChange={(draft) => setEditing({ rosterId: editing.id, draft })}
          hasUnits={Boolean(editing.picks.length)}
          pending={actions.update.isPending}
          onSave={(setup) => actions.update.mutate({ roster: editing, setup }, { onSuccess: () => setEditing(null) })}
        />
      ) : null}
      <RosterExportDialog text={actions.exportText} onClose={actions.clearExport} />
    </main>
  )
}
