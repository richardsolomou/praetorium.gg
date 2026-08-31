import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DEFAULT_GAME_LIMIT } from '../../core/battle'
import { saveRoster } from '../../server/functions'
import { invalidateSavedRosters } from '../queries'
import { RosterSetupDialog, type RosterSetup, type RosterSetupFactionOption } from './RosterSetupDialog'

const EMPTY_SETUP: RosterSetup = {
  name: '',
  catalogueId: '',
  detachmentIds: [],
  disposition: null,
  limit: DEFAULT_GAME_LIMIT,
  waivedRules: [],
  visibility: 'private',
}

export function CreateRoster({ factionOptions }: { factionOptions: RosterSetupFactionOption[] }) {
  const [open, setOpen] = useState(false)
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
      <Button onClick={() => setOpen(true)}>
        <Plus /> Create editable roster
      </Button>
      <RosterSetupDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
        factionOptions={factionOptions}
        value={EMPTY_SETUP}
        hasUnits={false}
        pending={create.isPending}
        onSave={(setup) => create.mutate(setup)}
      />
    </>
  )
}
