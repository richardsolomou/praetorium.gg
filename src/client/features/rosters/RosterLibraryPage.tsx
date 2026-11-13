import { GuideHelp } from '../onboarding/GuideHelp'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
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
import { useGuestRosterRow } from './GuestRoster'
import { useNewRoster } from './newRoster'
import { DEFAULT_ROSTER_ROWS, setRosterCookie, useRosterCookieChoice } from './rosterCookie'
import { ROSTER_GROUPING_COOKIE, ROSTER_NOTICES_COOKIE, ROSTER_ROWS_COOKIE, ROSTER_SORT_COOKIE } from '../../../contracts/rosterCookies'
import type { MissionReference } from './rosterStart'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { RosterExportDialog } from './RosterExportDialog'
import { RosterExchangeDialog } from './RosterExchangeDialog'
import { RosterImport } from './RosterImport'
import { RosterSetupDialog, type RosterSetup } from './RosterSetupDialog'
import { rosterSetupOf } from './rosterDraft'
import { factionSelectGroups } from './builder/factions'
import { RosterGroupMenu, RosterSortMenu, ROSTER_ASSESSMENT_DIMENSIONS } from './RosterFilters'
import { FilterBar, type FilterDimension } from '../../components/FilterBar'
import { NoFilterMatches } from '../../components/NoFilterMatches'
import { ungrouped } from '../../components/SearchableSelect'
import { facetsOf, periodSearch } from '../../searchParams'
import { facetMatches, facetText, periodBounds, withinPeriod, type Facet } from '../../../core/listFilter'
import { matchesRosterAssessment, rosterAssessmentFilterActive, ROSTER_SEARCH_MAX_LENGTH } from '../../../core/rosterDiscovery'
import { ROSTER_VISIBILITIES } from '../../../core/savedRoster'
import { VISIBILITY_NAME } from './visibility'
import { GAME_SIZES, battleSizeOptionLabel, pointsLabel } from '../../../core/battle'
import { countBy, toggled } from '../../../core/collections'
import { matchesSearch } from '../../text'
import { RosterRow } from './RosterRow'
import { RosterLoanDialog } from './RosterLoanDialog'
import { SavedRosterGradesDialog } from './RosterGradesDialog'
import { CreateBattle } from '../battles/CreateBattle'
import { type RosterShareChoices, RosterShareDialog } from './RosterShareDialog'
import { rosterTitle } from './RosterSummary'
import { RosterSelectionToolbar } from './RosterSelectionToolbar'
import { type SavedRoster, useRosterActions } from './rosterLibrary'
import { keepRosterGrouping, keepRosterSort, keptRosterGrouping, keptRosterSort } from './rosterSort'
import { type RosterSort, sortRosters } from '../../../core/rosterSort'
import { groupedEntries, groupsPage, type RosterGroup, type RosterGrouping } from '../../../core/rosterGrouping'
import { SETUP_STATE, useWorkspaceState } from './workspaceState'
import { useFavouriteFactions } from '../../favouriteFactions'
import {
  factionIndexQuery,
  gameReferencesQuery,
  meQuery,
  rostersLentToMeQuery,
  savedRosterChangedIdsQuery,
  savedRosterSummariesQuery,
  type QueryData,
} from '../../queries'
import { LentRosterList } from './LentRosters'
import { RosterViews } from './RosterViews'
import { useDispositionNames } from '../battle/setup/chrome'
import { useOrigin } from '../../useOrigin'
import { ROSTER_BATCH_MAX, ROSTER_LIBRARY_BATCH_SIZE, type RosterBatchAction } from '../../../core/rosterLibrary'
import { variantCards, variantGroups } from '../../../core/rosterVariants'
import { useRosterPages } from './rosterPages'
import { errorMessage } from '../../queryClient'
import { Problem } from '../../components/Problem'
import { countLabel } from '../../text'
import { LIBRARY_FACETS, type RosterLibrarySearch } from './rosterSearch'

