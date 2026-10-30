import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { meQuery } from '../../queries'
import { ClaimGuestRoster, GuestRoster, useGuestDraft } from './GuestRoster'
import { RosterLoading } from './RosterLoading'
import type { useRequestedDatasheet } from './requestedDatasheet'

/** A list the server cannot see because it is still only in this browser's storage, so the browser loads the route again. */
export function DeviceRoster() {
  const router = useRouter()
  useEffect(() => {
    void router.invalidate({ filter: (match) => match.routeId === '/rosters/$id/' })
  }, [router])
  return <RosterLoading />
}

/** A visitor's one list, built here; once they sign in, it is saved to the account under this same address. */
export function GuestDraftRoster({ print, requested }: { print?: boolean; requested?: ReturnType<typeof useRequestedDatasheet> }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const [{ guest, revision }, setGuest] = useGuestDraft(true)
  // Discarded here or in another tab, the list is gone, so the rosters page is where the visitor goes.
  useEffect(() => {
    if (!guest) void navigate({ to: '/rosters', replace: true })
  }, [guest, navigate])
  if (!guest) return <RosterLoading />
  if (me) return <ClaimGuestRoster key={guest.id} guest={guest} onDiscard={() => setGuest(null)} />
  return <GuestRoster key={revision} guest={guest} print={print} requested={requested} onDiscard={() => setGuest(null)} />
}
