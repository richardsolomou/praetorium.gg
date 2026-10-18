import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RosterPick } from '../../../../core/roster'
import { loadoutOf, UNIT_LOADOUT_NAME_MAX_LENGTH } from '../../../../core/unitLoadouts'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/Dialog'
import { Problem } from '../../../components/Problem'
import { useUnitLoadouts } from './useUnitLoadouts'

type Props = {
  pick: RosterPick
  unit: { name: string; choices: readonly { key: string; kind?: 'enhancement' | 'upgrade' }[] }
  catalogueId: string
  onClose: () => void
}

export function SaveLoadoutDialog({ pick, unit, catalogueId, onClose }: Props) {
  const id = useId()
  const [name, setName] = useState(unit.name)
  const { save } = useUnitLoadouts(false)
  const loadout = loadoutOf(pick, catalogueId, unit)
  const trimmed = name.trim()
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Save loadout</DialogTitle>
          <DialogDescription>
            Keeps this unit’s model count and wargear so you can add it to any roster of this army. Its note, Warlord, enhancement,
            detachment upgrade and attachment stay in this roster.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id={`${id}-form`}
            onSubmit={(event) => {
              event.preventDefault()
              if (loadout && trimmed) save.mutate({ ...loadout, name: trimmed }, { onSuccess: onClose })
            }}
          >
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              className="mt-1.5"
              value={name}
              maxLength={UNIT_LOADOUT_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </form>
          {save.error ? <Problem className="mt-2 text-xs" error={save.error} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!loadout || !trimmed || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save loadout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
