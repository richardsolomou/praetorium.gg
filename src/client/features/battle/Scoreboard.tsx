import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Pause, Timer } from 'lucide-react'
import { type BattleClock, latestTurnRound } from '../../../core/battleClock'
import type { BattleView } from '../../../core/battleView'
import { hasProfile } from '../../../core/newBattle'
import { battleResult } from '../../battleOutcome'
import { completedSideRound } from './battleProgress'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { sideName, type Side } from '../../sides'
import { tint } from './battleTints'
import { Elapsed } from './Elapsed'

type Props = { view: BattleView; clock: BattleClock; sides: Side[] }

/**
 * The one line worth glancing at mid-turn: who is ahead, whose turn it is, and how
 * far through the battle everyone is. The same component at every width, so a phone
 * and a laptop never disagree about the score.
 */
export function Scoreboard({ view, clock, sides }: Props) {
  const active = view.players.find((player) => player.isActive)
  const finished = view.status === 'finished'

  return (
    <section
      data-onboarding="battle-live-score"
      data-scoreboard
      aria-label="Battle scoreboard"
      className="@container sticky top-(--app-header) z-20 -mx-3 border-b border-edge bg-void/95 px-3 py-2 backdrop-blur"
    >
      {/*
       * A finished battle gives the whole strip to its result on a phone. Each side's
       * score is already at the top of its own panel a thumb away, and three columns
       * left the winner's name fighting the numbers either side of it for the width.
       * The height the round line, the sides' scores and turn times take is held, so
       * scrubbing from a round to the result does not move the strip.
       */}
      <div
        className={`mx-auto grid w-full items-center gap-x-3 gap-y-2 sm:min-h-14 sm:gap-x-6 max-sm:min-h-24 ${finished ? 'max-sm:grid-cols-1' : ''} ${
          sides.length > 1
            ? 'max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @max-[16rem]:grid-cols-2'
            : 'max-w-3xl grid-cols-[minmax(0,1fr)_auto] @max-[16rem]:grid-cols-1'
        }`}
      >
        {sides.map((side, position) => (
          <SideScore
            key={side.index}
            side={side}
            completedRound={completedSideRound(
              view,
              side.armies.map((army) => army.playerId),
            )}
            playing={view.status === 'playing'}
            clock={view.status === 'setup' ? null : clock}
            align={position === 0 ? 'start' : 'end'}
            className={finished ? 'max-sm:hidden' : ''}
          />
        ))}
        {/* Across the top on a phone, so both sides' figures get half the width each below it. */}
        <div
          className={cn(
            'order-2 text-center @max-[16rem]:order-first @max-[16rem]:col-span-full',
            finished ? 'min-w-32 sm:min-w-44' : 'min-w-0 sm:min-w-28',
          )}
        >
          {finished ? (
            <Result view={view} sides={sides} />
          ) : (
            <>
              <p className="shrink-0 font-display text-2xs font-semibold tracking-label text-dim uppercase">
                Round{' '}
                <span data-stat="round" className="figure text-sm font-bold text-bone">
                  {view.round}
                </span>{' '}
                of {view.rounds}
              </p>
              <h1 className="shrink-0 text-sm leading-tight font-bold uppercase sm:text-base">{view.phase} phase</h1>
              <p
                className={cn(
                  'min-w-0 text-2xs leading-tight font-semibold text-balance sm:font-normal',
                  active ? tint(active.side).text : 'text-dim',
                )}
              >
                {active ? `${active.name}’s turn` : 'Nobody’s turn'}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * The end of the battle, said the way the table says it out loud.
 *
 * The winner is named in their own tint, and the score sits under the name rather
 * than inside the sentence. The heading still reads as one line for a screen reader.
 */
function Result({ view, sides }: Omit<Props, 'clock'>) {
  const result = battleResult(sides, view)
  if (result.kind !== 'win') return <h1 className="text-sm leading-tight font-bold text-balance uppercase">{result.detail}</h1>
  const winner = result.side
  const colours = tint(winner.index)
  return (
    <h1 className="text-base leading-tight font-bold text-balance uppercase sm:text-lg">
      <span className={colours.text}>{sideName(winner)}</span> <span className="text-dim">{result.verb}</span>{' '}
      {result.score ? (
        <span className="figure block text-2xl leading-none">{result.score}</span>
      ) : (
        <span className="text-dim">{result.detail}</span>
      )}
    </h1>
  )
}

function SideScore({
  side,
  completedRound,
  playing,
  clock,
  align,
  className = '',
}: {
  side: Side
  completedRound: number
  playing: boolean
  clock: BattleClock | null
  align: 'start' | 'end'
  className?: string
}) {
  const colours = tint(side.index)
  const end = align === 'end'
  const turnRound = clock && latestTurnRound(clock, side.index)
  const paused = clock?.paused && side.isActive
  return (
    <div data-side-score={side.index} className={cn('min-w-0', end ? 'order-3' : 'order-1', className)}>
      {/* Capped, or the round rail stretches across a wide column and stops reading as five rounds. */}
      <div className={`min-w-0 max-w-64 ${end ? 'ml-auto text-right' : ''}`}>
        {/*
         * Who is on each side, until the panels that say it better are on screen.
         * From `lg` up both panels sit under this strip with their players pictured
         * and named at the top of each, so this strip leaves them out there.
         *
         * A phone reads them to a screen reader without drawing them, so the strip stays one row;
         * the tabs beneath it name each side.
         */}
        <p
          className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-tight font-bold max-sm:sr-only lg:hidden ${end ? 'justify-end' : ''} ${colours.text}`}
        >
          {side.armies.map((army) => {
            const name = (
              <>
                <PlayerAvatar name={army.playerName} image={army.playerImage} className="size-5 text-3xs" />
                <span className="min-w-0 truncate">{army.playerName}</span>
              </>
            )
            return (
              <span key={army.playerId} className={`inline-flex min-w-0 items-center gap-x-1.5 ${end ? 'flex-row-reverse' : ''}`}>
                {!hasProfile(army.playerId) ? (
                  <span className={`inline-flex min-w-0 items-center gap-1.5 ${end ? 'flex-row-reverse' : ''}`}>{name}</span>
                ) : (
                  <Link
                    to="/users/$userId"
                    params={{ userId: army.playerId }}
                    className={`inline-flex min-w-0 items-center gap-1.5 hover:underline ${end ? 'flex-row-reverse' : ''}`}
                  >
                    {name}
                  </Link>
                )}
              </span>
            )
          })}
        </p>
        <p className={`readout flex flex-wrap items-baseline gap-x-2.5 sm:mt-1 ${end ? 'flex-row-reverse' : ''}`}>
          {/* Whose turn it is, at a glance: the side taking it has its score underlined in the current form. */}
          <span
            className={cn(
              'flex items-baseline gap-1 border-b-[6px] border-double pb-0.5 transition-colors duration-300',
              playing && side.isActive ? 'border-parchment' : 'border-transparent',
            )}
          >
            {/* Keyed on the value, so a new score rises into place and draws the eye across the table. */}
            <span
              key={side.total}
              className={`figure animate-figure text-3xl leading-none font-bold sm:text-5xl lg:text-4xl ${colours.text}`}
            >
              {side.total}
            </span>
            <span className="font-display text-2xs font-semibold text-dim uppercase">vp</span>
          </span>
          <span className="flex items-baseline gap-1">
            <span key={side.cp} className={`figure animate-figure text-lg leading-none font-bold ${colours.text}`}>
              {side.cp}
            </span>
            <span className="font-display text-2xs font-semibold text-dim uppercase">cp</span>
          </span>
        </p>
        {/* Rounds this side has played solid, the one being played doubled, the rest dashed. */}
        <div
          className={cn('mt-1.5 grid auto-cols-fr grid-flow-col gap-1 max-sm:hidden', colours.line, end && '[direction:rtl]')}
          aria-hidden
        >
          {side.rounds.map((entry) => (
            <span
              key={entry.round}
              className="line-segment"
              data-line={entry.round <= completedRound ? 'done' : playing && entry.round === completedRound + 1 ? 'now' : 'todo'}
            />
          ))}
        </div>
        {/* The side's latest turn, so the one being played reads against the one it answers. */}
        {clock ? (
          <p
            data-turn-time
            className={`mt-1 flex items-center gap-1 text-2xs ${end ? 'justify-end' : ''} ${side.isActive ? 'text-bone' : 'text-dim'}`}
          >
            {paused ? <Pause aria-hidden className="size-3" /> : <Timer aria-hidden className="size-3" />}
            <span className="sr-only">{side.isActive ? (paused ? 'This turn, paused:' : 'This turn:') : 'Last turn:'}</span>
            <Elapsed clock={clock} match={turnRound === null ? { side: side.index } : { side: side.index, round: turnRound }} />
          </p>
        ) : null}
      </div>
    </div>
  )
}
