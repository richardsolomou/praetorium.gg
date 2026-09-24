import { Link } from '@tanstack/react-router'
import { Swords, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Battle } from '../battles/battle'
import { BattleShelf } from '../battles/BattleShelf'
import type { Standing } from '../../../core/standings'
import { HomeFeed } from './HomeFeed'
import { HomeHero } from './HomeHero'
import { HomeIntro } from './HomeIntro'
import { HomeLeaders } from './HomeLeaders'
import { HomeClosing, HomeSteps } from './HomePitch'
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
  rostersDue: readonly RosterDue[]
  friendRequests: number
  /** The head of the leaderboard, which only a visitor is shown. */
  leaders: { rows: readonly Standing[]; days: number } | null
  /** The control that opens a battle, supplied rather than imported: see `Home`. */
  newBattle?: ReactNode
  /** Asking to delete one of the reader's own games, answered by `Home` and not here. */
  onDelete?: (battle: Battle) => void
  more?: { pending: boolean; onShow: () => void } | null
}

/** How much of a finished shelf is a reminder rather than an archive; the archive is `/battles`. */
const RECENT = 5

/**
 * The home page's composition, given its data.
 *
 * One column width and one vertical rhythm the whole way down, and every block
 * below the top band is a rubric heading over its content — the shelves and the
 * two visitor sections included. The page had three widths and
 * five kinds of box before, which is what made a stack of individually correct
 * sections read as a pile.
 *
 * The shelves run outwards from the reader: the games waiting on them, anything
 * else that cannot move until they do, the lists they build between games, the
 * games they have already played, their friends' tables, then everybody else's. A
 * player arriving to resume a game never scrolls, and one arriving with nothing
 * of their own to do is handed the next-nearest thing rather than a blank page.
 *
 * A player and a visitor get the same skeleton. What differs is the top band, the
 * head of the leaderboard, and whether the tools that need no account are on the
 * page at all: somebody who has already signed up does not need the app sold to
 * them underneath their own live games, and every link in that pitch is already in
 * the navigation above their head.
 *
 * Nothing here fetches or mutates, so the whole page can be drawn from fixtures.
 */
