import { Label } from '@/components/ui/label'
import type { Seat } from '../seats'
import { PlayerAvatar } from './PlayerAvatar'
import { SearchableSelect, type SearchableGroup, type SearchableOption } from './SearchableSelect'

/** A player who may fill a seat. */
export type SeatCandidate = { id: string; name: string; image: string | null }

/** A candidate as a row in a seat's list: their disambiguated name and their picture. */
export function seatOption(candidate: SeatCandidate, labels: ReadonlyMap<string, string>): SearchableOption {
  return {
    label: labels.get(candidate.id) ?? candidate.name,
    value: candidate.id,
    icon: <PlayerAvatar name={candidate.name} image={candidate.image} className="size-6 text-[0.65rem]" />,
  }
}

/** What to call whoever is in a seat, or nothing while it is empty. */
export function seatLabel(id: string | null, labels: ReadonlyMap<string, string>, candidates: readonly SeatCandidate[]) {
  if (!id) return null
  return labels.get(id) ?? candidates.find((candidate) => candidate.id === id)?.name ?? 'Player'
}

/**
 * One row per seat a shape asks for.
 *
 * The caller says who may fill a seat, because that differs by surface — friends and
 * practice opponents when opening a battle by hand, entrants assigned a matching roster
 * size in a league. Who is already sitting somewhere is this component's business.
 */
export function SeatRows({
  idPrefix,
  seats,
  seatedIn,
  groupsFor,
  onPick,
}: {
  idPrefix: string
  seats: readonly Seat[]
  seatedIn: (seat: Seat) => string | null
  groupsFor: (seat: Seat, taken: ReadonlySet<string | null>) => SearchableGroup[]
  onPick: (seat: Seat, id: string) => void
}) {
  return (
    <div className="space-y-2">
      {seats.map((seat) => {
        // Nobody sits in two chairs, so a player picked elsewhere is not offered here.
        const taken = new Set(seats.filter((other) => other.id !== seat.id).map(seatedIn))
        return (
          <div key={seat.id}>
            <Label htmlFor={`${idPrefix}-${seat.id}`} className="eyebrow">
              {seat.label}
            </Label>
            <SearchableSelect
              id={`${idPrefix}-${seat.id}`}
              ariaLabel={seat.label}
              groups={groupsFor(seat, taken)}
              value={seatedIn(seat) ?? ''}
              onValueChange={(id) => onPick(seat, id)}
              placeholder={seat.placeholder}
              searchPlaceholder="Search players…"
              className="mt-1 h-11 rounded-none border-edge bg-sunken"
            />
          </div>
        )
      })}
    </div>
  )
}

/** The two sides the filled seats add up to, so nobody has to work out a 2v1 from three dropdowns. */
export function SeatMatchup({ seats, labelFor }: { seats: readonly Seat[]; labelFor: (seat: Seat) => string | null }) {
  const yours = ['You', ...seats.filter((seat) => seat.side === 'yours').map((seat) => labelFor(seat) ?? 'Choose ally')]
  const theirs = seats.filter((seat) => seat.side === 'theirs').map((seat) => labelFor(seat) ?? 'Choose opponent')

  return (
    <div aria-label="Battle matchup" aria-live="polite" className="border border-edge bg-sunken p-3">
      <p className="eyebrow mb-2">Matchup</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-sm">
        <div className="min-w-0">
          <span className="block text-[0.625rem] font-bold text-dim uppercase">Your side</span>
          <span className="block text-balance">{yours.join(' + ')}</span>
        </div>
        <span className="pt-3 text-[0.625rem] font-bold text-dim uppercase">vs</span>
        <div className="min-w-0 text-right">
          <span className="block text-[0.625rem] font-bold text-dim uppercase">Opposing side</span>
          <span className="block text-balance">{theirs.join(' + ')}</span>
        </div>
      </div>
    </div>
  )
}
