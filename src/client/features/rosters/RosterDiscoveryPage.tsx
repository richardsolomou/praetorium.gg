import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Copy, ListFilter, ScrollText, Users } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RULES_VERSION_STATUSES,
  type RosterAudience,
  type RosterDiscoveryFilter,
  type RulesVersionStatus,
} from '../../../core/rosterDiscovery'
import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'
import type { RosterSort } from '../../../core/rosterSort'
import { rulesVersionStatus } from '../../../core/rosterDiscoveryScope'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/Dialog'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import type { SearchableGroup } from '../../components/SearchableSelect'
import { copyRoster } from '../../functions'
import { useFavouriteFactions } from '../../favouriteFactions'
import { discoveredRostersQuery, factionIndexQuery, invalidateSavedRosters, meQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { factionSelectGroups } from './builder/factions'
import { CreateRoster } from './CreateRoster'
import { FilterField, RosterSortMenu } from './RosterFilters'
import { RosterImport } from './RosterImport'
import { RosterSummary, rosterTitle } from './RosterSummary'
import { RosterViews } from './RosterViews'

export type RosterDiscoverySearch = { faction?: string; detachment?: string; rules?: RulesVersionStatus; sort?: RosterSort }

type IndexedFactions = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof factionIndexQuery>['queryFn']>>>>['factions']
type DiscoveredPage = Awaited<ReturnType<NonNullable<ReturnType<typeof discoveredRostersQuery>['queryFn']>>>
type Discovered = DiscoveredPage['rosters'][number]

const RULES_LABEL: Record<RulesVersionStatus, string> = { current: 'Current', archived: 'Archived', preview: 'Preview' }
const RULES_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'Any rules version', value: 'all' },
      ...RULES_VERSION_STATUSES.map((status) => ({ label: RULES_LABEL[status], value: status })),
    ],
  },
]

/** One entry per faction, named by its current rules where it has them, whatever versions its rosters use. */
function factionFamilies(factions: IndexedFactions) {
  const families = new Map<string, IndexedFactions[number]>()
  for (const faction of factions) {
    const family = currentCatalogueFamilyId(faction.id)
    const known = families.get(family)
    if (!known || (faction.isDefault && !known.isDefault)) families.set(family, faction)
  }
  return [...families].map(([family, faction]) => ({ ...faction, family }))
}

/** The filter the page's address asks for, read against the faction index. */
export function discoveryFilter(search: RosterDiscoverySearch, factions: IndexedFactions): RosterDiscoveryFilter {
  const named = factions.find((faction) => faction.slug === search.faction)
  const family = named && currentCatalogueFamilyId(named.id)
  return {
    ...(family ? { faction: family } : {}),
    ...(family && search.detachment ? { detachment: search.detachment } : {}),
    ...(search.rules ? { rules: search.rules } : {}),
  }
}

