import { Button } from '@/components/ui/button'
import type { BattleView, Command } from '../../../core/battle'
import { type Side, sideName } from '../../sides'
import type { PresentPlayer } from '../../useLiveBattle'
import { type Award, PrimaryMission, type ReferenceCard, SecondaryMissions } from './MissionCards'
import { Stratagems } from './Stratagems'
import { HEADING, tint } from './tints'

type Props = {
  view: BattleView
  side: Side
  present: PresentPlayer[]
  coreKeys: ReadonlySet<string>
  pending: boolean
  send: (command: Command) => void
  awardsFor: (key: string, mode?: string) => Award[]
  referenceFor: (key: string) => ReferenceCard | undefined
  /** The ceilings this mission actually plays to, which the pack can lower. */
  guides: { primary: number; secondary: number }
  className?: string
}

/**
 * One side of the table, drawn the same way whoever is looking at it.
 *
 * Command points, victory points, mission cards and stratagems belong to the side.
 * A 2v1 ally does not get a second copy of them — it gets a second army inside this
 * panel, which is the only thing that is actually theirs.
 */
export function SidePanel({ view, side, present, coreKeys, pending, send, awardsFor, referenceFor, guides, className = '' }: Props) {
  const colours = tint(side.index)
  const finished = view.status === 'finished'
  const actionable = side.isViewer && !finished
  const cards = { view, side, actionable, pending, send, awardsFor, referenceFor, guides }

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
          <p className="text-[0.6875rem] text-dim">
            {side.armies.length > 1 ? `${side.armies.length} allied armies` : side.isActive ? 'Taking the turn' : 'Waiting'}
          </p>
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

      <div className="grid grid-cols-2 gap-2">
        <Readout label="Victory points" value={side.total} stat="vp" className="text-4xl" />
        <Readout label="Command points" value={side.cp} stat="cp" className={`text-4xl ${colours.text}`}>
          <span className="readout text-[0.625rem] text-faint">
            {side.cpGained} gained · {side.cpSpent} used
          </span>
          {actionable ? (
            <Button
              variant="secondary"
              size="xs"
              className="mt-1"
              title="Gain one additional command point"
              disabled={pending}
              onClick={() => send({ kind: 'adjust-cp', delta: 1 })}
            >
              +1 CP
            </Button>
          ) : null}
        </Readout>
      </div>

      <div className="grid grid-cols-5 border-y border-edge py-1.5">
        {side.rounds.map((round) => (
          <div key={round.round} className={`text-center ${round.round > 1 ? 'border-l border-edge' : ''}`}>
            <p className="eyebrow">T{round.round}</p>
            <p className={`readout text-base leading-tight ${round.round === view.round ? colours.text : 'text-dim'}`}>{round.total}</p>
            <p className="readout text-[0.5625rem] text-faint">
              {round.primary}+{round.secondary}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-1.5">
        <p className={HEADING}>{side.armies.length > 1 ? 'Armies' : 'Army'}</p>
        {side.armies.map((army) => (
          <div key={army.playerId} className="rounded-sm border border-edge bg-sunken px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold uppercase">{army.roster?.name ?? 'No list attached'}</span>
                <span className="block truncate text-[0.6875rem] text-dim">
                  {[
                    side.armies.length > 1 ? `${army.playerName}${army.isViewer ? ' · you' : ''}` : null,
                    army.detachment && !army.roster?.name.includes(army.detachment) ? army.detachment : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No detachment recorded'}
                </span>
              </span>
              {army.points === null ? null : <span className="readout shrink-0 text-[0.6875rem] text-dim">{army.points} pts</span>}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[0.6875rem]">
              <span className={army.painted ? 'text-achieved' : 'text-faint'}>
                {army.painted ? `Battle ready · +${army.paintedPoints} VP` : 'No battle ready bonus'}
              </span>
              {army.isViewer && !finished ? (
                <Button
                  variant={army.painted ? 'default' : 'outline'}
                  size="xs"
                  aria-label={`${army.painted ? 'Remove' : 'Add'} the battle ready bonus for ${army.roster?.name ?? army.playerName}`}
                  disabled={pending}
                  onClick={() => send({ kind: 'set-painted', painted: !army.painted })}
                >
                  {army.painted ? 'Remove' : 'Add'} bonus
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <PrimaryMission {...cards} />
      <SecondaryMissions {...cards} />
      <Stratagems side={side} phase={view.phase} coreKeys={coreKeys} actionable={actionable} pending={pending} send={send} />
    </section>
  )
}

function Readout({
  label,
  value,
  stat,
  className,
  children,
}: {
  label: string
  value: number
  stat: string
  className: string
  children?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className={HEADING}>{label}</p>
      <p data-stat={stat} className={`readout leading-none font-bold ${className}`}>
        {value}
      </p>
      {children ? <div className="mt-1 flex flex-col items-start">{children}</div> : null}
    </div>
  )
}
