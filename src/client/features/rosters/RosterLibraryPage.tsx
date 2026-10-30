import { GuideHelp } from '../onboarding/GuideHelp'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronDown, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { currentRulesFor } from '../../../core/currentRules'
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
import { CreateRoster } from './CreateRoster'
import { buttonClass } from '../../components/buttonClass'
import { useAccountPrompt } from './AccountPrompt'
import { claimInput, GUEST_PATH, type GuestDraft, guestRosterSummary, readGuestDraft } from './guestDraft'
import { GuestBattleLink, useGuestRosterRow } from './GuestRoster'
import { useNewRoster } from './newRoster'
import type { MissionReference } from './rosterStart'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { RosterExportDialog } from './RosterExportDialog'
import { RosterExchangeDialog } from './RosterExchangeDialog'
import { RosterImport } from './RosterImport'
import { RosterSetupDialog, type RosterSetup } from './RosterSetupDialog'
import { rosterSetupOf } from './rosterDraft'
import { factionSelectGroups } from './builder/factions'
import { NoFilterMatches, RosterFilters, type RosterUpdateFilter } from './RosterFilters'
import { RosterRow } from './RosterRow'
import { type SavedRoster, useRosterActions } from './rosterLibrary'
import { keepRosterSort } from './rosterSort'
import { type RosterSort, sortRosters } from '../../../core/rosterSort'
import { SETUP_STATE, useWorkspaceState } from './workspaceState'
import { useFavouriteFactions } from '../../favouriteFactions'
import { factionIndexQuery, meQuery, rostersLentToMeQuery, savedRosterChangedIdsQuery, savedRosterSummariesQuery } from '../../queries'
import { LentRosterList } from './LentRosters'
import { RosterViews } from './RosterViews'
import { useDispositionNames } from '../battle/setup/chrome'
import { useOrigin } from '../../useOrigin'
import type { RosterVisibility } from '../../../core/savedRoster'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../../core/rosterLibrary'
import { variantCards, variantGroups } from '../../../core/rosterVariants'
import { useRosterPages } from './rosterPages'
import { errorMessage } from '../../queryClient'
import { Problem } from '../../components/Problem'
import { countLabel } from '../../text'

export type RosterLibrarySearch = { limit?: number; faction?: string; visibility?: RosterVisibility; updates?: RosterUpdateFilter }
/** An unsaved setup edit, kept per tab so a refresh does not lose it. */
type EditingSession = { rosterId: string; draft: RosterSetup }

const WORKSPACE_PATH = '/rosters/'

/**
 * A visitor's one list on this device, read once the page is in the browser; `pending` holds its row's place until then.
 */
type DeviceLibrary = { guest: GuestDraft | null; pending: boolean; onChange: (guest: GuestDraft | null) => void }

/**
 * A player's rosters, or a visitor's one roster on this device, on the same page.
 *
 * A visitor's actions that would make a second list, or that need an account, ask them to sign up instead.
 */
