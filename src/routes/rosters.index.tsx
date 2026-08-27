import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
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
import { CreateRoster } from '../client/components/CreateRoster'
import { RosterImport } from '../client/components/RosterImport'
import { RosterExportDialog } from '../client/components/RosterExportDialog'
import { RosterSetupDialog, type RosterSetup } from '../client/components/RosterSetupDialog'
import { factionSelectGroups } from '../client/components/builder/factions'
import { RosterFilters } from '../client/components/rosters/RosterFilters'
import { RosterRow } from '../client/components/rosters/RosterRow'
import { type SavedRoster, useRosterActions } from '../client/components/rosters/rosterLibrary'
import { ROSTER_SORTS, type RosterSort, sortRosters } from '../client/components/rosters/rosterSort'
import { readWorkspaceState, writeWorkspaceState } from '../client/components/workspaceState'
import { SignInRequired } from '../client/components/SignInRequired'
import { PageState } from '../client/components/PageState'
import { useFavouriteFactions } from '../client/favouriteFactions'
import { factionIndexQuery, meQuery, savedRosterPointsQuery, savedRosterSummariesQuery } from '../client/queries'
import { useOrigin } from '../client/useOrigin'
import { GAME_SIZES } from '../core/battle'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../core/savedRoster'

type Search = { limit?: number; faction?: string; visibility?: RosterVisibility; sort?: RosterSort }
/** An unsaved setup edit, kept per tab so a refresh does not lose it. */
type EditingSession = { rosterId: string; draft: RosterSetup }

const WORKSPACE_PATH = '/rosters/'
const EDITING_STATE = 'roster-setup'

export const Route = createFileRoute('/rosters/')({
  validateSearch: (search: Record<string, unknown>): Search => {
    const limit = Number(search.limit)
    const faction = typeof search.faction === 'string' && search.faction.length <= 128 ? search.faction : undefined
    const visibility =
      typeof search.visibility === 'string' && ROSTER_VISIBILITIES.includes(search.visibility as RosterVisibility)
        ? (search.visibility as RosterVisibility)
        : undefined
    const sort =
      typeof search.sort === 'string' && ROSTER_SORTS.includes(search.sort as RosterSort) ? (search.sort as RosterSort) : undefined
    return {
      ...(GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}),
      ...(faction ? { faction } : {}),
      ...(visibility ? { visibility } : {}),
      ...(sort && sort !== 'created-desc' ? { sort } : {}),
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery())
  },
  component: RosterLibrary,
})

function RosterLibrary() {
  const { data: me } = useQuery(meQuery())
  const savedResult = useQuery({ ...savedRosterSummariesQuery(), enabled: Boolean(me) })
  const pricesResult = useQuery({ ...savedRosterPointsQuery(), enabled: Boolean(me) })
  const availableResult = useQuery({ ...factionIndexQuery(), enabled: Boolean(me) })
  const saved = savedResult.data ?? []
  const prices = pricesResult.data
  const available = availableResult.data
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { favourites } = useFavouriteFactions(Boolean(me))
  const factionSlugById = new Map((available?.factions ?? []).map((faction) => [faction.id, faction.slug]))
  const selectedFactionId = available?.factions.find((faction) => faction.slug === search.faction)?.id
  const factionGroups = factionSelectGroups(available?.factions ?? [], favourites).map((group) => ({
    ...group,
    items: group.items.map((faction) => ({ ...faction, value: factionSlugById.get(faction.value) ?? faction.value })),
  }))
  const shown = sortRosters(
    saved.filter(
      (roster) =>
        (search.limit === undefined || roster.limit === search.limit) &&
        (search.faction === undefined || roster.catalogueId === selectedFactionId) &&
        (search.visibility === undefined || roster.visibility === search.visibility),
    ),
    search.sort ?? 'created-desc',
  )
  const libraryPending = savedResult.isPending || (Boolean(search.faction) && availableResult.isPending)

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
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-3 py-5 sm:px-4 sm:py-7">
          <div>
            <p className="eyebrow text-parchment">Your rosters</p>
            <h1 className="text-3xl">My rosters</h1>
            <p className="mt-2 text-sm text-dim">Build, import, organize, and share the armies you bring to battle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RosterImport />
            <CreateRoster factionOptions={available?.factions ?? []} />
          </div>
        </div>
      </section>

      <RosterFilters
        value={{ limit: search.limit, faction: search.faction, visibility: search.visibility, sort: search.sort ?? 'created-desc' }}
        factionGroups={factionGroups}
        onChange={(next) =>
          void navigate({ to: '/rosters', search: { ...next, sort: next.sort === 'created-desc' ? undefined : next.sort } })
        }
      />
      {actions.shareProblem ? (
        <p className="mx-auto mt-3 max-w-5xl px-3 text-sm text-destructive sm:px-4">Could not copy the link: {actions.shareProblem}</p>
      ) : null}

      <section className="mx-auto mt-4 max-w-5xl px-3 sm:px-4">
        <div className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          {libraryPending ? (
            <Skeleton className="h-4 w-5" aria-label="Loading roster count" />
          ) : (
            <span className="readout">{shown.length}</span>
          )}
        </div>
        <div className="mt-2 space-y-2">
          {libraryPending ? (
            <RosterLibrarySkeleton />
          ) : shown.length ? (
            shown.map((roster) => (
              <RosterRow
                key={roster.id}
                roster={roster}
                faction={available?.factions.find((entry) => entry.id === roster.catalogueId)}
                points={points.get(roster.id)}
                factionLoading={availableResult.isPending}
                pointsLoading={pricesResult.isPending}
                actions={actions}
                origin={origin}
                onEdit={() => setEditing({ rosterId: roster.id, draft: setupOf(roster) })}
                onDelete={() => setDeleting(roster)}
              />
            ))
          ) : (
            <PageState
              headingLevel={2}
              eyebrow={saved.length ? 'Roster filters' : 'Roster library'}
              title={saved.length ? 'No rosters match' : 'No rosters yet'}
              explanation={saved.length ? 'No rosters match these filters.' : 'No rosters yet. Create one or bring one from another app.'}
              icon={ScrollText}
            />
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

      {editing ? (
        <RosterSetupDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          factionOptions={available?.factions ?? []}
          value={session?.draft ?? setupOf(editing)}
          onDraftChange={(draft) => setEditing({ rosterId: editing.id, draft })}
          hasUnits={Boolean(editing.unitCount)}
          pending={actions.update.isPending}
          onSave={(setup) => actions.update.mutate({ roster: editing, setup }, { onSuccess: () => setEditing(null) })}
        />
      ) : null}
      <RosterExportDialog text={actions.exportText} onClose={actions.clearExport} />
    </main>
  )
}

function RosterLibrarySkeleton() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} className="flex min-h-[5.25rem] items-center gap-3 border border-edge bg-panel p-3" aria-hidden>
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
      <Skeleton className="size-8" />
    </div>
  ))
}
