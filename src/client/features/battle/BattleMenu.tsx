import { useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
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
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Ending = { key: string; label: string; description: string; act: () => void }

type Props = {
  canDelete: boolean
  pending: boolean
  actionRemindersEnabled: boolean
  timerPaused: boolean
  players: readonly { id: string; name: string; isViewer: boolean; automated: boolean }[]
  onActionRemindersChange: (enabled: boolean) => void
  /** Shared by the table, unlike the reminders, so it is a command rather than a preference. */
  onTimerPausedChange: (paused: boolean) => void
  onConcede: (playerId: string) => void
  onDelete: () => void
}

/**
 * Personal battle preferences and the ways a battle stops.
 *
 * Each is rare, and none is undone by pressing the same button again, so they sit
 * behind a menu and a confirmation rather than in reach of a thumb all game.
 */
export function BattleMenu({
  canDelete,
  pending,
  actionRemindersEnabled,
  timerPaused,
  players,
  onActionRemindersChange,
  onTimerPausedChange,
  onConcede,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState<Ending | null>(null)
  const endings: Ending[] = players
    .filter((player) => !player.automated)
    .map((player) => ({
      key: `concede:${player.id}`,
      label: player.isViewer ? 'Concede battle' : `Concede for ${player.name}`,
      description: player.isViewer
        ? 'This records that you conceded and ends the battle for every player.'
        : `This records that ${player.name} conceded and ends the battle for every player.`,
      act: () => onConcede(player.id),
    }))

  return (
    <>
      <DropdownMenu>
        {/* Named rather than an icon alone: it sits under the log now, where nothing else says what it is. */}
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="Battle options" disabled={pending} />}>
          <EllipsisVertical />
          Battle options
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuCheckboxItem checked={actionRemindersEnabled} onCheckedChange={onActionRemindersChange}>
            Action reminders
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={() => onTimerPausedChange(!timerPaused)}>
            {timerPaused ? 'Resume timer' : 'Pause timer'}
          </DropdownMenuItem>
          {endings.map((ending) => (
            <DropdownMenuItem key={ending.key} variant="destructive" onClick={() => setConfirming(ending)}>
              {ending.label}
            </DropdownMenuItem>
          ))}
          {canDelete ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                setConfirming({
                  key: 'delete',
                  label: 'Delete battle',
                  description: 'This permanently deletes the battle, including its scores and history.',
                  act: onDelete,
                })
              }
            >
              Delete battle
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.label}?</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                confirming?.act()
                setConfirming(null)
              }}
            >
              {confirming?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
