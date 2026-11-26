import { Link } from '@tanstack/react-router'
import { ShelfLink } from '../../components/ShelfLink'
import { type ReactNode, useState } from 'react'
import { buttonClass } from '../../components/buttonClass'
import { isPracticeSeat } from '../../../core/newBattle'
import type { Battle } from '../battles/battle'
import { BattleLines } from '../battles/BattleLines'
import { SectionHeading } from '../../components/SectionHeading'
import type { OnboardingProgress } from '../../../core/onboarding'
import type { Standing } from '../../../core/standings'
import { AppCard, HomeAppCredits } from './HomeApps'
import { FriendTables, LINES_SHOWN, PublicTables, useBattleDetail, watchedTables } from './HomeFeed'
import { HomeGetStarted } from './HomeGetStarted'
import { type HomeGroup, HomeGroups, type HomeTournament } from './HomeGroups'
import { HomeHero } from './HomeHero'
import { HomeIntro } from './HomeIntro'
import { HomeSteps } from './HomeSteps'
import { HomeLeaders } from './HomeLeaders'
import { HomeClosing, HomeFeatures, HomeIncluded } from './HomePitch'
import { type HomeForm, HomeRecord, type HomeRecordData } from './HomeRecord'
import { battleOutcome } from '../../../core/standings'
import { HomeRivals, type Rival } from './HomeRivals'
import { type HomeRoster, HomeRosters } from './HomeRosters'
import { HomeInProgress, type LeagueGameDue, type RosterDue } from './HomeInProgress'

/** What the page draws, with nothing left to fetch. */
export type HomeData = {
  /** `usesApp`: they opened the mobile app in the past month, so Home stops offering it. */
  me: { id: string; name: string; usesApp?: boolean } | null
  mine: readonly Battle[]
  friends: readonly Battle[]
  open: readonly Battle[]
  /** The player's saved lists, most recently changed first. */
  rosters: readonly HomeRoster[]
  rosterCount: number
  rostersDue: readonly RosterDue[]
  friendRequests: number
  /** The ids of saved lists a data update changed since they were saved. */
  changedRosters: ReadonlySet<string>
  /** Absent until it has been folded, which happens after the page is drawn; null when it could not be. */
  record?: HomeRecordData | null
  /** The players this one has faced, most often first, from the same fold as `record`. */
  rivals: readonly Rival[]
  groups: readonly HomeGroup[]
  /** League games in the player's groups that nobody has started yet. */
  leagueGames: readonly LeagueGameDue[]
  tournaments: readonly HomeTournament[]
  onboarding?: OnboardingProgress
  /** The head of the leaderboard, which only a visitor is shown. */
  leaders: { rows: readonly Standing[] } | null
  /** The control that opens a battle, supplied rather than imported: see `Home`. */
  newBattle?: ReactNode
  /** Get started's way into setup, with the player's latest legal list already chosen, supplied for the same reason. */
  firstGame?: ReactNode
  notifications?: ReactNode
  /** The way back to the list a visitor left on this device, supplied for the same reason as `newBattle`. */
  guestDraft?: ReactNode
  /** Asking to delete one of the reader's own games, answered by `Home` and not here. */
  onDelete?: (battle: Battle) => void
}

/** A visitor's public shelf, longer because it is the evidence that games are played here. */
const VISITOR_GAMES = 3

/** An unfinished game untouched this long is left to the battles page rather than headlining the home page. */
export const ABANDONED_AFTER = 14 * 24 * 60 * 60 * 1_000

/** A game the player is in the middle of, rather than one they left long enough ago to count as abandoned. */
export const underWay = (battle: Battle, since: number) => battle.status !== 'finished' && battle.lastActivity > since

