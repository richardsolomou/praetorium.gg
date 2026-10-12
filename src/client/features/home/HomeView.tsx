import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Battle } from '../battles/battle'
import { BattleShelf } from '../battles/BattleShelf'
import type { Standing } from '../../../core/standings'
import { FriendTables, PublicTables, RECENT, watchedTables } from './HomeFeed'
import { HomeHero } from './HomeHero'
import { HomeIntro } from './HomeIntro'
import { HomeLeaders } from './HomeLeaders'
import { HomeClosing, HomeFeatures, HomeIncluded } from './HomePitch'
import { HomePlayed } from './HomePlayed'
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
  /** The head of the leaderboard, which only a visitor is shown. */
  leaders: { rows: readonly Standing[]; days: number } | null
  /** The control that opens a battle, supplied rather than imported: see `Home`. */
  newBattle?: ReactNode
  notifications?: ReactNode
  /** Asking to delete one of the reader's own games, answered by `Home` and not here. */
  onDelete?: (battle: Battle) => void
  more?: { pending: boolean; onShow: () => void } | null
}

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
  leaders,
  newBattle,
  notifications,
  onDelete,
  more,
}: HomeData) {
  const going = mine.filter((battle) => battle.status !== 'finished')
  const played = mine
    .filter((battle) => battle.status === 'finished' && !battle.playerDetails?.some((player) => player.automated))
    .slice(0, RECENT)
  // A visitor's hero is the most recent public battle, so the shelf below must not
  // print it again two inches further down.
  const hero = me ? undefined : open[0]
  const { friends: shownFriends, open: rest } = watchedTables(friends, open, hero)
  // The tools appear for a player only when their table and everyone else's are
  // empty, which is a new account on a new instance — otherwise the page would be
  // a long scroll of nothing, under a menu they have not learned yet.
  const bare = !going.length && !played.length && !shownFriends.length && !rest.length
  const waiting = rostersDue.length + friendRequests
  if (me) {
    const history = <HomePlayed played={played} viewerId={me.id} />
    return (
      <main className="w-full">
        <Welcome name={me.name} going={going.length} waiting={waiting} newBattle={newBattle} />
        {notifications}
        <div className="mx-auto w-full max-w-6xl space-y-10 px-5 py-8 sm:px-6">
          <Columns
            lead={
              going.length ? (
                <BattleShelf title={going.length === 1 ? 'Your game' : 'Your games'} battles={going} viewerId={me.id} onDelete={onDelete} />
              ) : null
            }
            aside={
              <>
                <HomeWaiting rostersDue={rostersDue} friendRequests={friendRequests} />
                <HomeRosters rosters={rosters} count={rosterCount} />
              </>
            }
            rest={
              <>
                {history}
                <FriendTables battles={shownFriends} explain={!bare} />
                <PublicTables battles={rest} signedIn more={more} />
              </>
            }
          />
          {bare ? <HomeIntro title="Before your first game" signedIn /> : null}
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
        <HomeIntro title="Try it before you sign up" />
        <Columns
          // A hero holding the only public battle is the shelf; an empty one under it would contradict it.
          // A visitor is shown that games are played here, not the archive of them.
          lead={rest.length || !hero ? <PublicTables battles={rest.slice(0, RECENT)} signedIn={false} /> : null}
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
function Welcome({ name, going, waiting, newBattle }: { name: string; going: number; waiting: number; newBattle?: ReactNode }) {
  const firstName = name.trim().split(/\s+/)[0]
  return (
    <section data-onboarding="home-activity" className="relative overflow-hidden border-b border-edge bg-panel">
      <div className="plot-grid" />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-6 sm:px-6 sm:py-7">
        <div>
          <h1 className="text-2xl leading-none sm:text-3xl">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
          <p className="mt-3 text-sm text-dim">
            {going ? (
              <>
                <span className="readout font-semibold text-bone">{going}</span> {going === 1 ? 'game' : 'games'} in progress
              </>
            ) : (
              'No game in progress'
            )}
            <span className="mx-2 text-faint">·</span>
            {waiting ? (
              <>
                <span className="readout font-semibold text-discarded">{waiting}</span> {waiting === 1 ? 'item' : 'items'} to review
              </>
            ) : (
              'Nothing to review'
            )}
          </p>
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
