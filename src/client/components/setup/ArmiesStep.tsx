import { useMutation, useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GAME_SIZES, PAINTED_ARMY_POINTS, type Command } from '../../../core/battle'
import { type BattleView } from '../../../core/battleView'
import { savedRosterPrice, unitWounds } from '../../../server/functions'
import { savedRostersQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import type { Army, Side } from '../../sides'
import { ArmyIdentity, RosterIdentity } from '../ArmyIdentity'
import { CHOOSABLE, CHOSEN, DispositionChip, SetupNote, SetupSidePanel, useDispositionNames } from './chrome'
import { battleRoster, type SavedRoster } from './roster'

type Props = { view: BattleView; sides: Side[]; send: (command: Command) => void; pending: boolean }

/**
 * Every army on the table, grouped by the side that fields it.
 *
 * A player only ever changes their own list, but everyone sees every list as soon as
 * it is attached — that is what makes the step worth doing together.
 */
export function ArmiesStep({ view, sides, send, pending }: Props) {
  /** The army the chooser is picking for: your own, or a practice opponent's. */
  const [choosing, setChoosing] = useState<Army | null>(null)
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const nameDisposition = useDispositionNames()
  const yourSide = sides.find((side) => side.isViewer)
  const sideOf = (army: Army) => sides.find((side) => side.armies.some((candidate) => candidate.playerId === army.playerId))
  /** What one army on a side may cost, which an allied pair splits between them. */
  const limitFor = (side: Side | undefined) =>
    view.settings.limit === null ? null : view.settings.limit / Math.max(1, side?.armies.length ?? 1)
  const perArmy = limitFor(yourSide)
  // The chooser prices against the side it was opened for, which an allied pair splits.
  const chooserLimit = choosing ? limitFor(sideOf(choosing)) : perArmy
  const eligible = chooserLimit === null ? saved : saved.filter((roster) => roster.limit === chooserLimit)
  const attach = useMutation({
    mutationFn: async ({ army, savedRoster }: { army: Army; savedRoster: SavedRoster }) => {
      // What a model of each datasheet can take is asked for beside the price rather
      // than after it: the picks already name every datasheet, so neither read is
      // waiting on the other. It is only ever asked here, because it is frozen into
      // the log from here and never read from the catalogue again.
      const [priced, wounds] = await Promise.all([
        savedRosterPrice({ data: { id: savedRoster.id } }),
        unitWounds({ data: { catalogueId: savedRoster.catalogueId, entryIds: savedRoster.picks.map((pick) => pick.entryId) } }),
      ])
      if (!priced) throw new Error('That roster could not be loaded.')
      return { army, roster: battleRoster(savedRoster, priced, wounds) }
    },
    onSuccess: ({ army, roster }) => {
      // Cards are settled by the battle, not carried in with the list: attaching a roster
      // starts them fresh. The bonus arrives claimed, because most armies on a table are.
      send({ kind: 'attach-roster', roster, prep: null, painted: true, playerId: army.playerId })
      setChoosing(null)
    },
  })

  return (
    <div className="space-y-4">
      {perArmy !== null && perArmy !== view.settings.limit ? (
        <SetupNote>
          The allied side splits {view.settings.limit} points evenly, so each ally brings a {perArmy}-point army.
        </SetupNote>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <SetupSidePanel key={side.index} side={side}>
            {side.armies.map((army) => (
              <article key={army.playerId} className="space-y-2 rounded-sm border border-edge bg-sunken p-2.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {side.armies.length > 1 ? (
                      <span className="block text-[0.6875rem] font-semibold text-dim uppercase">{army.playerName}</span>
                    ) : null}
                    <span className="block truncate font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
                    {/* What the army is, named the same way the battle will name it. */}
                    {army.roster ? <ArmyIdentity army={army} token={view.token} list={false} className="mt-0.5" /> : null}
                    <span className="mt-0.5 block text-xs text-dim">
                      {army.roster?.built?.units.length
                        ? `${army.roster.built.units.length} units · ${army.points} of ${army.roster.built.limit} points`
                        : army.roster
                          ? 'Imported army'
                          : army.automated
                            ? 'Choose the army it brings'
                            : 'Waiting for this player'}
                    </span>
                    {/*
                     * The disposition, in the colour the roster builder gave it. It is what
                     * decides the mission this side plays, so it belongs beside the army
                     * rather than being read back off the battlefield step later.
                     */}
                    <DispositionChip disposition={nameDisposition(army.roster?.built?.disposition)} className="mt-1" />
                  </div>
                  {army.isViewer || army.automated ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${army.roster ? 'Change' : 'Choose'} roster for ${army.playerName}`}
                        onClick={() => {
                          attach.reset()
                          setChoosing(army)
                        }}
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
                    <span className={`chip shrink-0 ${army.roster ? 'text-achieved' : 'text-dim'}`}>
                      {army.roster ? 'Ready' : 'Waiting'}
                    </span>
                  )}
                </div>
                {/*
                 * Whether the army is painted is a fact about the army, so it is said
                 * where the army is chosen. Anyone at the table may set it for any seat,
                 * because one device often stands in for all of them.
                 */}
                {army.roster ? (
                  <div className="flex items-center justify-between gap-2 border-t border-edge pt-2 text-xs">
                    <span className={army.painted ? 'text-achieved' : 'text-dim'}>
                      {army.painted ? 'Battle ready' : 'Not battle ready'}
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
            {/*
             * The bonus is the side's and pays once, so it is said under the side rather
             * than beside each list — an allied pair fields one army between them, and
             * an unpainted half costs the whole side the bonus.
             */}
            <p className={`text-xs ${side.paintedPoints ? 'text-achieved' : 'text-dim'}`}>
              {side.paintedPoints
                ? `Battle ready · +${side.paintedPoints} VP at the end of the battle`
                : side.armies.length > 1
                  ? `+${PAINTED_ARMY_POINTS} VP at the end of the battle once every army on this side is battle ready`
                  : 'No battle ready bonus'}
            </p>
          </SetupSidePanel>
        ))}
      </div>
      <RosterChooser
        open={choosing !== null}
        onOpenChange={(open) => !open && setChoosing(null)}
        forArmy={choosing}
        rosters={eligible}
        savedCount={saved.length}
        requiredLimit={chooserLimit}
        selectedName={choosing?.roster?.name}
        pending={pending || attach.isPending}
        onChoose={(savedRoster) => choosing && attach.mutate({ army: choosing, savedRoster })}
        error={attach.error ? errorMessage(attach.error) : null}
      />
    </div>
  )
}

function RosterChooser({
  open,
  onOpenChange,
  forArmy,
  rosters,
  savedCount,
  requiredLimit,
  selectedName,
  pending,
  onChoose,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  forArmy: Army | null
  rosters: SavedRoster[]
  savedCount: number
  requiredLimit: number | null
  selectedName?: string
  pending: boolean
  onChoose: (roster: SavedRoster) => void
  error: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">
            {forArmy?.automated ? `Choose ${forArmy.playerName}’s roster` : 'Choose your roster'}
          </DialogTitle>
          <DialogDescription className="text-dim">
            {/* A practice opponent owns no lists, so the army it brings comes from yours. */}
            {forArmy?.automated ? 'One of your own lists, played by the side across the table. ' : ''}
            {requiredLimit === null
              ? 'Rosters are shown in the same order as your roster library.'
              : `Rosters built for ${requiredLimit} points, in the same order as your roster library.`}
          </DialogDescription>
        </DialogHeader>
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          <span className="readout">{rosters.length}</span>
        </p>
        <div className="space-y-2">
          {rosters.length ? (
            rosters.map((roster) => (
              <button
                key={roster.id}
                type="button"
                disabled={pending}
                onClick={() => onChoose(roster)}
                className={`flex w-full items-center gap-3 border bg-sunken p-3 text-left disabled:opacity-60 ${
                  selectedName === roster.name ? CHOSEN : CHOOSABLE
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold uppercase">{roster.name}</span>
                  {/* The same line the battle draws for an army, so a list is recognisable before it is
                      chosen. Unlinked: the row is the control, and a link inside it takes the press
                      to a faction page instead of choosing the list. */}
                  <RosterIdentity roster={roster} linked={false} className="mt-1" />
                  <span className="mt-1 block text-xs text-dim">
                    11th edition · {GAME_SIZES.find((size) => size.limit === roster.limit)?.name ?? `${roster.limit} points`} ·{' '}
                    {roster.picks.length} units
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="chip block">{roster.limit} pts</span>
                  {selectedName === roster.name ? <span className="mt-1 block text-xs text-parchment">Selected</span> : null}
                </span>
              </button>
            ))
          ) : (
            <div className="space-y-3 border border-edge bg-sunken p-4">
              <p className="text-sm text-dim">
                {savedCount
                  ? `None of your ${savedCount} saved rosters is built for ${requiredLimit} points.`
                  : 'You do not have a saved roster yet.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                render={<Link to="/rosters" search={requiredLimit === null ? {} : { limit: requiredLimit }} />}
              >
                Open your roster library
              </Button>
            </div>
          )}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
