import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BattleShelf } from '../battles/BattleShelf'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { PlayerRankings } from './PlayerRankings'
import { PlayerRosters } from './PlayerRosters'
import { recordSummary } from './recordSummary'
import { ServiceRecordPanel } from './ServiceRecordPanel'
import {
  factionIndexQuery,
  meQuery,
  type PlayerProfileFilter,
  playerProfileQuery,
  playerRankingsQuery,
  playerRostersQuery,
  userProfileQuery,
} from '../../queries'

/** Which of the three answers a profile holds is on screen. */
const TABS = ['record', 'battles', 'rosters'] as const
type ProfileTab = (typeof TABS)[number]

export type ProfileSearch = PlayerProfileFilter & { tab?: ProfileTab }

/**
 * The address carries both the tab and the record's narrowing.
 *
 * `tab` is deliberately not a loader dependency: every tab's data is fetched for
 * the first frame, so switching one is a render rather than a request.
 */
export const readSearch = (search: Record<string, unknown>): ProfileSearch => {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
  const size = Number(search.limit)
  const tab = TABS.find((candidate) => candidate === search.tab)
  return {
    tab,
    faction: text(search.faction),
    detachment: text(search.detachment),
    opponentFaction: text(search.opponentFaction),
    opponentDetachment: text(search.opponentDetachment),
    opponentId: text(search.opponentId),
    missionPackId: text(search.missionPackId),
    limit: Number.isFinite(size) && size > 0 ? size : undefined,
  }
}

/** The narrowing alone, so a tab change is not a new cache key for the record. */
export const recordFilter = ({ tab: _tab, ...filter }: ProfileSearch): PlayerProfileFilter => filter

/**
 * One player, open to anybody.
 *
 * A name was already public; this makes the games behind it public too, but only
 * as far as their own answer allows — the server narrows the list with the same
 * fold a battle link reads, so a profile can never list a battle that link would
 * refuse. A player who keeps their battles private has a name here and nothing
 * else, which is exactly what they asked for.
 *
 * Nothing on the page is stored. The rankings come from the leaderboard's own fold
 * and the record from these battles, so neither can drift from the table it agrees
 * with.
 */
export function PlayerProfilePage({ userId, search }: { userId: string; search: ProfileSearch }) {
  const filter = recordFilter(search)
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: profile } = useQuery(userProfileQuery(userId))
  const { data } = useQuery(playerProfileQuery(userId, filter))
  const { data: rankings } = useQuery(playerRankingsQuery(userId))
  const { data: published } = useQuery(playerRostersQuery(userId))
  // Only fetched when there is a list to name a faction for, since the index is large.
  const factions = useQuery({ ...factionIndexQuery(), enabled: Boolean(published?.rosters.length) })
  if (!profile) {
    return (
      <main className="flex w-full">
        <PageState
          className="flex-1 border-x-0 border-t-0"
          eyebrow="Player profile"
          title="No such player"
          explanation="This account does not exist, or it has been deleted."
          icon={UserX}
        />
      </main>
    )
  }

  const yourself = userId === me?.id
  const record = data?.record
  // A tab nothing would fill is not offered, and an address naming one falls back
  // to the record rather than an empty panel insisting the tab exists.
  const tabs = [
    { value: 'record' as const, label: 'Record', count: undefined },
    { value: 'battles' as const, label: 'Battles', count: data?.played ?? 0 },
    ...(published?.rosters.length ? [{ value: 'rosters' as const, label: 'Rosters', count: published.rosters.length }] : []),
  ]
  const tab = tabs.some((candidate) => candidate.value === search.tab) ? (search.tab as ProfileTab) : 'record'
  return (
    <main className="w-full">
      <PageHeader
        eyebrow={yourself ? 'You' : 'Player'}
        title={profile.name}
        description={record ? recordSummary(record) : undefined}
        media={<PlayerAvatar name={profile.name} image={profile.image} className="size-20 text-2xl" />}
      />
      <PageContent>
        {/* The primitive's root is a flex row by default, which would sit the panel beside the tab bar. */}
        <Tabs
          value={tab}
          className="flex-col gap-0"
          onValueChange={(value) =>
            void navigate({ to: '/users/$userId', params: { userId }, search: { ...filter, tab: value as ProfileTab } })
          }
        >
          <TabsList data-onboarding="profile-tabs" variant="line" className="h-auto w-full justify-start gap-4 border-b border-edge p-0">
            {/*
              The primitive's own active underline is positioned by a variant this
              setup does not match, so it renders at no height. Stated here instead.
            */}
            {tabs.map(({ value, label, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rubric h-auto flex-none gap-2 rounded-none px-0 pb-2 after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-parchment hover:text-bone data-active:text-parchment data-active:after:opacity-100"
              >
                {label}
                {count === undefined ? null : <span className="readout text-faint">{count}</span>}
              </TabsTrigger>
            ))}
          </TabsList>

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
              <p className="border border-edge bg-panel p-5 text-sm text-dim">
                {yourself
                  ? 'None of your battles are listed here. Only the ones your sharing setting allows appear.'
                  : 'This player has no battles anyone else can watch.'}
              </p>
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
