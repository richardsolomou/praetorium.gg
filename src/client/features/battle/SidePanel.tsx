import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SendCommand } from './useCommand'
import type { BattleView } from '../../../core/battleView'
import { type Side } from '../../sides'
import { PlayerName } from './PlayerName'
import { PlayerRatingChange } from './PlayerRatingChange'
import { ArmyIdentity } from './ArmyIdentity'
import type { BattleCombatSelection } from '../simulator/BattleCombatDialog'
import { ArmyRoster } from './ArmyRoster'
import { PrimaryMission, type ReferenceCard, SecondaryMissions, type StratagemText } from './MissionCards'
import { Stratagems } from './Stratagems'
import { tint } from './battleTints'
import { ManualScore } from './ManualScore'

type Props = {
  view: BattleView
  side: Side
  onSimulate: (selection: BattleCombatSelection) => void
  coreKeys: ReadonlySet<string>
  pending: boolean
  /** A parked prompt, which holds controls that otherwise stay usable while a write is in flight. */
  blocked: boolean
  send: SendCommand
  referenceFor: (key: string) => ReferenceCard | undefined
  writtenFor: (side: Side, key: string) => StratagemText | undefined
  /** The ceilings this mission actually plays to, which the pack can lower. */
  guides: { primary: number; secondary: number }
  onRecordMissed?: (side: Side, stratagemKey: string) => void
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
  onSimulate,
  coreKeys,
  pending,
  blocked,
  send,
  referenceFor,
  writtenFor,
  guides,
  onRecordMissed,
  className = '',
}: Props) {
  const colours = tint(side.index)
  const cards = {
    view,
    side,
    pending,
    send,
    referenceFor,
    guides,
    // The other side's cards are read, not played, so they keep to names and totals.
    compact: !side.played,
  }
  // The side's command points head what they are spent on, so the count sits beside the stratagems rather than on a row of its own.
  const commandPoints = (
    <div className="flex min-h-9 items-center gap-2">
      <h3 className="text-base font-semibold text-bone">{side.stratagems.length ? 'Stratagems' : 'Command points'}</h3>
      <p className="flex items-baseline gap-1 text-dim">
        <span key={side.cp} data-stat="cp" className={`figure animate-figure text-xl leading-none ${colours.score}`}>
          {side.cp}
        </span>
        <span className="text-xs">CP</span>
      </p>
      {/* Only the people playing a side gain its command points, so the other side's panel just shows the count. */}
      {side.played ? <GainCp side={side} pending={pending} send={send} className="ml-auto h-8 px-2.5 text-xs" /> : null}
    </div>
  )
  const stratagems = side.stratagems.length ? (
    <div data-stratagems className="min-w-0 space-y-2">
      {commandPoints}
      <Stratagems
        side={side}
        phase={view.phase}
        coreKeys={coreKeys}
        pending={pending}
        send={send}
        showUnplayable={side.played}
        writtenFor={(key) => writtenFor(side, key)}
        onRecordMissed={onRecordMissed && ((key) => onRecordMissed(side, key))}
      />
    </div>
  ) : null
  // Missions score in the command phase; every other phase is played with stratagems, so they lead the panel there.
  const stratagemsFirst = Boolean(stratagems) && view.status === 'playing' && view.phase !== 'command'

  return (
    <section
      data-onboarding={side.isViewer ? 'battle-live-side' : undefined}
      data-panel="player"
      data-side={side.index}
      className={cn('min-w-0 space-y-5 border-t-2 pt-3', colours.edge, className)}
    >
      {/*
       * Who is on this side: each player pictured and named, with the army they
       * brought under their own name. A 2v1 lists two of these rather than two names
       * over two armies, so a pair fielding the same faction still shows which list
       * belongs to whom.
       *
       * From `lg` up both panels are on screen beside the scoreboard, so this is the
       * only place the players are written and the scoreboard is left to the score.
       */}
      <div className="space-y-2">
        {side.armies.map((army) => (
          <div key={army.playerId} className="min-w-0">
            <h2 className={`flex min-w-0 items-baseline gap-2 font-display text-xl leading-tight font-bold ${colours.text}`}>
              <PlayerName army={army} />
              <PlayerRatingChange view={view} playerId={army.playerId} />
            </h2>
            <ArmyIdentity army={army} className="mt-0.5" />
            {/*
             * The list itself, over the battle rather than away from it, and where its
             * losses are recorded. Casualties are a live action, so setup and a finished
             * battle open the same army with nothing to press.
             */}
            <ArmyRoster
              token={view.token}
              onSimulate={onSimulate}
              army={army}
              finished={view.status === 'finished'}
              side={side}
              actionable
              pending={pending}
              blocked={blocked}
              send={send}
            />
          </div>
        ))}
      </div>

      {view.settings.manual ? (
        <ManualScore side={side} actionable pending={pending} send={send} />
      ) : (
        <>
          {stratagems ? null : commandPoints}
          {stratagemsFirst ? stratagems : null}
          {/* Across the whole panel, or its five round columns get squeezed into half of it. */}
          <PrimaryMission {...cards} />
          {/* Split by the panel's own width: beside two other columns a wide window still leaves it too narrow for two. */}
          <div className="@container">
            <div className={cn('grid gap-x-6 gap-y-5', !stratagemsFirst && stratagems && '@xl:grid-cols-2 @xl:items-start')}>
              <div data-missions className="min-w-0 space-y-3">
                <SecondaryMissions {...cards} />
              </div>
              {stratagemsFirst ? null : stratagems}
            </div>
          </div>
        </>
      )}
    </section>
  )
})

/** The one additional command point a side can gain each round. */
export function GainCp({ side, pending, send, className }: Pick<Props, 'side' | 'pending' | 'send'> & { className?: string }) {
  return (
    <Button
      variant="secondary"
      size="xs"
      className={className}
      disabled={pending || !side.canGainCp}
      title={side.canGainCp ? 'Gain one additional command point' : 'This side already gained its additional CP this round'}
      aria-label={side.canGainCp ? '+1 CP' : 'Additional CP already gained this round'}
      onClick={() => send({ kind: 'adjust-cp', delta: 1, playerId: side.captain.id })}
    >
      {side.canGainCp ? '+1 CP' : 'CP gain used'}
    </Button>
  )
}
