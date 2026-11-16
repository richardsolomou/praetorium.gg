import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { dispositionsFor, dispositionTone } from '../../components/rosterSetup'
import { factionQuery } from '../../queries'
import { ChoiceMark } from '../rosters/RosterSetupDialog'
import type { SavedRoster } from '../rosters/rosterLibrary'

type Card = { id: string; name: string }

/**
 * Seals a list, first asking which Force Disposition it plays when it takes the table alone, names no card, and its
 * detachments offer several: an event fixes that card at sealing, before the reveal shows anyone the other lists.
 */
export function useSealDisposition(playsAlone: boolean, seal: (rosterId: string, disposition?: string) => void) {
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState<{ roster: SavedRoster; cards: Card[] } | null>(null)
  const [picked, setPicked] = useState<string | null>(null)

  const choose = async (roster: SavedRoster) => {
    if (!playsAlone) return seal(roster.id)
    const faction = await queryClient.query(factionQuery(roster.catalogueId)).catch(() => null)
    const ids = [...roster.detachmentIds, ...(roster.borrowedDetachmentId ? [roster.borrowedDetachmentId] : [])]
    const cards = dispositionsFor(faction?.detachments ?? [], ids)
    if (cards.length < 2 || cards.some((card) => card.id === roster.disposition)) return seal(roster.id)
    setPicked(null)
    setAsking({ roster, cards })
  }

  const dialog = (
    <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Choose your Force Disposition</AlertDialogTitle>
          <AlertDialogDescription>
            {asking?.roster.name} offers more than one. You play the one you seal for every game of this event.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Force Disposition</legend>
          {asking?.cards.map((card) => {
            const chosen = picked === card.id
            return (
              <button
                key={card.id}
                type="button"
                aria-pressed={chosen}
                onClick={() => setPicked(card.id)}
                className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 text-left transition-colors ${chosen ? 'border-parchment bg-parchment/6 inset-ring-1 inset-ring-parchment' : 'border-edge bg-sunken hover:border-runner-hi'}`}
              >
                <ChoiceMark chosen={chosen} />
                <span className={`chip ${dispositionTone(card.id)}`}>{card.name}</span>
              </button>
            )
          })}
        </fieldset>
        <AlertDialogFooter>
          <AlertDialogCancel>Choose another</AlertDialogCancel>
          <AlertDialogAction
            disabled={!picked}
            onClick={() => {
              if (asking && picked) seal(asking.roster.id, picked)
              setAsking(null)
            }}
          >
            Seal roster
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { choose, dialog }
}
