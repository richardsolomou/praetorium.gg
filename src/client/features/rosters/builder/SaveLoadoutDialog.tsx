import type { RosterPick } from '../../../../core/roster'
import { loadoutOf } from '../../../../core/unitLoadouts'
import { LoadoutNameDialog } from './LoadoutNameDialog'
import { useUnitLoadouts } from './useUnitLoadouts'

type Props = {
  pick: RosterPick
  unit: { name: string; choices: readonly { key: string; kind?: 'enhancement' | 'upgrade' }[] }
  catalogueId: string
  onClose: () => void
}

export function SaveLoadoutDialog({ pick, unit, catalogueId, onClose }: Props) {
  const { save } = useUnitLoadouts(false)
  const loadout = loadoutOf(pick, catalogueId, unit)
  return (
    <LoadoutNameDialog
      title="Save loadout"
      description="Keeps this unit’s model count, wargear and custom name so you can add it to any roster of this army. Its note, Warlord, enhancement, detachment upgrade and attachment stay in this roster."
      initialName={unit.name}
      submit="Save loadout"
      pendingLabel="Saving…"
      accepts={() => loadout !== null}
      pending={save.isPending}
      error={save.error}
      onSubmit={(name) => loadout && save.mutate({ ...loadout, name }, { onSuccess: onClose })}
      onClose={onClose}
    />
  )
}
