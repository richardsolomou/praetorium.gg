import { Button } from '@/components/ui/button'
import { type BattleView, type Command, UNIT_FORMATIONS } from '../../../core/battle'
import type { Side } from '../../sides'
import { sideName } from '../../sides'
import { HEADING, tint } from '../battle/tints'
import { Prep } from '../Prep'

type Props = { view: BattleView; sides: Side[]; missionId: string | null; send: (command: Command) => void; pending: boolean }

/** Where every unit starts, and the one card decision each side actually makes. */
export function PreBattleStep({ view, sides, missionId, send, pending }: Props) {
  const yours = sides.find((side) => side.isViewer)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <section key={side.index} className={`space-y-3 rounded-sm border border-edge border-t-2 bg-panel p-3 ${tint(side.index).edge}`}>
            <p className={`text-sm font-bold uppercase ${tint(side.index).text}`}>{sideName(side)}</p>
            {side.armies.map((army) => (
              <article key={army.playerId} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2 border-b border-edge pb-1">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
                    {side.armies.length > 1 ? <span className="block text-[0.625rem] text-dim">{army.playerName}</span> : null}
                  </span>
                  <span className="chip shrink-0">{army.units.length} units</span>
                </div>
                {army.units.map((unit) => (
                  <div key={unit.key} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-sunken px-2.5 py-1.5">
                    <span className="min-w-0">
                      <span className="text-sm font-semibold">{unit.name}</span>
                      {unit.prebattleRules?.length ? (
                        <span className="mt-0.5 block text-[0.625rem] text-azure uppercase">{unit.prebattleRules.join(' · ')}</span>
                      ) : null}
                    </span>
                    {army.isViewer ? (
                      <div className="flex flex-wrap gap-1">
                        {UNIT_FORMATIONS.filter(
                          (formation) =>
                            formation === 'battlefield' || formation === 'strategic-reserves' || unit.formationOptions?.includes(formation),
                        ).map((formation) => (
                          <Button
                            key={formation}
                            variant={unit.formation === formation ? 'default' : 'outline'}
                            size="xs"
                            disabled={pending}
                            onClick={() => send({ kind: 'set-unit-formation', unitKey: unit.key, formation })}
                          >
                            {formation.replaceAll('-', ' ')}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <span className="chip shrink-0">{unit.formation.replaceAll('-', ' ')}</span>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={army.painted ? 'text-achieved' : 'text-dim'}>
                    {army.painted ? 'Battle ready · +10 VP' : 'No battle ready bonus'}
                  </span>
                  {army.isViewer ? (
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
              </article>
            ))}
          </section>
        ))}
      </div>

      <section className="space-y-3 rounded-sm border border-edge bg-panel p-3">
        <div>
          <p className={HEADING}>{yours && yours.armies.length > 1 ? 'Shared by your side' : 'Your cards'}</p>
          <h3 className="mt-0.5 text-lg">Cards and stratagems</h3>
          <p className="mt-1 text-sm text-dim">
            {yours && yours.armies.length > 1
              ? 'You and your ally play one hand of mission cards, one set of stratagems, and one pool of command points.'
              : 'Your mission cards and stratagems come from your detachment. Only how the secondaries are drawn is a choice.'}
          </p>
        </div>
        <Prep view={view} missionId={missionId} send={send} pending={pending} />
      </section>
    </div>
  )
}