const UPDATE_GROUPS = ungrouped([
  { label: 'Older rules', value: 'older' },
  { label: 'Changed by update', value: 'changed' },
])
const STATE_GROUPS = ungrouped([
  { label: 'Locked', value: 'locked' },
  { label: 'Variant of another list', value: 'variant' },
])
/** An unsaved setup edit, kept per tab so a refresh does not lose it. */
type FilterableFaction =
  QueryData<typeof factionIndexQuery> extends infer Index ? (Index extends { factions: (infer Faction)[] } ? Faction : never) : never
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
  grouping = 'none',
  notices = false,
  rows = DEFAULT_ROSTER_ROWS,
  starting,
  reference,
  device,
}: {
  search: RosterLibrarySearch
  sort: RosterSort
  grouping?: RosterGrouping
  /** Whether the library last had a data update notice, so its line is kept while the counts load. */
  notices?: boolean
  /** How many rows the unfiltered library last showed, so its skeleton holds the list's height. */
  rows?: number
  starting?: boolean
  reference?: MissionReference
  device?: DeviceLibrary
}) {
  const [selectedSort, setSelectedSort] = useRosterCookieChoice(sort, ROSTER_SORT_COOKIE, keptRosterSort)
  const [selectedGrouping, setSelectedGrouping] = useRosterCookieChoice(grouping, ROSTER_GROUPING_COOKIE, keptRosterGrouping)
  const pageKey = JSON.stringify([search, selectedSort, selectedGrouping])
  const [page, setPage] = useState({ key: pageKey, visibleCount: ROSTER_LIBRARY_BATCH_SIZE })
  const visibleCount = page.key === pageKey ? page.visibleCount : ROSTER_LIBRARY_BATCH_SIZE
  const [now] = useState(() => Date.now())
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
  const { favourites } = useFavouriteFactions(Boolean(me))
  const facets = facetsOf(search, LIBRARY_FACETS)
  const facetUses = (facet: Facet | undefined, value: string) => Boolean(facet?.in.includes(value) || facet?.out.includes(value))
  // Walking every list is slow, so it waits for the visible rows unless the filter asks for it.
  const [rowsSettled, setRowsSettled] = useState(false)
  const changedResult = useQuery({
    ...savedRosterChangedIdsQuery(),
    enabled: Boolean(me && savedResult.isSuccess && (rowsSettled || facetUses(facets.updates, 'changed'))),
  })
  const changedIds = new Set(changedResult.data ?? [])
  const olderRules = (roster: SavedRoster) => Boolean(currentRulesFor(roster.catalogueId, available?.factions ?? []))
  const factionOf = (roster: SavedRoster) => available?.factions.find((faction) => faction.id === roster.catalogueId)
  const bounds = periodBounds(periodSearch(search), now)
  const candidates = sortRosters(
    saved.filter((roster) => {
      const faction = factionOf(roster)
      return (
        facetMatches(facets.limit, [String(roster.limit)]) &&
        facetMatches(facets.faction, faction ? [faction.slug] : []) &&
        facetMatches(facets.detachment, roster.detachmentIds) &&
        facetMatches(facets.visibility, [roster.visibility]) &&
        facetMatches(facets.disposition, roster.disposition ? [roster.disposition] : []) &&
        facetMatches(facets.updates, [...(olderRules(roster) ? ['older'] : []), ...(changedIds.has(roster.id) ? ['changed'] : [])]) &&
        facetMatches(facets.state, [...(roster.locked ? ['locked'] : []), ...(roster.baseRosterId ? ['variant'] : [])]) &&
        withinPeriod(roster.updatedAt, bounds) &&
        (!search.q || matchesSearch(`${rosterTitle(roster, faction)} ${faction?.displayName ?? ''}`, search.q))
      )
    }),
    selectedSort,
  )
  const needsAssessment = rosterAssessmentFilterActive(facets)
  // Only lists this filter has to judge are priced beyond the ones on screen.
  const assessed = useRosterPages(needsAssessment && me ? candidates.map((roster) => roster.id) : [], Boolean(me && savedResult.isSuccess))
  const assessmentOf = (roster: SavedRoster) => (guest ? guestRow : assessed.byId.get(roster.id))
  const shown = needsAssessment
    ? candidates.filter((roster) => {
        const entry = assessmentOf(roster)
        return entry && matchesRosterAssessment(facets, { points: entry.points ?? null, problem: entry.problem ?? null })
      })
    : candidates
  const needsChanged = facetUses(facets.updates, 'changed')
  const needsFactions = Boolean(
    search.faction || search.q || search.updates || selectedGrouping === 'faction' || selectedGrouping === 'detachment',
  )
  const libraryPending =
    (me ? savedResult.isPending : Boolean(device?.pending)) ||
    (needsFactions && availableResult.isPending) ||
    (needsChanged && changedResult.isPending) ||
    (needsAssessment && (guest ? guestRow.pending : assessed.results.some((result) => result.isPending)))
  const libraryError =
    (me && savedResult.isError) ||
    (needsFactions && availableResult.isError) ||
    (needsChanged && changedResult.isError) ||
    (needsAssessment && assessed.results.some((result) => result.isError))
  const active = shown.filter((roster) => !roster.archived)
  const archived = shown.filter((roster) => roster.archived)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const groupOf = (roster: SavedRoster): RosterGroup => {
    if (selectedGrouping === 'size') {
      const size = GAME_SIZES.find((entry) => entry.limit === roster.limit)
      return { key: String(roster.limit), label: size ? battleSizeOptionLabel(size) : pointsLabel(roster.limit), rank: roster.limit }
    }
    const faction = factionOf(roster)
    const factionName = faction?.displayName ?? 'Unknown faction'
    if (selectedGrouping === 'faction') return { key: faction?.id ?? '', label: factionName, rank: faction ? 0 : 1 }
    const detachments = roster.detachmentIds.flatMap((id) => faction?.detachments.find((entry) => entry.id === id)?.name ?? [])
    return {
      key: `${faction?.id ?? ''} ${roster.detachmentIds.join(' ')}`,
      label: `${factionName} · ${detachments.join(' + ') || 'No detachment'}`,
      rank: faction ? 0 : 1,
    }
  }
  // Variants stay beneath their base, so a whole variant set is shown under its base's group.
  const runs = selectedGrouping === 'none' ? null : groupedEntries(variantGroups(active), groupOf)
  // Keyed with the grouping, so a group folded under one grouping stays open under the next.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const isCollapsed = (key: string) => collapsed.has(`${selectedGrouping} ${key}`)
  const groupPage = runs ? groupsPage(runs, isCollapsed, visibleCount) : null
  const runOf = new Map(groupPage?.shown.flatMap((run) => run.entries.map(({ roster }) => [roster, run.group.key] as const)))
  const visible = groupPage ? groupPage.shown.flatMap((run) => run.entries) : variantGroups(active).slice(0, visibleCount)
  const more = groupPage ? groupPage.more : visible.length < active.length
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
  const olderNotice = Boolean(olderLists) && !facetUses(facets.updates, 'older')
  const changedNotice = Boolean(changedLists) && !facetUses(facets.updates, 'changed')
  // The changed count loads after the rows, so a notice arriving then would push them down unless its line is kept.
  const noticesKnown = Boolean(available) && !(me && changedResult.isPending)
  const keepNoticeLine = notices && !noticesKnown && !libraryError
  useEffect(() => {
    if (noticesKnown) setRosterCookie(ROSTER_NOTICES_COOKIE, olderLists || changedLists ? '1' : null)
  }, [noticesKnown, olderLists, changedLists])
  // A filtered address shows a different count, so only the plain library teaches the skeleton its size.
  const unfiltered = Object.values(search).every((value) => value === undefined)
  const shownRows = !libraryPending && !libraryError && unfiltered ? groups.length : undefined
  useEffect(() => {
    if (shownRows !== undefined) setRosterCookie(ROSTER_ROWS_COOKIE, shownRows === DEFAULT_ROSTER_ROWS ? null : String(shownRows))
  }, [shownRows])

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
  // Rosters chosen together are deleted in one action; a row's own Delete goes through the single path.
  const [deleting, setDeleting] = useState<{ rosters: SavedRoster[]; together: boolean } | null>(null)
  // Held by id, so the dialog reads each visibility change back from the library rather than a stale copy.
  const [sharingId, setSharingId] = useState<string | null>(null)
  const sharing = saved.find((roster) => roster.id === sharingId) ?? null
  const [lendingId, setLendingId] = useState<string | null>(null)
  const [battleRosterId, setBattleRosterId] = useState<string | null>(null)
  const [grading, setGrading] = useState<{ id: string; name: string } | null>(null)
  const [session, setEditing] = useWorkspaceState<EditingSession>(WORKSPACE_PATH, SETUP_STATE)
  const editing = saved.find((roster) => roster.id === session?.rosterId) ?? null
  // Only a signed-in player's own rosters can be changed together; rosters a filter hides stay out of the action.
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const selected = shown.filter((roster) => selectedIds.has(roster.id))
  const stopSelecting = () => {
    setSelecting(false)
    setSelectedIds(new Set())
    actions.batch.reset()
  }
  // Select all reaches only the rosters on screen, up to what one batch change accepts.
  const selectable = [...visible, ...archivedVisible].slice(0, ROSTER_BATCH_MAX).map(({ roster }) => roster.id)
  const changeSelected = (action: RosterBatchAction, ids: string[]) => actions.batch.mutate({ ids, action }, { onSuccess: stopSelecting })
  const selectionOf = (roster: SavedRoster) =>
    selecting
      ? {
          checked: selectedIds.has(roster.id),
          disabled: actions.batch.isPending || (!selectedIds.has(roster.id) && selected.length >= ROSTER_BATCH_MAX),
          onCheckedChange: (checked: boolean) => setSelectedIds((current) => toggled(current, roster.id, checked)),
        }
      : undefined

  // A visitor's list lives on this device, so choosing who can open it asks them to sign up first.
  const libraryShare = (roster: SavedRoster, title: string): RosterShareChoices => ({
    title,
    visibility: roster.visibility,
    onVisibility: (visibility) => {
      if (guest) account.ask('share')
      else if (visibility !== roster.visibility) actions.access.mutate({ id: roster.id, visibility })
    },
    choosing: actions.access.isPending && actions.access.variables?.id === roster.id ? actions.access.variables.visibility : null,
    visibilityNote: guest ? 'Sign in to share it by link or publicly.' : undefined,
    visibilityError: actions.access.isError ? actions.access.error : undefined,
    link: origin ? `${origin}/rosters/${roster.id}` : '',
    onCopy: guest ? () => account.ask('share') : () => void actions.share(roster, title),
    copied: actions.shareFeedback?.id === roster.id ? actions.shareFeedback.result : null,
    copying: false,
    copyProblem: actions.shareProblem ? `Could not copy the link: ${actions.shareProblem}` : undefined,
    onExport: () => actions.take.mutate({ roster, title }),
    exporting: actions.take.isPending,
    onExchange: () => actions.exchange.mutate({ roster, title }),
    exchanging: actions.exchange.isPending,
    onPrint: () => actions.print(roster.id),
  })

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
        onEdit={() => setEditing({ rosterId: roster.id, draft: rosterSetupOf(roster) })}
        onShare={() => setSharingId(roster.id)}
        onLend={() => setLendingId(roster.id)}
        onStartBattle={() => setBattleRosterId(roster.id)}
        onGrade={() => setGrading({ id: roster.id, name: rosterTitle(roster, factionOf(roster), pageById.get(roster.id)?.label) })}
        onDelete={() => setDeleting({ rosters: [roster], together: false })}
        onNeedsAccount={guest ? account.ask : undefined}
        selection={selectionOf(roster)}
      />
    )
    return variants.length ? (
      <div key={head.roster.id} data-roster-group className="part">
        {row(head, 'base')}
        {variants.map((variant) => row(variant, 'variant'))}
      </div>
    ) : (
      row(head, 'card')
    )
  }

  const filtered = Object.values(search).some(Boolean)
  const deletingCount = deleting?.rosters.length ?? 0
  const unarchived = guest ? [] : (deleting?.rosters.filter((roster) => !roster.archived) ?? [])
  const archivable = unarchived.length > 0
  const deleteAction = (
    <AlertDialogAction
      variant="destructive"
      className={archivable ? 'sm:mr-auto' : undefined}
      onClick={() => {
        if (deleting?.together)
          changeSelected(
            'delete',
            deleting.rosters.map((roster) => roster.id),
          )
        else if (deleting) actions.remove.mutate(deleting.rosters[0]!.id)
        setDeleting(null)
      }}
    >
      {deletingCount === 1 ? 'Delete roster' : `Delete ${countLabel(deletingCount, 'roster')}`}
    </AlertDialogAction>
  )

  return (
    <main className="w-full">
      <PageHeader
        title="Rosters"
        description="Build, import, organize, and share your armies, or find one your friends and other players made public."
        actions={
          <>
            <RosterImport onImport={me ? undefined : keepImported} blocked={another} />
            <CreateRoster
              factionOptions={available?.factions ?? []}
              limit={facets.limit?.in.length === 1 ? Number(facets.limit.in[0]) : undefined}
              blocked={another}
              starting={starting}
              reference={reference}
              onStarted={() => void navigate({ to: '/rosters', search, replace: true })}
            />
          </>
        }
        help={<GuideHelp task="roster">Build guide</GuideHelp>}
      >
        <RosterViews view="mine" />
      </PageHeader>

      <PageContent className="space-y-6">
        {me ? null : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-edge bg-sunken px-3 py-2 text-sm text-dim">
            <p className="min-w-0 flex-1">Without an account, this device keeps one roster. Sign up free to keep as many as you like.</p>
            <Link to="/sign-in" search={{ next: GUEST_PATH, join: true }} className={buttonClass({ size: 'sm' })}>
              Create an account
            </Link>
          </div>
        )}
        {importError ? <Problem>{importError}</Problem> : null}
        <RosterLibraryFilters
          search={search}
          facets={facets}
          rosters={saved}
          factions={available?.factions ?? []}
          favourites={favourites}
          count={filtered && !libraryPending ? shown.length : null}
          onChange={(next) => void navigate({ to: '/rosters', search: next, replace: true, resetScroll: false })}
          sort={
            <>
              <RosterSortMenu
                value={selectedSort}
                onChange={(chosen) => {
                  setSelectedSort(chosen)
                  keepRosterSort(chosen)
                }}
              />
              <RosterGroupMenu
                value={selectedGrouping}
                onChange={(chosen) => {
                  setSelectedGrouping(chosen)
                  keepRosterGrouping(chosen)
                }}
              />
            </>
          }
        />
        {actions.lock.isError ? <Problem error={actions.lock.error} /> : null}
        {actions.split.isError ? <Problem error={actions.split.error} /> : null}
        {actions.exchange.isError ? <Problem>Could not make an exchange code: {errorMessage(actions.exchange.error)}</Problem> : null}

        <section>
          <div className="rubric flex items-baseline gap-3 border-b border-edge pb-2">
            <h2 className="mr-auto">Rosters</h2>
            {libraryPending ? (
              <Skeleton className="h-4 w-5" aria-label="Loading roster count" />
            ) : libraryError ? (
              <span className="readout">—</span>
            ) : (
              <span className="readout">{active.length}</span>
            )}
            {me && !libraryPending && !libraryError && shown.length ? (
              // The negative margin keeps the header its text's height, so the button arriving with the rosters moves nothing below it.
              <Button
                variant="ghost"
                size="sm"
                className="-my-2 self-center tracking-normal normal-case"
                onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              >
                {selecting ? 'Done' : 'Select'}
              </Button>
            ) : null}
          </div>
          {olderNotice || changedNotice ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-discarded">
              {olderNotice ? (
                <Link to="/rosters" search={{ updates: 'older' }} className="hover:text-bone">
                  {olderLists} {olderLists === 1 ? 'roster uses' : 'rosters use'} older rules
                </Link>
              ) : null}
              {changedNotice ? (
                <Link to="/rosters" search={{ updates: 'changed' }} className="hover:text-bone">
                  {countLabel(changedLists, 'roster')} changed by a data update
                </Link>
              ) : null}
            </div>
          ) : keepNoticeLine ? (
            <div aria-hidden className="mt-2 text-xs font-semibold">
              {'\u00a0'}
            </div>
          ) : null}
          {selecting ? (
            <RosterSelectionToolbar
              selected={selected}
              pending={actions.batch.isPending}
              error={actions.batch.error}
              onChange={changeSelected}
              onDelete={() => setDeleting({ rosters: selected, together: true })}
              onSelectAll={(all) => setSelectedIds(new Set(all ? selectable : []))}
              allSelected={selectable.length > 0 && selectable.every((id) => selectedIds.has(id))}
            />
          ) : null}
          <div className="mt-2 space-y-3">
            {libraryError ? (
              <PageState
                headingLevel={2}
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
              <div className="runner gap-3 [--gate-x:1rem] [--gate-y:1.5rem] sm:[--gate-x:1.5rem]">
                <output className="sr-only" data-gate="none">
                  Loading your rosters…
                </output>
                <RosterLibrarySkeleton rows={unfiltered ? rows : DEFAULT_ROSTER_ROWS} />
              </div>
            ) : active.length ? (
              <>
                {groupPage ? (
                  <div className="space-y-6">
                    {groupPage.shown.map(({ group, total }) => (
                      <Collapsible
                        key={group.key}
                        render={<section />}
                        open={!isCollapsed(group.key)}
                        onOpenChange={(open) => setCollapsed((current) => toggled(current, `${selectedGrouping} ${group.key}`, !open))}
                      >
                        <h3>
                          <CollapsibleTrigger className="group eyebrow flex w-full items-baseline gap-3 pb-2 text-left hover:text-bone">
                            <span className="mr-auto">{group.label}</span>
                            <span className="readout">{total}</span>
                            <ChevronDown className="size-4 self-center transition-transform group-data-panel-open:rotate-180" aria-hidden />
                          </CollapsibleTrigger>
                        </h3>
                        <CollapsibleContent>
                          <div className="runner gap-3 [--gate-x:1rem] [--gate-y:1.5rem] sm:[--gate-x:1.5rem]">
                            {groups.filter((card) => runOf.get(card.head.roster) === group.key).map(renderCard)}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                ) : (
                  <div className="runner gap-3 [--gate-x:1rem] [--gate-y:1.5rem] sm:[--gate-x:1.5rem]">{groups.map(renderCard)}</div>
                )}
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
                {more ? (
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
              <NoFilterMatches>
                {archived.length ? 'Every roster here is archived. Archived rosters are listed below.' : 'No rosters match these filters'}
              </NoFilterMatches>
            ) : (
              <PageState
                headingLevel={2}
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
              <div className="mt-2 runner gap-3 [--gate-x:1rem] [--gate-y:1.5rem] sm:[--gate-x:1.5rem]">
                {archivedGroups.map(renderCard)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </PageContent>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deletingCount === 1 ? deleting?.rosters[0]?.name : countLabel(deletingCount, 'roster')}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {guest
                ? 'This removes the roster from this device for good. A copy you brought to a battle is kept there.'
                : deletingCount === 1
                  ? archivable
                    ? 'Deleting removes the roster for good; archiving hides it until you unarchive it. Frozen copies in battles and tournaments are kept either way.'
                    : 'This removes the saved roster for good. Frozen copies in battles and tournaments are kept.'
                  : archivable
                    ? 'Deleting removes these rosters for good; archiving hides them until you unarchive them. Frozen copies in battles and tournaments are kept either way.'
                    : 'This removes these saved rosters for good. Frozen copies in battles and tournaments are kept.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {archivable ? deleteAction : null}
            <AlertDialogCancel>{deletingCount === 1 ? 'Keep roster' : 'Keep rosters'}</AlertDialogCancel>
            {archivable ? (
              <AlertDialogAction
                onClick={() => {
                  if (deleting?.together)
                    changeSelected(
                      'archive',
                      unarchived.map((roster) => roster.id),
                    )
                  else actions.archive.mutate({ id: unarchived[0]!.id, archived: true })
                  setDeleting(null)
                }}
              >
                {deletingCount === 1 ? 'Archive roster' : `Archive ${countLabel(unarchived.length, 'roster')}`}
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
      {sharing ? (
        <RosterShareDialog
          open
          onClose={() => setSharingId(null)}
          {...libraryShare(
            sharing,
            rosterTitle(
              sharing,
              available?.factions.find((entry) => entry.id === sharing.catalogueId),
              pageById.get(sharing.id)?.label,
            ),
          )}
        />
      ) : null}
      {lendingId ? <RosterLoanDialog rosterId={lendingId} open onClose={() => setLendingId(null)} /> : null}
      {battleRosterId ? <CreateBattle rosterId={battleRosterId} open onOpenChange={(open) => !open && setBattleRosterId(null)} /> : null}
      {grading ? <SavedRosterGradesDialog id={grading.id} guest={guest} name={grading.name} onClose={() => setGrading(null)} /> : null}
      <RosterExportDialog exported={actions.exportText} onClose={actions.clearExport} />
      <RosterExchangeDialog exchange={actions.exchangeCode} onClose={actions.clearExchange} />
    </main>
  )
}

/** Cards the height of a loaded roster's, enough to reach past most desktop screens so the rows arriving do not push the footer away. */
function RosterLibrarySkeleton({ rows }: { rows: number }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="flex min-h-[6rem] items-center gap-3 part p-3" aria-hidden>
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

function RosterLibraryFilters({
  search,
  facets,
  rosters,
  factions,
  favourites,
  count,
  onChange,
  sort,
}: {
  search: RosterLibrarySearch
  facets: Partial<Record<(typeof LIBRARY_FACETS)[number], Facet>>
  rosters: readonly SavedRoster[]
  factions: readonly FilterableFaction[]
  favourites: ReadonlySet<string>
  count: number | null
  onChange: (next: RosterLibrarySearch) => void
  sort: ReactNode
}) {
  const { data: references } = useQuery(gameReferencesQuery())
  const tally = <T,>(values: T[]) => countBy(values, (value) => value)
  const countOf = (counts: ReadonlyMap<unknown, number>, value: unknown) => String(counts.get(value) ?? 0)
  // Everything here is in the browser already, so the choices are what the library holds and each can say how many.
  const held = factions.filter((faction) => rosters.some((roster) => roster.catalogueId === faction.id))
  const perFaction = tally(rosters.map((roster) => roster.catalogueId))
  const factionGroups = factionSelectGroups(held, favourites).map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      value: factions.find((faction) => faction.id === item.value)?.slug ?? item.value,
      detail: countOf(perFaction, item.value),
    })),
  }))
  const perDetachment = tally(rosters.flatMap((roster) => roster.detachmentIds))
  const detachmentNames = new Map(
    factions.flatMap((faction) => faction.detachments.map((detachment) => [detachment.id, detachment.name] as const)),
  )
  const perSize = tally(rosters.map((roster) => roster.limit))
  const perSharing = tally(rosters.map((roster) => roster.visibility))
  const perDisposition = tally(rosters.flatMap((roster) => roster.disposition ?? []))
  const dimensions: FilterDimension[] = [
    { key: 'faction', label: 'Faction', groups: factionGroups, pinned: true },
    {
      key: 'detachment',
      label: 'Detachment',
      pinned: true,
      groups: ungrouped(
        [...perDetachment.keys()]
          .map((id) => ({ label: detachmentNames.get(id) ?? id, value: id, detail: countOf(perDetachment, id) }))
          .toSorted((left, right) => left.label.localeCompare(right.label)),
      ),
    },
    {
      key: 'limit',
      label: 'Battle size',
      pinned: true,
      groups: ungrouped(
        GAME_SIZES.map((size) => ({ label: battleSizeOptionLabel(size), value: String(size.limit), detail: countOf(perSize, size.limit) })),
      ),
    },
    {
      key: 'visibility',
      label: 'Sharing',
      pinned: true,
      groups: ungrouped(ROSTER_VISIBILITIES.map((value) => ({ label: VISIBILITY_NAME[value], value, detail: countOf(perSharing, value) }))),
    },
    { key: 'updates', label: 'Rules and data', groups: UPDATE_GROUPS, pinned: true },
    {
      key: 'disposition',
      label: 'Disposition',
      groups: ungrouped(
        (references?.dispositions ?? [])
          .filter((disposition) => perDisposition.has(disposition.id))
          .map((disposition) => ({ label: disposition.name, value: disposition.id, detail: countOf(perDisposition, disposition.id) })),
      ),
    },
    { key: 'state', label: 'Status', groups: STATE_GROUPS },
    ...ROSTER_ASSESSMENT_DIMENSIONS,
  ]
  return (
    <FilterBar
      scope="rosters:mine"
      label="Roster"
      query={search.q ?? ''}
      onQuery={(next) => onChange({ ...search, q: next.trim() || undefined })}
      placeholder="Search your rosters…"
      maxQueryLength={ROSTER_SEARCH_MAX_LENGTH}
      dimensions={dimensions}
      value={facets}
      onChange={(key, facet) => onChange({ ...search, [key]: facetText(facet) })}
      period={{
        label: 'Updated',
        value: periodSearch(search),
        onChange: (next) => onChange({ ...search, period: undefined, from: undefined, to: undefined, ...next }),
      }}
      address={search}
      onApply={onChange}
      sort={sort}
      summary={count === null ? null : countLabel(count, 'roster')}
    />
  )
}