export function HomeView({ me, mine, friends, open, rosters, rostersDue, friendRequests, leaders, newBattle, onDelete, more }: HomeData) {
  // The feeds arrive without practice games; the player's own list is their whole history.
  const ours = mine.filter((battle) => !battle.playerDetails?.some((player) => player.automated))
  const going = ours.filter((battle) => battle.status !== 'finished')
  const played = ours.filter((battle) => battle.status === 'finished').slice(0, RECENT)
  // A visitor's hero is the most recent public battle, so the shelf below must not
  // print it again two inches further down.
  const hero = me ? undefined : open[0]
  // Named once, for the same reason. A friend's battle is usually public too, and
  // the server can only remove what it knows the reader has seen — their own seats
  // — so the shelf that names the relationship wins and the public shelf drops the
  // repeat.
  const shownFriends = friends.slice(0, RECENT)
  const shown = new Set([...shownFriends.map((battle) => battle.token), ...(hero ? [hero.token] : [])])
  const rest = open.filter((battle) => !shown.has(battle.token))
  // The tools appear for a player only when their table and everyone else's are
  // empty, which is a new account on a new instance — otherwise the page would be
  // a long scroll of nothing, under a menu they have not learned yet.
  const bare = !going.length && !played.length && !shownFriends.length && !rest.length
  const waiting = rostersDue.length + friendRequests + rosters.filter((entry) => entry.problem).length
  if (me) {
    return (
      <main className="w-full">
        <Welcome name={me.name} going={going.length} waiting={waiting} newBattle={newBattle} />
        <div className="mx-auto w-full max-w-6xl space-y-10 px-5 py-8 sm:px-6">
          <Columns
            lead={<LiveGames going={going} viewerId={me.id} onDelete={onDelete} />}
            aside={
              <>
                <HomeWaiting rostersDue={rostersDue} friendRequests={friendRequests} rosters={rosters} />
                <HomeRosters rosters={rosters} />
                <HomePlayed played={played} viewerId={me.id} />
              </>
            }
            rest={
              <>
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
        <HomeSteps />
        <Columns
          // A hero holding the only public battle is the shelf; an empty one under it would contradict it.
          // A visitor is shown that games are played here, not the archive of them.
          lead={rest.length || !hero ? <PublicTables battles={rest.slice(0, RECENT)} signedIn={false} /> : null}
          aside={leaders ? <HomeLeaders rows={leaders.rows} days={leaders.days} /> : null}
        />
        <HomeIntro title="Explore" />
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
  return (
    <section data-onboarding="home-activity" className="relative overflow-hidden border-b border-edge bg-panel">
      <div className="sheen" />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-6 sm:px-6 sm:py-7">
        <div>
          <h1 className="text-2xl leading-none sm:text-3xl">Welcome back, {name.trim().split(/\s+/)[0]}</h1>
          <p className="mt-3 text-sm text-dim">
            <span className="readout font-semibold text-bone">{going}</span> {going === 1 ? 'game' : 'games'} in progress
            <span className="mx-2 text-faint">·</span>
            {waiting ? (
              <>
                <span className="readout font-semibold text-discarded">{waiting}</span> waiting on you
              </>
            ) : (
              'Nothing waiting on you'
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
 * The player's games still being set up or played, which are the reason most visits happen.
 *
 * The empty state explains and points up rather than carrying a second New battle
 * button: the band above it already has one, and two of the same control on one
 * screen is two dialogs and two labels for one intent.
 */
function LiveGames({ going, viewerId, onDelete }: { going: readonly Battle[]; viewerId: string; onDelete?: (battle: Battle) => void }) {
  if (!going.length) {
    return (
      <section data-my-table>
        <p className="rubric border-b border-edge pb-2">Your games</p>
        <p className="flex items-start gap-3 border-b border-edge py-5 font-rules text-sm text-dim">
          <Swords className="size-5 shrink-0 text-parchment" aria-hidden />
          Start a game with a friend, or practise on your own against a practice opponent.
        </p>
      </section>
    )
  }
  return <BattleShelf title="Your games" battles={[...going]} viewerId={viewerId} onDelete={onDelete} />
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
  if (!lead) return aside
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-16">
      <div className="min-w-0 space-y-8 lg:col-start-1">{lead}</div>
      {aside ? <aside className="min-w-0 space-y-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">{aside}</aside> : null}
      {rest ? <div className="min-w-0 space-y-8 lg:col-start-1">{rest}</div> : null}
    </div>
  )
}

/**
 * The games this player's friends are in, or where friendships are kept.
 *
 * Friendships are in the account menu rather than the navigation, so an empty
 * shelf is the only thing on this page that names them. It says nothing about
 * whether the player has any: a table of four friends who all play together has
 * no friend games either, because every one of them already has this reader in it.
 *
 * On a bare page the section is gone, because the product introduction below it
 * says more to a new account than a third grey box would.
 */
function FriendTables({ battles, explain }: { battles: readonly Battle[]; explain: boolean }) {
  if (battles.length) return <HomeFeed onboarding="home-friends" title="Friends' games" battles={battles} />
  if (!explain) return null
  return (
    <section data-friends-empty>
      <p className="rubric border-b border-edge pb-2">Friends' games</p>
      <div className="flex flex-col gap-4 border-b border-edge py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-rules text-sm text-dim">Your friends' games appear here, apart from the ones you are already sitting in.</p>
        <Button render={<Link to="/friends" />} variant="outline" className="shrink-0" nativeButton={false}>
          <Users /> Your friends
        </Button>
      </div>
    </section>
  )
}

/** Every battle anyone may watch. The server has already removed the reader's own. */
function PublicTables({
  battles,
  signedIn,
  more,
}: {
  battles: readonly Battle[]
  signedIn: boolean
  more?: { pending: boolean; onShow: () => void } | null
}) {
  if (!battles.length) {
    return signedIn ? null : (
      <section data-public-empty>
        <p className="rubric border-b border-edge pb-2">Public games</p>
        <p className="border-b border-edge py-5 font-rules text-sm text-dim">
          No public battles yet. Create an account and start the first one.
        </p>
      </section>
    )
  }
  return (
    <div>
      <HomeFeed onboarding="home-public" title="Public games" battles={battles} />
      {more ? (
        <Button variant="outline" size="sm" className="mt-2" disabled={more.pending} onClick={more.onShow}>
          {more.pending ? 'Loading…' : 'Show more battles'}
        </Button>
      ) : null}
    </div>
  )
}