/** Other players' public rosters, or a signed-in player's friends' public rosters. */
export function RosterDiscoveryPage({ view, search }: { view: RosterAudience; search: RosterDiscoverySearch }) {
  const navigate = useNavigate()
  const path = useRouterState({ select: (state) => state.location.href })
  const { data: me } = useQuery(meQuery())
  const indexResult = useQuery(factionIndexQuery())
  const factions = indexResult.data?.factions ?? []
  const filter = discoveryFilter(search, factions)
  const { favourites } = useFavouriteFactions(Boolean(me))
  const families = factionFamilies(factions)
  const family = families.find((faction) => faction.family === filter.faction)
  const detachments = new Map<string, string>()
  for (const faction of factions)
    if (family && currentCatalogueFamilyId(faction.id) === family.family && (!filter.rules || rulesVersionStatus(faction) === filter.rules))
      for (const detachment of faction.detachments) detachments.set(detachment.id, detachment.name)
  const detachmentGroups: SearchableGroup[] = [
    {
      label: '',
      items: [
        { label: 'Any detachment', value: 'all' },
        ...[...detachments].map(([value, label]) => ({ label, value })).toSorted((left, right) => left.label.localeCompare(right.label)),
      ],
    },
  ]
  const factionGroups: SearchableGroup[] = [
    { label: '', items: [{ label: 'All factions', value: 'all' }] },
    ...factionSelectGroups(
      families.map((faction) => ({ ...faction, id: faction.slug })),
      new Set(families.filter((faction) => favourites.has(faction.id)).map((faction) => faction.slug)),
    ),
  ]
  const sort = search.sort ?? 'updated-desc'
  const choose = (next: RosterDiscoverySearch) => void navigate({ to: '/rosters', search: { view, sort: search.sort, ...next } })
  const active = [filter.faction, filter.detachment, filter.rules].filter(Boolean).length

  const result = useInfiniteQuery({ ...discoveredRostersQuery(filter, view, sort), enabled: !search.faction || indexResult.isSuccess })
  const shown = result.data?.pages.flatMap((page) => page.rosters) ?? []
  const listed = view === 'friends' ? "friends' public rosters" : 'public rosters'

  const queryClient = useQueryClient()
  const duplicate = useMutation({
    mutationFn: (entry: Discovered) => copyRoster({ data: { id: entry.roster.id, variant: false } }),
    onSuccess: async ({ id }, entry) => {
      posthog.capture('roster_duplicated', { unit_count: entry.roster.unitCount, discovered: true })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={me ? 'Your rosters' : 'Community'}
        title={me ? 'Rosters' : 'Public rosters'}
        description={
          me
            ? 'Build, import, organize, and share your armies, or find one your friends and other players made public.'
            : 'Find armies other players published, open them, and duplicate one to make it your own.'
        }
        actions={
          me ? (
            <>
              <RosterImport />
              <CreateRoster factionOptions={factions} />
            </>
          ) : (
            <Link to="/rosters" className={buttonClass()}>
              Build a roster
            </Link>
          )
        }
      >
        {me ? <RosterViews view={view} /> : null}
      </PageHeader>
      <PageContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
              <ListFilter />
              Filter
              {active ? <span className="chip readout">{active}</span> : null}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Filter rosters</DialogTitle>
                <DialogDescription>Narrow the {listed} to a faction, detachment or rules version.</DialogDescription>
              </DialogHeader>
              <DialogBody className="gap-3">
                <FilterField
                  label="Faction"
                  value={family?.slug ?? 'all'}
                  groups={factionGroups}
                  onChange={(chosen) => choose({ rules: search.rules, ...(chosen === 'all' ? {} : { faction: chosen }) })}
                />
                <FilterField
                  label="Detachment"
                  value={filter.detachment ?? 'all'}
                  groups={detachmentGroups}
                  disabled={!family}
                  onChange={(chosen) => choose({ ...search, detachment: chosen === 'all' ? undefined : chosen })}
                />
                <FilterField
                  label="Rules version"
                  value={filter.rules ?? 'all'}
                  groups={RULES_GROUPS}
                  onChange={(chosen) => choose({ ...search, rules: chosen === 'all' ? undefined : (chosen as RulesVersionStatus) })}
                />
              </DialogBody>
              <DialogFooter>
                <Button variant="ghost" disabled={!active} onClick={() => choose({})} className="sm:mr-auto sm:ml-0">
                  Clear filters
                </Button>
                <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <RosterSortMenu value={sort} onChange={(chosen) => choose({ ...search, sort: chosen === 'updated-desc' ? undefined : chosen })} />
        </div>
        {duplicate.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not duplicate that roster: {errorMessage(duplicate.error)}
          </p>
        ) : null}

        <section>
          <h2 className="rubric border-b border-edge pb-2">{view === 'friends' ? "Friends' public rosters" : 'Public rosters'}</h2>
          <div className="mt-2 space-y-3">
            {result.isError && !shown.length ? (
              <PageState
                headingLevel={2}
                eyebrow="Rosters"
                title="Could not load rosters"
                explanation={`The ${listed} could not be loaded. Try again.`}
                action={
                  <Button variant="outline" onClick={() => void result.refetch()} disabled={result.isFetching}>
                    Try again
                  </Button>
                }
              />
            ) : result.isPending ? (
              <div aria-busy="true" className="space-y-3">
                <output className="sr-only">Loading {listed}…</output>
                <DiscoveredRosterSkeleton />
              </div>
            ) : shown.length || result.hasNextPage ? (
              <>
                {shown.length ? null : <p className="py-2 text-sm text-dim">None of the most recently saved rosters match yet.</p>}
                {shown.map((entry) => (
                  <DiscoveredRoster
                    key={entry.roster.id}
                    entry={entry}
                    faction={factions.find((faction) => faction.id === entry.roster.catalogueId)}
                    signedIn={Boolean(me)}
                    signInPath={path}
                    duplicating={duplicate.isPending && duplicate.variables?.roster.id === entry.roster.id}
                    onDuplicate={() => duplicate.mutate(entry)}
                    disabled={duplicate.isPending}
                  />
                ))}
                {result.hasNextPage ? (
                  <Button variant="outline" disabled={result.isFetchingNextPage} onClick={() => void result.fetchNextPage()}>
                    {result.isFetchingNextPage ? 'Loading…' : 'Show more rosters'}
                  </Button>
                ) : null}
              </>
            ) : active ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm text-dim">
                No {listed} match these filters
                <Button variant="outline" size="sm" onClick={() => choose({})}>
                  Clear filters
                </Button>
              </p>
            ) : view === 'friends' ? (
              <div data-friends-empty>
                <PageState
                  headingLevel={2}
                  eyebrow="Friends' rosters"
                  title="No friends' rosters yet."
                  explanation="Rosters your friends make public appear here."
                  icon={Users}
                  action={
                    <Link to="/friends" className={buttonClass({ variant: 'outline' })}>
                      <Users /> Your friends
                    </Link>
                  }
                />
              </div>
            ) : (
              <PageState
                headingLevel={2}
                eyebrow="Public rosters"
                title={me ? 'No other public rosters yet.' : 'No public rosters yet.'}
                explanation={
                  me
                    ? "Other players' public rosters appear here; your own are under Mine."
                    : 'Players list a roster here by choosing Public in its roster setup.'
                }
                icon={ScrollText}
              />
            )}
          </div>
        </section>
      </PageContent>
    </main>
  )
}

