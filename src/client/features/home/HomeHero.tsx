import { Link } from '@tanstack/react-router'
import { ChevronRight, Eye } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { battleStage } from '../../battleStage'
import { summarySides, type SummarySide } from '../../battleSummary'
import type { Battle } from '../battles/battle'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SOURCE } from './HomePitch'

/**
 * The one full-bleed moment on the page, for somebody who has never been here.
 *
 * Its right-hand slot is a recent public battle rather than a decorative mark:
 * the player sees the product in use alongside the invitation to use it.
 * On a wide screen, when no public battle exists, the slot keeps its shape and
 * shows the logo, so the hero beside it does not change size. Stacked, the logo
 * would only be a box under the pitch, so a narrow screen leaves it out.
 */
export function HomeHero({ battle }: { battle?: Battle }) {
  return (
    <section className="relative overflow-hidden border-b border-edge bg-panel">
      <div className="sheen" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-6 md:py-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-14">
        <div>
          <h1 className="text-4xl leading-[0.9] sm:text-5xl lg:text-6xl">
            Build the force.
            <span className="block text-parchment">Run the battle.</span>
          </h1>
          <p className="mt-5 max-w-lg font-rules text-base text-dim sm:text-lg">
            Build your list, play it with friends on any device, and let the app keep the score.
          </p>
          {/*
            Both doors, because this page is the way back in as well as the way in.
            A returning player who has been signed out lands here, and leaving them
            only an invitation to make a second account is how they end up with one.
          */}
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-3 sm:mt-8">
            <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ size: 'lg' })}>
              Create an account
            </Link>
            <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Sign in
            </Link>
            <span className="basis-full text-sm text-faint sm:basis-auto">
              Free to use and{' '}
              <a
                href={SOURCE}
                className="text-info underline-offset-4 hover:text-parchment hover:underline"
                rel="noreferrer noopener"
                target="_blank"
              >
                open source
              </a>
            </span>
          </div>
        </div>
        {battle ? <HeroBattle battle={battle} /> : <HeroMark />}
      </div>
    </section>
  )
}

/**
 * One battle at the size the table reads it: each side's score in its own tint.
 *
 * The strip along the top is the two scores as shares of the whole, the same red
 * and green every number in a game is drawn in, so the card says who is ahead
 * before a word of it is read. An unscored table splits it evenly.
 */
function HeroBattle({ battle }: { battle: Battle }) {
  const [ours, theirs] = summarySides(battle)
  const stage = battleStage(battle.status)
  const a = ours?.score ?? 0
  const b = theirs?.score ?? 0
  const share = a + b ? (a / (a + b)) * 100 : 50
  return (
    <Link
      to="/battles/$token"
      params={{ token: battle.token }}
      className="group relative block w-full max-w-md overflow-hidden border border-edge-strong bg-sunken shadow-[0_1.5rem_3rem_-1rem_rgba(0,0,0,0.6)] transition-colors hover:border-faint"
      aria-label={`Watch ${battle.players.join(' versus ')}`}
    >
      <span className="flex h-1" aria-hidden>
        <span className="bg-side-a" style={{ width: `${share}%` }} />
        <span className="flex-1 bg-side-b" />
      </span>
      <span className="flex items-center justify-between gap-3 px-5 pt-4">
        <span className={`chip gap-1.5 ${stage.tint}`}>
          <Eye className="size-3.5" aria-hidden /> {stage.name}
        </span>
        <span className="truncate text-xs text-faint">
          {battle.status === 'playing' ? `Round ${battle.round} · ${battle.phase} phase` : (battle.mission?.name ?? 'Casual battle')}
        </span>
      </span>
      <HeroSide sideSummary={ours} score={a} side="a" />
      <span className="mx-5 flex items-center gap-3 text-2xs font-semibold tracking-eyebrow text-faint uppercase" aria-hidden>
        <span className="h-px flex-1 bg-edge" />
        versus
        <span className="h-px flex-1 bg-edge" />
      </span>
      <HeroSide sideSummary={theirs} score={b} side="b" />
      <span className="flex items-center justify-between border-t border-edge px-5 py-3 text-xs font-semibold tracking-label text-info uppercase group-hover:text-parchment">
        Watch this battle
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  )
}

function HeroSide({ sideSummary, score, side }: { sideSummary?: SummarySide; score: number; side: 'a' | 'b' }) {
  const seats = sideSummary?.seats ?? []
  return (
    <span className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 -space-x-2">
            {seats.map(({ player }) => (
              <PlayerAvatar
                key={player.id || player.name}
                name={player.name}
                image={player.image}
                className="size-8 border-2 border-sunken text-2xs"
              />
            ))}
          </span>
          <span className="min-w-0 text-lg leading-tight font-bold uppercase">
            {seats.length ? (
              seats.map(({ player }) => (
                <span key={player.id || player.name} className="block break-words">
                  {player.name}
                </span>
              ))
            ) : (
              <span className="block break-words">Unknown</span>
            )}
          </span>
        </span>
        {seats.map(({ player, army, faction, detachments }) => (
          <span key={player.id || player.name} className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-dim">
            {faction ? <FactionMark id={faction.slug} icon={faction.icon} size="sm" /> : null}
            <span className="truncate">
              {faction?.displayName ?? army ?? 'List not attached'}
              {detachments.length ? <span className="text-faint"> · {detachments.join(' · ')}</span> : null}
            </span>
          </span>
        ))}
      </span>
      <span className={`readout shrink-0 text-5xl leading-none font-bold ${side === 'a' ? 'text-side-a' : 'text-side-b'}`}>{score}</span>
    </span>
  )
}

/** The slot when nothing is being played, keeping a wide hero the same height either way. */
function HeroMark() {
  return (
    <div className="hidden place-items-center border border-edge-strong bg-sunken p-10 lg:grid" aria-hidden>
      <div className="relative grid size-40 place-items-center">
        <div className="absolute inset-0 rotate-45 border border-parchment/25" />
        <img src="/logo.svg" alt="" className="relative size-24 drop-shadow-[0_0_2rem_rgba(137,184,157,0.2)]" />
      </div>
    </div>
  )
}
