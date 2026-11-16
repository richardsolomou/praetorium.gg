import { GuideHelp } from '../onboarding/GuideHelp'
import { Link } from '@tanstack/react-router'
import { ShelfLink } from '../../components/ShelfLink'
import { Users } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import type { Battle } from '../battles/battle'
import { BattleShelf } from '../battles/BattleShelf'
import { SectionHeading } from '../../components/SectionHeading'
import { pointsLabel } from '../../../core/battle'
import { battleStage } from '../../battleStage'
import { useDateFormatting } from '../../dates'
import { BattleLines } from '../battles/BattleLines'

/** How many one-line games a signed-in summary shows: lines are short enough to show more than cards. */
export const LINES_SHOWN = 4

/**
 * Friends' and public games with each battle named once.
 *
 * A friend's battle is usually public too, and the server can only remove what it
 * knows the reader has seen — their own seats — so the shelf that names the
 * relationship wins and the public shelf drops the repeat, along with any battle
 * the page already shows elsewhere.
 */
export function watchedTables(friends: readonly Battle[], open: readonly Battle[], shownElsewhere?: Battle) {
  const shownFriends = friends.slice(0, LINES_SHOWN)
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
  const detail = useBattleDetail()
  if (battles.length) {
    return (
      <section data-battle-shelf="Friends' games">
        <SectionHeading title="Friends' games" />
        <BattleLines battles={battles} detail={detail} />
        <AllGames view="friends">All friends' games</AllGames>
      </section>
    )
  }
  return (
    <section data-friends-empty>
      <SectionHeading title="Friends' games" />
      <div className="part flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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
  const detail = useBattleDetail()
  if (!battles.length) {
    return signedIn ? null : (
      <section data-public-empty>
        <SectionHeading title="Public games" />
        <p className="part px-4 py-4 text-sm text-dim">No public battles yet. Create an account and start the first one.</p>
      </section>
    )
  }
  return (
    <div data-onboarding="home-public">
      {signedIn ? (
        <section data-battle-shelf="Public games">
          <SectionHeading title="Public games" />
          <BattleLines battles={battles} detail={detail} />
        </section>
      ) : (
        <BattleShelf title="Public games" battles={battles} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AllGames view="public">All public games</AllGames>
        <GuideHelp task="community">Watching games</GuideHelp>
      </div>
    </div>
  )
}

/** A one-line battle's footer: how far a game still going has got, what it was played as, and when. */
export function useBattleDetail() {
  const { date } = useDateFormatting()
  return (battle: Battle) =>
    [
      ...(battle.status === 'playing' ? [`Live · Round ${battle.round}`] : battle.status === 'setup' ? [battleStage('setup').name] : []),
      ...(battle.settings.manual
        ? []
        : battle.mission
          ? [battle.mission.name]
          : battle.settings.limit
            ? [pointsLabel(battle.settings.limit)]
            : []),
      date(battle.lastActivity),
    ].join(' · ')
}

function AllGames({ view, children }: { view: 'friends' | 'public'; children: string }) {
  return (
    <ShelfLink to="/battles" search={{ view }} className="mt-3">
      {children}
    </ShelfLink>
  )
}
