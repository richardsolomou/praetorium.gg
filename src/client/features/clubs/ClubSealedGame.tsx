import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, EllipsisVertical, Eye, FileLock2, Pencil, Swords, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { leagueSealingClosed } from '../../../core/league'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { createLeagueBattle, deleteLeague, revealLeague, submitLeagueRoster } from '../../functions'
import { battlesQuery, gameReferencesQuery, leagueQuery } from '../../queries'
import { useNow } from '../../useNow'
import { useMoment } from '../leagues/EventSchedule'
import { ViewRosterButton } from '../leagues/LeagueEntrants'
import { RosterChooser } from '../leagues/LeagueRosterChooser'
import { LeagueSettingsDialog } from '../leagues/LeagueSettingsDialog'
import { eventName, useLeagueRefresh } from '../leagues/leagueEvent'
import type { Club } from './club'

type Game = Club['games'][number]

/**
 * A club's sealed game where the club plays it: who has sealed a list, sealing your own, opening them together, then
 * a battle against each member who sealed, with the lists everyone sealed.
 */
export function ClubSealedGame({
  club,
  game,
  viewerId,
  highlighted = false,
}: {
  club: Club
  game: Game
  viewerId: string | null
  highlighted?: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const moment = useMoment()
  const now = useNow(game.sealBy)
  const refresh = useLeagueRefresh(game.token)
  const { data: record } = useQuery(leagueQuery(game.token))
  const [choosing, setChoosing] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const member = club.members.some((candidate) => candidate.userId === viewerId && candidate.status === 'accepted')
  const people = new Map(club.members.map((candidate) => [candidate.userId, candidate]))
  const revealed = game.revealedAt !== null
  const closed = !revealed && leagueSealingClosed(game, now)
  // Past the deadline only those who sealed in time are playing.
  const players = game.players.filter((player) => !closed || player.sealed)
  const own = players.find((player) => player.userId === viewerId)
  const sealed = players.filter((player) => player.sealed)
  const ready = !revealed && sealed.length >= 2 && sealed.length === players.length
  const played = new Set(game.played.map((pair) => pair.join('|')))
  const hasPlayed = (userId: string) => played.has([viewerId ?? '', userId].toSorted().join('|'))
  const listName = (userId: string) => record?.entries.find((entry) => entry.userId === userId)?.rosterName ?? null

  const seal = useMutation({
    mutationFn: (rosterId: string) => submitLeagueRoster({ data: { token: game.token, rosterId } }),
    onSuccess: async () => {
      setChoosing(false)
      await refresh()
    },
  })
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token: game.token } }),
    onSuccess: async () => {
      setRevealing(false)
      await refresh()
    },
  })
  const play = useMutation({
    mutationFn: async (opponentId: string) => {
      const references = await queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
      return createLeagueBattle({ data: { token: game.token, opponentId, missionPackId: references?.packs[0]?.id ?? null } })
    },
    onSuccess: async ({ token: battleToken }) => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token: battleToken } })
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteLeague({ data: { token: game.token } }),
    onSuccess: async () => {
      setDeleting(false)
      await refresh()
    },
  })

  const when = revealed
    ? game.playsAt
      ? `Played ${moment(game.playsAt)}`
      : null
    : game.sealBy
      ? `Lists due ${moment(game.sealBy)}`
      : game.playsAt
        ? `Played ${moment(game.playsAt)}`
        : null

  return (
    <section
      id={`game-${game.token}`}
      data-sealed-game={game.token}
      aria-label={`Sealed game: ${eventName({ ...game, tournament: null, club })}`}
      className={`border bg-panel ${highlighted ? 'border-parchment' : 'border-edge'}`}
    >
      <div className="flex min-w-0 items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-discarded">Sealed game</p>
          <h3 className="mt-1 truncate font-bold uppercase">{eventName({ ...game, tournament: null, club })}</h3>
          {when ? <p className="mt-0.5 text-sm text-dim">{when}</p> : null}
        </div>
        {club.organizer ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Sealed game options" />}>
              <EllipsisVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {revealed ? null : (
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onClick={() => (remove.reset(), setDeleting(true))}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <ul className="divide-y divide-edge border-t border-edge">
        {players.map((player) => {
          const person = people.get(player.userId)
          const name = person?.name ?? 'A former member'
          const list = revealed || player.userId === viewerId ? listName(player.userId) : null
          return (
            <li key={player.userId} data-person={name} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
              <PlayerAvatar name={name} image={person?.image ?? null} className="size-7 text-3xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {name}
                  {player.userId === viewerId ? <span className="ml-1.5 text-xs font-normal text-dim">you</span> : null}
                </span>
                {list ? <span className="block truncate text-xs text-dim">{list}</span> : null}
              </span>
              {revealed ? (
                <>
                  <ViewRosterButton token={game.token} eventToken={game.token} userId={player.userId} label={name} />
                  {game.format === '1v1' && own?.sealed && player.userId !== viewerId && player.sealed ? (
                    hasPlayed(player.userId) ? (
                      <span className="chip shrink-0 text-achieved">Played</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Play ${name}`}
                        disabled={play.isPending}
                        onClick={() => play.mutate(player.userId)}
                      >
                        <Swords /> Play
                      </Button>
                    )
                  ) : null}
                </>
              ) : player.sealed ? (
                <span className="flex shrink-0 items-center gap-1 text-sm text-achieved">
                  <Check className="size-4" aria-hidden /> Sealed
                </span>
              ) : (
                <span className="shrink-0 text-sm text-faint">Choosing</span>
              )}
            </li>
          )
        })}
        {!players.length ? <li className="px-4 py-2.5 text-sm text-dim">Nobody has sealed a list yet.</li> : null}
      </ul>

      {revealed ? null : (
        <div className="flex flex-wrap items-center gap-2 border-t border-edge p-4">
          {member && !closed ? (
            <Button variant={own?.sealed ? 'outline' : 'default'} onClick={() => (seal.reset(), setChoosing(true))}>
              <FileLock2 /> {own?.sealed ? 'Swap your list' : 'Seal your list'}
            </Button>
          ) : null}
          {ready && (own?.sealed || club.organizer) ? (
            <Button variant="outline" onClick={() => (reveal.reset(), setRevealing(true))}>
              <Eye /> Reveal lists
            </Button>
          ) : null}
          <p className="min-w-0 flex-1 text-xs text-dim">
            {closed
              ? 'The deadline has passed.'
              : ready
                ? 'Everyone in has sealed. Reveal when you’re ready.'
                : 'Lists stay hidden until they’re revealed together.'}
          </p>
        </div>
      )}
      {play.error ? <Problem error={play.error} className="px-4 pb-3" /> : null}

      <RosterChooser
        open={choosing}
        pending={seal.isPending}
        error={seal.error}
        failedRosterId={seal.variables ?? null}
        requiredLimit={game.rosterLimit}
        pointsBudget={game.pointsBudget}
        onClose={() => !seal.isPending && setChoosing(false)}
        onChoose={(roster) => seal.mutate(roster.id)}
      />
      <ConfirmDialog
        open={revealing}
        title="Reveal every list?"
        description={`The ${sealed.length} sealed lists open for everyone, and nobody else can seal one. You can’t undo this.`}
        cancel="Keep them sealed"
        confirm="Reveal lists"
        pendingLabel="Revealing…"
        pending={reveal.isPending}
        error={reveal.error}
        onClose={() => setRevealing(false)}
        onConfirm={() => reveal.mutate()}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete this sealed game?"
        description="Its sealed lists go with it. Battles already played stay on the club table."
        cancel="Keep it"
        confirm="Delete"
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
      {editing ? <LeagueSettingsDialog mode={{ kind: 'edit', token: game.token }} open={editing} onOpenChange={setEditing} /> : null}
    </section>
  )
}

/**
 * Whether a game belongs under Up next: until its lists are revealed, then while it is the club's newest game, a duel,
 * and the reader still has someone to play. Games carried over from leagues include team formats, played as one battle.
 */
export function sealedGameOpen(club: Club, game: Game, viewerId: string | null) {
  if (game.revealedAt === null) return true
  if (game.token !== club.games[0]?.token || game.format !== '1v1') return false
  const own = game.players.find((player) => player.userId === viewerId && player.sealed)
  if (!own) return false
  const played = new Set(game.played.map((pair) => pair.join('|')))
  return game.players.some(
    (player) => player.sealed && player.userId !== viewerId && !played.has([viewerId ?? '', player.userId].toSorted().join('|')),
  )
}
