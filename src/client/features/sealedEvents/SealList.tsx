import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { submitSealedEventRoster } from '../../functions'
import { afterPaint } from '../../afterPaint'
import { useSealDisposition } from './SealDisposition'
import { RosterChooser } from './SealedEventRosterChooser'

/**
 * Sealing a list into a group's game or league: choosing a saved roster, then the Force Disposition a list that takes the
 * table alone plays, then sealing it. `playsAlone` holds before the first seal too, since that seal is what enters a member.
 */
export function useSealList({
  token,
  playsAlone,
  requiredLimit,
  pointsBudget,
  seatPoints = null,
  shared = false,
  onSealed,
}: {
  token: string
  playsAlone: boolean
  requiredLimit: number | null
  pointsBudget: number | null
  seatPoints?: number | null
  shared?: boolean
  onSealed: () => Promise<unknown>
}) {
  const [choosing, setChoosing] = useState(false)
  const seal = useMutation({
    mutationFn: async ({ rosterId, disposition }: { rosterId: string; disposition?: string }) => {
      await afterPaint()
      return submitSealedEventRoster({ data: { token, rosterId, disposition } })
    },
    onSuccess: async () => {
      setChoosing(false)
      await onSealed()
    },
  })
  const card = useSealDisposition(playsAlone, (rosterId, disposition) => seal.mutate({ rosterId, disposition }))
  const element = (
    <>
      <RosterChooser
        open={choosing}
        pending={seal.isPending}
        error={seal.error}
        failedRosterId={seal.variables?.rosterId ?? null}
        requiredLimit={requiredLimit}
        pointsBudget={pointsBudget}
        seatPoints={seatPoints}
        shared={shared}
        onClose={() => !seal.isPending && setChoosing(false)}
        onChoose={(roster) => void card.choose(roster)}
      />
      {card.dialog}
    </>
  )
  return { open: () => (seal.reset(), setChoosing(true)), element }
}
