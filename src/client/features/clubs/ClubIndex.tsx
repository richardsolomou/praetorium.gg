import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Eye, LockKeyhole, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { clubsQuery, meQuery } from '../../queries'
import { LEAGUE_CARD } from '../leagues/LeagueActions'
import { EventsTabs } from '../events/EventsTabs'
import { ClubSettingsDialog } from './ClubSettingsDialog'

type ClubSummary = Awaited<ReturnType<NonNullable<ReturnType<typeof clubsQuery>['queryFn']>>>[number]

export function ClubIndex() {
  const { data: me } = useQuery(meQuery())
  const { data: clubs = [] } = useQuery(clubsQuery())
  const [creating, setCreating] = useState(false)
  const mine = clubs.filter((club) => club.ownMember)
  const publicClubs = clubs.filter((club) => !club.ownMember)
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Events"
        title="Clubs"
        description="Casual play with your friends or local club: tag your battles to the club and they count on its standing table."
        actions={
          me ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New club
            </Button>
          ) : null
        }
      >
        <EventsTabs current="clubs" />
      </PageHeader>
      <PageContent className="space-y-6">
        {mine.length ? <ClubShelf title="Your clubs" clubs={mine} viewerId={me?.id ?? null} /> : null}
        {publicClubs.length ? <ClubShelf title="Public clubs" clubs={publicClubs} viewerId={me?.id ?? null} /> : null}
        {!clubs.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Play with your group"
            title="No clubs yet"
            explanation={me ? 'Create one and send the link to your group.' : 'Public clubs will appear here. Sign in to create one.'}
            icon={Users}
          />
        ) : null}
      </PageContent>
      <ClubSettingsDialog club={null} open={creating} onOpenChange={setCreating} />
    </main>
  )
}

function ClubShelf({ title, clubs, viewerId }: { title: string; clubs: readonly ClubSummary[]; viewerId: string | null }) {
  return (
    <section>
      <h2 className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
        {title} <span className="readout">{clubs.length}</span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {clubs.map((club) => {
          const status = clubStatus(club, viewerId)
          return (
            <article key={club.id} data-club={club.token} className={LEAGUE_CARD}>
              <Link to="/clubs/$token" params={{ token: club.token }} className="flex min-w-0 flex-1 flex-col">
                <div className="flex-1 p-4">
                  <p className="flex items-center gap-2 text-xs text-dim">
                    {club.visibility === 'private' ? (
                      <LockKeyhole className="size-3.5 shrink-0" aria-label="Private" />
                    ) : (
                      <Eye className="size-3.5 shrink-0 text-info" aria-label="Public" />
                    )}
                    <span className="truncate tracking-label uppercase">
                      {club.admission === 'approval' ? 'Approval required' : 'Anyone can join'}
                    </span>
                  </p>
                  <h3 className="mt-1.5 truncate text-lg leading-tight font-bold uppercase">{club.name}</h3>
                  {club.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-dim">{club.description}</p>
                  ) : (
                    <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-dim">
                      <PlayerAvatar name={club.ownerName} image={club.ownerImage} className="size-5 text-3xs" />
                      <span className="truncate">Run by {club.ownerName}</span>
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 items-center gap-3 border-t border-edge bg-sunken/60 px-4 py-2.5 text-sm">
                  {status ? (
                    <span className={`flex min-w-0 items-center gap-2 font-semibold ${status.tint}`}>
                      <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
                      <span className="truncate">{status.label}</span>
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs text-dim readout">
                    {plural(club.memberCount, 'member')} · {plural(club.battleCount, 'battle')}
                  </span>
                </div>
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** The reader's own place in the club, when they have one. */
function clubStatus(club: ClubSummary, viewerId: string | null) {
  if (club.ownerId === viewerId) return { label: 'You run it', tint: 'text-achieved' }
  if (club.ownMember?.status === 'pending') return { label: 'Waiting for approval', tint: 'text-dim' }
  if (club.ownMember?.role === 'admin') return { label: 'Admin', tint: 'text-achieved' }
  if (club.ownMember) return { label: 'Member', tint: 'text-achieved' }
  return null
}