function DiscoveredRoster({
  entry,
  faction,
  signedIn,
  signInPath,
  duplicating,
  disabled,
  onDuplicate,
}: {
  entry: Discovered
  faction?: IndexedFactions[number]
  signedIn: boolean
  signInPath: string
  duplicating: boolean
  disabled: boolean
  onDuplicate: () => void
}) {
  const { roster, owner } = entry
  const title = rosterTitle(roster, faction)
  return (
    <article data-discovered-roster={title} className="border border-edge bg-panel hover:border-info hover:bg-raised">
      <Link to="/rosters/$id" params={{ id: roster.id }} className="flex min-w-0 p-3">
        <RosterSummary roster={roster} faction={faction} points={entry.points} problem={entry.problem} showLock={false} showLegality />
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-3 py-2">
        <span className="min-w-0 truncate text-xs text-dim">
          By{' '}
          <Link to="/users/$userId" params={{ userId: owner.id }} className="font-semibold text-info hover:text-bone">
            {owner.name}
          </Link>
        </span>
        {signedIn ? (
          <Button variant="outline" size="sm" disabled={disabled} onClick={onDuplicate} aria-label={`Duplicate ${title}`}>
            <Copy /> {duplicating ? 'Duplicating…' : 'Duplicate'}
          </Button>
        ) : (
          <Link to="/sign-in" search={{ next: signInPath }} className={buttonClass({ variant: 'outline', size: 'sm' })}>
            <Copy /> Sign in to duplicate
          </Link>
        )}
      </div>
    </article>
  )
}

function DiscoveredRosterSkeleton() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} className="border border-edge bg-panel" aria-hidden>
      <div className="flex min-h-[5.25rem] items-center gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-edge px-3 py-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  ))
}
