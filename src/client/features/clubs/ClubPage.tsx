import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, Clipboard, EllipsisVertical, Eye, LockKeyhole, LogOut, Pencil, Share2, Trash2, UserPlus, X } from 'lucide-react'
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
import { Standings } from '../leaderboard/Standings'
import { useInviteShareLabel } from '../friends/friendInvite'
import { inviteFeedbackText, useInviteShare } from '../leagues/LeagueActions'
import { SectionHeading } from '../leagues/LeagueEntrants'
import type { Club } from './club'
import { ClubSettingsDialog } from './ClubSettingsDialog'

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
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const isOwner = viewerId === club.ownerId
  const own = club.members.find((member) => member.userId === viewerId) ?? null
  const accepted = club.members.filter((member) => member.status === 'accepted')
  const admins = accepted.filter((member) => member.role === 'admin')
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
                      <LogOut /> {own?.status === 'pending' ? 'Withdraw request' : 'Leave club'}
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
          {club.admission === 'approval' ? 'Approval required' : 'Anyone can join'} ·{' '}
          {accepted.length === 1 ? '1 member' : `${accepted.length} members`}
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

      <PageContent className="space-y-6">
        <Membership club={club} viewerId={viewerId} own={own} />
        <ClubTable token={club.token} viewerId={viewerId} />
        <Members club={club} viewerId={viewerId} isOwner={isOwner} />
      </PageContent>

      <ClubSettingsDialog club={club} ownerId={viewerId} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        title={`Delete ${club.name}?`}
        description="The club, its members and its table go for good. Battles its members played stay where they are."
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
        title={own?.status === 'pending' ? 'Withdraw your request?' : `Leave ${club.name}?`}
        description="You drop off the club’s table. Rejoin any time to come back on it with your record."
        cancel="Stay"
        confirm={own?.status === 'pending' ? 'Withdraw' : 'Leave club'}
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

/** Where the reader stands: invited to join, waiting, or a member with an invite to pass on. */
function Membership({ club, viewerId, own }: { club: Club; viewerId: string | null; own: Club['members'][number] | null }) {
  const refresh = useClubRefresh(club.token)
  const invite = useInviteShare(`/clubs/${club.token}`, club.name, 'club_invite_shared')
  const shareLabel = useInviteShareLabel()
  const join = useMutation({ mutationFn: () => joinClub({ data: { token: club.token } }), onSettled: refresh })
  if (own?.status === 'accepted')
    return (
      <section className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-4">
        <p className="min-w-0 flex-1 text-sm text-dim">
          Choose this club when you set up a battle against another member, and the result counts on its table.
        </p>
        <Button variant="outline" onClick={invite.share}>
          {invite.feedback === 'shared' ? <Share2 /> : invite.feedback === 'copied' ? <Check /> : <Clipboard />} {shareLabel}
        </Button>
        <p aria-live="polite" className="basis-full text-xs text-dim empty:hidden">
          {invite.feedback ? inviteFeedbackText(invite.feedback) : ''}
        </p>
      </section>
    )
  return (
    <section className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-4">
      <p className="min-w-0 flex-1 text-sm text-dim">
        {own?.status === 'pending'
          ? `Waiting for ${club.ownerName} or an admin to let you in.`
          : club.admission === 'approval'
            ? 'Ask to join, and an organizer lets you in.'
            : 'Join to play for a place on this club’s table.'}
      </p>
      {own ? null : viewerId ? (
        <Button onClick={() => join.mutate()} disabled={join.isPending}>
          <UserPlus /> {club.admission === 'approval' ? 'Ask to join' : 'Join club'}
        </Button>
      ) : (
        <Link to="/sign-in" search={{ next: `/clubs/${club.token}` }} className={buttonClass()}>
          Sign in to join
        </Link>
      )}
      {join.error ? <Problem error={join.error} className="basis-full" /> : null}
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
  const pending = club.members.filter((member) => member.status === 'pending' && club.organizer)
  const accepted = club.members.filter((member) => member.status === 'accepted')
  const role = (member: Club['members'][number]) => (member.userId === club.ownerId ? 'Owner' : member.role === 'admin' ? 'Admin' : null)
  return (
    <>
      {pending.length ? (
        <section>
          <SectionHeading title="Asking to join" count={pending.length} />
          <ul className="divide-y divide-edge border border-edge bg-panel">
            {pending.map((member) => (
              <li key={member.userId} data-person={member.name} className="flex min-w-0 items-center gap-3 p-3">
                <PlayerAvatar name={member.name} image={member.image} className="size-8 text-xs" />
                <span className="min-w-0 flex-1 truncate font-semibold">{member.name}</span>
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
              <li key={member.userId} data-person={member.name} className="flex min-w-0 items-center gap-3 p-3">
                <Link to="/users/$userId" params={{ userId: member.userId }} className="group flex min-w-0 flex-1 items-center gap-3">
                  <PlayerAvatar name={member.name} image={member.image} className="size-8 text-xs" />
                  <span className="truncate font-semibold group-hover:underline">{member.name}</span>
                  {role(member) ? <span className="chip shrink-0 text-dim">{role(member)}</span> : null}
                </Link>
                {removable ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
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

/** The club's table, which a private club shows its members alone. */
function ClubTable({ token, viewerId }: { token: string; viewerId: string | null }) {
  const { data } = useQuery(clubStandingsQuery(token))
  if (!data) return null
  return (
    <div className="space-y-2">
      <Standings table={data.table} viewerId={viewerId ?? undefined} title="Table" empty="No club battle has finished yet." />
      <p className="text-sm text-faint">
        Every battle members chose this club for at setup, rated from 1000 like the leaderboard. Guest, practice and manually tracked
        battles never count.{data.partial ? ' Only the most recent 10,000 battles are counted.' : ''}
      </p>
    </div>
  )
}
