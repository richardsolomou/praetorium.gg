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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type Ending = { key: string; label: string; description: string; destructive: boolean; act: () => void }

type Props = {
  finished: boolean
  canDelete: boolean
  pending: boolean
  players: readonly { id: string; name: string; isViewer: boolean; automated: boolean }[]
  onFinishEarly: () => void
  onConcede: (playerId: string) => void
  onReopen: () => void
  onDelete: () => void
}

/**
 * The ways a battle stops.
 *
 * Each is rare, and none is undone by pressing the same button again, so they sit
 * behind a menu and a confirmation rather than in reach of a thumb all game.
 */
export function BattleMenu({ finished, canDelete, pending, players, onFinishEarly, onConcede, onReopen, onDelete }: Props) {
  const [confirming, setConfirming] = useState<Ending | null>(null)
  // Reopening is undone by finishing again, so it asks for nothing. Ending and deleting cannot be.
  const endings: Ending[] = finished
    ? [{ key: 'reopen', label: 'Reopen battle', description: '', destructive: false, act: onReopen }]
    : [
        {
          key: 'finish',
          label: 'Finish early',
          description: 'This records the current score as final. You can reopen the battle afterward.',
          destructive: true,
          act: onFinishEarly,
        },
        ...players
          .filter((player) => !player.automated)
          .map((player) => ({
            key: `concede:${player.id}`,
            label: player.isViewer ? 'Concede battle' : `Concede for ${player.name}`,
            description: player.isViewer
              ? 'This records that you conceded and ends the battle for every player.'
              : `This records that ${player.name} conceded and ends the battle for every player.`,
            destructive: true,
            act: () => onConcede(player.id),
          })),
      ]

  return (
    <>
      <DropdownMenu>
        {/* Named rather than an icon alone: it sits under the log now, where nothing else says what it is. */}
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="Battle options" disabled={pending} />}>
          <EllipsisVertical />
          Battle options
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {endings.map((ending) => (
            <DropdownMenuItem
              key={ending.key}
              variant={ending.destructive ? 'destructive' : undefined}
              onClick={() => (ending.destructive ? setConfirming(ending) : ending.act())}
            >
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
                  destructive: true,
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
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">{confirming?.label}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">{confirming?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="rounded-none border-edge bg-sunken">
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming?.destructive ? 'destructive' : 'default'}
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
