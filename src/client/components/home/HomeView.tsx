import { Link } from '@tanstack/react-router'
import { ChevronRight, Swords, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Battle } from '../battles/battle'
import { BattleShelf } from '../battles/BattleShelf'
import { HomeHero } from './HomeHero'
import { HomeIntro } from './HomeIntro'

/** What the page draws, with nothing left to fetch. */
export type HomeData = {
  me: { id: string; name: string } | null
  mine: readonly Battle[]
  friends: readonly Battle[]
  open: readonly Battle[]
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
 * The shelves run outwards from the reader: the games waiting on them, the games
 * they have already played, their friends' tables, then everybody else's. A
 * player arriving to resume a game never scrolls, and one arriving with nothing
 * of their own to do is handed the next-nearest thing rather than a blank page.
 *
 * A player and a visitor get the same skeleton. What differs is the top band, and
 * whether the pitch is on the page at all: somebody who has already signed up does
 * not need the app sold to them underneath their own live games, and every link in
 * that pitch is already in the navigation above their head.
 *
 * Nothing here fetches or mutates, so the whole page can be drawn from fixtures.
 */
export function HomeView({ me, mine, friends, open, newBattle, onDelete, more }: HomeData) {
  const sharedGames = (battles: readonly Battle[]) => battles.filter((battle) => !battle.playerDetails?.some((player) => player.automated))
  const ours = sharedGames(mine)
  const going = ours.filter((battle) => battle.status !== 'finished')
  const played = ours.filter((battle) => battle.status === 'finished').slice(0, RECENT)
  const publicGames = sharedGames(open)
  // A visitor's hero is the most recent public battle, so the shelf below must not
  // print it again two inches further down.
  const hero = me ? undefined : publicGames[0]
  // Named once, for the same reason. A friend's battle is usually public too, and
  // the server can only remove what it knows the reader has seen — their own seats
  // — so the shelf that names the relationship wins and the public shelf drops the
  // repeat.
  const shownFriends = sharedGames(friends).slice(0, RECENT)
  const shown = new Set([...shownFriends.map((battle) => battle.token), ...(hero ? [hero.token] : [])])
  const rest = publicGames.filter((battle) => !shown.has(battle.token))
  // The pitch appears when the page has nothing else to say. A visitor always gets
  // it; a player only when their table and everyone else's are empty, which is a
  // new account on a new instance — otherwise the page would be two grey boxes and
  // a long scroll of nothing, under a menu they have not learned yet.
  const bare = !going.length && !played.length && !shownFriends.length && !rest.length
  const introduce = !me || bare
  return (
    <main className="w-full">
      {me ? <Welcome name={me.name} newBattle={newBattle} /> : <HomeHero battle={hero} />}
      <div className="mx-auto w-full max-w-5xl space-y-8 px-3 py-8 sm:px-4">
        {me ? <MyTable going={going} played={played} viewerId={me.id} onDelete={onDelete} /> : null}
        <FriendTables battles={shownFriends} explain={Boolean(me) && !bare} />
        <PublicTables battles={rest} signedIn={Boolean(me)} more={more} />
        {introduce ? <HomeIntro /> : null}
      </div>
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
function Welcome({ name, newBattle }: { name: string; newBattle?: ReactNode }) {
  return (
    <section className="border-b border-edge bg-panel">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-3 py-4 sm:px-4">
        <div>
          <p className="eyebrow text-parchment">Praetorium</p>
          <h1 className="mt-0.5 text-2xl">Welcome back, {name.trim().split(/\s+/)[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {newBattle}
          <Button render={<Link to="/rosters/new" />} variant="outline">
            Build a roster
          </Button>
        </div>
      </div>
    </section>
  )
}

/**
 * The player's own games: the ones still running, then the last few they finished.
 *
 * Both are here rather than only the live ones because a player between games has
 * a home page either way, and their last result is the thing they came back to
 * read. The finished shelf stays short and hands off to the battles page, which is
 * the archive and the only place a battle is deleted.
 *
 * The empty state explains and points up rather than carrying a second New battle
 * button: the band above it already has one, and two of the same control on one
 * screen is two dialogs and two labels for one intent.
 */
function MyTable({
  going,
  played,
  viewerId,
  onDelete,
}: {
  going: readonly Battle[]
  played: readonly Battle[]
  viewerId: string
  onDelete?: (battle: Battle) => void
}) {
  const live = going.length ? (
    <BattleShelf title="Your games" battles={[...going]} viewerId={viewerId} onDelete={onDelete} />
  ) : (
    <section data-my-table>
      <p className="rubric border-b border-edge pb-2">Your games</p>
      <p className="mt-2 border border-edge bg-panel p-5 text-sm text-dim">
        <Swords className="mt-0.5 size-5 shrink-0 text-parchment" aria-hidden />
        <span className="mt-3 block">Start a game with a friend, or practise on your own against a practice opponent.</span>
      </p>
    </section>
  )
  if (!played.length) {
    return (
      <div>
        {live}
        {going.length ? <AllBattles /> : null}
      </div>
    )
  }
  return (
    <div className="space-y-8">
      {live}
      <div>
        <BattleShelf title="Games you have played" battles={[...played]} viewerId={viewerId} onDelete={onDelete} />
        <AllBattles />
      </div>
    </div>
  )
}

/** The battles page, which holds every game the player has ever opened. */
function AllBattles() {
  return (
    <Link to="/battles" className="eyebrow mt-2 inline-flex items-center gap-1 text-info hover:text-parchment">
      All my battles <ChevronRight className="size-3.5" />
    </Link>
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
  if (battles.length) return <BattleShelf title="Friends' games" battles={[...battles]} />
  if (!explain) return null
  return (
    <section data-friends-empty>
      <p className="rubric border-b border-edge pb-2">Friends' games</p>
      <div className="mt-2 flex flex-col gap-4 border border-edge bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-dim">Your friends' games appear here, apart from the ones you are already sitting in.</p>
        <Button render={<Link to="/friends" />} variant="outline" className="shrink-0">
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
        <p className="mt-2 border border-edge bg-panel p-5 text-sm text-dim">
          No public battles yet. Create an account and start the first one.
        </p>
      </section>
    )
  }
  return (
    <div>
      <BattleShelf title="Public games" battles={[...battles]} />
      {more ? (
        <Button variant="outline" size="sm" className="mt-2" disabled={more.pending} onClick={more.onShow}>
          {more.pending ? 'Loading…' : 'Show more battles'}
        </Button>
      ) : null}
    </div>
  )
}
