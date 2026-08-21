import { Button } from '@/components/ui/button'
import { type Command, UNIT_FORMATIONS } from '../../../core/battle'
import { type BattleView } from '../../../core/battleView'
import type { Army, Side } from '../../sides'
import { sideName } from '../../sides'
import { HEADING, tint } from '../battle/tints'
import { Prep } from '../Prep'

type Props = { view: BattleView; sides: Side[]; missionId: string | null; send: (command: Command) => void; pending: boolean }

/** Where every unit starts, and the one card decision each side actually makes. */
export function PreBattleStep({ view, sides, missionId, send, pending }: Props) {
  const yours = sides.find((side) => side.isViewer)

  return (
    <div className="space-y-4">
      {/* Setting the table is often done from one device, so nobody has to hand a phone across it. */}
      <p className="rounded-sm border border-edge bg-sunken px-3 py-2 text-xs text-dim">
        Anyone at the table can set reserves and the battle ready bonus for any army while the table is being set.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <section key={side.index} className={`space-y-3 rounded-sm border border-edge border-t-2 bg-panel p-3 ${tint(side.index).edge}`}>
            <p className={`text-sm font-bold uppercase ${tint(side.index).text}`}>{sideName(side)}</p>
            {side.armies.map((army) => (
              <ArmySetup key={army.playerId} army={army} multiple={side.armies.length > 1} send={send} />
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

function ArmySetup({ army, multiple, send }: { army: Army; multiple: boolean; send: (command: Command) => void }) {
  return (
    <article className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge pb-1">
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
          {multiple ? <span className="block text-[0.625rem] text-dim">{army.playerName}</span> : null}
        </span>
        <span className="chip shrink-0">{army.units.length} units</span>
      </div>
      {army.units.map((unit) => (
        <div key={unit.key} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-sunken px-2.5 py-1.5">
          <span className="min-w-0">
            <span className="text-sm font-semibold">{unit.name}</span>
            {unit.prebattleRules?.length ? (
              <span className="mt-0.5 block text-[0.625rem] text-discarded uppercase">
                {unit.prebattleRules.map(formationLabel).join(' · ')}
              </span>
            ) : null}
          </span>
          <div className="flex flex-wrap gap-1">
            {UNIT_FORMATIONS.filter(
              (formation) =>
                formation === 'battlefield' || formation === 'strategic-reserves' || unit.formationOptions?.includes(formation),
            ).map((formation) => (
              <Button
                key={formation}
                variant={unit.formation === formation ? 'default' : 'outline'}
                size="xs"
                aria-label={`Start ${unit.name} in ${formationLabel(formation)}`}
                onClick={() => send({ kind: 'set-unit-formation', unitKey: unit.key, formation, playerId: army.playerId })}
              >
                {formationLabel(formation)}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={army.painted ? 'text-achieved' : 'text-dim'}>
          {army.painted ? `Battle ready · +${army.paintedPoints} VP at the end of the battle` : 'No battle ready bonus'}
        </span>
        <Button
          variant={army.painted ? 'default' : 'outline'}
          size="xs"
          aria-label={`${army.painted ? 'Remove' : 'Add'} the battle ready bonus for ${army.roster?.name ?? army.playerName}`}
          onClick={() => send({ kind: 'set-painted', painted: !army.painted, playerId: army.playerId })}
        >
          {army.painted ? 'Remove' : 'Add'} bonus
        </Button>
      </div>
    </article>
  )
}

/** The data stores these hyphenated and lower case; every other name on screen is written out. */
const formationLabel = (value: string) => {
  const words = value.replaceAll('-', ' ')
  return words.charAt(0).toLocaleUpperCase() + words.slice(1)
}