/** Keep one page width and show the player’s own pending games before friends’ and public games; visitors share the layout but see the public entry points. */
export function HomeView({
  me,
  mine,
  friends,
  open,
  rosters,
  rosterCount,
  rostersDue,
  friendRequests,
  changedRosters,
  record,
  rivals,
  groups,
  leagueGames,
  tournaments,
  onboarding,
  leaders,
  newBattle,
  firstGame,
  notifications,
  guestDraft,
  onDelete,
}: HomeData) {
  const [since] = useState(() => Date.now() - ABANDONED_AFTER)
  const live = (battle: Battle) => battle.status === 'finished' || battle.lastActivity > since
  const going = mine.filter((battle) => underWay(battle, since))
  const stale = mine.filter((battle) => battle.status !== 'finished' && battle.lastActivity <= since).length
  const finished = mine.filter((battle) => battle.status === 'finished' && !battle.playerDetails?.some(isPracticeSeat))
  const played = finished.slice(0, LINES_SHOWN)
  const detail = useBattleDetail()
  // A visitor's hero is the most recent public battle, so the shelf below must not
  // print it again two inches further down.
  const hero = me ? undefined : open.find(live)
  const { friends: shownFriends, open: rest } = watchedTables(friends, open, hero)
  if (me) {
    // A player who only builds lists has no record to show, and a strip of dashes would say they are losing.
    const battled = onboarding?.completedTasks.includes('battle') ?? false
    const opponents = <HomeRivals userId={me.id} rivals={rivals} />
    const stats = battled && record !== null ? <HomeRecord userId={me.id} data={record} form={homeForm(finished, me.id)} /> : null
    return (
      <main className="w-full">
        {/* Setup asks for an army first, so a player with neither a list nor a game is offered the list. */}
        <Welcome
          name={me.name}
          returning={mine.length > 0 || rosterCount > 0}
          newBattle={rosterCount > 0 || mine.length > 0 ? newBattle : null}
        />
        {notifications}
        <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-6 sm:px-6 sm:py-8">
          {/* The game being played leads the page across both columns, with the player's standing under it. */}
          <HomeInProgress
            games={going}
            staleGames={stale}
            viewerId={me.id}
            onDelete={onDelete}
            rostersDue={rostersDue}
            leagueGames={leagueGames}
            changedRosters={changedRosters.size}
            friendRequests={friendRequests}
          />
          {stats}
          <Columns
            lead={
              battled ? null : (
                <HomeGetStarted hasRoster={rosterCount > 0} inGroup={groups.some((group) => !group.pending)} newBattle={firstGame} />
              )
            }
            aside={
              <>
                {/* The lists keep one place whatever else the page holds; an empty shelf would only repeat Get started's first step. */}
                {battled || rosterCount > 0 ? <HomeRosters rosters={rosters} count={rosterCount} changed={changedRosters} /> : null}
                <HomeGroups groups={groups} tournaments={tournaments} />
                {/* A phone reads the side column before the results, so the opponents wait below them there. */}
                <div className="max-lg:hidden">{opponents}</div>
                <AppCard stores={!me.usesApp} />
              </>
            }
            rest={
              <>
                {played.length ? (
                  <section data-battle-shelf="Recent results">
                    <SectionHeading title="Recent results" />
                    <BattleLines battles={played} detail={detail} viewerId={me.id} />
                    <AllMyBattles />
                  </section>
                ) : null}
                <div className="lg:hidden">{opponents}</div>
                <FriendTables battles={shownFriends} />
                {/* A returning player watches games still going; finished ones are a link away. */}
                <PublicTables battles={rest.filter((battle) => battle.status !== 'finished').slice(0, LINES_SHOWN)} signedIn />
              </>
            }
          />
        </div>
        <HomeAppCredits dismissable stores={!me.usesApp} />
      </main>
    )
  }
  return (
    <main className="w-full">
      <HomeHero battle={hero} guestDraft={guestDraft} />
      <div className="mx-auto w-full max-w-6xl space-y-12 px-5 py-10 sm:px-6 md:space-y-16 md:py-16">
        <HomeSteps />
        <Columns
          // A hero holding the only public battle is the shelf; an empty one under it would contradict it.
          // A visitor is shown that games are played here, not the archive of them.
          lead={rest.length || !hero ? <PublicTables battles={rest.slice(0, VISITOR_GAMES)} signedIn={false} /> : null}
          aside={leaders ? <HomeLeaders rows={leaders.rows} /> : null}
        />
        <HomeFeatures />
        <HomeIncluded />
        <HomeIntro />
      </div>
      <HomeClosing />
      <HomeAppCredits dismissable={false} />
    </main>
  )
}

