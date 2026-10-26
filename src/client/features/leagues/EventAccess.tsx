import { Link } from '@tanstack/react-router'
import { Eye, LockKeyhole } from 'lucide-react'
import type { LeagueAdmission, LeagueVisibility } from '../../../core/league'
import { PlayerAvatar } from '../../components/PlayerAvatar'

/** Who can find a league or club. A card labels the icon; a page header already says it in words beside it. */
export function VisibilityIcon({ visibility, labelled = false }: { visibility: LeagueVisibility; labelled?: boolean }) {
  if (!labelled)
    return visibility === 'private' ? <LockKeyhole className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />
  return visibility === 'private' ? (
    <LockKeyhole className="size-3.5 shrink-0" aria-label="Private" />
  ) : (
    <Eye className="size-3.5 shrink-0 text-info" aria-label="Public" />
  )
}

export const admissionLabel = (admission: LeagueAdmission) => (admission === 'approval' ? 'Approval required' : 'Anyone can join')

export const accessSummary = (visibility: LeagueVisibility, admission: LeagueAdmission) =>
  `${visibility === 'private' ? 'Private link' : 'Public'} · ${admissionLabel(admission)}`

/** The people running a league or club, each linking to their profile. */
export function OrganizerLinks({
  title,
  organizers,
}: {
  title: string
  organizers: readonly { id: string; name: string; image: string | null }[]
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dim">
      <span>{title}</span>
      {organizers.map((organizer) => (
        <Link key={organizer.id} to="/users/$userId" params={{ userId: organizer.id }} className="group flex w-fit items-center gap-2">
          <PlayerAvatar name={organizer.name} image={organizer.image} className="size-7 text-3xs" />
          <span className="text-bone group-hover:underline">{organizer.name}</span>
        </Link>
      ))}
    </div>
  )
}
