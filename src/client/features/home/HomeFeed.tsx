import { Link } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { battleStage } from '../../battleStage'
import { summarySides, type SummarySide } from '../../battleSummary'
import { FactionMark } from '../../components/FactionMark'
import type { Battle } from '../battles/battle'
import type { OnboardingTarget } from '../onboarding/onboarding'

/** How much of a friends' or finished shelf is a reminder rather than an archive. */
export const RECENT = 5

/**
 * Friends' and public games with each battle named once.
 *
 * A friend's battle is usually public too, and the server can only remove what it
 * knows the reader has seen — their own seats — so the shelf that names the
 * relationship wins and the public shelf drops the repeat, along with any battle
 * the page already shows elsewhere.
 */
export function watchedTables(friends: readonly Battle[], open: readonly Battle[], shownElsewhere?: Battle) {
  const shownFriends = friends.slice(0, RECENT)
  const shown = new Set([...shownFriends, ...(shownElsewhere ? [shownElsewhere] : [])].map((battle) => battle.token))
  return { friends: shownFriends, open: open.filter((battle) => !shown.has(battle.token)) }
}

/**
 * Other people's battles, one line each: where the game is, who is at the table, and the score.
 *
 * A game the reader is not sitting in is something to glance at and maybe open, so it
 * gets a line rather than the scoreboard card the reader's own games keep. The full
 * table is one click away on the battle itself.
 */
export function HomeFeed({ title, battles, onboarding }: { title: string; battles: readonly Battle[]; onboarding?: OnboardingTarget }) {
  if (!battles.length) return null
  return (
    <section data-onboarding={onboarding} data-home-feed={title}>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{battles.length}</span>
      </p>
      <ul className="divide-y divide-edge border-b border-edge">
        {battles.map((battle) => {
          const [ours, theirs] = summarySides(battle)
          const stage = battleStage(battle.status)
          return (
            <li key={battle.token}>
              <Link
                to="/battles/$token"
                params={{ token: battle.token }}
                aria-label={`Watch ${battle.players.join(' versus ')}`}
                // A phone reads the stage and score on one line and each side on its own below;
                // a wider screen lays all four out along one line.
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 -mx-3 px-3 py-3 hover:bg-raised sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_minmax(0,1fr)]"
              >
                <span className={`eyebrow ${stage.tint}`}>{stage.name}</span>
                <Side side={ours} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                <span className="readout order-2 justify-self-end text-sm sm:order-none sm:justify-self-auto">
                  <span className="text-side-a">{ours?.score ?? 0}</span>
                  <span className="text-faint"> – </span>
                  <span className="text-side-b">{theirs?.score ?? 0}</span>
                </span>
                <Side side={theirs} className="order-4 col-span-2 sm:order-none sm:col-span-1 sm:flex-row-reverse sm:text-right" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Side({ side, className }: { side?: SummarySide; className: string }) {
  const faction = side?.seats.find((seat) => seat.faction)?.faction
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      {faction ? (
        <FactionMark id={faction.slug} name={faction.displayName} edition={faction.edition} icon={faction.icon} size="sm" />
      ) : null}
      <span className="truncate text-sm font-bold uppercase">{side?.seats.map((seat) => seat.player.name).join(' & ') || 'Unknown'}</span>
    </span>
  )
}

/**
 * The games this player's friends are in, or where friendships are kept.
 *
 * Friendships are in the account menu rather than the navigation, so an empty
 * shelf is the only thing on the page that names them. It says nothing about
 * whether the player has any: a table of four friends who all play together has
 * no friend games either, because every one of them already has this reader in it.
 *
 * On a bare home page the section is gone, because the product introduction below it
 * says more to a new account than a third grey box would.
 */
export function FriendTables({ battles, explain }: { battles: readonly Battle[]; explain: boolean }) {
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
export function PublicTables({
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