export function RosterLibraryPage({
  search,
  sort,
  starting,
  reference,
  device,
}: {
  search: RosterLibrarySearch
  sort: RosterSort
  starting?: boolean
  reference?: MissionReference
  device?: DeviceLibrary
}) {
  const [selectedSort, setSelectedSort] = useState(sort)
  const pageKey = JSON.stringify([
    search.limit ?? null,
    search.faction ?? null,
    search.visibility ?? null,
    search.updates ?? null,
    selectedSort,
  ])
  const [page, setPage] = useState({ key: pageKey, visibleCount: ROSTER_LIBRARY_BATCH_SIZE })
  const visibleCount = page.key === pageKey ? page.visibleCount : ROSTER_LIBRARY_BATCH_SIZE
  const [sortFrom, setSortFrom] = useState(sort)
  if (sortFrom !== sort) {
    setSortFrom(sort)
    setSelectedSort(sort)
  }
  const { data: me } = useQuery(meQuery())
  const guest = me ? null : (device?.guest ?? null)
  const savedResult = useQuery({ ...savedRosterSummariesQuery(), enabled: Boolean(me) })
  const availableResult = useQuery(factionIndexQuery())
  const lent = useQuery({ ...rostersLentToMeQuery(), enabled: Boolean(me) }).data ?? []
  const nameDisposition = useDispositionNames()
  const guestRow = useGuestRosterRow(guest)
  const account = useAccountPrompt()
  const saved = me ? (savedResult.data ?? []) : guest ? [guestRosterSummary(guest)] : []
  const available = availableResult.data
  const navigate = useNavigate()
  const router = useRouter()
  const { favourites } = useFavouriteFactions(Boolean(me))
  const factionSlugById = new Map((available?.factions ?? []).map((faction) => [faction.id, faction.slug]))
  const selectedFactionId = available?.factions.find((faction) => faction.slug === search.faction)?.id
  const factionGroups = factionSelectGroups(available?.factions ?? [], favourites).map((group) => ({
    ...group,
    items: group.items.map((faction) => ({ ...faction, value: factionSlugById.get(faction.value) ?? faction.value })),
  }))
  // Walking every list is slow, so it waits for the visible rows unless the filter asks for it.
  const [rowsSettled, setRowsSettled] = useState(false)
  const changedResult = useQuery({
    ...savedRosterChangedIdsQuery(),
    enabled: Boolean(me && savedResult.isSuccess && (rowsSettled || search.updates === 'changed')),
  })
  const changedIds = new Set(changedResult.data ?? [])
  const olderRules = (roster: SavedRoster) => Boolean(currentRulesFor(roster.catalogueId, available?.factions ?? []))
  const shown = sortRosters(
    saved.filter(
      (roster) =>
        (search.limit === undefined || roster.limit === search.limit) &&
        (search.faction === undefined || roster.catalogueId === selectedFactionId) &&
        (search.visibility === undefined || roster.visibility === search.visibility) &&
        (search.updates !== 'older' || olderRules(roster)) &&
        (search.updates !== 'changed' || changedIds.has(roster.id)),
    ),
    selectedSort,
  )
  const needsFactions = Boolean(search.faction || search.updates === 'older')
  const libraryPending =
    (me ? savedResult.isPending : Boolean(device?.pending)) ||
    (needsFactions && availableResult.isPending) ||
    (search.updates === 'changed' && changedResult.isPending)
  const libraryError =
    (me && savedResult.isError) || (needsFactions && availableResult.isError) || (search.updates === 'changed' && changedResult.isError)
  const active = shown.filter((roster) => !roster.archived)
  const archived = shown.filter((roster) => roster.archived)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const visible = variantGroups(active).slice(0, visibleCount)
  const archivedVisible = archivedOpen ? variantGroups(archived) : []
  const cards = variantCards([...visible, ...archivedVisible])
  const groups = cards.filter(({ head }) => head.index < visible.length)
  const archivedGroups = cards.filter(({ head }) => head.index >= visible.length)
  const pages = useRosterPages(
    [...visible, ...archivedVisible].map(({ roster }) => roster.id),
    Boolean(me && savedResult.isSuccess),
  )
  const pageResults = pages.results
  if (!rowsSettled && savedResult.isSuccess && pageResults.every((result) => result.isSuccess)) setRowsSettled(true)
  const pageById = guest
    ? new Map([
        [
          guest.id,
          { id: guest.id, points: guestRow.points, label: guestRow.label ?? '', problem: guestRow.problem, changes: 0, differences: null },
        ],
      ])
    : pages.byId
  const changedLists = changedIds.size
  const olderLists = available ? saved.filter(olderRules).length : 0

  const origin = useOrigin()
  const actions = useRosterActions(
    origin,
    guest
      ? {
          guest,
          points: guestRow.points,
          onChanged: () => device?.onChange(readGuestDraft()),
          onRemoved: () => device?.onChange(null),
        }
      : null,
  )
  // A visitor keeps one list; making another asks them to sign up first.
  const another = guest ? () => account.ask('another-roster') : undefined
  const { keepImported, saveError: importError } = useNewRoster()
  const [deleting, setDeleting] = useState<SavedRoster | null>(null)
  const [session, setEditing] = useWorkspaceState<EditingSession>(WORKSPACE_PATH, SETUP_STATE)
  const editing = saved.find((roster) => roster.id === session?.rosterId) ?? null

  const renderCard = ({ head, variants }: (typeof cards)[number]) => {
    const row = ({ roster, index }: typeof head, layout: 'card' | 'base' | 'variant') => (
      <RosterRow
        key={roster.id}
        roster={roster}
        layout={layout}
        faction={available?.factions.find((entry) => entry.id === roster.catalogueId)}
        points={pageById.get(roster.id)?.points}
        label={pageById.get(roster.id)?.label}
        dispositionName={nameDisposition(roster.disposition)?.name}
        factionLoading={availableResult.isPending}
        pointsLoading={guest ? guestRow.pending : pages.pending(index)}
        problem={pageById.get(roster.id)?.problem ?? null}
        differences={pageById.get(roster.id)?.differences}
        updates={{ olderRules: olderRules(roster), changes: pageById.get(roster.id)?.changes ?? 0 }}
        showVisibility={roster.visibility !== head.roster.visibility}
        actions={actions}
        origin={origin}
        onEdit={() => setEditing({ rosterId: roster.id, draft: rosterSetupOf(roster) })}
        onDelete={() => setDeleting(roster)}
        onNeedsAccount={guest ? account.ask : undefined}
      />
    )
    return variants.length ? (
      <div key={head.roster.id} data-roster-group className="border border-edge bg-panel">
        {row(head, 'base')}
        {variants.map((variant) => row(variant, 'variant'))}
      </div>
    ) : (
      row(head, 'card')
    )
  }

  const filtered = Boolean(search.limit !== undefined || search.faction || search.visibility || search.updates)
  const archivable = Boolean(deleting && !deleting.archived && !guest)
  const deleteAction = (
    <AlertDialogAction
      variant="destructive"
      className={archivable ? 'sm:mr-auto' : undefined}
      onClick={() => {
        if (deleting) actions.remove.mutate(deleting.id)
        setDeleting(null)
      }}
    >
      Delete roster
    </AlertDialogAction>
  )

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Your rosters"
        title="Rosters"
        description="Build, import, organize, and share your armies, or find one your friends and other players made public."
        actions={
          <>
            <GuideHelp task="roster">Build guide</GuideHelp>
            <RosterImport onImport={me ? undefined : keepImported} blocked={another} />
            <CreateRoster
              factionOptions={available?.factions ?? []}
              limit={search.limit}
              blocked={another}
              starting={starting}
              reference={reference}
              onStarted={() => void navigate({ to: '/rosters', search, replace: true })}
            />
          </>
        }
      >
        <RosterViews view="mine" />
      </PageHeader>

      <PageContent className="space-y-6">
        {me ? null : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-edge bg-sunken px-3 py-2 text-sm text-dim">
            <p className="min-w-0 flex-1">Without an account, this device keeps one roster. Sign up free to keep as many as you like.</p>
            <Link to="/sign-in" search={{ next: GUEST_PATH, join: true }} className={buttonClass({ size: 'sm' })}>
              Create an account
            </Link>
          </div>
        )}
        <GuestBattleLink />
        {importError ? <Problem>{importError}</Problem> : null}
        <RosterFilters
          value={{ ...search, sort: selectedSort }}
          factionGroups={factionGroups}
          onChange={({ sort: chosen, ...filters }) => {
            if (chosen !== selectedSort) {
              setSelectedSort(chosen)
              keepRosterSort(chosen)
              void router.invalidate({ filter: (match) => match.routeId === '/rosters/' })
            }
            if (
              filters.limit !== search.limit ||
              filters.faction !== search.faction ||
              filters.visibility !== search.visibility ||
              filters.updates !== search.updates
            )
              void navigate({ to: '/rosters', search: filters })
          }}
        />
        {actions.shareProblem ? <Problem>Could not copy the link: {actions.shareProblem}</Problem> : null}
        {actions.lock.isError ? <Problem error={actions.lock.error} /> : null}
        {actions.exchange.isError ? <Problem>Could not make an exchange code: {errorMessage(actions.exchange.error)}</Problem> : null}

        <section>
          <div className="rubric flex items-baseline gap-3 border-b border-edge pb-2">
            <h2 className="mr-auto">Rosters</h2>
            {olderLists && search.updates !== 'older' ? (
              <Link
                to="/rosters"
                search={{ updates: 'older' }}
                className="text-xs font-semibold tracking-normal text-discarded normal-case hover:text-bone"
              >
                {olderLists} {olderLists === 1 ? 'roster uses' : 'rosters use'} older rules
              </Link>
            ) : null}
            {changedLists && search.updates !== 'changed' ? (
              <Link
                to="/rosters"
                search={{ updates: 'changed' }}
                className="text-xs font-semibold tracking-normal text-discarded normal-case hover:text-bone"
              >
                {countLabel(changedLists, 'roster')} changed by a data update
              </Link>
            ) : null}
            {libraryPending ? (
              <Skeleton className="h-4 w-5" aria-label="Loading roster count" />
            ) : libraryError ? (
              <span className="readout">—</span>
            ) : (
              <span className="readout">{active.length}</span>
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
              <div className="space-y-3">
                <output className="sr-only">Loading your rosters…</output>
                <RosterLibrarySkeleton />
              </div>
            ) : active.length ? (
              <>
                {groups.map(renderCard)}
                {pageResults.some((result) => result.isError) || guestRow.failed ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (guestRow.failed) guestRow.retry()
                      void Promise.all(pageResults.filter((result) => result.isError).map((result) => result.refetch()))
                    }}
                  >
                    Retry roster points and legality
                  </Button>
                ) : null}
                {visible.length < active.length ? (
                  <Button
                    variant="outline"
                    disabled={pageResults.some((result) => !result.isSuccess)}
                    onClick={() => setPage({ key: pageKey, visibleCount: visibleCount + ROSTER_LIBRARY_BATCH_SIZE })}
                  >
                    Show more rosters
                  </Button>
                ) : null}
              </>
            ) : saved.length ? (
              <NoFilterMatches onClear={filtered ? () => void navigate({ to: '/rosters', search: {} }) : undefined}>
                {archived.length ? 'Every roster here is archived. Archived rosters are listed below.' : 'No rosters match these filters'}
              </NoFilterMatches>
            ) : (
              <PageState
                headingLevel={2}
                eyebrow="Roster library"
                title="No rosters yet"
                explanation="Create one, or import a list from another app."
                icon={ScrollText}
              />
            )}
          </div>
        </section>
        {lent.length ? (
          <section>
            <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
              Lent to you <span className="readout">{lent.length}</span>
            </h2>
            <div className="mt-2">
              <LentRosterList rosters={lent} />
            </div>
          </section>
        ) : null}
        {!libraryPending && !libraryError && archived.length ? (
          <Collapsible render={<section />} open={archivedOpen} onOpenChange={setArchivedOpen}>
            <CollapsibleTrigger className="group rubric flex w-full items-baseline gap-3 border-b border-edge pb-2 text-left hover:text-bone">
              <span className="mr-auto">Archived</span>
              <span className="readout">{archived.length}</span>
              <ChevronDown className="size-4 self-center transition-transform group-data-panel-open:rotate-180" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-3">{archivedGroups.map(renderCard)}</div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </PageContent>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {guest
                ? 'This removes the roster from this device for good. A copy you brought to a battle is kept there.'
                : deleting?.archived
                  ? 'This removes the saved roster for good. Frozen copies in battles and tournaments are kept.'
                  : 'Deleting removes the roster for good; archiving hides it until you unarchive it. Frozen copies in battles and tournaments are kept either way.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {archivable ? deleteAction : null}
            <AlertDialogCancel>Keep roster</AlertDialogCancel>
            {archivable ? (
              <AlertDialogAction
                onClick={() => {
                  if (deleting) actions.archive.mutate({ id: deleting.id, archived: true })
                  setDeleting(null)
                }}
              >
                Archive roster
              </AlertDialogAction>
            ) : (
              deleteAction
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editing ? (
        <RosterSetupDialog
          mode="edit"
          sourceCatalogueId={editing.catalogueId}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null)
              actions.update.reset()
            }
          }}
          factionOptions={available?.factions ?? []}
          value={session?.draft ?? rosterSetupOf(editing)}
          onDraftChange={(draft) => setEditing({ rosterId: editing.id, draft })}
          hasUnits={Boolean(editing.unitCount)}
          reviewSource={guest ? claimInput(guest) : editing.id}
          guest={Boolean(guest)}
          pending={actions.update.isPending}
          saveError={actions.update.isError ? errorMessage(actions.update.error) : undefined}
          canKeepOriginal={!guest}
          onSave={async (_setup, review, options) => {
            if (!review) throw new Error('Review the roster before saving changes.')
            const id = options?.keepOriginal ? (await actions.convertAsVariant.mutateAsync(review)).id : editing.id
            if (!options?.keepOriginal) await actions.update.mutateAsync(review)
            setEditing(null)
            if (options?.keepOriginal) void navigate({ to: '/rosters/$id', params: { id } })
          }}
        />
      ) : null}
      {account.prompt}
      <RosterExportDialog exported={actions.exportText} onClose={actions.clearExport} />
      <RosterExchangeDialog exchange={actions.exchangeCode} onClose={actions.clearExchange} />
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
