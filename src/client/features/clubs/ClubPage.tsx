import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Check,
  Clipboard,
  EllipsisVertical,
  Eye,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  Share2,
  Swords,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buttonClass } from '../../components/buttonClass'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PageContent, PageHeader } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { createBattle, deleteClub, joinClub, leaveClub, moderateClubMember, removeClubMember } from '../../functions'
import { battlesQuery, clubKey, clubQuery, clubsKey, clubStandingsQuery, gameReferencesQuery, meQuery } from '../../queries'
import { BattleShelf } from '../battles/BattleShelf'
import { useInviteShareLabel } from '../friends/friendInvite'
import { Standings } from '../leaderboard/Standings'
import { inviteFeedbackText, useInviteShare } from '../leagues/LeagueActions'
import { SectionHeading } from '../leagues/LeagueEntrants'
import { LeagueSettingsDialog } from '../leagues/LeagueSettingsDialog'
import type { Club } from './club'
import { ClubSettingsDialog } from './ClubSettingsDialog'

type Member = Club['members'][number]
type ClubTable = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof clubStandingsQuery>['queryFn']>>>>

export function ClubPage({ token }: { token: string }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: club } = useQuery(clubQuery(token))
  useEffect(() => {
    if (club === null) void navigate({ to: '/clubs' })
  }, [club, navigate])
  if (!club) return null
  return <ClubScreen club={club} viewerId={me?.id ?? null} />
}

function useClubRefresh(token: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: clubKey(token) }), queryClient.invalidateQueries({ queryKey: clubsKey() })])
}

