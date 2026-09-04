import { Link } from '@tanstack/react-router'
import type { BattleView } from '../../../core/battleView'
import { battleResult } from '../../battleOutcome'
import { completedSideRound } from '../../battleProgress'
import { PlayerAvatar } from '../PlayerAvatar'
import { sideName, type Side } from '../../sides'
import { tint } from './tints'

type Props = { view: BattleView; sides: Side[]; outcome: string | null }

/**
 * The one line worth glancing at mid-turn: who is ahead, whose turn it is, and how
 * far through the battle everyone is. The same component at every width, so a phone
 * and a laptop never disagree about the score.
 */
export function Scoreboard({ view, sides, outcome }: Props) {
  const active = view.players.find((player) => player.isActive)
  const finished = view.status === 'finished'

  return (
    <section
      data-scoreboard
      aria-label="Battle scoreboard"
      className="sticky top-12 z-20 -mx-3 border-b border-edge bg-void/95 px-3 py-2 backdrop-blur"
    >
      {/*
       * A finished battle gives the whole strip to its result on a phone. Each side's
       * score is already at the top of its own panel a thumb away, and three columns
       * left the winner's name fighting the numbers either side of it for the width.
       */}
      <div
        className={`mx-auto grid items-center gap-3 sm:gap-6 ${finished ? 'max-sm:grid-cols-1' : ''} ${
          sides.length > 1 ? 'max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'max-w-3xl grid-cols-[minmax(0,1fr)_auto]'
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
            align={position === 0 ? 'start' : 'end'}
            className={finished ? 'max-sm:hidden' : ''}
          />
        ))}
        <div className={`order-2 text-center ${finished ? 'min-w-32 sm:min-w-44' : 'min-w-28'}`}>
          {finished ? (
            <Result view={view} sides={sides} outcome={outcome} />
          ) : (
            <>
              <p className="eyebrow">
                Round{' '}
                <span data-stat="round" className="readout text-bone">
                  {view.round}
                </span>{' '}
                of {view.rounds}
              </p>
              <h1 className="text-sm leading-tight font-bold uppercase sm:text-base">{view.phase} phase</h1>
              <p className="truncate text-[0.6875rem] text-dim">{active ? `${active.name}’s turn` : 'Nobody’s turn'}</p>
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
 * The winner is named in their own tint under their own picture, because that is what
 * the two sides have been reading all game, and the score sits under the name rather
 * than inside the sentence. The heading still reads as one line for a screen reader.
 */
function Result({ view, sides, outcome }: Props) {
  const result = battleResult(sides, view)
  const winner = result.kind === 'win' ? sides.find((side) => side.index === result.side.index) : undefined
  if (!winner || result.kind !== 'win') {
    return (
      <>
        <p className="eyebrow">Result</p>
        <h1 className="text-sm leading-tight font-bold text-balance uppercase">{outcome}</h1>
      </>
    )
  }
  const colours = tint(winner.index)
  return (
    <>
      <p className="eyebrow">Result</p>
      <div className="mt-0.5 flex justify-center -space-x-2" aria-hidden>
        {winner.armies.map((army) => (
          <PlayerAvatar
            key={army.playerId}
            name={army.playerName}
            image={army.playerImage}
            className={`size-8 border-2 border-void text-xs sm:size-10 sm:text-sm ${colours.ring}`}
          />
        ))}
      </div>
      <h1 className="mt-1 text-base leading-tight font-bold text-balance uppercase sm:text-lg">
        <span className={colours.text}>{sideName(winner)}</span> <span className="text-dim">{result.verb}</span>{' '}
        {result.score ? (
          <span className="readout block text-2xl leading-none sm:text-3xl">{result.score}</span>
        ) : (
          <span className="text-dim">{result.detail}</span>
        )}
      </h1>
    </>
  )
}

function SideScore({
  side,
  completedRound,
  align,
  className = '',
}: {
  side: Side
  completedRound: number
  align: 'start' | 'end'
  className?: string
}) {
  const colours = tint(side.index)
  const end = align === 'end'
  return (
    <div data-side-score={side.index} className={`min-w-0 ${end ? 'order-3' : 'order-1'} ${className}`}>
      {/* Capped, or the round strip stretches across a wide column and stops reading as five rounds. */}
      <div className={`min-w-0 max-w-64 ${end ? 'ml-auto text-right' : ''}`}>
        {/*
         * Who is on each side, until the panels that say it better are on screen.
         * From `lg` up both panels sit under this strip with their players pictured
         * and named at the top of each, so repeating them here said nothing twice.
         *
         * Below that, a phone gives each side about a third of the strip, which two
         * names and two pictures do not fit into: they wrapped over four lines and
         * pushed the score itself off the screen. So the picture identifies each
         * player and the name stays behind it for a screen reader, which keeps this
         * link the way out of a battle that it is. From `sm` there is room for both.
         */}
        <p
          className={`flex flex-wrap items-center gap-x-1 text-sm leading-tight font-bold uppercase lg:hidden ${end ? 'justify-end' : ''} ${colours.text}`}
        >
          {side.armies.map((army, at) => (
            <span key={army.playerId} className="inline-flex items-center gap-x-1">
              {at ? <span className="text-dim">&amp;</span> : null}
              <Link to="/users/$userId" params={{ userId: army.playerId }} className="group inline-flex items-center gap-1 align-middle">
                <PlayerAvatar name={army.playerName} image={army.playerImage} className="size-5 text-[0.625rem]" />
                <span className="sr-only whitespace-nowrap group-hover:underline sm:not-sr-only">{army.playerName}</span>
              </Link>
            </span>
          ))}
        </p>
        <p className={`readout mt-0.5 flex items-baseline gap-1.5 ${end ? 'justify-end' : ''}`}>
          <span className="text-2xl leading-none font-bold sm:text-3xl">{side.total}</span>
          <span className="text-[0.625rem] text-dim uppercase">vp</span>
          <span className={`ml-1 text-base leading-none font-bold ${colours.text}`}>{side.cp}</span>
          <span className="text-[0.625rem] text-dim uppercase">cp</span>
        </p>
        <div className={`mt-1 flex gap-0.5 ${end ? 'flex-row-reverse' : ''}`} aria-hidden>
          {side.rounds.map((entry) => (
            <span key={entry.round} className={`h-1 flex-1 ${entry.round <= completedRound ? colours.rail : 'bg-edge-strong'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
