import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { DEFAULT_PLAYER_DEFAULTS } from '../../../core/playerDefaults'
import { playerDefaultsQuery } from '../../queries'
import { advanceOnboarding } from '../onboarding/onboarding'
import { EMPTY_SETUP } from './guestDraft'
import { useNewRoster } from './newRoster'
import { RosterSetupDialog, type RosterSetupFactionOption } from './RosterSetupDialog'

export function CreateRoster({ factionOptions }: { factionOptions: RosterSetupFactionOption[] }) {
  const [open, setOpen] = useState(false)
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery(playerDefaultsQuery())
  const initial = { ...EMPTY_SETUP, visibility: defaults.rosterVisibility, limit: defaults.battleSize }
  const create = useNewRoster()

  return (
    <>
      <Button
        data-onboarding="create-roster"
        onClick={() => {
          posthog.capture('roster_creation_started')
          advanceOnboarding('roster', 'roster-start', 'roster-faction')
          setOpen(true)
        }}
      >
        <Plus /> Create editable roster
      </Button>
      <RosterSetupDialog
        // The dialog reads its value once, so defaults that arrive later start it again.
        key={`${initial.visibility}-${initial.limit}`}
        mode="create"
        open={open}
        onOpenChange={setOpen}
        factionOptions={factionOptions}
        value={initial}
        hasUnits={false}
        pending={create.pending}
        onSave={(setup) => create.start(setup)}
      />
    </>
  )
}
