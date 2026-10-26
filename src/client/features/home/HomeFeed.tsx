import { GuideHelp } from '../onboarding/GuideHelp'
import { Link } from '@tanstack/react-router'
import { ShelfLink } from '../../components/ShelfLink'
import { Users } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import type { Battle } from '../battles/battle'
import { BattleShelf } from '../battles/BattleShelf'

/** How many games each signed-in home shelf shows before its link to the full list. */
export const SHOWN = 2

/**
 * Friends' and public games with each battle named once.
 *
 * A friend's battle is usually public too, and the server can only remove what it
 * knows the reader has seen — their own seats — so the shelf that names the
 * relationship wins and the public shelf drops the repeat, along with any battle
 * the page already shows elsewhere.
 */
export function watchedTables(friends: readonly Battle[], open: readonly Battle[], shownElsewhere?: Battle) {
  const shownFriends = friends.slice(0, SHOWN)
  const shown = new Set([...shownFriends, ...(shownElsewhere ? [shownElsewhere] : [])].map((battle) => battle.token))
  return { friends: shownFriends, open: open.filter((battle) => !shown.has(battle.token)) }
}

/**
 * The games this player's friends are in, or where friendships are kept.
 *
 * Friendships are in the account menu rather than the navigation, so an empty
 * shelf is the only thing on the page that names them. It says nothing about
 * whether the player has any: a table of four friends who all play together has
 * no friend games either, because every one of them already has this reader in it.
 */
export function FriendTables({ battles }: { battles: readonly Battle[] }) {
  if (battles.length) {
    return (
      <div>
        <BattleShelf title="Friends' games" battles={battles} />
        <AllGames view="friends">All friends' games</AllGames>
      </div>
    )
  }
  return (
    <section data-friends-empty>
      <h2 className="rubric border-b border-edge pb-2">Friends' games</h2>
      <div className="flex flex-col gap-4 border-b border-edge py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-dim">Games your friends play without you show here.</p>
        <Link to="/friends" className={buttonClass({ variant: 'outline', className: 'shrink-0' })}>
          <Users /> Your friends
        </Link>
      </div>
    </section>
  )
}

/** Every battle anyone may watch, most recently active first. The server has already removed the reader's own. */
export function PublicTables({ battles, signedIn }: { battles: readonly Battle[]; signedIn: boolean }) {
  if (!battles.length) {
    return signedIn ? null : (
      <section data-public-empty>
        <h2 className="rubric border-b border-edge pb-2">Public games</h2>
        <p className="py-2 text-sm text-dim">No public battles yet. Create an account and start the first one.</p>
      </section>
    )
  }
  return (
    <div>
      <BattleShelf onboarding="home-public" title="Public games" battles={battles} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AllGames view="public">All public games</AllGames>
        <GuideHelp task="community">Watching games</GuideHelp>
      </div>
    </div>
  )
}

function AllGames({ view, children }: { view: 'friends' | 'public'; children: string }) {
  return (
    <ShelfLink to="/battles" search={{ view }} className="mt-2">
      {children}
    </ShelfLink>
  )
}
