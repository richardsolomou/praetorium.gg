import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, EllipsisVertical, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { SignInRequired } from '../../components/SignInRequired'
import { useDateFormatting } from '../../dates'
import { deleteJournalEvent, deleteJournalGame } from '../../functions'
import { factionIndexQuery, journalQuery, meQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { journalTotals, type JournalResult, type JournalTotals } from '../../../core/gameJournal'
import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'
import { JournalEventDialog } from './JournalEventDialog'
import { JournalGameDialog, type JournalGame } from './JournalGameDialog'

type JournalEvent = { id: string; name: string }
type Editing = { kind: 'game'; game: JournalGame | null; eventId: string | null } | { kind: 'event'; event: JournalEvent | null }
type Deleting = { kind: 'game'; game: JournalGame } | { kind: 'event'; event: JournalEvent; games: number }

const RESULT_LABEL: Record<JournalResult, string> = { won: 'Win', drawn: 'Draw', lost: 'Loss' }
const RESULT_TONE: Record<JournalResult, string> = { won: 'text-achieved', drawn: 'text-bone', lost: 'text-discarded' }

export function JournalPage() {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const journal = useQuery({ ...journalQuery(), enabled: Boolean(me) })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<Deleting | null>(null)
  const remove = useMutation({
    mutationFn: (target: Deleting) =>
      target.kind === 'game' ? deleteJournalGame({ data: { id: target.game.id } }) : deleteJournalEvent({ data: { id: target.event.id } }),
    onSuccess: async () => {
      setDeleting(null)
      await queryClient.invalidateQueries({ queryKey: journalQuery().queryKey })
    },
  })

  if (!me) return <SignInRequired title="Game journal" explanation="Sign in to record games you played away from Praetorium." />

  const events = journal.data?.events ?? []
  const games = journal.data?.games ?? []
  const loose = games.filter((game) => !game.eventId || !events.some((event) => event.id === game.eventId))

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Your games"
        title="Game journal"
        description="Games you played away from Praetorium, grouped by the events they were part of."
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => setEditing({ kind: 'event', event: null })}>
              <CalendarPlus /> Add an event
            </Button>
            <Button size="lg" onClick={() => setEditing({ kind: 'game', game: null, eventId: null })}>
              <Plus /> Record a game
            </Button>
          </>
        }
      />
      <PageContent className="space-y-6">
        <p className="border border-edge bg-sunken p-3 text-sm text-dim" data-journal-provenance>
          These are self-reported. Only you can see your journal, and its games never count toward your service record, the leaderboard, or
          ratings, which only use battles both players recorded in Praetorium.
        </p>
        {journal.isError ? (
          <PageState
            headingLevel={2}
            eyebrow="Game journal"
            title="Could not load your journal"
            explanation="Your journal could not be loaded. Try again."
            action={
              <Button variant="outline" disabled={journal.isFetching} onClick={() => void journal.refetch()}>
                Try again
              </Button>
            }
          />
        ) : journal.isPending ? (
          <output className="block text-sm text-dim">Loading your journal…</output>
        ) : !games.length && !events.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Game journal"
            icon={NotebookPen}
            title="No games recorded"
            explanation="Record a game you played at a club, a tournament or a friend’s table to keep your results in one place."
            action={<Button onClick={() => setEditing({ kind: 'game', game: null, eventId: null })}>Record a game</Button>}
          />
        ) : (
          <>
            <Totals totals={journalTotals(games)} label="All games" />
            {events.map((event) => {
              const eventGames = games.filter((game) => game.eventId === event.id)
              return (
                <section key={event.id} aria-label={event.name} data-journal-event className="space-y-2">
                  <div className="rubric flex items-baseline gap-3 border-b border-edge pb-2">
                    <span className="mr-auto break-words">{event.name}</span>
                    <span className="readout">{eventGames.length}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${event.name}`} />}>
                        <EllipsisVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing({ kind: 'game', game: null, eventId: event.id })}>
                          <Plus /> Record a game here
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditing({ kind: 'event', event })}>
                          <Pencil /> Rename event
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting({ kind: 'event', event, games: eventGames.length })}
                        >
                          <Trash2 /> Delete event
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {eventGames.length ? (
                    <>
                      <Totals totals={journalTotals(eventGames)} label={`${event.name} totals`} compact />
                      <GameList
                        games={eventGames}
                        onEdit={(game) => setEditing({ kind: 'game', game, eventId: null })}
                        onDelete={(game) => setDeleting({ kind: 'game', game })}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-dim">No games recorded for this event yet.</p>
                  )}
                </section>
              )
            })}
            {loose.length ? (
              <section aria-label="Not in an event" className="space-y-2">
                <div className="rubric flex items-baseline gap-3 border-b border-edge pb-2">
                  <span className="mr-auto">{events.length ? 'Not in an event' : 'Games'}</span>
                  <span className="readout">{loose.length}</span>
                </div>
                <GameList
                  games={loose}
                  onEdit={(game) => setEditing({ kind: 'game', game, eventId: null })}
                  onDelete={(game) => setDeleting({ kind: 'game', game })}
                />
              </section>
            ) : null}
          </>
        )}
      </PageContent>
      {editing?.kind === 'game' ? (
        <JournalGameDialog open game={editing.game} eventId={editing.eventId} events={events} onClose={() => setEditing(null)} />
      ) : null}
      {editing?.kind === 'event' ? <JournalEventDialog open event={editing.event} onClose={() => setEditing(null)} /> : null}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.kind === 'event' ? `Delete ${deleting.event.name}?` : 'Delete this game?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === 'event'
                ? deleting.games
                  ? `Its ${deleting.games === 1 ? 'game stays' : `${deleting.games} games stay`} in your journal, no longer grouped.`
                  : 'It has no games.'
                : 'The game is removed from your journal.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(remove.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function Totals({ totals, label, compact = false }: { totals: JournalTotals; label: string; compact?: boolean }) {
  const facts = [
    { name: 'Games', value: String(totals.games) },
    { name: 'Won · drawn · lost', value: `${totals.won} · ${totals.drawn} · ${totals.lost}` },
    { name: 'Win rate', value: `${Math.round(totals.rate * 100)}%` },
    ...(totals.scored
      ? [{ name: `Victory points over ${totals.scored} scored`, value: `${totals.pointsFor}–${totals.pointsAgainst}` }]
      : []),
  ]
  return (
    <dl
      aria-label={label}
      className={`grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 ${compact ? 'text-xs' : 'border border-edge bg-panel p-3 text-sm'}`}
    >
      {facts.map((fact) => (
        <div key={fact.name} className="min-w-0">
          <dt className="eyebrow text-dim">{fact.name}</dt>
          <dd className="readout">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function GameList({
  games,
  onEdit,
  onDelete,
}: {
  games: readonly JournalGame[]
  onEdit: (game: JournalGame) => void
  onDelete: (game: JournalGame) => void
}) {
  const { data: index } = useQuery(factionIndexQuery())
  const { day } = useDateFormatting()
  const factionName = (id: string | null) =>
    id === null
      ? null
      : (index?.factions.find((entry) => entry.isDefault && currentCatalogueFamilyId(entry.id) === id)?.displayName ?? null)
  return (
    <ul className="space-y-2" data-journal-games>
      {games.map((game) => {
        const yours = [factionName(game.factionId), game.army].filter(Boolean).join(' · ')
        const theirs = [game.opponentName, factionName(game.opponentFactionId)].filter(Boolean).join(' · ')
        return (
          <li key={game.id} data-journal-game className="flex items-start gap-3 border border-edge bg-sunken p-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-bold uppercase ${RESULT_TONE[game.result]}`}>{RESULT_LABEL[game.result]}</span>
                {game.score !== null && game.opponentScore !== null ? (
                  <span className="readout">
                    {game.score}–{game.opponentScore}
                  </span>
                ) : null}
                <span className="text-xs text-dim">{day(game.playedOn)}</span>
              </p>
              <p className="text-sm break-words">
                {yours || 'Your army not recorded'}
                {theirs ? <span className="text-dim"> vs {theirs}</span> : null}
              </p>
              {game.notes ? <p className="text-xs break-words whitespace-pre-line text-dim">{game.notes}</p> : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for the game on ${day(game.playedOn)}`} />}
              >
                <EllipsisVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(game)}>
                  <Pencil /> Edit game
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(game)}>
                  <Trash2 /> Delete game
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )
      })}
    </ul>
  )
}
