import { Link } from '@tanstack/react-router'
import { Check, QrCode, Trash2, UserRound, X } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { armyPointsFor, pointsBudgetOf, sharedSidePoints, type Command } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import type { Army, Side } from '../../../sides'
import { countLabel } from '../../../text'
import { WaiverNote, rosterWaivers } from '../../../components/FormatWaivers'
import { ArmyIdentity } from '../ArmyIdentity'
import { ArmyRoster } from '../ArmyRoster'
import { tint } from '../battleTints'
import { PlayerName } from '../PlayerName'
import type { SendCommand } from '../useCommand'
import type { BattleCombatSelection } from '../../simulator/BattleCombatDialog'
import { CHOOSABLE, CHOSEN, DispositionChip, useDispositionNames } from './chrome'
import { canChooseFor, WarlordToggle } from './ArmiesStep'

const ignoreCommand: SendCommand = () => {}
const points = (value: number) => value.toLocaleString('en')

/**
 * Who is playing whom, facing each other across the spine every step below hangs from, with each army's list and
 * what the table sets on it. A place nobody has joined yet is an empty chair, which the link fills.
 */
export function FaceOff({
  view,
  sides,
  open,
  controls,
  onSimulate,
}: {
  view: BattleView
  sides: Side[]
  /** The places on each side nobody has joined yet. */
  open: [number, number]
  /** Absent for a reader with no seat, who sees the armies without changing them. */
  controls?: {
    shared: boolean
    busy: boolean
    send: (command: Command) => void
    onShare: () => void
    onChoose: (army: Army) => void
    /** Present for a side that can take another player. */
    onAddAlly: (side: number) => (() => void) | undefined
    /** Present for a side whose empty place can go. */
    onRemovePlace: (side: number) => (() => void) | undefined
    problems: (side: number) => string | undefined
  }
  /** Lets a reader with no seat open a list in place, as they would once the battle runs. */
  onSimulate?: (selection: BattleCombatSelection) => void
}) {
  const viewerSide = sides.find((side) => side.isViewer)?.index ?? 0
  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-stretch sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]">
      {[0, 1].map((index) => {
        const side = sides.find((candidate) => candidate.index === index)
        const armies = side?.armies ?? []
        const chosen = armies.filter((army) => army.roster)
        const empty = open[index]!
        // An empty side is the opponent's until someone joins it; any other empty place is an ally's.
        const emptyName = (at: number) => (index !== viewerSide && !armies.length && at === 0 ? 'Opponent' : 'Ally')
        const unchosen = controls ? armies.find((army) => !army.roster && canChooseFor(view, army)) : undefined
        const shared = sharedSidePoints(view, index)
        const spent = chosen.reduce((total, army) => total + (army.roster?.built ? (army.points ?? 0) : 0), 0)
        const problem = controls?.problems(index)
        const addAlly = controls?.onAddAlly(index)
        const removePlace = controls?.onRemovePlace(index)
        return (
          <Fragment key={index}>
            {index ? (
              <span aria-hidden className="grid place-items-center font-display text-sm font-bold text-faint sm:text-lg">
                VS
              </span>
            ) : null}
            <div
              data-face-off-side={index}
              className={cn('part flex min-w-0 flex-col gap-1.5 border-t-2 p-3 sm:p-4', tint(index).edge, index && 'items-end text-right')}
            >
              <p
                className={cn(
                  'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold uppercase',
                  tint(index).text,
                  index && 'justify-end',
                )}
              >
                {armies.map((army, at) => (
                  <span key={army.playerId} className="inline-flex min-w-0 items-center gap-x-2">
                    {at ? <span className="text-dim">&amp;</span> : null}
                    <PlayerName army={army} />
                    {army.automated && controls ? <span className="chip text-dim normal-case">Played by you</span> : null}
                  </span>
                ))}
                {Array.from({ length: empty }, (_, at) => (
                  <span key={`open-${at}`} className="inline-flex min-w-0 items-center gap-x-2">
                    {armies.length || at ? <span className="text-dim">&amp;</span> : null}
                    <span data-open-place className="inline-flex min-w-0 items-center gap-1.5 text-dim">
                      <span
                        aria-hidden
                        className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-runner-hi"
                      >
                        <UserRound className="size-3.5" />
                      </span>
                      {emptyName(at)}
                    </span>
                    {removePlace ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove the ${emptyName(at).toLowerCase()} place`}
                        className="-ml-1 text-dim"
                        onClick={removePlace}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </span>
                ))}
              </p>
              <span
                className={cn(
                  'max-w-full font-display text-base leading-tight font-bold break-words uppercase sm:text-2xl',
                  !chosen.length && 'text-dim',
                )}
              >
                {chosen.length
                  ? chosen.map((army, at) => (
                      <Fragment key={army.playerId}>
                        {at ? ' & ' : null}
                        {onSimulate ? (
                          army.roster!.name
                        ) : (
                          /* The list as fielded, which the battle lets either side read even where the saved roster is private. */
                          <Link
                            to="/rosters/$id"
                            params={{ id: army.playerId }}
                            search={{ battle: view.token }}
                            className="underline decoration-faint decoration-2 underline-offset-4 hover:decoration-current"
                          >
                            {army.roster!.name}
                          </Link>
                        )}
                      </Fragment>
                    ))
                  : 'No army yet'}
              </span>
              {controls && !armies.length && empty ? (
                controls.shared ? (
                  <span className="text-xs text-dim">Link shared · waiting for them to join</span>
                ) : (
                  <Button size="sm" className="mt-1 self-stretch" disabled={controls.busy} onClick={controls.onShare}>
                    <QrCode /> Share a link
                  </Button>
                )
              ) : null}
              {unchosen ? (
                <Button size="sm" className="mt-1 self-stretch" onClick={() => controls!.onChoose(unchosen)}>
                  {chosen.length ? `Choose ${unchosen.playerName}’s army` : 'Choose army'}
                </Button>
              ) : null}
              {chosen.map((army) => (
                <ArmyLine
                  key={army.playerId}
                  view={view}
                  side={side!}
                  army={army}
                  limit={
                    shared !== null
                      ? null
                      : view.settings.teamBattle
                        ? armyPointsFor(view, index)
                        : army.roster?.built
                          ? pointsBudgetOf(army.roster.built)
                          : null
                  }
                  controls={controls}
                  mirrored={index === 1}
                >
                  {onSimulate ? (
                    <ArmyRoster
                      army={army}
                      side={side!}
                      finished={false}
                      actionable={false}
                      pending={false}
                      send={ignoreCommand}
                      onSimulate={onSimulate}
                    />
                  ) : null}
                </ArmyLine>
              ))}
              {shared !== null ? (
                <span className={cn('figure text-xs', spent > shared ? 'text-discarded' : 'text-dim')}>
                  {points(spent)} of {points(shared)} pts shared{spent > shared ? ` · ${points(spent - shared)} over` : ''}
                </span>
              ) : null}
              {problem ? <p className="text-xs text-discarded">{problem}</p> : null}
              {addAlly ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn('-mx-2 mt-auto text-dim', index ? 'self-end' : 'self-start')}
                  disabled={controls?.busy}
                  onClick={addAlly}
                >
                  + Add ally
                </Button>
              ) : null}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

/** One chosen army: what it is, what it costs, and what the table sets on it. */
function ArmyLine({
  view,
  side,
  army,
  limit,
  controls,
  mirrored,
  children,
}: {
  view: BattleView
  side: Side
  army: Army
  /** Its own points limit, or null where allies share their side's. */
  limit: number | null
  controls: Parameters<typeof FaceOff>[0]['controls']
  mirrored: boolean
  children: ReactNode
}) {
  const nameDisposition = useDispositionNames()
  const roster = army.roster!
  const manual = view.settings.manual === true
  const mine = controls && canChooseFor(view, army)
  return (
    <div className={cn('flex flex-col gap-1.5', mirrored && 'items-end')}>
      {roster.built ? <ArmyIdentity army={army} className={cn('text-xs', mirrored && 'justify-end')} /> : null}
      {roster.lentBy ? <span className="text-xs text-dim">Lent by {roster.lentBy.name}</span> : null}
      <span className="figure text-xs text-dim">
        {roster.built
          ? `${points(army.points ?? 0)}${limit === null ? '' : ` of ${points(limit)}`} pts · ${countLabel(army.unitCount, 'unit')}`
          : 'Imported army'}
      </span>
      <WaiverNote rules={rosterWaivers(roster.built)} />
      {/* Anyone at the table may set these, because one device often stands in for all of them. */}
      <div className={cn('flex flex-wrap items-center gap-1.5', mirrored && 'justify-end')}>
        {view.sealedEventToken ? <span className="chip text-achieved">Sealed roster</span> : null}
        {side.armies.length === 1 || !side.disposition ? (
          <DispositionChip disposition={nameDisposition(roster.built?.disposition)} />
        ) : null}
        {controls && side.warlordChoices.length > 1 && side.warlordChoices.includes(army.playerId) ? (
          <WarlordToggle side={side} army={army} send={controls.send} />
        ) : null}
        {manual ? null : controls ? (
          <Button
            variant="outline"
            size="xs"
            disabled={controls.busy}
            aria-pressed={army.painted}
            className={cn('gap-1', army.painted ? CHOSEN : CHOOSABLE)}
            aria-label={`${army.painted ? 'Remove' : 'Add'} the battle ready bonus for ${army.playerName}`}
            onClick={() => controls.send({ kind: 'set-painted', painted: !army.painted, playerId: army.playerId })}
          >
            {army.painted ? <Check className="size-3" aria-hidden /> : null}
            Battle ready
          </Button>
        ) : army.painted ? (
          <span className="chip text-achieved">Battle ready</span>
        ) : null}
        {mine ? (
          <>
            <Button variant="outline" size="xs" aria-label={`Change roster for ${army.playerName}`} onClick={() => controls.onChoose(army)}>
              Change
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={controls.busy}
              aria-label={`Take away the roster for ${army.playerName}`}
              title="Take this army off the table"
              onClick={() => controls.send({ kind: 'detach-roster', playerId: army.playerId })}
            >
              <Trash2 />
            </Button>
          </>
        ) : null}
      </div>
      {children}
    </div>
  )
}