function ClubScreen({ club, viewerId }: { club: Club; viewerId: string | null }) {
  const navigate = useNavigate()
  const refresh = useClubRefresh(club.token)
  const { data: table } = useQuery(clubStandingsQuery(club.token))
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const isOwner = viewerId === club.ownerId
  const own = club.members.find((member) => member.userId === viewerId) ?? null
  const member = own?.status === 'accepted'
  const accepted = club.members.filter((candidate) => candidate.status === 'accepted')
  const admins = accepted.filter((candidate) => candidate.role === 'admin')
  const invite = useInviteShare(`/clubs/${club.token}`, club.name, 'club_invite_shared')
  const shareLabel = useInviteShareLabel()
  const remove = useMutation({
    mutationFn: () => deleteClub({ data: { token: club.token } }),
    onSettled: refresh,
    onSuccess: () => navigate({ to: '/clubs' }),
  })
  const play = usePlayClubGame(club.token)
  const leave = useMutation({
    mutationFn: () => leaveClub({ data: { token: club.token } }),
    onSettled: refresh,
    onSuccess: () => setLeaving(false),
  })

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Club"
        title={club.name}
        actions={
          <>
            {member ? (
              <Button variant="outline" onClick={invite.share}>
                {invite.feedback === 'shared' ? <Share2 /> : invite.feedback === 'copied' ? <Check /> : <Clipboard />} {shareLabel}
              </Button>
            ) : null}
            {club.organizer ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit club
              </Button>
            ) : null}
            {own ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More for ${club.name}`} />}>
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {isOwner ? (
                    <DropdownMenuItem variant="destructive" onClick={() => (remove.reset(), setDeleting(true))}>
                      <Trash2 /> Delete club
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem variant="destructive" onClick={() => (leave.reset(), setLeaving(true))}>
                      <LogOut /> {member ? 'Leave club' : 'Withdraw request'}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      >
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-dim">
          {club.visibility === 'private' ? <LockKeyhole className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          {club.visibility === 'private' ? 'Private link' : 'Public'} ·{' '}
          {club.admission === 'approval' ? 'Approval required' : 'Anyone can join'}
        </p>
        {club.description ? <p className="mt-3 max-w-2xl font-rules text-sm whitespace-pre-wrap text-dim">{club.description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dim">
          <span>Run by</span>
          {[{ userId: club.ownerId, name: club.ownerName, image: club.ownerImage }, ...admins].map((organizer) => (
            <Link
              key={organizer.userId}
              to="/users/$userId"
              params={{ userId: organizer.userId }}
              className="group flex w-fit items-center gap-2"
            >
              <PlayerAvatar name={organizer.name} image={organizer.image} className="size-7 text-3xs" />
              <span className="text-bone group-hover:underline">{organizer.name}</span>
            </Link>
          ))}
        </div>
        {invite.feedback ? (
          <p aria-live="polite" className="mt-2 text-xs text-dim">
            {inviteFeedbackText(invite.feedback)}
          </p>
        ) : null}
      </PageHeader>

      <PageContent>
        {/* As a tournament reads: the reader's own place leads the side column and a phone, the club's play fills the main one. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
          <div className="space-y-6 lg:col-start-2 lg:row-start-1">
            {member && viewerId ? (
              <PlayClubGame club={club} viewerId={viewerId} table={table} play={play} />
            ) : (
              <JoinClub club={club} viewerId={viewerId} own={own} />
            )}
            <ClubFigures club={club} members={accepted.length} table={table} />
          </div>
          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {table ? <TableSection table={table} viewerId={viewerId} /> : null}
            <SealedGames club={club} />
          </div>
          <aside className="space-y-6 lg:col-start-2">
            <Members club={club} viewerId={viewerId} isOwner={isOwner} play={member ? play : null} />
          </aside>
        </div>
      </PageContent>

      <ClubSettingsDialog club={club} ownerId={viewerId} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        title={`Delete ${club.name}?`}
        description="This removes the club, its members and its table. Its battles and sealed games stay."
        cancel="Keep club"
        confirm="Delete club"
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={leaving}
        title={member ? `Leave ${club.name}?` : 'Withdraw your request?'}
        description="You come off the table. Rejoin and your results come back."
        cancel="Stay"
        confirm={member ? 'Leave club' : 'Withdraw'}
        pendingLabel="Leaving…"
        destructive
        pending={leave.isPending}
        error={leave.error}
        onClose={() => setLeaving(false)}
        onConfirm={() => leave.mutate()}
      />
    </main>
  )
}

/** The club at a glance: how many play, how much they have played, and who leads. */
function ClubFigures({ club, members, table }: { club: Club; members: number; table: ClubTable | null | undefined }) {
  const leader = table?.table.rows[0]
  const figures = [
    { label: 'Members', value: String(members) },
    { label: 'Games played', value: table ? String(table.finished) : '–' },
    { label: 'Sealed games', value: String(club.tournaments.length) },
  ]
  return (
    <dl className="divide-y divide-edge border border-edge bg-panel text-sm">
      {figures.map((figure) => (
        <div key={figure.label} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
          <dt className="text-dim">{figure.label}</dt>
          <dd className="figure text-base">{figure.value}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <dt className="text-dim">Leading</dt>
        <dd className="flex min-w-0 items-center gap-2">
          {leader ? (
            <>
              <span className="min-w-0 truncate font-semibold">{leader.name}</span>
              <span className="figure text-achieved">{Math.round(leader.rating)}</span>
            </>
          ) : (
            <span className="text-faint">Nobody yet</span>
          )}
        </dd>
      </div>
    </dl>
  )
}

/** Starts a battle against a member, counted for the club from the start, and opens it. */
function usePlayClubGame(token: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (opponentId: string) => {
      const references = await queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
      return createBattle({ data: { opponentId, clubToken: token, missionPackId: references?.packs[0]?.id ?? null } })
    },
    onSuccess: async ({ token: battleToken }) => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token: battleToken } })
    },
  })
}

type PlayClubGameMutation = ReturnType<typeof usePlayClubGame>

/** What a member comes here to do: play another member for the table, knowing where they stand on it. */
function PlayClubGame({
  club,
  viewerId,
  table,
  play,
}: {
  club: Club
  viewerId: string
  table: ClubTable | null | undefined
  play: PlayClubGameMutation
}) {
  const opponents = club.members.filter((member) => member.status === 'accepted' && member.userId !== viewerId)
  const [opponentId, setOpponentId] = useState<string | null>(null)
  const chosen = opponents.find((member) => member.userId === opponentId) ?? opponents[0]
  const rows = table?.table.rows ?? []
  const place = rows.findIndex((row) => row.id === viewerId)
  return (
    <section aria-labelledby="club-play" className="border border-edge bg-panel p-4 sm:p-5">
      <h2 id="club-play" className="text-xl leading-tight font-bold uppercase">
        Play a club game
      </h2>
      <p className="mt-1.5 text-sm text-dim">
        {place >= 0
          ? `You’re #${place + 1} of ${rows.length}, rated ${Math.round(rows[place]!.rating)}.`
          : 'Your first finished game puts you on the table.'}
      </p>
      {opponents.length ? (
        <div className="mt-4 space-y-2">
          <Select value={chosen?.userId ?? ''} onValueChange={(id) => id && setOpponentId(id)} disabled={play.isPending}>
            <SelectTrigger aria-label="Opponent" className="h-11 w-full">
              <SelectValue>{() => chosen?.name ?? 'Choose an opponent'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {opponents.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="lg"
            className="w-full pointer-coarse:h-11"
            disabled={!chosen || play.isPending}
            onClick={() => chosen && play.mutate(chosen.userId)}
          >
            <Swords /> {play.isPending ? 'Starting…' : 'Start battle'}
          </Button>
          <p className="text-xs text-dim">An ordinary battle: each of you picks a list at setup.</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-dim">Nobody else is in the club yet. Share the invite link to bring people in.</p>
      )}
      {play.error ? <Problem error={play.error} className="mt-2" /> : null}
    </section>
  )
}

/** For someone not in the club yet: join, or see that the request is waiting. Members have nothing to do here. */
function JoinClub({ club, viewerId, own }: { club: Club; viewerId: string | null; own: Member | null }) {
  const refresh = useClubRefresh(club.token)
  const join = useMutation({ mutationFn: () => joinClub({ data: { token: club.token } }), onSettled: refresh })
  const detail = own
    ? `${club.ownerName} or an admin needs to accept you.`
    : club.admission === 'approval'
      ? 'An organizer accepts each request. Once you’re in, your games against members go on the table.'
      : 'Once you’re in, your games against members go on the table.'
  return (
    <section data-club-status aria-labelledby="club-status" className="border border-edge bg-panel p-4 sm:p-5">
      <h2 id="club-status" className="text-xl leading-tight font-bold uppercase">
        {own ? 'Request sent' : 'Join this club'}
      </h2>
      <p className="mt-1.5 text-sm text-dim">{detail}</p>
      <div className="mt-4">
        {own ? null : viewerId ? (
          <Button size="lg" className="w-full pointer-coarse:h-11" disabled={join.isPending} onClick={() => join.mutate()}>
            <UserPlus /> {club.admission === 'approval' ? 'Ask to join' : 'Join club'}
          </Button>
        ) : (
          <Link
            to="/sign-in"
            search={{ next: `/clubs/${club.token}` }}
            className={buttonClass({ size: 'lg', className: 'w-full pointer-coarse:h-11' })}
          >
            Sign in to join
          </Link>
        )}
      </div>
      {join.error ? <Problem error={join.error} className="mt-2" /> : null}
    </section>
  )
}

/** The table once a battle has counted; until then, how one comes to count. */
function TableSection({ table, viewerId }: { table: ClubTable; viewerId: string | null }) {
  if (!table.finished && !table.recent.length)
    return (
      <section>
        <SectionHeading title="Getting started" />
        <ol className="grid gap-px border border-edge bg-edge sm:grid-cols-3">
          {[
            ['Invite your group', 'Share the link. Anyone who joins can play for the table.'],
            ['Pick the club at setup', 'It’s offered when everyone in the battle is a member.'],
            ['Finish the game', 'The result goes on the table. Everyone starts at 1000.'],
          ].map(([title, detail], index) => (
            <li key={title} className="bg-panel p-4">
              <span className="figure text-sm text-faint">{index + 1}</span>
              <p className="mt-1 font-bold uppercase">{title}</p>
              <p className="mt-1 text-sm text-dim">{detail}</p>
            </li>
          ))}
        </ol>
      </section>
    )
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Standings table={table.table} viewerId={viewerId ?? undefined} title="Table" empty="No games finished yet." />
        <p className="text-sm text-faint">
          Counts games played for the club and its sealed games. Ratings start at 1000, as on the leaderboard. Guest, practice and manually
          tracked games don’t count.{table.partial ? ' Only the latest 10,000 games are counted.' : ''}
        </p>
      </div>
      <BattleShelf title="Recent battles" name="Club battles" battles={table.recent} viewerId={viewerId ?? undefined} />
    </div>
  )
}

