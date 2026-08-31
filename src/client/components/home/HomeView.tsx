import { Link } from '@tanstack/react-router'
import { ChevronRight, Swords } from 'lucide-react'
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
  more?: { pending: boolean; onShow: () => void } | null
}

/**
 * The home page's composition, given its data.
 *
 * One column width and one vertical rhythm the whole way down, and every block
 * below the top band is a rubric heading over its content — the shelves, the
 * standings and the two visitor sections included. The page had three widths and
 * five kinds of box before, which is what made a stack of individually correct
 * sections read as a pile.
 *
 * A player and a visitor get the same skeleton. What differs is the top band, and
 * whether the pitch is on the page at all: somebody who has already signed up does
 * not need the app sold to them underneath their own live games, and every link in
 * that pitch is already in the navigation above their head.
 *
 * Nothing here fetches or mutates, so the whole page can be drawn from fixtures.
 */
export function HomeView({ me, mine, friends, open, newBattle, more }: HomeData) {
  const going = mine.filter((battle) => battle.status !== 'finished').slice(0, 4)
  // A visitor's hero is the liveliest public battle, so the shelf below must not
  // print it again two inches further down.
  const hero = me ? undefined : open[0]
  // Named once, for the same reason. A friend's battle is usually public too, and
  // the server can only remove what it knows the reader has seen — their own seats
  // — so the shelf that names the relationship wins and the public shelf drops the
  // repeat.
  const shownFriends = friends.slice(0, 5)
  const shown = new Set([...shownFriends.map((battle) => battle.token), ...(hero ? [hero.token] : [])])
  const rest = open.filter((battle) => !shown.has(battle.token))
  // The pitch appears when the page has nothing else to say. A visitor always gets
  // it; a player only when their table and everyone else's are empty, which is a
  // new account on a new instance — otherwise the page would be two grey boxes and
  // a long scroll of nothing, under a menu they have not learned yet.
  const bare = !going.length && !shownFriends.length && !rest.length
  const introduce = !me || bare
  return (
    <main className="w-full">
      {me ? <Welcome name={me.name} newBattle={newBattle} /> : <HomeHero live={hero} />}
      <div className="mx-auto w-full max-w-5xl space-y-8 px-3 py-8 sm:px-4">
        {me ? <MyTable battles={going} viewerId={me.id} /> : null}
        <BattleShelf title="Friends' tables" battles={[...shownFriends]} />
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
 * The player's own games, live ones first. Finished history stays on the battles page.
 *
 * The empty state explains and points up rather than carrying a second New battle
 * button: the band above it already has one, and two of the same control on one
 * screen is two dialogs and two labels for one intent.
 */
function MyTable({ battles, viewerId }: { battles: readonly Battle[]; viewerId: string }) {
  if (!battles.length) {
    return (
      <section data-my-table>
        <p className="rubric border-b border-edge pb-2">Your table</p>
        <p className="mt-2 flex items-start gap-3 border border-edge bg-panel p-5 text-sm text-dim">
          <Swords className="mt-0.5 size-5 shrink-0 text-parchment" aria-hidden />
          <span className="max-w-xl">
            Nothing is on the table. Start a battle against a friend or a practice opponent, and every seated phone reads the same log,
            phase and score.
          </span>
        </p>
      </section>
    )
  }
  return (
    <div>
      <BattleShelf title="Your table" battles={[...battles]} viewerId={viewerId} />
      <Link to="/battles" className="eyebrow mt-2 inline-flex items-center gap-1 text-info hover:text-parchment">
        All my battles <ChevronRight className="size-3.5" />
      </Link>
    </div>
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
        <p className="rubric border-b border-edge pb-2">Public tables</p>
        <p className="mt-2 border border-edge bg-panel p-5 text-sm text-dim">
          No battles are being played right now. Create an account and open the first one.
        </p>
      </section>
    )
  }
  return (
    <div>
      <BattleShelf title="Public tables" battles={[...battles]} />
      {more ? (
        <Button variant="outline" size="sm" className="mt-2" disabled={more.pending} onClick={more.onShow}>
          {more.pending ? 'Loading…' : 'Show more battles'}
        </Button>
      ) : null}
    </div>
  )
}
