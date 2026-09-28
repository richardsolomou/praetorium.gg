import { useEffect, useState } from 'react'
import { Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { alliedLeagueRosterLimit, type LeagueEntryStatus } from '../../../core/league'
import { TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchableSelect } from '../../components/SearchableSelect'
import { SeatMatchup, SeatRows, seatLabel, seatOption } from '../../components/Seats'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { errorMessage } from '../../queryClient'
import { seatedPlayers, seatsFor, type Seat } from '../../seats'
import { doublesTeams } from './leagueEvent'

/** One name for the button that starts a shape's battle and the dialog it opens. */
export function startBattleLabel(format: TableShape) {
  return `Start ${TABLE_SHAPE_LABELS[format].count} battle`
}

export function OneOnOneBattleChooser({
  open,
  ownUserId,
  entries,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  entries: { userId: string; name: string; image: string | null }[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (opponentId: string) => void
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setOpponentId(null)
  }, [open])
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const options = entries
    .filter((entry) => entry.userId !== ownUserId)
    .map((entry) => ({
      label: labels.get(entry.userId) ?? entry.name,
      value: entry.userId,
      icon: <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-3xs" />,
    }))
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{startBattleLabel('1v1')}</DialogTitle>
          <DialogDescription>Pick who you are playing. Both sealed lists are added for you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="league-opponent">Opponent</Label>
          <SearchableSelect
            id="league-opponent"
            className="h-11"
            groups={[{ label: '', items: options }]}
            value={opponentId ?? ''}
            onValueChange={(id) => {
              onIntentChange()
              setOpponentId(id)
            }}
            placeholder="Choose an opponent"
            searchPlaceholder="Search entrants…"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!opponentId || pending} onClick={() => opponentId && onStart(opponentId)}>
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LeagueBattleChooser({
  open,
  ownUserId,
  ownRequiredLimit,
  rosterLimit,
  entries,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  ownRequiredLimit: number | null
  rosterLimit: number
  entries: { userId: string; name: string; image: string | null; requiredLimit: number | null }[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) => void
}) {
  const [theirIds, setTheirIds] = useState<(string | null)[]>([null, null])
  const [allyId, setAllyId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) {
      setTheirIds([null, null])
      setAllyId(null)
    }
  }, [open])
  const alliedLimit = alliedLeagueRosterLimit(rosterLimit)
  // The organizer's roster assignment already says which side of the table this entrant is on.
  const isSolo = ownRequiredLimit === rosterLimit
  const seats = seatsFor('2v1', isSolo ? 'solo' : 'pair')
  const seatedIn = (seat: Seat) => (seat.side === 'yours' ? allyId : (theirIds[seat.at] ?? null))
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const candidates = entries.map((entry) => ({
    id: entry.userId,
    name: entry.name,
    image: entry.image,
    requiredLimit: entry.requiredLimit,
  }))
  // An ally seat is filled by an entrant assigned the allied size; the solo seat of a
  // pair's opponent by one assigned the full size. A seat nobody can fill offers nobody.
  const groupsFor = (seat: Seat, taken: ReadonlySet<string | null>) => {
    const wantsSolo = seat.side === 'theirs' && !isSolo
    const label = wantsSolo ? 'Solo entrants' : 'Allied entrants'
    const items = candidates
      .filter((entry) => entry.id !== ownUserId && !taken.has(entry.id))
      .filter((entry) => entry.requiredLimit === (wantsSolo ? rosterLimit : alliedLimit))
      .map((entry) => seatOption(entry, labels))
    return items.length ? [{ label, items }] : []
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent aria-busy={pending} className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">{startBattleLabel('2v1')}</DialogTitle>
          <DialogDescription>
            {isSolo ? 'Pick the two allied entrants you are facing.' : 'Pick your teammate and the solo entrant you are facing.'}
          </DialogDescription>
        </DialogHeader>
        <SeatRows
          idPrefix="league-battle"
          seats={seats}
          seatedIn={seatedIn}
          groupsFor={groupsFor}
          onPick={(seat, id) => {
            onIntentChange()
            if (seat.side === 'yours') return setAllyId(id)
            setTheirIds((current) => current.map((held, at) => (at === seat.at ? id : held)))
          }}
        />
        <SeatMatchup seats={seats} labelFor={(seat) => seatLabel(seatedIn(seat), labels, candidates)} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        {pending ? <output className="sr-only">Starting battle…</output> : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!seats.every(seatedIn) || pending}
            onClick={() => {
              const players = seatedPlayers(seats, seatedIn)
              const [opponentId, secondOpponentId] = players.opponentIds
              if (!opponentId) return
              onStart(players.allyId ? { opponentId, allyId: players.allyId } : { opponentId, secondOpponentId })
            }}
          >
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DoublesBattleChooser({
  open,
  ownUserId,
  entries,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  entries: DoublesEntrant[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (opponentId: string) => void
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setOpponentId(null)
  }, [open])
  const ownTeamId = entries.find((entry) => entry.userId === ownUserId)?.teamId
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const options = doublesTeams(entries)
    .filter((team) => team.id !== ownTeamId && team.members.length === 2 && team.members.every((entry) => entry.submitted))
    .map((team) => ({
      label: team.members.map((entry) => labels.get(entry.userId) ?? entry.name).join(' & '),
      value: team.members[0]!.userId,
      icon: (
        <span className="flex shrink-0 -space-x-2">
          {team.members.map((entry) => (
            <PlayerAvatar key={entry.userId} name={entry.name} image={entry.image} className="size-6 border-2 border-panel text-3xs" />
          ))}
        </span>
      ),
    }))
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent aria-busy={pending} className="max-h-[85dvh] overflow-x-hidden overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-2xl">{startBattleLabel('2v2')}</DialogTitle>
          <DialogDescription>Pick the team you are playing. Your teammate and all four sealed lists are added for you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="league-doubles-opponents">Opposing team</Label>
          <SearchableSelect
            id="league-doubles-opponents"
            className="h-11"
            groups={[{ label: '', items: options }]}
            value={opponentId ?? ''}
            onValueChange={(id) => {
              onIntentChange()
              setOpponentId(id)
            }}
            placeholder="Choose an opposing team"
            searchPlaceholder="Search teams or entrants…"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        {pending ? <output className="sr-only">Starting doubles battle…</output> : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!opponentId || pending} onClick={() => opponentId && onStart(opponentId)}>
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type DoublesEntrant = {
  userId: string
  name: string
  image: string | null
  status: LeagueEntryStatus
  teamId: string | null
  submitted: boolean
}
