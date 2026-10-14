import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Battle } from '../battles/battle'
import { BattleShelf } from '../battles/BattleShelf'
import type { OnboardingProgress } from '../../../core/onboarding'
import type { Standing } from '../../../core/standings'
import { type ArmyUpdate, HomeArmyUpdates } from './HomeArmyUpdates'
import { HomeChecklist, settingUp } from './HomeChecklist'
import { FriendTables, PublicTables, watchedTables } from './HomeFeed'
import { HomeHero } from './HomeHero'
import { HomeIntro } from './HomeIntro'
import { HomeLeaders } from './HomeLeaders'
import { HomeClosing, HomeFeatures, HomeIncluded } from './HomePitch'
import { HomeRecord, type HomeRecordData } from './HomeRecord'
import { type HomeRoster, HomeRosters } from './HomeRosters'
import { HomeWaiting, type RosterDue } from './HomeWaiting'

/** What the page draws, with nothing left to fetch. */
export type HomeData = {
  me: { id: string; name: string } | null
  mine: readonly Battle[]
  friends: readonly Battle[]
  open: readonly Battle[]
  /** The player's saved lists, most recently changed first. */
  rosters: readonly HomeRoster[]
  rosterCount: number
  rostersDue: readonly RosterDue[]
  friendRequests: number
  /** Saved lists a data update changed since they were saved. */
  changedRosters: number
  armyUpdates: readonly ArmyUpdate[]
  /** Absent until it has been folded, which happens after the page is drawn; null when it could not be. */
  record?: HomeRecordData | null
  onboarding?: OnboardingProgress
  /** The head of the leaderboard, which only a visitor is shown. */
  leaders: { rows: readonly Standing[]; days: number } | null
  /** The control that opens a battle, supplied rather than imported: see `Home`. */
  newBattle?: ReactNode
  notifications?: ReactNode
  /** Asking to delete one of the reader's own games, answered by `Home` and not here. */
  onDelete?: (battle: Battle) => void
}

/** How many finished games the page lists before pointing at the battles page. */
const PLAYED = 10

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
  armyUpdates,
  record,
  onboarding,
  leaders,
  newBattle,
  notifications,
  onDelete,
}: HomeData) {
  const going = mine.filter((battle) => battle.status !== 'finished')
  const played = mine
    .filter((battle) => battle.status === 'finished' && !battle.playerDetails?.some((player) => player.automated))
    .slice(0, PLAYED)
  // A visitor's hero is the most recent public battle, so the shelf below must not
  // print it again two inches further down.
  const hero = me ? undefined : open[0]
  const { friends: shownFriends, open: rest } = watchedTables(friends, open, hero)
  const checklist = !going.length && onboarding && settingUp(onboarding) ? <HomeChecklist progress={onboarding} /> : null
  // Without a game going or played, the lists are what the player comes back for, so they lead.
  const listsFirst = !going.length && !played.length
  const rosterShelf = <HomeRosters rosters={rosters} count={rosterCount} changed={changedRosters} />
  if (me) {
    return (
      <main className="w-full">
        <Welcome
          name={me.name}
          newBattle={newBattle}
          // A player who only builds lists has no record to show, and a strip of dashes would say they are losing.
          stats={onboarding?.completedTasks.includes('battle') ? <HomeRecord userId={me.id} data={record} /> : null}
        />
        {notifications}
        <div className="mx-auto w-full max-w-6xl space-y-10 px-5 py-8 sm:px-6">
          <Columns
            lead={
              going.length ? (
                <BattleShelf title={going.length === 1 ? 'Your game' : 'Your games'} battles={going} viewerId={me.id} onDelete={onDelete} />
              ) : (
                (checklist ?? (listsFirst ? rosterShelf : null))
              )
            }
            aside={
              <>
                <HomeWaiting rostersDue={rostersDue} friendRequests={friendRequests} />
                {listsFirst ? null : rosterShelf}
                <HomeArmyUpdates updates={armyUpdates} />
              </>
            }
            rest={
              <>
                {played.length ? (
                  <div>
                    <BattleShelf title="Games you have played" battles={played} viewerId={me.id} onDelete={onDelete} />
                    <Link to="/battles" className="eyebrow mt-2 inline-flex items-center gap-1 text-info hover:text-parchment">
                      All my battles <ChevronRight className="size-3.5" />
                    </Link>
                  </div>
                ) : null}
                <FriendTables battles={shownFriends} explain={!checklist} />
                <PublicTables battles={rest} signedIn />
              </>
            }
          />
        </div>
      </main>
    )
  }
  return (
    <main className="w-full">
      <HomeHero battle={hero} />
      <div className="mx-auto w-full max-w-6xl space-y-12 px-5 py-10 sm:px-6 md:space-y-16 md:py-16">
        <HomeFeatures />
        <HomeIncluded />
        <HomeIntro />
        <Columns
          // A hero holding the only public battle is the shelf; an empty one under it would contradict it.
          // A visitor is shown that games are played here, not the archive of them.
          lead={rest.length || !hero ? <PublicTables battles={rest} signedIn={false} /> : null}
          aside={leaders ? <HomeLeaders rows={leaders.rows} days={leaders.days} /> : null}
        />
      </div>
      <HomeClosing />
    </main>
  )
}

/**
 * The signed-in top band, which is short on purpose.
 *
 * The mobile shell opens here, so the first thing a player who already has games
 * needs is the games. It is a band rather than a hero for the same reason the rest
 * of the page is one width: a second tall gradient panel would make one page look
 * like two.
 */
function Welcome({ name, newBattle, stats }: { name: string; newBattle?: ReactNode; stats: ReactNode }) {
  const firstName = name.trim().split(/\s+/)[0]
  return (
    <section data-onboarding="home-activity" className="relative overflow-hidden border-b border-edge bg-panel">
      <div className="plot-grid" />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-6 sm:px-6 sm:py-7">
        <div className="w-full sm:w-auto">
          <h1 className="text-2xl leading-none sm:text-3xl">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
          {stats}
        </div>
        <div className="flex flex-wrap gap-2">
          {newBattle}
          <Button render={<Link to="/rosters/new" />} variant="outline" nativeButton={false}>
            Build a roster
          </Button>
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
