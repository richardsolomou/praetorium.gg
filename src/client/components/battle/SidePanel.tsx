import { Button } from '@/components/ui/button'
import type { BattleView, Command } from '../../../core/battle'
import { type Army, type Side, sideName } from '../../sides'
import type { PresentPlayer } from '../../useLiveBattle'
import { type Award, PrimaryMission, type ReferenceCard, SecondaryMissions, type StratagemText } from './MissionCards'
import { Stratagems } from './Stratagems'
import { HEADING, tint } from './tints'

type Props = {
  view: BattleView
  side: Side
  present: PresentPlayer[]
  coreKeys: ReadonlySet<string>
  pending: boolean
  send: (command: Command) => void
  awardsFor: (side: Side, key: string, mode?: string) => Award[]
  referenceFor: (side: Side, key: string) => ReferenceCard | undefined
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
 */
export function SidePanel({
  view,
  side,
  present,
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
    awardsFor: (key: string, mode?: string) => awardsFor(side, key, mode),
    referenceFor: (key: string) => referenceFor(side, key),
    guides,
  }
  const bonus = side.armies.filter((army) => army.painted)

  return (
    <section
      data-panel="player"
      data-side={side.index}
      className={`min-w-0 space-y-3 rounded-lg border border-edge border-t-2 bg-panel p-3 ${colours.edge} ${
        side.isActive && !finished ? `ring-1 ${colours.glow}` : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className={`truncate text-lg leading-tight font-bold uppercase ${colours.text}`}>{sideName(side)}</h2>
          <p className="truncate text-[0.6875rem] text-dim">{side.armies.map(armyLine).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {side.armies.map((army) => (
            <span
              key={army.playerId}
              className={`size-2 rounded-full ${present.some((watcher) => watcher.playerId === army.playerId) ? 'bg-azure' : 'border border-dim/60'}`}
              title={`${army.playerName} ${present.some((watcher) => watcher.playerId === army.playerId) ? 'is watching' : 'is not on the page'}`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-y border-edge py-2">
        <div className="min-w-0">
          <p className={HEADING}>Victory points</p>
          <p data-stat="vp" className="readout text-4xl leading-none font-bold">
            {side.total}
          </p>
          {/* Chosen before the battle and paid at the end of it, so it is a promise rather than a number in the score. */}
          {bonus.length ? (
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
                title="Gain one additional command point"
                onClick={() => send({ kind: 'adjust-cp', delta: 1, playerId: side.captain.id })}
              >
                +1 CP
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Missions and stratagems side by side: both are read constantly, so neither is worth scrolling for. */}
      <div className="grid gap-x-4 gap-y-3 xl:grid-cols-2 xl:items-start">
        <div className="min-w-0 space-y-3">
          <PrimaryMission {...cards} />
          <SecondaryMissions {...cards} />
        </div>
        <div className="min-w-0">
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
      </div>
    </section>
  )
}

/** The list names itself after its detachment often enough that repeating it would say it twice. */
const armyLine = (army: Army) => {
  if (!army.roster) return 'No list'
  return army.detachment && !army.roster.name.includes(army.detachment) ? `${army.roster.name} · ${army.detachment}` : army.roster.name
}
