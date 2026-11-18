import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { listUnitCount } from '../../../core/attachedUnits'
import { factionIndexQuery, meQuery } from '../../queries'
import { useStoredValue, writeStoredValue } from '../../storedValue'
import { countLabel } from '../../text'
import { useClientValue } from '../../useClientValue'
import { peekGuestDraft } from './guestDraft'

/** The id of the draft whose prompt the visitor closed, so a later draft is offered again. */
const DISMISSED_KEY = 'praetorium.guest-draft-prompt-dismissed'

export type GuestDraftSurface = 'home' | 'faction' | 'datasheet' | 'detachment'

/** A visitor's way back to the list this browser keeps for them, which otherwise only the rosters page shows. */
export function ContinueGuestDraft({ surface, className }: { surface: GuestDraftSurface; className?: string }) {
  const { data: me, isPending } = useQuery(meQuery())
  const guest = useClientValue(peekGuestDraft, null)
  const dismissed = useStoredValue(DISMISSED_KEY)
  const shown = !isPending && !me && guest !== null && dismissed !== guest.id
  const { data: index } = useQuery({ ...factionIndexQuery(), enabled: shown })
  useEffect(() => {
    if (shown) posthog.capture('guest_roster_prompt_shown', { surface })
  }, [shown, surface])
  if (!shown) return null
  const faction = index?.factions.find((entry) => entry.id === guest.draft.catalogueId)?.displayName
  const units = listUnitCount(guest.draft.picks)
  return (
    <div className={cn('flex items-center part pr-1 transition-colors hover:border-runner hover:bg-raised', className)}>
      <Link
        to="/rosters/$id"
        params={{ id: guest.id }}
        onClick={() => posthog.capture('guest_roster_prompt_followed', { surface })}
        className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2 pr-1 pl-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{faction ? `Continue your ${faction} list` : 'Continue your list'}</span>
          <span className="block text-xs text-dim">{`${countLabel(units, 'unit')} · not saved yet`}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
      </Link>
      <Button size="icon-sm" variant="ghost" aria-label="Hide this reminder" onClick={() => writeStoredValue(DISMISSED_KEY, guest.id)}>
        <X aria-hidden />
      </Button>
    </div>
  )
}
