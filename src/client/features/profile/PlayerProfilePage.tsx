import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { countBy } from '../../../core/collections'
import { BattleShelf } from '../battles/BattleShelf'
import { PageTabsList } from '../../components/PageTabs'
import { PageContent, PageHeader } from '../../components/Page'
import { FullPageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { AdminBadge } from '../../components/AdminBadge'
import { SupporterBadge } from '../../components/SupporterBadge'
import { PlayerRankings } from './PlayerRankings'
import { ProfileForm } from './ProfileForm'
import { PlayerRosters } from './PlayerRosters'
import { PlayerCollection } from './PlayerCollection'
import { recordSummary } from './recordSummary'
import { ServiceRecordPanel } from './ServiceRecordPanel'
import { searchText } from '../../searchParams'
import { PersonalPerformancePanel } from './PersonalPerformancePanel'
import { AchievementsPanel } from './AchievementsPanel'
import {
  factionIndexQuery,
  collectionProfileQuery,
  meQuery,
  type PlayerProfileFilter,
  playerAchievementsQuery,
  playerProfileQuery,
  playerRankingsQuery,
  playerRostersQuery,
  userProfileQuery,
} from '../../queries'
import { Problem } from '../../components/Problem'

const TABS = ['record', 'battles', 'rosters', 'collection', 'achievements'] as const
type ProfileTab = (typeof TABS)[number]

type ProfileSearch = PlayerProfileFilter & { tab?: ProfileTab }

/**
 * The address carries both the tab and the record's narrowing.
 *
 * `tab` is deliberately not a loader dependency: every tab's data is fetched for
 * the first frame, so switching one is a render rather than a request.
 */
export const readSearch = (search: Record<string, unknown>): ProfileSearch => {
  const size = Number(search.limit)
  const tab = TABS.find((candidate) => candidate === search.tab)
  return {
    tab,
    faction: searchText(search.faction),
    detachment: searchText(search.detachment),
    opponentFaction: searchText(search.opponentFaction),
    opponentDetachment: searchText(search.opponentDetachment),
    opponentId: searchText(search.opponentId),
    missionPackId: searchText(search.missionPackId),
    limit: Number.isFinite(size) && size > 0 ? size : undefined,
  }
}

/** The narrowing alone, so a tab change is not a new cache key for the record. */
export const recordFilter = ({ tab: _tab, ...filter }: ProfileSearch): PlayerProfileFilter => filter

/** A profile is public, but its record, battle list, and rank derive only from games the reader may watch. */
export function PlayerProfilePage({ userId, search }: { userId: string; search: ProfileSearch }) {
  const filter = recordFilter(search)
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: profile } = useQuery(userProfileQuery(userId))
  const { data } = useQuery(playerProfileQuery(userId, filter))
  const { data: rankings } = useQuery(playerRankingsQuery(userId))
  const { data: achievements } = useQuery(playerAchievementsQuery(userId))
  const collection = useQuery(collectionProfileQuery(userId))
  const { data: published } = useQuery(playerRostersQuery(userId))
  // Only fetched when there is a list to name a faction for, since the index is large.
  const factions = useQuery({ ...factionIndexQuery(), enabled: Boolean(published?.rosters.length) })
  if (!profile) {
    return (
      <FullPageState
        eyebrow="Player profile"
        title="No such player"
        explanation="This account does not exist, or it has been deleted."
        icon={UserX}
      />
    )
  }

  const yourself = userId === me?.id
  const record = data?.record
  // A tab nothing would fill is not offered, and an address naming one falls back
  // to the record rather than an empty panel insisting the tab exists.
  const lists = published?.rosters ?? []
  // Many players only build lists. With no battle to count, their lists lead and the record is not offered.
  const battled = Boolean(data?.facets.factions.length)
  const rosterTab = lists.length ? [{ value: 'rosters' as const, label: 'Rosters', count: lists.length }] : []
  const tabs = [
    ...(battled || !lists.length
      ? [
          { value: 'record' as const, label: 'Record', count: undefined },
          { value: 'battles' as const, label: 'Battles', count: data?.played ?? 0 },
          ...rosterTab,
        ]
      : rosterTab),
    ...(yourself || collection.data?.entries.length ? [{ value: 'collection' as const, label: 'Collection', count: undefined }] : []),
    { value: 'achievements' as const, label: 'Achievements', count: achievements ? Object.keys(achievements.earned).length : undefined },
  ]
  const tab = tabs.some((candidate) => candidate.value === search.tab) ? (search.tab as ProfileTab) : tabs[0]!.value
  const mostBuilt = [...countBy(lists, (roster) => roster.catalogueId)].toSorted((one, other) => other[1] - one[1])[0]?.[0]
  const buildsMost = factions.data?.factions.find((faction) => faction.id === mostBuilt) ?? null
  return (
    <main className="w-full">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            {yourself ? 'You' : 'Player'}
            {profile.admin ? <AdminBadge /> : null}
            {profile.supporter ? <SupporterBadge /> : null}
          </span>
        }
        title={profile.name}
        description={record && (record.battles || !lists.length) ? recordSummary(record) : undefined}
        media={
          <PlayerAvatar
            name={profile.name}
            image={profile.image}
            className={`size-20 text-2xl ${profile.admin ? 'ring-2 ring-admin/70 ring-offset-3 ring-offset-panel' : profile.supporter ? 'ring-2 ring-supporter/60 ring-offset-3 ring-offset-panel' : ''}`}
          />
        }
      >
        {data ? (
          <ProfileForm
            battles={data.battles}
            userId={userId}
            rank={rankings?.overall ?? null}
            lists={{ count: lists.length, main: buildsMost }}
            achievementPoints={achievements?.points ?? 0}
          />
        ) : null}
      </PageHeader>
      <PageContent>
        {/* The primitive's root is a flex row by default, which would sit the panel beside the tab bar. */}
        <Tabs
          value={tab}
          className="flex-col gap-0"
          onValueChange={(value) =>
            void navigate({ to: '/users/$userId', params: { userId }, search: { ...filter, tab: value as ProfileTab } })
          }
        >
          <PageTabsList tabs={tabs} />

          <TabsContent value="record" className="mt-4 space-y-6">
            {rankings ? <PlayerRankings rankings={rankings} /> : null}
            {data ? (
              <ServiceRecordPanel
                record={data.record}
                facets={data.facets}
                filter={filter}
                onFilter={(next) => void navigate({ to: '/users/$userId', params: { userId }, search: { ...next, tab: 'record' } })}
              />
            ) : null}
            {data?.record.battles ? <PersonalPerformancePanel performance={data.performance} /> : null}
          </TabsContent>

          <TabsContent value="battles" className="mt-4">
            {data?.battles.length ? (
              <>
                <BattleShelf battles={[...data.battles]} />
                {data.played > data.battles.length ? (
                  <p className="mt-2 text-xs text-faint">
                    The {data.battles.length} most recent of {data.played}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-dim">
                {yourself
                  ? 'None of your battles are listed here. Only the ones your sharing setting allows appear.'
                  : 'This player has no battles anyone else can watch.'}
              </p>
            )}
          </TabsContent>

          <TabsContent value="collection" className="mt-4">
            {collection.data ? (
              <PlayerCollection
                owner={{ id: userId, name: profile.name }}
                groups={collection.data.groups}
                wishlist={collection.data.wishlist}
                yourself={yourself}
              />
            ) : collection.isError ? (
              <Problem>
                Could not load the collection.{' '}
                <button type="button" className="text-info underline" onClick={() => void collection.refetch()}>
                  Retry
                </button>
              </Problem>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading collection">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="achievements" className="mt-4">
            {achievements ? (
              <AchievementsPanel achievements={achievements} />
            ) : (
              <Skeleton className="h-60" aria-label="Loading achievements" />
            )}
          </TabsContent>

          {published?.rosters.length ? (
            <TabsContent value="rosters" className="mt-4">
              <PlayerRosters
                rosters={published.rosters}
                totals={new Map(published.totals.map((entry) => [entry.id, entry]))}
                factions={factions.data?.factions ?? []}
                factionsLoading={factions.isPending}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </PageContent>
    </main>
  )
}
