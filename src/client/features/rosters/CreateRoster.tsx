import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { DEFAULT_PLAYER_DEFAULTS } from '../../../core/playerDefaults'
import { playerDefaultsQuery } from '../../queries'
import { advanceOnboarding } from '../onboarding/onboarding'
import { EMPTY_SETUP } from './guestDraft'
import { useNewRoster } from './newRoster'
import { RosterSetupDialog, type RosterSetupFactionOption } from './RosterSetupDialog'
import type { MissionReference } from './rosterStart'

/**
 * `limit` starts the new list at a size the reader is filtering by, such as the one a sealed event asked for. `blocked`
 * replaces the setup for a visitor who already keeps their one list on this device. `starting` opens the setup once
 * the page knows whether this device keeps one, and `onStarted` then clears the request.
 */
export function CreateRoster({
  factionOptions,
  limit,
  blocked,
  starting,
  onStarted,
  reference: arrivingReference,
}: {
  factionOptions: RosterSetupFactionOption[]
  limit?: number
  blocked?: () => void
  starting?: boolean
  onStarted?: () => void
  reference?: MissionReference
}) {
  const [open, setOpen] = useState(false)
  const [reference, setReference] = useState<MissionReference>()
  const create = useNewRoster(reference)
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery({ ...playerDefaultsQuery(), enabled: !create.guest })
  const initial = { ...EMPTY_SETUP, visibility: defaults.rosterVisibility, limit: limit ?? defaults.battleSize }
  const started = (source?: MissionReference) => {
    posthog.capture('roster_creation_started', source ? { reference: source } : undefined)
    advanceOnboarding('roster', 'roster-start', 'roster-faction')
  }
  const begin = () => {
    if (blocked) return blocked()
    setReference(undefined)
    started()
    setOpen(true)
  }
  const arriving = Boolean(starting)
  const [arrivingFrom, setArrivingFrom] = useState(false)
  if (arriving !== arrivingFrom) {
    setArrivingFrom(arriving)
    if (arriving && !blocked) {
      setReference(arrivingReference)
      setOpen(true)
    }
  }
  const arrive = useEffectEvent(() => {
    onStarted?.()
    if (blocked) blocked()
    else started(arrivingReference)
  })
  useEffect(() => {
    if (arriving) arrive()
  }, [arriving])

  return (
    <>
      <Button data-onboarding="create-roster" onClick={begin}>
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
