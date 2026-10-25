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
  Trash2,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { buttonClass } from '../../components/buttonClass'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PageContent, PageHeader } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { deleteClub, joinClub, leaveClub, moderateClubMember, removeClubMember } from '../../functions'
import { clubKey, clubQuery, clubsKey, clubStandingsQuery, meQuery } from '../../queries'
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
  const remove = useMutation({
    mutationFn: () => deleteClub({ data: { token: club.token } }),
    onSettled: refresh,
    onSuccess: () => navigate({ to: '/clubs' }),
  })
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
      </PageHeader>

      <PageContent>
        {/* As a tournament reads: the reader's own place leads the side column and a phone, the club's play fills the main one. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
          <div className="lg:col-start-2 lg:row-start-1">
            <ClubStatus club={club} viewerId={viewerId} own={own} />
          </div>
          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {table ? <TableSection table={table} viewerId={viewerId} member={member} /> : null}
            <SealedGames club={club} />
          </div>
          <aside className="space-y-6 lg:col-start-2">
            <ClubFigures club={club} members={accepted.length} table={table} />
            <Members club={club} viewerId={viewerId} isOwner={isOwner} />
          </aside>
        </div>
      </PageContent>

      <ClubSettingsDialog club={club} ownerId={viewerId} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        title={`Delete ${club.name}?`}
        description="The club, its members and its table go for good. Its sealed games and battles stay where they are."
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
        description="You drop off the club’s table. Rejoin any time to come back on it with your record."
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
    { label: 'Battles', value: table ? String(table.finished) : '–' },
    { label: 'Games', value: String(club.tournaments.length) },
  ]
  return (
    <dl className="border border-edge bg-panel">
      <div className="grid grid-cols-3 divide-x divide-edge">
        {figures.map((figure) => (
          <div key={figure.label} className="p-3">
            <dt className="eyebrow truncate">{figure.label}</dt>
            <dd className="mt-1 figure text-2xl">{figure.value}</dd>
          </div>
        ))}
      </div>
      <div className="border-t border-edge p-3">
        <dt className="eyebrow">Leading</dt>
        <dd className="mt-1 flex min-w-0 items-center gap-2">
          {leader ? (
            <>
              <PlayerAvatar name={leader.name} image={leader.image} className="size-7 text-3xs" />
              <span className="min-w-0 truncate font-semibold">{leader.name}</span>
              <span className="ml-auto figure text-achieved">{Math.round(leader.rating)}</span>
            </>
          ) : (
            <span className="text-dim">Nobody yet</span>
          )}
        </dd>
      </div>
    </dl>
  )
}

/** The reader's own place in the club, and the one thing to do about it: join, wait, or bring others in. */
function ClubStatus({ club, viewerId, own }: { club: Club; viewerId: string | null; own: Member | null }) {
  const refresh = useClubRefresh(club.token)
  const join = useMutation({ mutationFn: () => joinClub({ data: { token: club.token } }), onSettled: refresh })
  const invite = useInviteShare(`/clubs/${club.token}`, club.name, 'club_invite_shared')
  const shareLabel = useInviteShareLabel()
  const member = own?.status === 'accepted'
  const title = member
    ? viewerId === club.ownerId
      ? 'You run this club'
      : 'You’re a member'
    : own
      ? 'Waiting for approval'
      : 'Join this club'
  const detail = member
    ? 'Choose the club when you set up a battle against another member, and the result counts on its table.'
    : own
      ? `${club.ownerName} or an admin will let you in.`
      : club.admission === 'approval'
        ? 'Ask to join, and an organizer lets you in. Then the battles you play other members count on its table.'
        : 'Join, and the battles you play other members count on its table.'
  return (
    <section
      data-club-status
      aria-labelledby="club-status"
      className={`border bg-panel p-4 sm:p-5 ${member ? 'border-achieved/50' : 'border-edge'}`}
    >
      <h2 id="club-status" className={`text-xl leading-tight font-bold uppercase ${member ? 'text-achieved' : ''}`}>
        {title}
      </h2>
      <p className="mt-1.5 text-sm text-dim">{detail}</p>
      <div className="mt-4">
        {member ? (
          <Button variant="outline" size="lg" className="w-full pointer-coarse:h-11" onClick={invite.share}>
            {invite.feedback === 'shared' ? <Share2 /> : invite.feedback === 'copied' ? <Check /> : <Clipboard />} {shareLabel}
          </Button>
        ) : own ? null : viewerId ? (
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
      {invite.feedback ? (
        <p aria-live="polite" className="mt-2 text-xs text-dim">
          {inviteFeedbackText(invite.feedback)}
        </p>
      ) : null}
      {join.error ? <Problem error={join.error} className="mt-2" /> : null}
    </section>
  )
}

/** The table once a battle has counted; until then, how one comes to count. */
function TableSection({ table, viewerId, member }: { table: ClubTable; viewerId: string | null; member: boolean }) {
  if (!table.finished && !table.recent.length)
    return (
      <section>
        <SectionHeading title="How the table fills" />
        <ol className="grid gap-px border border-edge bg-edge sm:grid-cols-3">
          {[
            ['Bring the group in', 'Send the invite link. Everyone who joins can play for the table.'],
            ['Choose the club at setup', 'When every player is a member, battle setup offers the club. Pick it before the game starts.'],
            ['Finish the battle', 'The result counts here, rated from 1000 like the leaderboard.'],
          ].map(([title, detail], index) => (
            <li key={title} className="bg-panel p-4">
              <span className="figure text-sm text-faint">{index + 1}</span>
              <p className="mt-1 font-bold uppercase">{title}</p>
              <p className="mt-1 text-sm text-dim">{detail}</p>
            </li>
          ))}
        </ol>
        {member ? null : <p className="mt-2 text-sm text-faint">The table fills as members play each other.</p>}
      </section>
    )
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Standings table={table.table} viewerId={viewerId ?? undefined} title="Table" empty="No club battle has finished yet." />
        <p className="text-sm text-faint">
          Battles members chose the club for, and the battles of its sealed games, rated from 1000 like the leaderboard. Guest, practice and
          manually tracked battles never count.{table.partial ? ' Only the most recent 10,000 battles are counted.' : ''}
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
          Everyone seals a roster in secret, the rosters open together, then you play them. The battles count on the club’s table.
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

function Members({ club, viewerId, isOwner }: { club: Club; viewerId: string | null; isOwner: boolean }) {
  const refresh = useClubRefresh(club.token)
  const moderate = useMutation({
    mutationFn: (input: { userId: string; accept: boolean }) => moderateClubMember({ data: { token: club.token, ...input } }),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeClubMember({ data: { token: club.token, userId } }),
    onSettled: refresh,
  })
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
                    onClick={() => moderate.mutate({ userId: member.userId, accept: false })}
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
                {removable ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="pointer-coarse:size-11"
                    aria-label={`Remove ${member.name} from the club`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(member.userId)}
                  >
                    <X />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
        {remove.error ? <Problem error={remove.error} className="mt-2" /> : null}
      </section>
    </>
  )
}
