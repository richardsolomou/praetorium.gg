import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DEFAULT_PLAYER_DEFAULTS } from '../../../core/playerDefaults'
import { saveRoster } from '../../../server/functions'
import { invalidateSavedRosters, playerDefaultsQuery } from '../../queries'
import { advanceOnboarding } from '../onboarding/onboarding'
import { EMPTY_SETUP } from './guestDraft'
import { RosterSetupDialog, type RosterSetup, type RosterSetupFactionOption } from './RosterSetupDialog'

export function CreateRoster({ factionOptions }: { factionOptions: RosterSetupFactionOption[] }) {
  const [open, setOpen] = useState(false)
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery(playerDefaultsQuery())
  const initial = { ...EMPTY_SETUP, visibility: defaults.rosterVisibility, limit: defaults.battleSize }
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (setup: RosterSetup) =>
      saveRoster({
        data: {
          ...setup,
          picks: [],
          prep: null,
          source: 'editable',
        },
      }),
    onSuccess: async ({ id }) => {
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  return (
    <>
      <Button
        data-onboarding="create-roster"
        onClick={() => {
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
        pending={create.isPending}
        onSave={(setup) => create.mutate(setup)}
      />
    </>
  )
}
