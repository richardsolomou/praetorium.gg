import { useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import { posthog } from 'posthog-js'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { isPracticeSeat } from '../../../core/newBattle'
import { DropdownMenuCheckboxItem, DropdownMenuItem } from '../../components/Menu'

type Ending = 'finish-early' | 'concede' | 'delete'

type Props = {
  canDelete: boolean
  pending: boolean
  actionRemindersEnabled: boolean
  timerPaused: boolean
  players: readonly { id: string; name: string; isViewer: boolean; automated: boolean }[]
  /** Absent when the battle has no mission actions to remind anyone of. */
  onActionRemindersChange?: (enabled: boolean) => void
  /** Absent when no earlier phase can take a missed action. */
  onRecordMissed?: () => void
  /** The battle whose stream overlay link the menu copies. */
  token: string
  /** Shared by the table, unlike the reminders, so it is a command rather than a preference. */
  onTimerPausedChange: (paused: boolean) => void
  onConcede: (playerId: string) => void
  onFinishEarly: () => void
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
  token,
  onRecordMissed,
  onTimerPausedChange,
  onConcede,
  onFinishEarly,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState<Ending | null>(null)
  const [concedingPlayerId, setConcedingPlayerId] = useState<string | null>(null)
  const eligiblePlayers = players.filter((player) => !isPracticeSeat(player))
  const selectedPlayer = eligiblePlayers.find((player) => player.id === concedingPlayerId)
  const playerLabel = (player: Props['players'][number]) => (player.isViewer ? `${player.name} (you)` : player.name)
  const endings = {
    'finish-early': {
      label: 'End practice battle',
      description: 'This ends the battle at the current score. Practice battles never count for records or standings.',
      act: onFinishEarly,
    },
    concede: {
      label: 'Concede battle',
      description: 'The selected player’s side loses and the battle ends for everyone.',
      act: () => selectedPlayer && onConcede(selectedPlayer.id),
    },
    delete: {
      label: 'Delete battle',
      description: 'This permanently deletes the battle, including its scores and history.',
      act: onDelete,
    },
  }
  const ending = confirming ? endings[confirming] : null

  return (
    <>
      <DropdownMenu>
        {/* Named rather than an icon alone: it sits under the log, where nothing else says what it is. */}
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="Battle options" disabled={pending} />}>
          <EllipsisVertical />
          Battle options
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {onActionRemindersChange ? (
            <DropdownMenuCheckboxItem checked={actionRemindersEnabled} onCheckedChange={onActionRemindersChange}>
              Action reminders
            </DropdownMenuCheckboxItem>
          ) : null}
          {onRecordMissed ? <DropdownMenuItem onClick={onRecordMissed}>Record a missed action</DropdownMenuItem> : null}
          <DropdownMenuItem onClick={() => onTimerPausedChange(!timerPaused)}>
            {timerPaused ? 'Resume timer' : 'Pause timer'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyOverlayLink(token)}>Copy stream overlay link</DropdownMenuItem>
          {players.some(isPracticeSeat) ? (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming('finish-early')}>
              {endings['finish-early'].label}
            </DropdownMenuItem>
          ) : null}
          {eligiblePlayers.length ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                setConcedingPlayerId(eligiblePlayers.find((player) => player.isViewer)?.id ?? null)
                setConfirming('concede')
              }}
            >
              {endings.concede.label}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming('delete')}>
              {endings.delete.label}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {ending ? (
        <ConfirmDialog
          title={`${ending.label}?`}
          description={ending.description}
          cancel="Keep playing"
          confirm={ending.label}
          destructive
          disabled={pending || (confirming === 'concede' && !selectedPlayer)}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            ending.act()
            setConfirming(null)
          }}
        >
          {confirming === 'concede' ? (
            <div>
              <Label className="eyebrow" htmlFor="conceding-player">
                Who is conceding?
              </Label>
              <Select value={selectedPlayer?.id ?? null} onValueChange={setConcedingPlayerId}>
                <SelectTrigger id="conceding-player" className="mt-1.5 w-full">
                  <SelectValue>{selectedPlayer ? playerLabel(selectedPlayer) : 'Choose a player'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {eligiblePlayers.map((player) => (
                    <SelectItem key={player.id} value={player.id} label={playerLabel(player)}>
                      {playerLabel(player)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  )
}

async function copyOverlayLink(token: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/battles/${token}/overlay`)
    toast.success('Stream overlay link copied')
    posthog.capture('battle_overlay_link_copied')
  } catch (error) {
    posthog.captureException(error, { operation: 'copy_overlay_link' })
    toast.error('Copy failed. Try again.')
  }
}