/** Sealed-roster games the club has played; its organizers start new ones here. */
function SealedGames({ club }: { club: Club }) {
  const refresh = useClubRefresh(club.token)
  const [creating, setCreating] = useState(false)
  if (!club.tournaments.length && !club.organizer) return null
  return (
    <section>
      <SectionHeading
        title="Sealed games"
        count={club.tournaments.length}
        action={
          club.organizer ? (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus /> New sealed game
            </Button>
          ) : null
        }
      />
      {club.tournaments.length ? (
        <ul className="divide-y divide-edge border border-edge bg-panel">
          {club.tournaments.map((tournament) => (
            <li key={tournament.token}>
              <Link
                to="/clubs/$token/games/$game"
                params={{ token: club.token, game: tournament.token }}
                className="flex min-w-0 items-center gap-3 p-3 hover:bg-raised"
              >
                <Trophy className="size-4 shrink-0 text-info" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{tournament.name}</span>
                <span className={`chip shrink-0 ${tournament.revealedAt ? 'text-achieved' : 'text-dim'}`}>
                  {tournament.revealedAt ? 'Rosters out' : 'Sealing'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-dim">
          Everyone seals a list in secret, then you reveal them together and play. The results go on the table.
        </p>
      )}
      <LeagueSettingsDialog
        mode={{ kind: 'create', clubToken: club.token }}
        open={creating}
        onOpenChange={(open) => {
          setCreating(open)
          if (!open) void refresh()
        }}
      />
    </section>
  )
}

function Members({
  club,
  viewerId,
  isOwner,
  play,
}: {
  club: Club
  viewerId: string | null
  isOwner: boolean
  /** Starts a club game against a member, for a reader who is one. */
  play: PlayClubGameMutation | null
}) {
  const refresh = useClubRefresh(club.token)
  const moderate = useMutation({
    mutationFn: (input: { userId: string; accept: boolean }) => moderateClubMember({ data: { token: club.token, ...input } }),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeClubMember({ data: { token: club.token, userId } }),
    onSettled: refresh,
    onSuccess: () => setConfirming(null),
  })
  // Removing someone, or turning their request down, is asked about first: one stray press should not cost a member their place.
  const [confirming, setConfirming] = useState<{ member: Member; action: 'remove' | 'decline' } | null>(null)
  const pending = club.organizer ? club.members.filter((member) => member.status === 'pending') : []
  const accepted = club.members.filter((member) => member.status === 'accepted')
  const role = (member: Member) => (member.userId === club.ownerId ? 'Owner' : member.role === 'admin' ? 'Admin' : null)
  return (
    <>
      {pending.length ? (
        <section>
          <SectionHeading title="Asking to join" count={pending.length} />
          <ul className="divide-y divide-edge border border-edge bg-panel">
            {pending.map((member) => (
              <li key={member.userId} data-person={member.name} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <PlayerAvatar name={member.name} image={member.image} className="size-8 text-xs" />
                <span className="min-w-0 flex-1 truncate font-semibold">{member.name}</span>
                <div className="flex basis-full gap-2">
                  <Button size="sm" disabled={moderate.isPending} onClick={() => moderate.mutate({ userId: member.userId, accept: true })}>
                    <Check /> Let in
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={moderate.isPending}
                    onClick={() => (moderate.reset(), setConfirming({ member, action: 'decline' }))}
                  >
                    <X /> Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {moderate.error ? <Problem error={moderate.error} className="mt-2" /> : null}
        </section>
      ) : null}
      <section>
        <SectionHeading title="Members" count={accepted.length} />
        <ul className="divide-y divide-edge border border-edge bg-panel">
          {accepted.map((member) => {
            const removable =
              club.organizer && member.userId !== club.ownerId && member.userId !== viewerId && (member.role !== 'admin' || isOwner)
            return (
              <li key={member.userId} data-person={member.name} className="flex min-w-0 items-center gap-2 p-2 pl-3">
                <Link to="/users/$userId" params={{ userId: member.userId }} className="group flex min-w-0 flex-1 items-center gap-2.5">
                  <PlayerAvatar name={member.name} image={member.image} className="size-8 text-xs" />
                  <span className="truncate font-semibold group-hover:underline">{member.name}</span>
                  {role(member) ? <span className="chip shrink-0 text-dim">{role(member)}</span> : null}
                </Link>
                {play && member.userId !== viewerId ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="pointer-coarse:size-11"
                    aria-label={`Play ${member.name}`}
                    disabled={play.isPending}
                    onClick={() => play.mutate(member.userId)}
                  >
                    <Swords />
                  </Button>
                ) : null}
                {removable ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="pointer-coarse:size-11"
                    aria-label={`Remove ${member.name} from the club`}
                    disabled={remove.isPending}
                    onClick={() => (remove.reset(), setConfirming({ member, action: 'remove' }))}
                  >
                    <X />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.action === 'decline' ? `Decline ${confirming.member.name}?` : `Remove ${confirming?.member.name ?? ''}?`}
        description={
          confirming?.action === 'decline'
            ? 'They won’t join the club. They can ask again later.'
            : 'They come off the club table. They can join again later, and their results come back.'
        }
        cancel="Keep"
        confirm={confirming?.action === 'decline' ? 'Decline' : 'Remove'}
        pendingLabel={confirming?.action === 'decline' ? 'Declining…' : 'Removing…'}
        destructive
        pending={remove.isPending || moderate.isPending}
        error={confirming?.action === 'decline' ? moderate.error : remove.error}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return
          if (confirming.action === 'remove') remove.mutate(confirming.member.userId)
          else moderate.mutate({ userId: confirming.member.userId, accept: false }, { onSuccess: () => setConfirming(null) })
        }}
      />
    </>
  )
}
