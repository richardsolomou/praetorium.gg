import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { PHASES, type BattleView, type Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { tint } from './tints'

type Props = { view: BattleView; yours: Side | undefined; send: (command: Command) => void; pending: boolean; className?: string }

/**
 * Where the battle moves forward.
 *
 * Advancing belongs to the battle rather than to either side's panel, so the two
 * panels stay the same shape and their numbers line up across the table whichever
 * side is taking the turn.
 */
export function TurnControl({ view, yours, send, pending, className = '' }: Props) {
  const active = view.players.find((player) => player.isActive)
  const activeSide = active?.side ?? 0
  const yourTurn = Boolean(yours?.isActive)
  const at = PHASES.indexOf(view.phase)

  return (
    <section className={`space-y-2 ${className}`}>
      <ol className="flex gap-0.5" aria-label={`${view.phase} phase`}>
        {PHASES.map((phase, index) => (
          <li key={phase} className="min-w-0 flex-1" aria-current={phase === view.phase ? 'step' : undefined}>
            <span className={`block h-1 ${index <= at ? tint(activeSide).rail : 'bg-edge-strong'}`} />
            <span
              className={`mt-1 block truncate text-center text-[0.5625rem] font-semibold tracking-[0.06em] uppercase ${
                phase === view.phase ? 'text-bone' : 'text-faint'
              }`}
            >
              {phase}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-stretch gap-2">
        <AdvanceButton view={view} yourTurn={yourTurn} pending={pending} send={send} />
        <Button
          variant="outline"
          className="h-11 shrink-0 px-3"
          aria-label="Undo latest action"
          title="Undo latest action"
          disabled={view.undoable === null || pending}
          onClick={() => view.undoable !== null && send({ kind: 'undo', target: view.undoable })}
        >
          <Undo2 />
        </Button>
      </div>
      {yourTurn ? null : (
        <p className="text-center text-xs text-dim">Waiting for {active?.name ?? 'the other side'} to finish the phase.</p>
      )}
    </section>
  )
}

function AdvanceButton({
  view,
  yourTurn,
  pending,
  send,
}: {
  view: BattleView
  yourTurn: boolean
  pending: boolean
  send: (command: Command) => void
}) {
  const label = view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`
  const trigger = (
    <Button
      variant={yourTurn ? 'default' : 'outline'}
      className="h-11 min-w-0 flex-1 text-base"
      disabled={!yourTurn || pending}
      title={yourTurn ? undefined : 'Only the side taking the turn can end a phase'}
    >
      {label}
    </Button>
  )
  if (!view.advancePrompt) return <Button {...trigger.props} onClick={() => send({ kind: 'advance' })} />
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="uppercase">Score before continuing?</AlertDialogTitle>
          <AlertDialogDescription className="text-dim">{view.advancePrompt}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-none border-edge bg-sunken">
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={() => send({ kind: 'advance' })}>Continue anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
