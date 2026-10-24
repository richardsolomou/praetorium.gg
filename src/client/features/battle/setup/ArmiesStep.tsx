import { useQuery } from '@tanstack/react-query'
import { Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../../components/buttonClass'
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
import { Skeleton } from '@/components/ui/skeleton'
import { PAINTED_ARMY_POINTS, pointsBudgetOf, pointsLabel, pointsSize, type Command } from '../../../../core/battle'
import { type BattleView } from '../../../../core/battleView'
import { errorMessage } from '../../../queryClient'
import { rostersLentToMeQuery, savedRosterSummariesQuery } from '../../../queries'
import type { Army, Side } from '../../../sides'
import { ArmyIdentity } from '../ArmyIdentity'
import { RosterChoices } from '../../rosters/RosterChoices'
import type { RosterProblem } from '../../rosters/RosterSummary'
import { LentRosterList, type LentRoster } from '../../rosters/LentRosters'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/Dialog'
import { rosterWaivers, WaiverList, WaiverNote } from '../../../components/FormatWaivers'
import { BATTLE_SIZE_CONTROL, CHOOSABLE, CHOSEN, DispositionChip, SetupNote, SetupSidePanel, useDispositionNames } from './chrome'
import { Problem } from '../../../components/Problem'
import { isGuestSeat } from '../../../../core/newBattle'
import type { RosterAttachment } from '../useCommand'
import { GuestInvite } from '../GuestInvite'
import { GuestRosterChooser } from './GuestRosterChooser'
import { useHistoryDialog } from '../../../useHistoryDialog'

type SavedRoster = Awaited<ReturnType<NonNullable<ReturnType<typeof savedRosterSummariesQuery>['queryFn']>>>[number]
type Props = {
  view: BattleView
  sides: Side[]
  send: (command: Command) => void
  attachRoster: (command: RosterAttachment) => Promise<boolean>
  pending: boolean
  problem: string | null
}

/**
 * Every army on the table, grouped by the side that fields it.
 *
 * A player only ever changes their own list, but everyone sees every list as soon as
 * it is attached — that is what makes the step worth doing together.
 */
export function ArmiesStep({ view, sides, send, attachRoster, pending, problem }: Props) {
  /** The army the chooser is picking for, your own or a practice opponent's, by player id. */
  const [choosingId, choose, closeChooser] = useHistoryDialog('choose-roster')
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
  /** A guest has no account, so no saved or lent lists: their army comes from this device's builder. */
  const guest = isGuestSeat(view.viewerId)
  const rosterQuery = useQuery({ ...savedRosterSummariesQuery(), enabled: !guest })
  const saved = (rosterQuery.data ?? []).filter((roster) => !roster.archived)
  const lentQuery = useQuery({ ...rostersLentToMeQuery(), enabled: !guest })
  const nameDisposition = useDispositionNames()
  const yourSide = sides.find((side) => side.isViewer)
  const sideOf = (army: Army) => sides.find((side) => side.armies.some((candidate) => candidate.playerId === army.playerId))
  /** What one army on a side may cost, which an allied pair splits between them. */
  const limitFor = (side: Side | undefined) =>
    view.settings.limit === null ? null : view.settings.limit / Math.max(1, side?.armies.length ?? 1)
  const perArmy = limitFor(yourSide)
  // The chooser prices against the side it was opened for, which an allied pair splits.
  const chooserLimit = view.settings.sizeFromRosters ? null : choosing ? limitFor(sideOf(choosing)) : perArmy
  const eligible = chooserLimit === null ? saved : saved.filter((roster) => roster.limit === chooserLimit)
  const lent = (lentQuery.data ?? []).filter(({ summary }) => chooserLimit === null || summary.limit === chooserLimit)
  const attach = async (savedRoster: SavedRoster) => {
    if (choosing && (await attachRoster({ kind: 'attach-saved-roster', rosterId: savedRoster.id, playerId: choosing.playerId })))
      closeChooser()
  }
  // The confirmation closes as it is answered, so a refused attach reports itself in
  // the chooser behind it rather than under a dialog that has nowhere to say it.
  const confirm = () => {
    const chosen = confirming
    setConfirming(null)
    if (chosen) void attach(chosen)
  }
  const confirmingWaivers = rosterWaivers(confirming)
  const oneWaiver = confirmingWaivers.length === 1
  return (
    <div data-onboarding="battle-setup-armies" className="space-y-4">
      {perArmy !== null && perArmy !== view.settings.limit ? (
        <SetupNote>
          The allied side splits {view.settings.limit?.toLocaleString('en')} points evenly, so each ally brings a {pointsSize(perArmy)}{' '}
          army.
        </SetupNote>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {sides.map((side) => (
          <SetupSidePanel key={side.index} side={side} named>
            {side.armies.map((army) => (
              <article key={army.playerId} className="space-y-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    {side.armies.length > 1 ? <span className="eyebrow block">{army.playerName}</span> : null}
                    {army.roster ? (
                      <span className="block font-bold break-words uppercase">{army.roster.name}</span>
                    ) : (
                      <span className="block py-2 text-sm text-dim">No army chosen</span>
                    )}
                    {/* What the army is, named the same way the battle will name it. */}
                    {army.roster ? <ArmyIdentity army={army} list={false} className="mt-0.5" /> : null}
                    {army.roster?.lentBy ? <span className="mt-0.5 block text-xs text-dim">Lent by {army.roster.lentBy.name}</span> : null}
                    {army.roster ? (
                      <span className="mt-0.5 block text-xs text-dim">
                        {army.roster.built
                          ? `${army.unitCount} units · ${(army.points ?? 0).toLocaleString('en')} of ${pointsLabel(pointsBudgetOf(army.roster.built))}`
                          : 'Imported army'}
                      </span>
                    ) : null}
                    {/*
                     * The disposition, in the colour the roster builder gave it. It decides the
                     * mission this side plays, so it belongs beside the army. Allies who have
                     * settled one card show it once for the side instead of each list's own.
                     */}
                    {side.armies.length === 1 || !side.disposition ? (
                      <DispositionChip disposition={nameDisposition(army.roster?.built?.disposition)} className="mt-1" />
                    ) : null}
                    {/* Said under every army rather than only under your own: an opponent
                        deciding whether to play this game needs the same fact its owner has. */}
                    <WaiverNote rules={rosterWaivers(army.roster?.built)} className="mt-1" />
                  </div>
                  {view.leagueToken ? (
                    <span className="chip shrink-0 self-start text-achieved sm:self-auto">League roster</span>
                  ) : army.isViewer || (army.automated && !guest) ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {isGuestSeat(army.playerId) && !guest ? (
                        <GuestInvite token={view.token} playerId={army.playerId} name={army.playerName} joined={false} />
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${army.roster ? 'Change' : 'Choose'} roster for ${army.playerName}`}
                        onClick={() => choose(army.playerId)}
                      >
                        {army.roster ? 'Change roster' : 'Choose roster'}
                      </Button>
                      {/* Bringing the wrong list is as easy as bringing the right one, and
                        swapping it was the only way back. Emptying the seat is the other. */}
                      {army.roster ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={`Take away the roster for ${army.playerName}`}
                          title="Take this army off the table"
                          onClick={() => send({ kind: 'detach-roster', playerId: army.playerId })}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-1 self-start sm:self-auto">
                      {isGuestSeat(army.playerId) && !guest ? (
                        <GuestInvite token={view.token} playerId={army.playerId} name={army.playerName} joined />
                      ) : null}
                      <span className={`chip ${army.roster ? 'text-achieved' : 'text-dim'}`}>{army.roster ? 'Ready' : 'Waiting'}</span>
                    </div>
                  )}
                </div>
                {/*
                 * Whether the army is painted is a fact about the army, so it is said
                 * where the army is chosen. Anyone at the table may set it for any seat,
                 * because one device often stands in for all of them.
                 */}
                {army.roster && !view.settings.manual ? (
                  <div className="flex items-center justify-between gap-2 border-t border-edge pt-2 text-xs">
                    <span className={army.painted ? 'text-achieved' : 'text-dim'}>
                      {army.painted
                        ? side.armies.length === 1 && side.paintedPoints
                          ? `Battle ready · +${side.paintedPoints} VP at the start of the battle`
                          : 'Battle ready'
                        : 'Not battle ready'}
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={pending}
                      className={army.painted ? CHOSEN : CHOOSABLE}
                      aria-label={`${army.painted ? 'Remove' : 'Add'} the battle ready bonus for ${army.playerName}`}
                      onClick={() => send({ kind: 'set-painted', painted: !army.painted, playerId: army.playerId })}
                    >
                      {army.painted ? 'Remove' : 'Add'} bonus
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
            {side.armies.length > 1 && nameDisposition(side.disposition) ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-dim">
                Side plays <DispositionChip disposition={nameDisposition(side.disposition)} />
              </p>
            ) : null}
            {/*
             * The bonus is the side's and pays once, so an allied pair hears it under the
             * side rather than beside each list: an unpainted half costs the whole side
             * the bonus. A lone army says it on its own line above.
             */}
            {view.settings.manual || side.armies.length === 1 ? null : (
              <p className={`text-xs ${side.paintedPoints ? 'text-achieved' : 'text-dim'}`}>
                {side.paintedPoints
                  ? `Battle ready · +${side.paintedPoints} VP at the start of the battle`
                  : `+${PAINTED_ARMY_POINTS} VP at the start of the battle once every army on this side is battle ready`}
              </p>
            )}
          </SetupSidePanel>
        ))}
      </div>
      <GuestRosterChooser
        open={guest && choosing !== null}
        onOpenChange={(open) => !open && closeChooser()}
        pending={pending}
        problem={problem}
        onChoose={(draft) => {
          void attachRoster({ kind: 'attach-draft-roster', draft }).then((attached) => attached && closeChooser())
        }}
      />
      <RosterChooser
        open={!guest && choosing !== null}
        onOpenChange={(open) => !open && closeChooser()}
        forArmy={choosing}
        rosters={eligible}
        lent={lent}
        savedCount={saved.length}
        requiredLimit={chooserLimit}
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
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent className="border-discarded/50 sm:max-w-lg [&>*]:min-w-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-discarded">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              {confirmingWaivers.length === 1 ? 'This list waives a rule' : `This list waives ${confirmingWaivers.length} rules`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.name} is not playing {oneWaiver ? 'one of' : 'some of'} the rules of its battle size:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <WaiverList rules={confirmingWaivers} />
          <p className="text-sm text-dim">
            Praetorium has not checked {oneWaiver ? 'it' : 'them'}, so this army may be illegal. Everyone at this table sees what it waives.
          </p>
          <AlertDialogFooter className="sm:flex-wrap">
            {confirming ? (
              <Link
                to="/rosters/$id"
                params={{ id: confirming.id }}
                data-slot="button"
                className={buttonClass({ variant: 'outline', className: 'sm:mr-auto' })}
              >
                <Pencil /> Edit roster
              </Link>
            ) : null}
            <AlertDialogCancel disabled={pending}>Choose another</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={confirm}>
              Bring it anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    </div>
  )
}

function RosterChooser({
  open,
  onOpenChange,
  forArmy,
  rosters,
  lent,
  savedCount,
  requiredLimit,
  selectedId,
  loading,
  pending,
  onChoose,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  forArmy: Army | null
  rosters: SavedRoster[]
  /** Rosters friends have lent this player, which they may field as their own army. */
  lent: LentRoster[]
  savedCount: number
  requiredLimit: number | null
  /** The list already fielded by this army, matched by id: two lists can share a name. */
  selectedId: string | null
  loading: boolean
  pending: boolean
  onChoose: (roster: SavedRoster, problem?: RosterProblem | null) => void
  error: string | null
}) {
  const changingSize = useRef(false)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      // After the close, so the dialog's own focus return to its trigger does not take it back.
      onOpenChangeComplete={(opened) => {
        if (opened || !changingSize.current) return
        changingSize.current = false
        document.getElementById(BATTLE_SIZE_CONTROL)?.focus()
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {forArmy?.automated ? `Choose ${forArmy.playerName}’s roster` : 'Choose your roster'}
          </DialogTitle>
          <DialogDescription>
            {/* A practice opponent owns no lists, so the army it brings comes from yours. */}
            {forArmy?.automated ? 'One of your own lists, played by the side across the table. ' : ''}
            {requiredLimit === null
              ? 'Your rosters, most recently updated first.'
              : `Rosters built for ${pointsLabel(requiredLimit)}, most recently updated first.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
            Rosters <span className="readout">{rosters.length}</span>
          </h2>
          <div className="space-y-2">
            {loading ? (
              <div className="space-y-2" aria-label="Loading rosters">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="flex min-h-20 items-center gap-3 border border-edge bg-sunken p-3" aria-hidden>
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-5 w-28" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : rosters.length ? (
              <RosterChoices rosters={rosters} selectedId={selectedId} disabled={pending} onSelect={onChoose} />
            ) : (
              <div className="space-y-3 border border-edge bg-sunken p-4">
                <p className="text-sm text-dim">
                  {savedCount
                    ? `None of your ${savedCount} saved rosters is built for ${requiredLimit?.toLocaleString('en')} points.`
                    : 'You do not have a saved roster yet.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {savedCount > 0 && requiredLimit !== null ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        changingSize.current = true
                        onOpenChange(false)
                      }}
                    >
                      Choose a different battle size
                    </Button>
                  ) : null}
                  <Link
                    to="/rosters"
                    search={requiredLimit === null ? {} : { limit: requiredLimit }}
                    className={buttonClass({ variant: 'outline', size: 'sm' })}
                  >
                    Open your roster library
                  </Link>
                </div>
              </div>
            )}
          </div>
          {lent.length ? (
            <>
              <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
                Lent by friends <span className="readout">{lent.length}</span>
              </h2>
              <LentRosterList rosters={lent} selectedId={selectedId} disabled={pending} onChoose={onChoose} />
            </>
          ) : null}
          {error ? <Problem>{error}</Problem> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
