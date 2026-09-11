import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { CreateRoster } from '../../components/CreateRoster'
import { PageState } from '../../components/PageState'
import { RosterExportDialog } from '../../components/RosterExportDialog'
import { RosterImport } from '../../components/RosterImport'
import { RosterSetupDialog, type RosterSetup } from '../../components/RosterSetupDialog'
import { SignInRequired } from '../../components/SignInRequired'
import { factionSelectGroups } from '../builder/factions'
import { RosterFilters } from './RosterFilters'
import { RosterRow } from './RosterRow'
import { type SavedRoster, useRosterActions } from './rosterLibrary'
import { type RosterSort, sortRosters } from './rosterSort'
import { readWorkspaceState, writeWorkspaceState } from '../../components/workspaceState'
import { useFavouriteFactions } from '../../favouriteFactions'
import { factionIndexQuery, meQuery, savedRosterSummariesQuery, savedRosterTotalsQuery } from '../../queries'
import { useOrigin } from '../../useOrigin'
import type { RosterVisibility } from '../../../core/savedRoster'

export type RosterLibrarySearch = { limit?: number; faction?: string; visibility?: RosterVisibility; sort?: RosterSort }
/** An unsaved setup edit, kept per tab so a refresh does not lose it. */
type EditingSession = { rosterId: string; draft: RosterSetup }

const WORKSPACE_PATH = '/rosters/'
const EDITING_STATE = 'roster-setup'

export function RosterLibraryPage({ search }: { search: RosterLibrarySearch }) {
  const { data: me } = useQuery(meQuery())
  const savedResult = useQuery({ ...savedRosterSummariesQuery(), enabled: Boolean(me) })
  const totalsResult = useQuery({ ...savedRosterTotalsQuery(), enabled: Boolean(me) })
  const availableResult = useQuery({ ...factionIndexQuery(), enabled: Boolean(me) })
  const saved = savedResult.data ?? []
  const totals = totalsResult.data
  const available = availableResult.data
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
  const libraryError = savedResult.isError || (Boolean(search.faction) && availableResult.isError)

  const totalsById = new Map((totals ?? []).map((entry) => [entry.id, entry]))

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
    waivedRules: roster.waivedRules,
    optionalRules: roster.optionalRules ?? [],
    borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
    visibility: roster.visibility,
  })

  if (!me) return <SignInRequired title="Your rosters" explanation="Sign in to build and save army lists." />

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

      <section className="mx-auto mt-4 max-w-5xl px-3 pb-8 sm:px-4">
        <div className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          {libraryPending ? (
            <Skeleton className="h-4 w-5" aria-label="Loading roster count" />
          ) : libraryError ? (
            <span className="readout">—</span>
          ) : (
            <span className="readout">{shown.length}</span>
          )}
        </div>
        <div className="mt-2 space-y-3">
          {libraryError ? (
            <PageState
              headingLevel={2}
              eyebrow="Roster library"
              title="Could not load rosters"
              explanation="The roster library could not be loaded. Try again."
              action={
                <Button
                  variant="outline"
                  onClick={() => void Promise.all([savedResult.refetch(), availableResult.refetch()])}
                  disabled={savedResult.isFetching || availableResult.isFetching}
                >
                  Try again
                </Button>
              }
            />
          ) : libraryPending ? (
            <RosterLibrarySkeleton />
          ) : shown.length ? (
            shown.map((roster) => (
              <RosterRow
                key={roster.id}
                roster={roster}
                faction={available?.factions.find((entry) => entry.id === roster.catalogueId)}
                points={totalsById.get(roster.id)?.points}
                label={totalsById.get(roster.id)?.label}
                factionLoading={availableResult.isPending}
                pointsLoading={totalsResult.isPending}
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
