import { Plus } from 'lucide-react'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { advanceOnboarding } from '../onboarding/onboarding'
import { SealedEventSettingsDialog } from './SealedEventSettingsDialog'

export function CreateSealedEvent() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        data-onboarding="create-sealed-event"
        onClick={() => {
          posthog.capture('sealed_event_creation_started')
          advanceOnboarding('league', 'sealed-event-start', 'sealed-event-name')
          setOpen(true)
        }}
      >
        <Plus /> New tournament
      </Button>
      <SealedEventSettingsDialog mode={{ kind: 'create' }} open={open} onOpenChange={setOpen} />
    </>
  )
}
