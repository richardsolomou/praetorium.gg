import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
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
import { Label } from '@/components/ui/label'
import { CreateRoster } from '../client/components/CreateRoster'
import { RosterImport } from '../client/components/RosterImport'
import { RosterExportDialog } from '../client/components/RosterExportDialog'
import { RosterSetupDialog, type RosterSetup } from '../client/components/RosterSetupDialog'
import { SearchableSelect, type SearchableGroup } from '../client/components/SearchableSelect'
import { factionSelectGroups } from '../client/components/builder/factions'
import { RosterRow } from '../client/components/rosters/RosterRow'
import { type SavedRoster, useRosterActions } from '../client/components/rosters/rosterLibrary'
import { ROSTER_SORTS, type RosterSort, sortRosters } from '../client/components/rosters/rosterSort'
import { readWorkspaceState, writeWorkspaceState } from '../client/components/workspaceState'
import { SignInRequired } from '../client/components/SignInRequired'
import { useFavouriteFactions } from '../client/favouriteFactions'
import { factionsQuery, meQuery, savedRosterPointsQuery, savedRostersQuery } from '../client/queries'
import { useOrigin } from '../client/useOrigin'
import { GAME_SIZES } from '../core/battle'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../core/savedRoster'

type Search = { limit?: number; faction?: string; visibility?: RosterVisibility; sort?: RosterSort }
/** An unsaved setup edit, kept per tab so a refresh does not lose it. */
type EditingSession = { rosterId: string; draft: RosterSetup }

const WORKSPACE_PATH = '/rosters/'
const EDITING_STATE = 'roster-setup'
const BATTLE_SIZE_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'All battle sizes', value: 'all' },
      ...GAME_SIZES.map((size) => ({ label: `${size.name} · ${size.limit} points`, value: String(size.limit) })),
    ],
  },
]
const SHARING_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'Any sharing status', value: 'all' },
      { label: 'Private', value: 'private' },
      { label: 'Unlisted', value: 'unlisted' },
    ],
  },
]
const SORT_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'Name: A to Z', value: 'name-asc' },
      { label: 'Name: Z to A', value: 'name-desc' },
      { label: 'Recently updated', value: 'updated-desc' },
      { label: 'Least recently updated', value: 'updated-asc' },
      { label: 'Battle size: low to high', value: 'size-asc' },
      { label: 'Battle size: high to low', value: 'size-desc' },
    ],
  },
]

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
      ...(sort && sort !== 'name-asc' ? { sort } : {}),
    }
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
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { favourites } = useFavouriteFactions()
  const factionSlugById = new Map((available?.factions ?? []).map((faction) => [faction.id, faction.slug]))
  const selectedFactionId = available?.factions.find((faction) => faction.slug === search.faction)?.id
  const factionGroups = factionSelectGroups(available?.factions ?? [], favourites).map((group) => ({
    ...group,
    items: group.items.map((faction) => ({ ...faction, value: factionSlugById.get(faction.value) ?? faction.value })),
  }))
  const rosterFactionGroups: SearchableGroup[] = [{ label: '', items: [{ label: 'All factions', value: 'all' }] }, ...factionGroups]
  const shown = sortRosters(
    saved.filter(
      (roster) =>
        (search.limit === undefined || roster.limit === search.limit) &&
        (search.faction === undefined || roster.catalogueId === selectedFactionId) &&
        (search.visibility === undefined || roster.visibility === search.visibility),
    ),
    search.sort ?? 'name-asc',
  )

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

      <div className="mt-4 flex flex-wrap items-end gap-3" aria-label="Roster filters">
        <RosterCombobox
          label="Battle size"
          value={search.limit ? String(search.limit) : 'all'}
          groups={BATTLE_SIZE_GROUPS}
          onChange={(value) => void navigate({ to: '/rosters', search: { ...search, limit: value === 'all' ? undefined : Number(value) } })}
        />
        <RosterCombobox
          label="Faction"
          value={search.faction ?? 'all'}
          groups={rosterFactionGroups}
          className="w-52 max-w-full"
          onChange={(value) => void navigate({ to: '/rosters', search: { ...search, faction: value === 'all' ? undefined : value } })}
        />
        <RosterCombobox
          label="Sharing"
          value={search.visibility ?? 'all'}
          groups={SHARING_GROUPS}
          onChange={(value) =>
            void navigate({ to: '/rosters', search: { ...search, visibility: value === 'all' ? undefined : (value as RosterVisibility) } })
          }
        />
        <RosterCombobox
          label="Sort"
          value={search.sort ?? 'name-asc'}
          groups={SORT_GROUPS}
          className="w-52 max-w-full"
          onChange={(value) =>
            void navigate({ to: '/rosters', search: { ...search, sort: value === 'name-asc' ? undefined : (value as RosterSort) } })
          }
        />
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
              {saved.length ? 'No rosters match these filters.' : 'No rosters yet. Create one or bring one from another app.'}
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

function RosterCombobox({
  label,
  value,
  groups,
  onChange,
  className,
}: {
  label: string
  value: string
  groups: SearchableGroup[]
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div>
      <Label className="eyebrow block">{label}</Label>
      <SearchableSelect
        ariaLabel={label}
        groups={groups}
        value={value}
        onValueChange={onChange}
        placeholder={label}
        className={`mt-1 h-9 min-w-40 rounded-none border-edge bg-sunken text-xs font-semibold uppercase ${className ?? ''}`}
      />
    </div>
  )
}
