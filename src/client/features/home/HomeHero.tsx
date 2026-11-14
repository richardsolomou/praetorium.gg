import { Link } from '@tanstack/react-router'
import { ChevronRight, Eye } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import { battleStage } from '../../battleStage'
import { summarySides, type SummarySide } from '../../battleSummary'
import type { Battle } from '../battles/battle'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SOURCE } from '../../projectLinks'
import { AppBand } from './HomeApps'
import { nameColour } from '../../playerName'

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
    <section className="masthead-bleed relative overflow-hidden border-b border-edge bg-masthead">
      <div className="construction-grid" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-6 md:py-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-14">
        <div>
          <h1 className="text-[2.5rem] leading-[0.95] sm:text-6xl">
            Build your army.
            <span className="block">Track every game.</span>
          </h1>
          <p className="mt-5 max-w-xl font-rules text-base text-bone/85 sm:text-lg">
            A free Warhammer 40,000 army builder, combat simulator and battle tracker.
          </p>
          {/*
            The builder leads because it needs no account. Sign in stays here because a
            signed-out player lands on this page, and offering them only sign-up is how
            they end up with a second account.
          */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:flex sm:flex-wrap sm:items-center">
            <Link to="/rosters/new" className={buttonClass({ size: 'lg', className: 'col-span-2' })}>
              Build an army
            </Link>
            <Link to="/sign-in" search={{ next: undefined, join: true }} className={buttonClass({ variant: 'outline', size: 'lg' })}>
              Create a free account
            </Link>
            <Link to="/sign-in" search={{ next: undefined }} className={buttonClass({ variant: 'ghost', size: 'lg' })}>
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-sm text-faint">
            No account needed. Free and{' '}
            <a
              href={SOURCE}
              className="text-bone underline underline-offset-4 hover:text-parchment"
              rel="noreferrer noopener"
              target="_blank"
            >
              open source
            </a>
            .
          </p>
        </div>
        {battle ? <HeroBattle battle={battle} /> : <HeroMark />}
      </div>
      <AppBand dismissable={false} />
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
      data-home-featured
      className="group relative block w-full max-w-md overflow-hidden rounded-xl border border-edge bg-panel shadow-lifted transition-colors hover:border-runner-hi hover:bg-raised"
      aria-label={`Watch ${battle.players.join(' versus ')}`}
    >
      <span className="flex h-1" aria-hidden>
        <span className="bg-side-a" style={{ width: `${share}%` }} />
        <span className="flex-1 bg-side-b" />
      </span>
      <span className="flex items-center justify-between gap-3 px-5 pt-4">
        <span data-battle-status={battle.status} className={`chip gap-1.5 ${stage.tint}`}>
          <Eye className="size-3.5" aria-hidden /> {stage.name}
        </span>
        <span className="truncate text-xs text-faint">
          {battle.status === 'playing' ? `Round ${battle.round} · ${battle.phase} phase` : (battle.mission?.name ?? 'Casual battle')}
        </span>
      </span>
      <HeroSide sideSummary={ours} score={a} side="a" />
      <span className="mx-5 flex items-center gap-3 text-2xs font-semibold tracking-eyebrow text-faint uppercase" aria-hidden>
        <span className="h-0.5 flex-1 bg-[repeating-linear-gradient(90deg,var(--color-runner)_0_4px,transparent_4px_7px)]" />
        versus
        <span className="h-0.5 flex-1 bg-[repeating-linear-gradient(90deg,var(--color-runner)_0_4px,transparent_4px_7px)]" />
      </span>
      <HeroSide sideSummary={theirs} score={b} side="b" />
      <span className="flex items-center justify-between border-t border-edge px-5 py-3 text-sm font-semibold text-bone/85 group-hover:text-parchment">
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
                className="size-8 border-2 border-panel text-2xs"
              />
            ))}
          </span>
          <span className="min-w-0 text-lg leading-tight font-bold">
            {seats.length ? (
              seats.map(({ player }) => (
                <span key={player.id || player.name} className="block break-words" style={player.id ? nameColour(player) : undefined}>
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
            {faction ? <FactionMark faction={faction} size="sm" /> : null}
            <span className="truncate">
              {faction?.displayName ?? army ?? 'List not attached'}
              {detachments.length ? <span className="text-faint"> · {detachments.join(' · ')}</span> : null}
            </span>
          </span>
        ))}
      </span>
      <span className={`figure shrink-0 text-5xl leading-none font-bold ${side === 'a' ? 'text-side-a' : 'text-side-b'}`}>{score}</span>
    </span>
  )
}

/** The slot when nothing is being played, keeping a wide hero the same height either way. */
function HeroMark() {
  return (
    <div className="hidden place-items-center rounded-3xl border-2 border-runner p-10 lg:grid" aria-hidden>
      <div className="grid size-36 place-items-center rounded-full border-2 border-runner-hi bg-panel">
        <img src="/logo.svg" alt="" className="size-24" />
      </div>
    </div>
  )
}
