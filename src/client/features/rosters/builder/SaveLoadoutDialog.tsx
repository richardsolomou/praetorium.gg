import type { ComponentProps } from 'react'
import { attachedHost } from '../../../../core/attachedUnits'
import { joinedUnits, loadoutOf, UNIT_LOADOUT_NAME_MAX_LENGTH } from '../../../../core/unitLoadouts'
import { nicknamedUnit } from '../../../../core/unitNotes'
import type { KeyedPick } from '../rosterPicks'
import { AttachedUnitBlock } from './AttachedUnitBlock'
import { LoadoutNameDialog } from './LoadoutNameDialog'
import { UnitCard } from './UnitCard'
import { useUnitLoadouts } from './useUnitLoadouts'

type Unit = ComponentProps<typeof UnitCard>['unit'] & { choices: readonly { key: string; kind?: 'enhancement' | 'upgrade' }[] }

type Props = {
  picks: readonly KeyedPick[]
  /** The priced units, in the same order as `picks`. */
  units: readonly (Unit | undefined)[]
  index: number
  /** Saves the whole attached unit the picked unit stands in, rather than the unit alone. */
  whole: boolean
  catalogueId: string
  onClose: () => void
}

export function SaveLoadoutDialog({ picks, units, index, whole, catalogueId, onClose }: Props) {
  const { save } = useUnitLoadouts(false)
  const pick = picks[index]
  if (!pick) return null
  const group = whole ? [attachedHost(picks, pick), ...joinedUnits(picks, pick.key, catalogueId)] : [pick]
  const unitOf = (unit: KeyedPick) => units[picks.indexOf(unit)]
  const loadout = loadoutOf(
    group.map((unit) => ({ pick: unit, unit: unitOf(unit) })),
    catalogueId,
  )
  const name = group
    .map((unit) => nicknamedUnit(unitOf(unit)?.name ?? '', unit.nickname))
    .join(' + ')
    .slice(0, UNIT_LOADOUT_NAME_MAX_LENGTH)
  // Shows only what the save keeps: enhancements, upgrades and notes stay in the roster.
  const card = (unit: KeyedPick) => {
    const built = unitOf(unit)
    return built ? (
      <UnitCard
        key={unit.key}
        unit={{ ...built, enhancements: [], upgrades: [] }}
        nickname={unit.nickname}
        selected={false}
        editable={false}
      />
    ) : null
  }
  const [host, ...rest] = group
  const noun = whole ? 'attached unit' : 'loadout'
  return (
    <LoadoutNameDialog
      title={`Save ${noun}`}
      description={
        whole
          ? 'Keeps these units with their model counts, wargear and custom names, so you can add them already attached to any roster of this army. Enhancements, Warlord and notes stay in this roster.'
          : 'Keeps this unit’s model count, wargear and custom name so you can add it to any roster of this army. Enhancements, Warlord, notes and attachments stay in this roster.'
      }
      initialName={name}
      submit={`Save ${noun}`}
      pendingLabel="Saving…"
      accepts={() => loadout !== null}
      pending={save.isPending}
      error={save.error}
      onSubmit={(chosen) => loadout && save.mutate({ ...loadout, name: chosen }, { onSuccess: onClose })}
      onClose={onClose}
    >
      {host ? (
        <div data-saving-preview className="pointer-events-none mb-3">
          {rest.length ? (
            <AttachedUnitBlock name={unitOf(host)?.name ?? ''} nickname={host.nickname} bodyguard={card(host)}>
              {rest.map(card)}
            </AttachedUnitBlock>
          ) : (
            card(host)
          )}
        </div>
      ) : null}
    </LoadoutNameDialog>
  )
}
