import { Plus } from 'lucide-react'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { advanceOnboarding } from '../onboarding/onboarding'
import { LeagueSettingsDialog } from './LeagueSettingsDialog'

export function CreateLeague({ source }: { source?: 'sample' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        data-onboarding="create-league"
        onClick={() => {
          posthog.capture('league_creation_started', { source })
          advanceOnboarding('league', 'league-start', 'league-name')
          setOpen(true)
        }}
      >
        <Plus /> New league
      </Button>
      <LeagueSettingsDialog mode={{ kind: 'create', source }} open={open} onOpenChange={setOpen} />
    </>
  )
}
