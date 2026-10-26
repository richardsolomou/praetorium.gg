import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Copy, Eye, ScrollText, Swords, Users } from 'lucide-react'
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
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import type { SearchableGroup } from '../../components/SearchableSelect'
import { copyPlayedArmy, copyRoster } from '../../functions'
import { useFavouriteFactions } from '../../favouriteFactions'
import { discoveredRostersQuery, factionIndexQuery, invalidateSavedRosters, meQuery, playedArmiesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { factionSelectGroups } from './builder/factions'
import { CreateRoster } from './CreateRoster'
import { FilterDialog, FilterField, NoFilterMatches, RosterSortMenu } from './RosterFilters'
import { RosterImport } from './RosterImport'
import { RosterSummary, rosterTitle } from './RosterSummary'
import { RosterViews } from './RosterViews'
import { useAccountPrompt } from './AccountPrompt'
import { peekGuestDraft } from './guestDraft'
import { copyPlayedArmyToDevice, copyRosterToDevice, useNewRoster } from './newRoster'
import { useClientValue } from '../../useClientValue'
import { Problem } from '../../components/Problem'
import { FactionMark } from '../../components/FactionMark'
import { BATTLE_ENDINGS, battleOutcomeStage } from '../../battleStage'
import { OwnerLink } from './OwnerLink'

export type RosterDiscoverySearch = { faction?: string; detachment?: string; rules?: RulesVersionStatus; sort?: RosterSort }

type IndexedFactions = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof factionIndexQuery>['queryFn']>>>>['factions']
type DiscoveredPage = Awaited<ReturnType<NonNullable<ReturnType<typeof discoveredRostersQuery>['queryFn']>>>
type Discovered = DiscoveredPage['rosters'][number]
type PlayedArmy = Awaited<ReturnType<NonNullable<ReturnType<typeof playedArmiesQuery>['queryFn']>>>['armies'][number]

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

/** Other players' public rosters, a signed-in player's friends' public rosters, or armies from finished public battles. */
export function RosterDiscoveryPage({ view, search }: { view: RosterAudience | 'played'; search: RosterDiscoverySearch }) {
  const played = view === 'played'
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

  const ready = !search.faction || indexResult.isSuccess
  // A visitor has no friends to list, so their Friends tab says what an account adds instead of asking.
  const signedOutFriends = !me && view === 'friends'
  const result = useInfiniteQuery({
    ...discoveredRostersQuery(filter, played ? 'public' : view, sort),
    enabled: !played && !signedOutFriends && ready,
  })
  const playedResult = useInfiniteQuery({ ...playedArmiesQuery(filter), enabled: played && ready })
  const shown = result.data?.pages.flatMap((page) => page.rosters) ?? []
  const listed = played ? 'played armies' : view === 'friends' ? "friends' public rosters" : 'public rosters'

  const queryClient = useQueryClient()
  const create = useNewRoster()
  const draft = useClientValue(peekGuestDraft, null)
  const account = useAccountPrompt()
  // A visitor keeps one list; making another asks them to sign up first.
  const another = !me && draft ? () => account.ask('another-roster') : undefined
  const duplicate = useMutation({
    mutationFn: (entry: Discovered) =>
      me ? copyRoster({ data: { id: entry.roster.id, variant: false } }) : copyRosterToDevice(entry.roster.id),
    onSuccess: async ({ id }, entry) => {
      posthog.capture('roster_duplicated', { unit_count: entry.roster.unitCount, discovered: true, guest: !me })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })
  const copyPlayed = useMutation({
    mutationFn: (army: PlayedArmy) => {
      const data = { token: army.battle, playerId: army.player.id }
      return me ? copyPlayedArmy({ data }) : copyPlayedArmyToDevice(data)
    },
    onSuccess: async ({ id }, army) => {
      posthog.capture('roster_duplicated', { unit_count: army.unitCount, played: true, guest: !me })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Your rosters"
        title="Rosters"
        description="Build, import, organize, and share your armies, or find one your friends and other players made public."
        actions={
          <>
            <RosterImport onImport={me ? undefined : create.keepImported} blocked={another} />
            <CreateRoster factionOptions={factions} blocked={another} />
          </>
        }
      >
        <RosterViews view={view} />
      </PageHeader>
      <PageContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <FilterDialog
            active={active}
            description={`Narrow the ${listed} to a faction, detachment or rules version.`}
            onClear={() => choose({})}
          >
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
          </FilterDialog>
          {played ? null : (
            <RosterSortMenu
              value={sort}
              onChange={(chosen) => choose({ ...search, sort: chosen === 'updated-desc' ? undefined : chosen })}
            />
          )}
        </div>
        {duplicate.isError ? <Problem>Could not duplicate that roster: {errorMessage(duplicate.error)}</Problem> : null}
        {copyPlayed.isError ? <Problem>Could not copy that army: {errorMessage(copyPlayed.error)}</Problem> : null}
        {create.saveError ? <Problem>{create.saveError}</Problem> : null}

        {played ? (
          <PlayedArmies
            result={playedResult}
            factions={factions}
            filtered={active > 0}
            copying={copyPlayed.isPending ? copyPlayed.variables : null}
            onCopy={(army) => (another ? another() : copyPlayed.mutate(army))}
            onClearFilters={() => choose({})}
          />
        ) : (
          <section>
            <h2 className="rubric border-b border-edge pb-2">{view === 'friends' ? "Friends' public rosters" : 'Public rosters'}</h2>
            <div className="mt-2 space-y-3">
              {signedOutFriends ? (
                <PageState
                  headingLevel={2}
                  eyebrow="Friends' rosters"
                  title="See what your friends are building"
                  explanation="With a free account, your friends' public rosters appear here, ready to open or duplicate."
                  icon={Users}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Link to="/sign-in" search={{ next: path, join: true }} className={buttonClass()}>
                        Create an account
                      </Link>
                      <Link to="/sign-in" search={{ next: path }} className={buttonClass({ variant: 'ghost' })}>
                        I already have an account
                      </Link>
                    </div>
                  }
                />
              ) : result.isError && !shown.length ? (
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
                      duplicating={duplicate.isPending && duplicate.variables?.roster.id === entry.roster.id}
                      onDuplicate={another ?? (() => duplicate.mutate(entry))}
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
                <NoFilterMatches onClear={() => choose({})}>No {listed} match these filters</NoFilterMatches>
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
        )}
      </PageContent>
      {account.prompt}
    </main>
  )
}

/**
 * Armies as their finished battles fielded them, under the rules version recorded then.
 *
 * A card opens the frozen army in its battle, which copying never changes; the points and
 * legality beside it are today's answer for that rules version, which a copy starts from.
 */
function PlayedArmies({
  result,
  factions,
  filtered,
  copying,
  onCopy,
  onClearFilters,
}: {
  result: ReturnType<typeof useInfiniteQuery<Awaited<ReturnType<NonNullable<ReturnType<typeof playedArmiesQuery>['queryFn']>>>>>
  factions: IndexedFactions
  filtered: boolean
  copying: PlayedArmy | null
  onCopy: (army: PlayedArmy) => void
  onClearFilters: () => void
}) {
  const armies = result.data?.pages.flatMap((page) => page.armies) ?? []
  return (
    <section>
      <h2 className="rubric border-b border-edge pb-2">Played armies</h2>
      <p className="mt-2 text-xs text-dim">
        Armies from finished battles every player keeps public, as they were fielded. Points and legality are checked against today’s data
        for the rules version each was played under.
      </p>
      <div className="mt-2 space-y-3">
        {result.isError && !armies.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Played armies"
            title="Could not load played armies"
            explanation="The played armies could not be loaded. Try again."
            action={
              <Button variant="outline" onClick={() => void result.refetch()} disabled={result.isFetching}>
                Try again
              </Button>
            }
          />
        ) : result.isPending ? (
          <div aria-busy="true" className="space-y-3">
            <output className="sr-only">Loading played armies…</output>
            <DiscoveredRosterSkeleton />
          </div>
        ) : armies.length || result.hasNextPage ? (
          <>
            {armies.length ? null : <p className="py-2 text-sm text-dim">None of the most recently finished battles match yet.</p>}
            {armies.map((army) => {
              const indexed = factions.find((faction) => faction.id === army.catalogueId)
              // Frozen armies keep the status their rules version had when they were fielded.
              const faction = indexed && {
                ...indexed,
                edition:
                  indexed.edition && army.edition
                    ? { ...indexed.edition, name: army.edition.name, status: army.edition.status }
                    : indexed.edition,
              }
              const key = `${army.battle}:${army.player.id}`
              return (
                <article key={key} data-played-army={army.name} className="border border-edge bg-panel hover:border-info hover:bg-raised">
                  <Link to="/rosters/$id" params={{ id: army.player.id }} search={{ battle: army.battle }} className="flex min-w-0 p-3">
                    <RosterSummary
                      roster={{ ...army, updatedAt: army.playedAt }}
                      faction={faction}
                      points={army.points}
                      problem={army.problem}
                      showLock={false}
                      showLegality
                      dateLabel="played"
                    />
                  </Link>
                  <PlayedOutcome outcome={army.outcome} token={army.battle} />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-3 py-2">
                    <span className="min-w-0 truncate text-xs text-dim">
                      By <OwnerLink owner={army.player} />
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={copying !== null}
                      onClick={() => onCopy(army)}
                      aria-label={`Duplicate ${army.name}`}
                    >
                      <Copy /> {copying && `${copying.battle}:${copying.player.id}` === key ? 'Duplicating…' : 'Duplicate'}
                    </Button>
                  </div>
                </article>
              )
            })}
            {result.hasNextPage ? (
              <Button variant="outline" disabled={result.isFetchingNextPage} onClick={() => void result.fetchNextPage()}>
                {result.isFetchingNextPage ? 'Loading…' : 'Show more armies'}
              </Button>
            ) : null}
          </>
        ) : filtered ? (
          <NoFilterMatches onClear={onClearFilters}>No played armies match these filters</NoFilterMatches>
        ) : (
          <PageState
            headingLevel={2}
            eyebrow="Played armies"
            title="No played armies yet."
            explanation="Armies appear here once a battle every player keeps public has finished."
            icon={Swords}
          />
        )}
      </div>
    </section>
  )
}

/** How the battle went for the army's side, drawn as its battle card draws it, with the way into the battle. */
function PlayedOutcome({ outcome, token }: { outcome: PlayedArmy['outcome']; token: string }) {
  const stage = battleOutcomeStage(outcome.result)
  return (
    <div data-played-outcome className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-edge px-3 py-2">
      <span className={`chip ${stage.tint}`}>{stage.name}</span>
      <span className="figure text-lg leading-none font-bold">
        <span className="text-side-a">{outcome.score}</span>
        <span className="px-1 text-sm text-faint">–</span>
        <span className="text-side-b">{outcome.opponentScore}</span>
      </span>
      {outcome.conceded ? <span className="text-2xs text-faint">{BATTLE_ENDINGS.conceded}</span> : null}
      {outcome.opponents.length ? (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-dim">
          <span className="text-faint">vs</span>
          {outcome.opponents.map((faction) => (
            <span key={faction.slug} className="flex min-w-0 items-center gap-1.5">
              <FactionMark faction={faction} size="sm" />
              <span className="truncate">{faction.displayName}</span>
            </span>
          ))}
        </span>
      ) : null}
      <Link to="/battles/$token" params={{ token }} className={buttonClass({ variant: 'ghost', size: 'sm', className: 'ml-auto' })}>
        <Eye /> Open battle
      </Link>
    </div>
  )
}

function DiscoveredRoster({
  entry,
  faction,
  duplicating,
  disabled,
  onDuplicate,
}: {
  entry: Discovered
  faction?: IndexedFactions[number]
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
          By <OwnerLink owner={owner} />
        </span>
        <Button variant="outline" size="sm" disabled={disabled} onClick={onDuplicate} aria-label={`Duplicate ${title}`}>
          <Copy /> {duplicating ? 'Duplicating…' : 'Duplicate'}
        </Button>
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
