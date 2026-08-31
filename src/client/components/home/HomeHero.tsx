import { Link } from '@tanstack/react-router'
import { Eye } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { battleStage } from '../../battleStage'
import { summarySides, type SummarySide } from '../../battleSummary'
import type { Battle } from '../battles/battle'
import { FactionMark } from '../FactionMark'
import { PlayerAvatar } from '../PlayerAvatar'

/**
 * The one full-bleed moment on the page, for somebody who has never been here.
 *
 * Its right-hand slot is a battle actually being played rather than a decorative
 * mark: the sentence on the left claims the app keeps one live record across a
 * table, and the card beside it is that claim happening. When no public battle
 * exists the slot keeps its shape and shows the logo, so the hero does not change
 * size depending on whether anyone is playing.
 */
export function HomeHero({ live }: { live?: Battle }) {
  return (
    <section className="relative overflow-hidden border-b border-edge bg-panel">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
      <div className="relative mx-auto grid w-full max-w-5xl gap-8 px-3 py-12 sm:px-4 md:grid-cols-[minmax(0,1fr)_19rem] md:items-center md:py-16">
        <div>
          <p className="eyebrow text-parchment">Free and open source</p>
          <h1 className="mt-2 text-4xl leading-[0.95] sm:text-5xl">Build the force. Run the battle.</h1>
          <p className="mt-5 max-w-xl text-base text-dim sm:text-lg">
            Praetorium builds Warhammer 40,000 army lists and keeps one live battle record across every player&apos;s device.{' '}
            {/* Only promise the feed when there is one: on a new instance the shelf below it is empty. */}
            {live ? 'Watch a game below before you play one.' : 'Build a list, sit down with a friend, and keep one record between you.'}
          </p>
          {/*
            Both doors, because this page is the way back in as well as the way in.
            A returning player who has been signed out lands here, and leaving them
            only an invitation to make a second account is how they end up with one.
          */}
          <div className="mt-7 flex flex-wrap gap-2">
            <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ size: 'lg' })}>
              Create an account
            </Link>
            <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Sign in
            </Link>
          </div>
        </div>
        {live ? <HeroBattle battle={live} /> : <HeroMark />}
      </div>
    </section>
  )
}

/** The scoreboard of one battle, narrow enough to stand beside the pitch. */
function HeroBattle({ battle }: { battle: Battle }) {
  const [ours, theirs] = summarySides(battle)
  const stage = battleStage(battle.status)
  return (
    <Link
      to="/battles/$token"
      params={{ token: battle.token }}
      className="block border border-edge bg-sunken p-4 hover:border-edge-strong"
      aria-label={`Watch ${battle.players.join(' versus ')}`}
    >
      <span className={`chip inline-flex items-center gap-1.5 ${stage.tint}`}>
        <Eye className="size-3.5" aria-hidden /> {stage.name}
      </span>
      <HeroSide sideSummary={ours} score={ours?.score ?? 0} side="a" />
      <span className="my-2 block border-t border-edge" />
      <HeroSide sideSummary={theirs} score={theirs?.score ?? 0} side="b" />
      <span className="mt-3 block text-[0.625rem] text-faint">
        {battle.status === 'playing' ? `Round ${battle.round} · ${battle.phase} phase` : (battle.mission?.name ?? 'Casual battle')}
      </span>
    </Link>
  )
}

function HeroSide({ sideSummary, score, side }: { sideSummary?: SummarySide; score: number; side: 'a' | 'b' }) {
  return (
    <span className="mt-3 flex items-start justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-2">
        {sideSummary?.seats.map(({ player, faction, detachments }) => (
          <span key={player.id || player.name} className="flex min-w-0 items-center gap-2">
            <PlayerAvatar name={player.name} image={player.image} className="size-8 text-[0.625rem]" />
            <span className="min-w-0">
              <span className="block truncate font-bold uppercase">{player.name}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-dim">
                {faction ? <FactionMark id={faction.slug} icon={faction.icon} size="sm" /> : null}
                <span className="truncate">{faction?.displayName ?? 'List not attached'}</span>
              </span>
              {detachments.length ? <span className="block truncate text-[0.625rem] text-faint">{detachments.join(' · ')}</span> : null}
            </span>
          </span>
        )) ?? <span className="font-bold uppercase">Unknown</span>}
      </span>
      <span className={`readout shrink-0 text-2xl ${side === 'a' ? 'text-side-a' : 'text-side-b'}`}>{score}</span>
    </span>
  )
}

/** The slot when nothing is being played, keeping the hero the same height either way. */
function HeroMark() {
  return (
    <div className="grid place-items-center border border-edge bg-sunken p-8" aria-hidden>
      <div className="relative grid size-40 place-items-center">
        <div className="absolute inset-0 rotate-45 border border-parchment/25" />
        <img src="/logo.svg" alt="" className="relative size-24 drop-shadow-[0_0_2rem_rgba(137,184,157,0.2)]" />
      </div>
    </div>
  )
}
