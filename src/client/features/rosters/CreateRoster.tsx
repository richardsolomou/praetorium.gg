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

/**
 * `limit` starts the new list at a size the reader is filtering by, such as the one a league asked for. `blocked`
 * replaces the setup for a visitor who already keeps their one list on this device.
 */
export function CreateRoster({
  factionOptions,
  limit,
  blocked,
}: {
  factionOptions: RosterSetupFactionOption[]
  limit?: number
  blocked?: () => void
}) {
  const [open, setOpen] = useState(false)
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery(playerDefaultsQuery())
  const initial = { ...EMPTY_SETUP, visibility: defaults.rosterVisibility, limit: limit ?? defaults.battleSize }
  const create = useNewRoster()

  return (
    <>
      <Button
        data-onboarding="create-roster"
        onClick={() => {
          if (blocked) return blocked()
          posthog.capture('roster_creation_started')
          advanceOnboarding('roster', 'roster-start', 'roster-faction')
          setOpen(true)
        }}
      >
        <Plus /> New roster
      </Button>
      <RosterSetupDialog
        // The dialog reads its value once, so defaults that arrive later start it again.
        key={`${initial.visibility}-${initial.limit}`}
        mode="create"
        guest={create.guest}
        open={open}
        onOpenChange={setOpen}
        factionOptions={factionOptions}
        value={initial}
        hasUnits={false}
        pending={create.pending}
        saveError={create.saveError}
        onSave={(setup) => create.start(setup)}
      />
    </>
  )
}
