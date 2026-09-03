import { memo } from 'react'
import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import { type Side } from '../../sides'
import { PlayerName } from '../PlayerName'
import { ArmyIdentity } from '../ArmyIdentity'
import { ArmyRoster } from './ArmyRoster'
import { type Award, PrimaryMission, type ReferenceCard, SecondaryMissions, type StratagemText } from './MissionCards'
import { Stratagems } from './Stratagems'
import { HEADING, tint } from './tints'

type Props = {
  view: BattleView
  side: Side
  coreKeys: ReadonlySet<string>
  pending: boolean
  send: (command: Command) => void
  awardsFor: (key: string, mode?: string) => Award[]
  referenceFor: (key: string) => ReferenceCard | undefined
  writtenFor: (side: Side, key: string) => StratagemText | undefined
  /** The ceilings this mission actually plays to, which the pack can lower. */
  guides: { primary: number; secondary: number }
  className?: string
}

/**
 * One side of the table, drawn the same way whoever is looking at it.
 *
 * Command points, victory points, mission cards and stratagems belong to the side.
 * A 2v1 ally does not get a second copy of them, which is why an allied pair fills
 * one of these rather than two.
 *
 * Memoized: every prop keeps its identity while the battle stands still, so a
 * dialog opening in the centre column does not redraw both armies.
 */
export const SidePanel = memo(function SidePanel({
  view,
  side,
  coreKeys,
  pending,
  send,
  awardsFor,
  referenceFor,
  writtenFor,
  guides,
  className = '',
}: Props) {
  const colours = tint(side.index)
  const finished = view.status === 'finished'
  const actionable = !finished
  const cards = {
    view,
    side,
    actionable,
    pending,
    send,
    awardsFor,
    referenceFor,
    guides,
  }
  // One army between them, so the side either has the bonus or it does not.
  const bonus = side.paintedPoints > 0

  return (
    <section
      data-panel="player"
      data-side={side.index}
      className={`min-w-0 space-y-3 rounded-lg border border-edge border-t-2 bg-panel p-3 ${colours.edge} ${
        side.isActive && !finished ? `ring-1 ${colours.glow}` : ''
      } ${className}`}
    >
      {/*
       * Who is on this side: each player pictured and named, with the army they
       * brought under their own name. A 2v1 lists two of these rather than two names
       * over two armies, because in a pair fielding the same faction there was
       * nothing to say which list belonged to whom.
       *
       * From `lg` up both panels are on screen beside the scoreboard, so this is the
       * only place the players are written and the scoreboard is left to the score.
       */}
      <div className="space-y-2">
        {side.armies.map((army) => (
          <div key={army.playerId} className="min-w-0">
            <h2 className={`text-lg leading-tight font-bold uppercase ${colours.text}`}>
              <PlayerName army={army} />
            </h2>
            <ArmyIdentity army={army} token={view.token} className="mt-0.5" />
            {/*
             * The list itself, over the battle rather than away from it, and where its
             * losses are recorded. Casualties are a live action, so setup and a finished
             * battle open the same army with nothing to press.
             */}
            <ArmyRoster army={army} side={side} token={view.token} actionable={view.status === 'playing' && !pending} send={send} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-y border-edge py-2">
        <div className="min-w-0">
          <p className={HEADING}>Victory points</p>
          <p data-stat="vp" className="readout text-4xl leading-none font-bold">
            {side.total}
          </p>
          {/* Chosen before the battle and paid at the end of it, so it is a promise rather than a number in the score. */}
          {bonus ? (
            <p className="mt-1 text-[0.625rem] text-achieved">
              {finished ? 'Battle ready included' : `+${side.paintedPoints} battle ready at the end`}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className={HEADING}>Command points</p>
          <p data-stat="cp" className={`readout text-4xl leading-none font-bold ${colours.text}`}>
            {side.cp}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="readout text-[0.625rem] text-faint">
              {side.cpGained} gained · {side.cpSpent} used
            </span>
            {actionable ? (
              <Button
                variant="secondary"
                size="xs"
                disabled={!side.canGainCp}
                title={side.canGainCp ? 'Gain one additional command point' : 'This side already gained its additional CP this round'}
                aria-label={side.canGainCp ? '+1 CP' : 'Additional CP already gained this round'}
                onClick={() => send({ kind: 'adjust-cp', delta: 1, playerId: side.captain.id })}
              >
                {side.canGainCp ? '+1 CP' : 'CP gain used'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* A tablet holds two columns; each panel narrows again in the three-column `lg` table. */}
      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 md:items-start lg:grid-cols-1 xl:grid-cols-2">
        <div
          className={`min-w-0 space-y-3 ${side.stratagems.length ? 'order-2 border-t border-edge pt-2.5 md:order-1 md:border-0 md:pt-0 lg:order-2 lg:border-t lg:pt-2.5 xl:order-1 xl:border-0 xl:pt-0' : ''}`}
        >
          <PrimaryMission {...cards} />
          <SecondaryMissions {...cards} />
        </div>
        {side.stratagems.length ? (
          <div className="order-1 min-w-0 md:order-2 lg:order-1 xl:order-2">
            <Stratagems
              side={side}
              phase={view.phase}
              coreKeys={coreKeys}
              actionable={actionable}
              pending={pending}
              send={send}
              writtenFor={(key) => writtenFor(side, key)}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
})
