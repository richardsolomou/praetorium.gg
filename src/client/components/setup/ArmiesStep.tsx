import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GAME_SIZES, type Command } from '../../../core/battle'
import { type BattleView } from '../../../core/battleView'
import { savedRosterPrice } from '../../../server/functions'
import { savedRostersQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { type Side, sideName } from '../../sides'
import { tint } from '../battle/tints'
import { battleRoster, type SavedRoster } from './roster'

type Props = { view: BattleView; sides: Side[]; send: (command: Command) => void; pending: boolean }

/**
 * Every army on the table, grouped by the side that fields it.
 *
 * A player only ever changes their own list, but everyone sees every list as soon as
 * it is attached — that is what makes the step worth doing together.
 */
export function ArmiesStep({ view, sides, send, pending }: Props) {
  const [choosing, setChoosing] = useState(false)
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const yourSide = sides.find((side) => side.isViewer)
  const perArmy = view.settings.limit === null ? null : view.settings.limit / Math.max(1, yourSide?.armies.length ?? 1)
  const eligible = perArmy === null ? saved : saved.filter((roster) => roster.limit === perArmy)
  const attach = useMutation({
    mutationFn: async (savedRoster: SavedRoster) => {
      const priced = await savedRosterPrice({ data: { id: savedRoster.id } })
      if (!priced) throw new Error('That roster could not be loaded.')
      return battleRoster(savedRoster, priced)
    },
    onSuccess: (roster) => {
      // Cards are settled by the battle, not carried in with the list: attaching a roster starts them fresh.
      send({ kind: 'attach-roster', roster, prep: null })
      setChoosing(false)
    },
  })

  return (
    <div className="space-y-4">
      {perArmy !== null && perArmy !== view.settings.limit ? (
        <p className="rounded-sm border border-edge bg-sunken px-3 py-2 text-xs text-dim">
          The allied side splits {view.settings.limit} points evenly, so each ally brings a {perArmy}-point army.
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <section key={side.index} className={`space-y-2 rounded-sm border border-edge border-t-2 bg-panel p-3 ${tint(side.index).edge}`}>
            <p className={`text-sm font-bold uppercase ${tint(side.index).text}`}>{sideName(side)}</p>
            {side.armies.map((army) => (
              <article key={army.playerId} className="flex items-center gap-3 rounded-sm border border-edge bg-sunken p-2.5">
                <div className="min-w-0 flex-1">
                  {side.armies.length > 1 ? (
                    <span className="block text-[0.6875rem] font-semibold text-dim uppercase">{army.playerName}</span>
                  ) : null}
                  <span className="block truncate font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
                  <span className="mt-0.5 block text-xs text-dim">
                    {army.roster?.built?.units.length
                      ? `${army.roster.built.units.length} units · ${army.points} of ${army.roster.built.limit} points`
                      : army.roster
                        ? 'Imported army'
                        : 'Waiting for this player'}
                  </span>
                </div>
                {army.isViewer ? (
                  <Button variant="outline" size="sm" onClick={() => setChoosing(true)}>
                    {army.roster ? 'Change roster' : 'Choose roster'}
                  </Button>
                ) : (
                  <span className={`chip shrink-0 ${army.roster ? 'text-achieved' : 'text-dim'}`}>{army.roster ? 'Ready' : 'Waiting'}</span>
                )}
              </article>
            ))}
          </section>
        ))}
      </div>
      <RosterChooser
        open={choosing}
        onOpenChange={setChoosing}
        rosters={eligible}
        savedCount={saved.length}
        requiredLimit={perArmy}
        selectedName={yourSide?.armies.find((army) => army.isViewer)?.roster?.name}
        pending={pending || attach.isPending}
        onChoose={(roster) => attach.mutate(roster)}
        error={attach.error ? errorMessage(attach.error) : null}
      />
    </div>
  )
}

function RosterChooser({
  open,
  onOpenChange,
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
          <DialogTitle className="text-2xl uppercase">Choose your roster</DialogTitle>
          <DialogDescription className="text-dim">
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
                className="flex w-full items-center gap-3 border border-edge bg-sunken p-3 text-left hover:border-azure disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold uppercase">{roster.name}</span>
                  <span className="mt-1 block text-xs text-dim">
                    11th edition · {GAME_SIZES.find((size) => size.limit === roster.limit)?.name ?? `${roster.limit} points`} ·{' '}
                    {roster.picks.length} units
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="chip block">{roster.limit} pts</span>
                  {selectedName === roster.name ? <span className="mt-1 block text-xs text-achieved">Selected</span> : null}
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
