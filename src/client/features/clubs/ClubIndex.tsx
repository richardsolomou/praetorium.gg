import { admissionLabel, VisibilityIcon } from '../leagues/EventAccess'
import { SectionHeading } from '../../components/SectionHeading'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { useDateFormatting } from '../../dates'
import { clubsQuery, meQuery, type QueryData } from '../../queries'
import { LEAGUE_CARD } from '../leagues/LeagueActions'
import { ClubSettingsDialog } from './ClubSettingsDialog'
import { countLabel } from '../../text'

type ClubSummary = QueryData<typeof clubsQuery>[number]

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
        description="Keep a running leaderboard of the games your group plays."
        actions={
          me ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New club
            </Button>
          ) : null
        }
      />
      <PageContent className="space-y-6">
        {mine.length ? <ClubShelf title="Your clubs" clubs={mine} /> : null}
        {publicClubs.length ? <ClubShelf title="Public clubs" clubs={publicClubs} /> : null}
        {!clubs.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Play with your group"
            title="No clubs yet"
            explanation={me ? 'Start one and send the link to your group.' : 'Public clubs show up here. Sign in to start one.'}
            icon={Users}
          />
        ) : null}
      </PageContent>
      <ClubSettingsDialog club={null} open={creating} onOpenChange={setCreating} />
    </main>
  )
}

function ClubShelf({ title, clubs }: { title: string; clubs: readonly ClubSummary[] }) {
  const { date } = useDateFormatting()
  return (
    <section>
      <SectionHeading title={title} count={clubs.length} />
      <div className="grid gap-3 md:grid-cols-2">
        {clubs.map((club) => {
          return (
            <article key={club.id} data-club={club.token} className={LEAGUE_CARD}>
              <Link to="/clubs/$token" params={{ token: club.token }} className="flex min-w-0 flex-1 flex-col">
                <div className="flex-1 p-4">
                  <p className="flex items-center gap-2 text-xs text-dim">
                    <VisibilityIcon visibility={club.visibility} labelled />
                    <span className="truncate tracking-label uppercase">{admissionLabel(club.admission)}</span>
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
                  {/* A request still waiting is the one thing about the reader worth saying; otherwise, how lively the club is. */}
                  {club.ownMember?.status === 'pending' ? (
                    <span className="truncate font-semibold text-discarded">Request sent</span>
                  ) : (
                    <span className="truncate text-dim">{club.lastBattleAt ? `Last game ${date(club.lastBattleAt)}` : 'No games yet'}</span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-dim readout">
                    {countLabel(club.memberCount, 'member')} · {countLabel(club.battleCount, 'game')}
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
