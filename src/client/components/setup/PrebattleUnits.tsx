import { attachedUnitList } from '../../../core/attachedUnits'
import type { Army, Side } from '../../sides'
import { HEADING } from '../battle/tints'
import { GROUPS } from '../builder/groups'
import { formationLabel, SetupSidePanel } from './chrome'

type Rule = 'infiltrators' | 'scouts'

/**
 * Every unit on the table carrying one pre-battle ability, side by side.
 *
 * Read twice with a different rule each time: Infiltrators is about where a unit is
 * set up, so it belongs to the deployment section, and Scouts is a move made after
 * both armies are down, so it belongs to the one after the first turn is settled.
 *
 * An attached unit is one unit and is listed once, carrying only what every part of
 * it carries — both these abilities ask that every model in the unit has them.
 */
export function PrebattleUnits({ sides, rule, empty }: { sides: Side[]; rule: Rule; empty: string }) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <SetupSidePanel key={side.index} side={side} className="space-y-3">
            {side.armies.map((army) => (
              <ArmyRules key={army.playerId} army={army} rule={rule} empty={empty} multiple={side.armies.length > 1} />
            ))}
          </SetupSidePanel>
        ))}
      </div>
    </>
  )
}

function ArmyRules({ army, rule, empty, multiple }: { army: Army; rule: Rule; empty: string; multiple: boolean }) {
  // A unit held back is not on the table to do any of this, and a character and the
  // unit he joined are one unit doing it together or not at all.
  const onTable = attachedUnitList(army.units).filter((unit) => unit.host.formation === 'battlefield')
  const carrying = onTable.filter((unit) => unit.prebattleRules.includes(rule))

  return (
    <article className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge pb-1">
        <span className="min-w-0">
          <span className="block break-words text-xs font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
          {multiple ? <span className="block text-[0.625rem] text-dim">{army.playerName}</span> : null}
        </span>
        <span className="chip shrink-0">{onTable.length} on the table</span>
      </div>
      {carrying.length ? (
        GROUPS.flatMap((group) => {
          const units = carrying.filter((unit) => (unit.host.group ?? 'other') === group.id)
          return units.length
            ? [
                <section key={group.id} className="space-y-1">
                  <p className={HEADING}>{group.plural}</p>
                  {units.map(({ host, joined }) => (
                    <div key={host.key} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-sunken px-2.5 py-1.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{host.name}</span>
                        {joined.length ? (
                          <span className="block text-[0.625rem] text-dim">
                            with {joined.map((character) => character.name).join(', ')}
                          </span>
                        ) : null}
                      </span>
                      <span className="chip shrink-0 border-discarded/60 text-discarded">{formationLabel(rule)}</span>
                    </div>
                  ))}
                </section>,
              ]
            : []
        })
      ) : (
        <p className="text-xs text-dim">{empty}</p>
      )}
    </article>
  )
}