/** How many results the form guide reads. */
const FORM_SHOWN = 5
/** How many rated games the rating trend sums, so it says which way the player is going now rather than overall. */
const RATING_TREND_GAMES = 10

/** The player's latest results, newest first, the army they brought to most of them, and how their rating moved. */
function homeForm(finished: readonly Battle[], playerId: string): HomeForm {
  const recent = finished.flatMap((battle) => {
    const seat = battle.playerIds.indexOf(playerId)
    return seat === -1 ? [] : [{ outcome: battleOutcome(battle, battle.sides[seat]!), faction: battle.factions?.[seat] ?? null }]
  })
  const armies = new Map<string, NonNullable<HomeForm['main']>>()
  for (const { faction } of recent) {
    if (faction) armies.set(faction.slug, { faction, battles: (armies.get(faction.slug)?.battles ?? 0) + 1 })
  }
  const rated = finished.flatMap((battle) => {
    const change = battle.ratingChanges?.[playerId]
    return change === undefined ? [] : [change]
  })
  const trend = rated.slice(0, RATING_TREND_GAMES)
  return {
    rating: trend.length ? { change: trend.reduce((total, change) => total + change, 0), games: trend.length } : null,
    outcomes: recent.slice(0, FORM_SHOWN).map(({ outcome }) => outcome),
    main: [...armies.values()].toSorted((one, other) => other.battles - one.battles)[0] ?? null,
  }
}

function AllMyBattles() {
  return (
    <ShelfLink to="/battles" className="mt-3">
      All my battles
    </ShelfLink>
  )
}

/**
 * The signed-in greeting on the masthead band, sized like a page title, with the two ways to start something.
 */
function Welcome({ name, returning, newBattle }: { name: string; returning: boolean; newBattle?: ReactNode }) {
  const firstName = name.trim().split(/\s+/)[0]
  const greeting = returning ? 'Welcome back' : 'Welcome'
  return (
    <section className="masthead-bleed relative overflow-hidden border-b border-edge bg-masthead">
      <div className="relative mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          {/* Each half stays whole, so a narrow screen breaks after the comma rather than inside the greeting. */}
          <h1 className="text-2xl leading-tight sm:text-3xl sm:leading-none">
            <span className="whitespace-nowrap">{firstName ? `${greeting},` : greeting}</span>
            {firstName ? (
              <>
                {' '}
                <span className="whitespace-nowrap">{firstName}</span>
              </>
            ) : null}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Link to="/rosters/new" className={buttonClass({ variant: 'outline' })}>
              Build a roster
            </Link>
            {newBattle}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The page's two columns on a wide screen, and one in reading order on a narrow one.
 *
 * `lead` and `rest` are the wide column, the games to watch or play; `aside` is the
 * narrow one, the short lists a player acts on. Source order is lead, aside, rest,
 * so a phone reads the short lists straight after the games waiting on the player
 * instead of after every feed below them.
 */
function Columns({ lead, aside, rest }: { lead: ReactNode; aside?: ReactNode; rest?: ReactNode }) {
  if (!lead && !rest) return aside
  return (
    <div
      className={`grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-16 ${lead && rest ? 'lg:grid-rows-[min-content_1fr]' : ''}`}
    >
      {lead ? <div className="min-w-0 space-y-8 lg:col-start-1">{lead}</div> : null}
      {aside ? <aside className="min-w-0 space-y-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">{aside}</aside> : null}
      {rest ? <div className={`min-w-0 space-y-8 lg:col-start-1 ${lead ? '' : 'lg:row-start-1'}`}>{rest}</div> : null}
    </div>
  )
}
