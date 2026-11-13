import { useQuery } from '@tanstack/react-query'
import { Crown, Pencil, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../../components/buttonClass'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { fitsBattleSize, pointsBudgetOf, type Command } from '../../../../core/battle'
import { type BattleView } from '../../../../core/battleView'
import { errorMessage } from '../../../queryClient'
import { rostersLentToMeQuery, savedRosterSummariesQuery, type QueryData } from '../../../queries'
import { type Army, type Side, sideName } from '../../../sides'
import { rosterWaivers, WaiverConfirmDialog } from '../../../components/FormatWaivers'
import { CHOOSABLE, CHOSEN } from './chrome'
import type { RosterAttachment } from '../useCommand'
import { RosterChooser } from './RosterChooser'
import { useHistoryDialog } from '../../../useHistoryDialog'

type SavedRoster = QueryData<typeof savedRosterSummariesQuery>[number]
type Props = {
  view: BattleView
  sides: Side[]
  attachRoster: (command: RosterAttachment) => Promise<boolean>
  pending: boolean
  problem: string | null
}

/** Whether this reader picks the list for an army: their own, or one at a place the table plays, outside a sealed event. */
export function canChooseFor(view: BattleView, army: Army) {
  return !view.sealedEventToken && (army.isViewer || army.automated)
}

/** Choosing the list for an army, opened from its card in the face-off by `useHistoryDialog('choose-roster')`. */
export function ArmyChooser({ view, sides, attachRoster, pending, problem }: Props) {
  /** The army the chooser is picking for, your own or one the table plays, by player id. */
  const [choosingId, , closeChooser] = useHistoryDialog('choose-roster')
  const choosing = sides.flatMap((side) => side.armies).find((army) => army.playerId === choosingId) ?? null
  /**
   * A chosen list that is not playing all of its format, held back for a confirmation.
   *
   * Attaching one is the moment it stops being the owner's own business: from here the
   * opponent is facing it, so the player who brings it says so on purpose.
   */
  const [confirming, setConfirming] = useState<SavedRoster | null>(null)
  /** A chosen list the library already prices over its limit, held back instead of sent for the server to refuse. */
  const [overLimit, setOverLimit] = useState<SavedRoster | null>(null)
  // Both answer the chooser, so Back past its history entry dismisses them with it.
  if (choosing === null && (confirming || overLimit)) {
    setConfirming(null)
    setOverLimit(null)
  }
  const rosterQuery = useQuery(savedRosterSummariesQuery())
  const saved = (rosterQuery.data ?? []).filter((roster) => !roster.archived)
  const lentQuery = useQuery(rostersLentToMeQuery())
  const team = view.settings.teamBattle
  // A size the rosters set is no filter, since any list may change it.
  const chooserLimit = view.settings.sizeFromRosters ? null : view.settings.limit
  const fits = (roster: { limit: number; waivedRules?: readonly string[] | null }) =>
    fitsBattleSize({ ...view.settings, limit: chooserLimit }, roster)
  const eligible = saved.filter(fits)
  const lent = (lentQuery.data ?? []).filter(({ summary }) => fits(summary))
  const attach = async (savedRoster: SavedRoster) => {
    if (choosing && (await attachRoster({ kind: 'attach-saved-roster', rosterId: savedRoster.id, playerId: choosing.playerId })))
      closeChooser()
  }
  // The confirmation closes as it is answered, so a refused attach reports itself in
  // the chooser behind it rather than under a dialog that has nowhere to say it.
  const confirm = (chosen: SavedRoster) => {
    setConfirming(null)
    void attach(chosen)
  }
  return (
    <>
      <RosterChooser
        open={choosing !== null}
        onOpenChange={(open) => !open && closeChooser()}
        forArmy={choosing}
        rosters={eligible}
        lent={lent}
        savedCount={saved.length}
        requiredLimit={chooserLimit}
        orSmaller={team}
        selectedId={choosing?.rosterId ?? null}
        loading={rosterQuery.isPending}
        pending={pending}
        onChoose={(savedRoster, rosterProblem) => {
          if (rosterProblem === 'over-limit') setOverLimit(savedRoster)
          else if (rosterWaivers(savedRoster).length) setConfirming(savedRoster)
          else void attach(savedRoster)
        }}
        error={rosterQuery.error ? errorMessage(rosterQuery.error) : problem}
      />
      <WaiverConfirmDialog
        roster={confirming}
        noun="list"
        consequence="this army may be illegal. Everyone at this table sees what it waives."
        confirmLabel="Bring it anyway"
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={confirm}
      />
      <AlertDialog open={overLimit !== null} onOpenChange={(open) => !open && setOverLimit(null)}>
        <AlertDialogContent className="border-destructive/50 sm:max-w-lg [&>*]:min-w-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              This list is over its points limit
            </AlertDialogTitle>
            <AlertDialogDescription>
              {overLimit ? `${overLimit.name || 'It'} costs more than its ${pointsBudgetOf(overLimit)}-point limit.` : null} Fix it before
              bringing it to a battle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            {overLimit ? (
              <Link
                to="/rosters/$id"
                params={{ id: overLimit.id }}
                data-slot="button"
                className={buttonClass({ variant: 'outline', className: 'sm:mr-auto' })}
              >
                <Pencil /> Edit roster
              </Link>
            ) : null}
            <AlertDialogCancel>Choose another</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function WarlordToggle({ side, army, send }: { side: Side; army: Army; send: (command: Command) => void }) {
  const unit = army.units.find((candidate) => candidate.warlord)?.name ?? 'Warlord'
  const leads = side.warlord === army.playerId
  return (
    <Button
      variant="outline"
      size="xs"
      aria-pressed={leads}
      aria-label={`Make ${army.playerName}’s ${unit} the Warlord for ${sideName(side)}`}
      title={leads ? 'This Warlord leads the side' : 'Lead the side with this Warlord'}
      className={`gap-1 ${leads ? CHOSEN : CHOOSABLE}`}
      onClick={() => send({ kind: 'set-side-warlord', side: side.index, playerId: army.playerId })}
    >
      <Crown className={`size-3 ${leads ? 'fill-current' : ''}`} aria-hidden />
      {unit}
    </Button>
  )
}
